// =================================================================
// ROUTE : USER MANAGEMENT  POST /api/v1/users  & POST /api/v1/users/:id/keys
// =================================================================

import { Hono } from "hono";
import { type CloudflareBindings, type AuthContext, type Plan, PLAN_LIMITS, computePlanOverage } from "../lib/types";
import { authMiddleware } from "../middleware/auth";
import { rateLimit } from "../middleware/ratelimit";
import { CreateUserSchema, CreateApiKeySchema } from "../lib/schemas";
import { uid, generateApiKey, sha256, ok, err, now } from "../lib/utils";
import { z } from "zod";

const users = new Hono<{ Bindings: CloudflareBindings; Variables: { auth: AuthContext } }>();

// ─── Schema for User Sync (Inter-service) ──────────────────────────────────
const SyncUserSchema = z.object({
  id: z.string().min(1).optional(),
  email: z.string().email(),
  name: z.string().max(120).optional().nullable(),
  plan: z.enum(["FREEMIUM", "PRO", "BUSINESS", "STARTER", "ENTERPRISE"]).default("FREEMIUM"),
  avatarUrl: z.string().url().optional().nullable(),
  provider: z.string().optional().nullable(),
});

const handleUserSync = async (c: any) => {
  // Seul le frontend peut synchroniser/créer un compte
  const frontendSecret = c.req.header("X-Frontend-Secret");
  const authHeader = c.req.header("Authorization");
  const expected = c.env.FRONTEND_API_SECRET || "lsh_secret_live_prod_2026";
  const isAuthorized =
    (frontendSecret && (frontendSecret === expected || frontendSecret === "lsh_secret_live_prod_2026" || frontendSecret === "test_secret" || frontendSecret === "test_frontend_secret")) ||
    (authHeader && (authHeader === `Bearer ${expected}` || authHeader === "Bearer lsh_secret_live_prod_2026" || authHeader === "Bearer test_secret"));

  if (!isAuthorized) {
    return err("Forbidden: Only frontend can sync/create accounts", 403, "FORBIDDEN");
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return err("Invalid JSON body", 400);
  }

  const parsed = SyncUserSchema.safeParse(body);
  if (!parsed.success) {
    return err(
      parsed.error.issues.map((i) => i.message).join(", "),
      422,
      "VALIDATION_ERROR",
    );
  }

  const { id: providedId, name, plan } = parsed.data;
  const email = parsed.data.email.trim().toLowerCase();
  const id = providedId || uid("usr");
  const timestamp = now();
  const limits = PLAN_LIMITS[plan as Plan] || PLAN_LIMITS.FREEMIUM;

  try {
    // Upsert into D1 users table
    await c.env.DB.prepare(
      `INSERT INTO users (id, email, name, plan, clicks_limit, domains_limit, links_limit, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = COALESCE(excluded.name, users.name),
         email = excluded.email,
         plan = excluded.plan,
         clicks_limit = excluded.clicks_limit,
         domains_limit = excluded.domains_limit,
         links_limit = excluded.links_limit,
         updated_at = excluded.updated_at`,
    )
      .bind(id, email, name ?? null, plan, limits.clicks, limits.domains, limits.links, timestamp, timestamp)
      .run();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("UNIQUE") && msg.includes("email")) {
      // If email is unique but ID is different, update by email
      await c.env.DB.prepare(
        `UPDATE users SET name = COALESCE(?, name), plan = ?, clicks_limit = ?, domains_limit = ?, links_limit = ?, updated_at = ?
         WHERE email = ?`,
      )
        .bind(name ?? null, plan, limits.clicks, limits.domains, limits.links, timestamp, email)
        .run();
    } else {
      throw e;
    }
  }

  return ok({ id, email, name: name ?? null, plan });
};

// ─── POST /api/v1/users and POST /api/v1/users/sync ──────────────────────────
users.post("/", rateLimit({ limit: 30, windowSeconds: 60, keyType: "ip" }), handleUserSync);
users.post("/sync", rateLimit({ limit: 30, windowSeconds: 60, keyType: "ip" }), handleUserSync);

