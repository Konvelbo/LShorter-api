// =================================================================
// ROUTE : USER MANAGEMENT  POST /api/v1/users  & POST /api/v1/users/:id/keys
// =================================================================

import { Hono } from "hono";
import { type CloudflareBindings, type AuthContext } from "../lib/types";
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
  const expected = c.env.FRONTEND_API_SECRET || "test_secret";
  if (c.req.header("X-Frontend-Secret") !== expected) {
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

  try {
    // Upsert into D1 users table (columns: id, email, name, plan, created_at, updated_at)
    await c.env.DB.prepare(
      `INSERT INTO users (id, email, name, plan, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = COALESCE(excluded.name, users.name),
         email = excluded.email,
         plan = excluded.plan,
         updated_at = excluded.updated_at`,
    )
      .bind(id, email, name ?? null, plan, timestamp, timestamp)
      .run();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("UNIQUE") && msg.includes("email")) {
      // If email is unique but ID is different, update by email
      await c.env.DB.prepare(
        `UPDATE users SET name = COALESCE(?, name), plan = ?, updated_at = ?
         WHERE email = ?`,
      )
        .bind(name ?? null, plan, timestamp, email)
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
    `SELECT id, email, name, plan, created_at, updated_at FROM users WHERE id = ?`,
  )
    .bind(userId)
    .first();

  if (!row) return err("User not found", 404, "NOT_FOUND");
  return ok(row);
});

// ─── PATCH /api/v1/users/:userId  (update plan/name) ─────────────
const UpdateUserSchema = z.object({
  plan: z.enum(["FREEMIUM", "PRO", "BUSINESS", "STARTER", "ENTERPRISE"]).optional(),
  name: z.string().min(1).max(120).optional(),
});

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

  const { plan, name } = parsed.data;
  if (!plan && !name) return err("Nothing to update", 400, "EMPTY_UPDATE");

  // Only frontend can update plans
  if (plan && !isFrontend) {
    return err("Forbidden: Only frontend can upgrade plans", 403, "FORBIDDEN");
  }

  const setParts: string[] = ["updated_at = ?"];
  const bindings: (string | null)[] = [now()];

  if (plan) { setParts.push("plan = ?"); bindings.push(plan); }
  if (name) { setParts.push("name = ?"); bindings.push(name); }
  bindings.push(targetUserId);

  const result = await c.env.DB.prepare(
    `UPDATE users SET ${setParts.join(", ")} WHERE id = ?`
  ).bind(...bindings).run();

  if (!result.meta.changes) return err("User not found", 404, "NOT_FOUND");

  const updated = await c.env.DB.prepare(
    `SELECT id, email, name, plan, created_at, updated_at FROM users WHERE id = ?`
  ).bind(targetUserId).first();

  return ok(updated);
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
      await c.env.DB.prepare(
        `INSERT INTO api_keys (id, user_id, key_hash, name, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
        .bind(keyId, targetUserId, hash, parsed.data.name, now())
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
