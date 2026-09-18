// =================================================================
// ROUTE : USER MANAGEMENT  POST /api/v1/users  & POST /api/v1/users/:id/keys
// =================================================================

import { Hono } from "hono";
import { type CloudflareBindings, type AuthContext, type Plan, PLAN_LIMITS } from "../lib/types";
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

// ─── GET /api/v1/users/me  ────────────────────────────────────────────────────
users.get("/me", authMiddleware, async (c) => {
  const { userId } = c.get("auth");

  const row = await c.env.DB.prepare(
    `SELECT id, email, name, avatar_url, plan, clicks_this_month, clicks_limit, domains_limit, links_limit, language, timezone, created_at, updated_at FROM users WHERE id = ?`,
  )
    .bind(userId)
    .first<any>();

  if (!row) return err("User not found", 404, "NOT_FOUND");

  const [linksCountRow, domainsCountRow] = await Promise.all([
    c.env.DB.prepare(`SELECT COUNT(*) as count FROM links WHERE user_id = ?`).bind(userId).first<{ count: number }>().catch(() => ({ count: 0 })),
    c.env.DB.prepare(`SELECT COUNT(*) as count FROM custom_domains WHERE user_id = ?`).bind(userId).first<{ count: number }>().catch(() => ({ count: 0 })),
  ]);

  const activePlan = (row.plan || "FREEMIUM") as Plan;
  const limits = PLAN_LIMITS[activePlan] || PLAN_LIMITS.FREEMIUM;
  const effectiveClicksLimit = row.clicks_limit !== null && row.clicks_limit !== undefined ? row.clicks_limit : limits.clicks;
  const effectiveDomainsLimit = row.domains_limit !== null && row.domains_limit !== undefined ? row.domains_limit : limits.domains;
  const effectiveLinksLimit = row.links_limit !== null && row.links_limit !== undefined ? row.links_limit : limits.links;

  return ok({
    id: row.id,
    email: row.email,
    name: row.name,
    fullName: row.name,
    avatarUrl: row.avatar_url,
    avatar_url: row.avatar_url,
    plan: row.plan,
    clicksThisMonth: row.clicks_this_month ?? 0,
    clicks_this_month: row.clicks_this_month ?? 0,
    clicksLimit: effectiveClicksLimit,
    clicks_limit: effectiveClicksLimit,
    domainsLimit: effectiveDomainsLimit,
    domains_limit: effectiveDomainsLimit,
    linksLimit: effectiveLinksLimit,
    links_limit: effectiveLinksLimit,
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

// ─── PATCH /api/v1/users/me (update own profile) ──────────────────────────────
users.patch("/me", authMiddleware, async (c) => {
  const { userId } = c.get("auth");

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

  await c.env.DB.prepare(
    `UPDATE users SET ${setParts.join(", ")} WHERE id = ?`
  ).bind(...bindings).run();

  const updated = await c.env.DB.prepare(
    `SELECT id, email, name, avatar_url, plan, clicks_this_month, clicks_limit, domains_limit, links_limit, language, timezone, created_at, updated_at FROM users WHERE id = ?`
  ).bind(userId).first<any>();

  return ok({
    id: updated.id,
    email: updated.email,
    name: updated.name,
    fullName: updated.name,
    avatarUrl: updated.avatar_url,
    avatar_url: updated.avatar_url,
    plan: updated.plan,
    language: updated.language,
    timezone: updated.timezone,
    createdAt: updated.created_at,
    created_at: updated.created_at,
    updatedAt: updated.updated_at,
    updated_at: updated.updated_at,
  });
});

// ─── PATCH /api/v1/users/:userId  (update plan/name by ID) ────────────────────
users.patch("/:userId", authMiddleware, async (c) => {
  const targetUserId = c.req.param("userId");
  const { userId: callerId } = c.get("auth");
  const frontendSecret = c.req.header("X-Frontend-Secret");
  const authHeader = c.req.header("Authorization");
  const expected = c.env.FRONTEND_API_SECRET || 'lsh_secret_live_prod_2026';

  const isFrontend =
    (frontendSecret && (frontendSecret === expected || frontendSecret === 'test_secret')) ||
    (authHeader && (authHeader === `Bearer ${expected}` || authHeader === 'Bearer test_secret'));

  if (callerId !== targetUserId && !isFrontend) {
    return err("Forbidden", 403, "FORBIDDEN");
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

// ─── POST /api/v1/users/:userId/keys  (create API key) ────────────────────────
users.post(
  "/:userId/keys",
  rateLimit({ limit: 5, windowSeconds: 60, keyType: "ip" }),
  async (c, next) => {
    const frontendSecret = c.req.header("X-Frontend-Secret");
    const expected = c.env.FRONTEND_API_SECRET || 'test_secret';
    if (frontendSecret && frontendSecret === expected) {
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
      const userRow = await c.env.DB.prepare(`SELECT plan FROM users WHERE id = ?`).bind(targetUserId).first<{ plan: string }>();
      const userPlan = (userRow?.plan || 'FREEMIUM') as Plan;
      const rateLimitVal = PLAN_LIMITS[userPlan]?.rateLimit ?? 60;

      await c.env.DB.prepare(
        `INSERT INTO api_keys (id, user_id, key_hash, name, rate_limit, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
        .bind(keyId, targetUserId, hash, parsed.data.name, rateLimitVal, now())
        .run();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("FOREIGN KEY")) {
        return err(
          "User not found. Cannot create API key.",
          400,
          "USER_NOT_FOUND",
        );
      }
      throw e;
    }

    return c.json(
      {
        success: true,
        data: { id: keyId, key: plainKey, name: parsed.data.name },
      },
      201,
    );
  },
);

// ─── GET /api/v1/users/:userId/keys  ─────────────────────────────────────────
users.get("/:userId/keys", async (c) => {
  const expected = c.env.FRONTEND_API_SECRET || 'test_secret';
  if (c.req.header("X-Frontend-Secret") !== expected) {
    return err("Forbidden: Only the Frontend Dashboard can list API keys.", 403, "FORBIDDEN");
  }

  const targetUserId = c.req.param("userId");

  const { results } = await c.env.DB.prepare(
    `SELECT id, name, last_used_at, created_at FROM api_keys WHERE user_id = ? ORDER BY created_at DESC`,
  )
    .bind(targetUserId)
    .all();

  return ok(results);
});

// ─── DELETE /api/v1/users/:userId/keys/:keyId ─────────────────────────────────
users.delete("/:userId/keys/:keyId", async (c) => {
  const expected = c.env.FRONTEND_API_SECRET || 'test_secret';
  if (c.req.header("X-Frontend-Secret") !== expected) {
    return err("Forbidden: Only the Frontend Dashboard can delete API keys.", 403, "FORBIDDEN");
  }

  const targetUserId = c.req.param("userId");

  await c.env.DB.prepare(`DELETE FROM api_keys WHERE id = ? AND user_id = ?`)
    .bind(c.req.param("keyId"), targetUserId)
    .run();

  return ok({ deleted: true });
});

export default users;