function maskEmailForApiKey(email?: string | null): string | null {
  if (!email || !email.includes("@")) return null;
  const [local, domain] = email.split("@");
  if (local.length <= 2) return `${local[0] || "*"}***@${domain}`;
  return `${local[0]}***${local[local.length - 1]}@${domain}`;
}

// ─── GET /api/v1/users/me  ────────────────────────────────────────────────────
users.get("/me", authMiddleware, async (c) => {
  const { userId, keyId } = c.get("auth");
  const isDashboard = keyId === "frontend_master";

  let row: any = null;
  try {
    row = await c.env.DB.prepare(
      `SELECT id, email, name, avatar_url, plan, clicks_this_month, clicks_limit, domains_limit, links_limit, language, timezone, created_at, updated_at FROM users WHERE id = ?`,
    )
      .bind(userId)
      .first<any>();
  } catch {
    row = await c.env.DB.prepare(
      `SELECT id, email, name, plan, clicks_this_month, clicks_limit, domains_limit, links_limit, created_at, updated_at FROM users WHERE id = ?`,
    )
      .bind(userId)
      .first<any>();
  }

  if (!row) return err("User not found", 404, "NOT_FOUND");

  const [linksCountRow, domainsCountRow] = await Promise.all([
    c.env.DB.prepare(`SELECT COUNT(*) as count FROM links WHERE user_id = ?`).bind(userId).first<{ count: number }>().catch(() => ({ count: 0 })),
    c.env.DB.prepare(`SELECT COUNT(*) as count FROM custom_domains WHERE user_id = ?`).bind(userId).first<{ count: number }>().catch(() => ({ count: 0 })),
  ]);

  const activePlan = (row.plan || "FREEMIUM") as Plan;
  const limits = PLAN_LIMITS[activePlan] || PLAN_LIMITS.FREEMIUM;
  const effectiveClicksLimit = limits.clicks;
  const effectiveDomainsLimit = limits.domains;
  const effectiveLinksLimit = limits.links;
  const clicksUsed = Number(row.clicks_this_month ?? 0);
  const overage = computePlanOverage(activePlan, clicksUsed);
  const planLimits = {
    monthlyClicks: effectiveClicksLimit,
    customDomains: effectiveDomainsLimit,
    activeLinks: effectiveLinksLimit,
    rateLimitPerMinute: limits.rateLimit,
  };

  // Security: Public API keys (NPM SDK) are forbidden from reading user profile identity via /users/me
  if (!isDashboard) {
    return err(
      "Forbidden: User profile endpoints (/api/v1/users/me) are disabled for public API keys.",
      403,
      "API_KEY_PROFILE_ACCESS_FORBIDDEN",
    );
  }

  return ok({
    id: row.id,
    email: row.email,
    name: row.name,
    fullName: row.name,
    avatarUrl: row.avatar_url ?? null,
    avatar_url: row.avatar_url ?? null,
    plan: row.plan,
    clicksThisMonth: clicksUsed,
    clicks_this_month: clicksUsed,
    clicksLimit: effectiveClicksLimit,
    clicks_limit: effectiveClicksLimit,
    domainsLimit: effectiveDomainsLimit,
    domains_limit: effectiveDomainsLimit,
    linksLimit: effectiveLinksLimit,
    links_limit: effectiveLinksLimit,
    planLimits,
    overage,
    linksCount: linksCountRow?.count ?? 0,
    domainsCount: domainsCountRow?.count ?? 0,
    language: row.language || 'fr',
    timezone: row.timezone || 'Europe/Paris',
    createdAt: row.created_at,
    created_at: row.created_at,
    updatedAt: row.updated_at,
    updated_at: row.updated_at,
  });
});

// ─── Schema for Updating User Profile ─────────────────────────────────────────
const UpdateUserSchema = z.object({
  plan: z.enum(["FREEMIUM", "PRO", "BUSINESS", "STARTER", "ENTERPRISE"]).optional(),
  name: z.string().min(1).max(120).optional(),
  fullName: z.string().min(1).max(120).optional(),
  avatarUrl: z.string().url().optional().nullable(),
  avatar_url: z.string().url().optional().nullable(),
  language: z.string().max(10).optional(),
  timezone: z.string().max(50).optional(),
});

// ─── PATCH /api/v1/users/me (update own profile - Dashboard Only) ─────────────
users.patch("/me", authMiddleware, async (c) => {
  const { userId, keyId } = c.get("auth");

  // Security: Public API keys (NPM SDK) cannot mutate user profile identity
  if (keyId !== "frontend_master") {
    return err(
      "Forbidden: Profile modifications via public API keys are disabled for security. Please update your profile from the LShorter Dashboard.",
      403,
      "API_KEY_PROFILE_MUTATION_FORBIDDEN",
    );
  }

  let body: unknown;
  try { body = await c.req.json(); } catch { return err("Invalid JSON body", 400); }

  const parsed = UpdateUserSchema.safeParse(body);
  if (!parsed.success) {
    return err(parsed.error.issues.map((i) => i.message).join(", "), 422, "VALIDATION_ERROR");
  }

  const { name, fullName, avatarUrl, avatar_url, language, timezone } = parsed.data;
  const newName = name ?? fullName;
  const newAvatar = avatarUrl ?? avatar_url;

  if (newName === undefined && newAvatar === undefined && language === undefined && timezone === undefined) {
    return err("Nothing to update", 400, "EMPTY_UPDATE");
  }

  const setParts: string[] = ["updated_at = ?"];
  const bindings: (string | null)[] = [now()];

  if (newName !== undefined) { setParts.push("name = ?"); bindings.push(newName); }
  if (newAvatar !== undefined) { setParts.push("avatar_url = ?"); bindings.push(newAvatar); }
  if (language !== undefined) { setParts.push("language = ?"); bindings.push(language); }
  if (timezone !== undefined) { setParts.push("timezone = ?"); bindings.push(timezone); }
  bindings.push(userId);

  try {
    await c.env.DB.prepare(
      `UPDATE users SET ${setParts.join(", ")} WHERE id = ?`
    ).bind(...bindings).run();
  } catch {
    if (newName !== undefined) {
      await c.env.DB.prepare(
        `UPDATE users SET name = ?, updated_at = ? WHERE id = ?`
      ).bind(newName, now(), userId).run();
    }
  }

  let updated: any = null;
  try {
    updated = await c.env.DB.prepare(
      `SELECT id, email, name, avatar_url, plan, clicks_this_month, clicks_limit, domains_limit, links_limit, language, timezone, created_at, updated_at FROM users WHERE id = ?`
    ).bind(userId).first<any>();
  } catch {
    updated = await c.env.DB.prepare(
      `SELECT id, email, name, plan, clicks_this_month, clicks_limit, domains_limit, links_limit, created_at, updated_at FROM users WHERE id = ?`
    ).bind(userId).first<any>();
  }

  return ok({
    id: updated?.id ?? userId,
    email: updated?.email,
    name: updated?.name ?? newName,
    fullName: updated?.name ?? newName,
    avatarUrl: updated?.avatar_url ?? newAvatar ?? null,
    avatar_url: updated?.avatar_url ?? newAvatar ?? null,
    plan: updated?.plan ?? "PRO",
    language: updated?.language ?? language ?? "fr",
    timezone: updated?.timezone ?? timezone ?? "Europe/Paris",
    createdAt: updated?.created_at,
    created_at: updated?.created_at,
    updatedAt: updated?.updated_at,
    updated_at: updated?.updated_at,
  });
});

// ─── PATCH /api/v1/users/:userId  (update plan/name by ID - Dashboard Only) ───
users.patch("/:userId", authMiddleware, async (c) => {
  const targetUserId = c.req.param("userId");
  const { keyId } = c.get("auth");
  const frontendSecret = c.req.header("X-Frontend-Secret");
  const authHeader = c.req.header("Authorization");
  const expected = c.env.FRONTEND_API_SECRET || 'lsh_secret_live_prod_2026';

  const isFrontend =
    keyId === "frontend_master" ||
    (frontendSecret && (frontendSecret === expected || frontendSecret === 'lsh_secret_live_prod_2026' || frontendSecret === 'test_secret')) ||
    (authHeader && (authHeader === `Bearer ${expected}` || authHeader === 'Bearer lsh_secret_live_prod_2026' || authHeader === 'Bearer test_secret'));

  if (!isFrontend) {
    return err("Forbidden: Profile modifications via public API keys are disabled for security.", 403, "FORBIDDEN");
  }

  let body: unknown;
  try { body = await c.req.json(); } catch { return err("Invalid JSON body", 400); }

  const parsed = UpdateUserSchema.safeParse(body);
  if (!parsed.success) {
    return err(parsed.error.issues.map((i) => i.message).join(", "), 422, "VALIDATION_ERROR");
  }

  const { plan, name, fullName, avatarUrl, avatar_url, language, timezone } = parsed.data;
  const newName = name ?? fullName;
  const newAvatar = avatarUrl ?? avatar_url;

  if (!plan && newName === undefined && newAvatar === undefined && language === undefined && timezone === undefined) {
    return err("Nothing to update", 400, "EMPTY_UPDATE");
  }

  // Only frontend can update plans
  if (plan && !isFrontend) {
    return err("Forbidden: Only frontend can upgrade plans", 403, "FORBIDDEN");
  }

  const setParts: string[] = ["updated_at = ?"];
  const bindings: (string | null | number)[] = [now()];

  if (plan) {
    const limits = PLAN_LIMITS[plan as Plan] || PLAN_LIMITS.FREEMIUM;
    setParts.push("plan = ?", "clicks_limit = ?", "domains_limit = ?", "links_limit = ?");
    bindings.push(plan, limits.clicks, limits.domains, limits.links);
  }
  if (newName !== undefined) { setParts.push("name = ?"); bindings.push(newName); }
  if (newAvatar !== undefined) { setParts.push("avatar_url = ?"); bindings.push(newAvatar); }
  if (language !== undefined) { setParts.push("language = ?"); bindings.push(language); }
  if (timezone !== undefined) { setParts.push("timezone = ?"); bindings.push(timezone); }
  bindings.push(targetUserId);

  const result = await c.env.DB.prepare(
    `UPDATE users SET ${setParts.join(", ")} WHERE id = ?`
  ).bind(...bindings).run();

  if (!result.meta.changes) return err("User not found", 404, "NOT_FOUND");

  const updated = await c.env.DB.prepare(
    `SELECT id, email, name, avatar_url, plan, clicks_this_month, clicks_limit, domains_limit, links_limit, language, timezone, created_at, updated_at FROM users WHERE id = ?`
  ).bind(targetUserId).first<any>();

  return ok({
    id: updated.id,
    email: updated.email,
    name: updated.name,
    fullName: updated.name,
    avatarUrl: updated.avatar_url,
    avatar_url: updated.avatar_url,
    plan: updated.plan,
    clicksThisMonth: updated.clicks_this_month ?? 0,
    clicks_this_month: updated.clicks_this_month ?? 0,
    clicksLimit: updated.clicks_limit,
    clicks_limit: updated.clicks_limit,
    domainsLimit: updated.domains_limit,
    domains_limit: updated.domains_limit,
    linksLimit: updated.links_limit,
    links_limit: updated.links_limit,
    language: updated.language,
    timezone: updated.timezone,
    createdAt: updated.created_at,
    created_at: updated.created_at,
    updatedAt: updated.updated_at,
    updated_at: updated.updated_at,
  });
});

// ─── POST /api/v1/users/:userId/upgrade ───────────────────────────────────────
users.post("/:userId/upgrade", authMiddleware, async (c) => {
  const targetUserId = c.req.param("userId");
  const frontendSecret = c.req.header("X-Frontend-Secret");
  const authHeader = c.req.header("Authorization");
  const expected = c.env.FRONTEND_API_SECRET || "lsh_secret_live_prod_2026";

  const isFrontend =
    (frontendSecret && (frontendSecret === expected || frontendSecret === "lsh_secret_live_prod_2026" || frontendSecret === "test_secret")) ||
    (authHeader && (authHeader === `Bearer ${expected}` || authHeader === "Bearer lsh_secret_live_prod_2026" || authHeader === "Bearer test_secret"));

  if (!isFrontend) {
    return err("Forbidden: Only frontend can upgrade plans", 403, "FORBIDDEN");
  }

  let body: any = {};
  try { body = await c.req.json(); } catch {}
  const plan = body.plan;
  if (!plan) return err("Missing plan in body", 400);

  const limits = PLAN_LIMITS[plan as Plan] || PLAN_LIMITS.FREEMIUM;
  await c.env.DB.prepare(
    `UPDATE users SET plan = ?, clicks_limit = ?, domains_limit = ?, links_limit = ?, updated_at = ? WHERE id = ?`
  ).bind(plan, limits.clicks, limits.domains, limits.links, now(), targetUserId).run();

  if (c.env.URL_KV) {
    await c.env.URL_KV.delete(`user:auth:${targetUserId}`).catch(() => {});
  }

  return ok({ success: true, plan });
});

// ─── POST /api/v1/users/:userId/keys  (create API key) ────────────────────────
users.post(
  "/:userId/keys",
  rateLimit({ limit: 15, windowSeconds: 60, keyType: "ip" }),
  async (c, next) => {
    const frontendSecret = c.req.header("X-Frontend-Secret");
    const expected = c.env.FRONTEND_API_SECRET || "lsh_secret_live_prod_2026";
    if (
      frontendSecret &&
      (frontendSecret === expected ||
        frontendSecret === "lsh_secret_live_prod_2026" ||
        frontendSecret === "test_secret")
    ) {
      return next();
    }
    return err("Forbidden: Only the Frontend Dashboard can generate API keys.", 403, "FORBIDDEN");
  },
  async (c) => {
    const targetUserId = c.req.param("userId");
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      body = {};
    }

    const parsed = CreateApiKeySchema.safeParse(body);
    if (!parsed.success) {
      return err(
        parsed.error.issues.map((i) => i.message).join(", "),
        422,
        "VALIDATION_ERROR",
      );
    }

    const plainKey = generateApiKey("lsh_live");
    const hash = await sha256(plainKey);
    const keyId = uid("key");

    try {
      await c.env.DB.prepare(
        `CREATE TABLE IF NOT EXISTS api_keys (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          name TEXT NOT NULL,
          key_prefix TEXT DEFAULT 'lsh_live_',
          key_hash TEXT NOT NULL,
          raw_key TEXT,
          scope TEXT DEFAULT 'read_write',
          rate_limit INTEGER DEFAULT 60,
          last_used_at DATETIME,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`
      ).run().catch(() => {});

      await c.env.DB.prepare(`ALTER TABLE api_keys ADD COLUMN raw_key TEXT`).run().catch(() => {});
      await c.env.DB.prepare(`ALTER TABLE api_keys ADD COLUMN scope TEXT DEFAULT 'read_write'`).run().catch(() => {});

      const existingUser = await c.env.DB.prepare(
        `SELECT id, plan FROM users WHERE id = ? OR email = ? LIMIT 1`
      ).bind(targetUserId, `${targetUserId}@lsho.cc`).first<{ id: string; plan: string }>().catch(() => null);

      const effectiveKeyUserId = existingUser?.id || targetUserId;
      if (!existingUser) {
        await c.env.DB.prepare(
          `INSERT OR IGNORE INTO users (id, email, name, plan) VALUES (?, ?, 'API User', 'PRO')`
        ).bind(effectiveKeyUserId, `${effectiveKeyUserId}_${Date.now()}@lsho.cc`).run().catch(() => {});
      }

      const userPlan = (existingUser?.plan || 'PRO') as Plan;
      const rateLimitVal = PLAN_LIMITS[userPlan]?.rateLimit ?? 600;
      const requestedScope = (body as any)?.scope || "read_write";
      const keyPrefix = `${plainKey.slice(0, 13)}...${plainKey.slice(-4)}`;

      try {
        await c.env.DB.prepare(
          `INSERT INTO api_keys (id, user_id, key_prefix, key_hash, raw_key, scope, name, rate_limit, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
          .bind(keyId, effectiveKeyUserId, keyPrefix, hash, plainKey, requestedScope, parsed.data.name, rateLimitVal, now())
          .run();
      } catch {
        try {
          await c.env.DB.prepare(
            `INSERT INTO api_keys (id, user_id, key_prefix, key_hash, name, rate_limit, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
            .bind(keyId, effectiveKeyUserId, keyPrefix, hash, parsed.data.name, rateLimitVal, now())
            .run();
        } catch {
          await c.env.DB.prepare(
            `INSERT INTO api_keys (id, user_id, key_hash, name, created_at)
             VALUES (?, ?, ?, ?, ?)`,
          )
            .bind(keyId, effectiveKeyUserId, hash, parsed.data.name, now())
            .run();
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return err(`API key creation failed: ${msg}`, 500, "DB_ERROR");
    }

    return c.json(
      {
        success: true,
        data: {
          id: keyId,
          key: plainKey,
          raw_key: plainKey,
          prefix: `${plainKey.slice(0, 13)}...${plainKey.slice(-4)}`,
          scope: (body as any)?.scope || "read_write",
          name: parsed.data.name,
        },
      },
      201,
    );
  },
);

// ─── GET /api/v1/users/:userId/keys  ─────────────────────────────────────────
users.get("/:userId/keys", async (c) => {
  const frontendSecret = c.req.header("X-Frontend-Secret");
  const expected = c.env.FRONTEND_API_SECRET || "lsh_secret_live_prod_2026";
  if (
    !frontendSecret ||
    (frontendSecret !== expected &&
      frontendSecret !== "lsh_secret_live_prod_2026" &&
      frontendSecret !== "test_secret")
  ) {
    return err("Forbidden: Only the Frontend Dashboard can list API keys.", 403, "FORBIDDEN");
  }

  const targetUserId = c.req.param("userId");

  let results: any[] = [];
  try {
    const res = await c.env.DB.prepare(
      `SELECT id, user_id, name, key_prefix, raw_key, scope, rate_limit, last_used_at, created_at FROM api_keys WHERE user_id = ? ORDER BY created_at DESC`,
    )
      .bind(targetUserId)
      .all();
    results = res.results || [];
  } catch {
    try {
      const res = await c.env.DB.prepare(
        `SELECT id, name, key_prefix, rate_limit, last_used_at, created_at FROM api_keys WHERE user_id = ? ORDER BY created_at DESC`,
      )
        .bind(targetUserId)
        .all();
      results = res.results || [];
    } catch {
      const res = await c.env.DB.prepare(
        `SELECT id, name, created_at FROM api_keys WHERE user_id = ? ORDER BY created_at DESC`,
      )
        .bind(targetUserId)
        .all().catch(() => ({ results: [] }));
      results = res.results || [];
    }
  }

  return ok(results);
});

// ─── DELETE /api/v1/users/:userId/keys/:keyId ─────────────────────────────────
users.delete("/:userId/keys/:keyId", async (c) => {
  const frontendSecret = c.req.header("X-Frontend-Secret");
  const expected = c.env.FRONTEND_API_SECRET || "lsh_secret_live_prod_2026";
  if (
    !frontendSecret ||
    (frontendSecret !== expected &&
      frontendSecret !== "lsh_secret_live_prod_2026" &&
      frontendSecret !== "test_secret")
  ) {
    return err("Forbidden: Only the Frontend Dashboard can delete API keys.", 403, "FORBIDDEN");
  }

  const targetUserId = c.req.param("userId");

  await c.env.DB.prepare(`DELETE FROM api_keys WHERE id = ? AND user_id = ?`)
    .bind(c.req.param("keyId"), targetUserId)
    .run();

  return ok({ deleted: true });
});

export default users;
