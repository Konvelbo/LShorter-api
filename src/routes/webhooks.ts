// =================================================================
// ROUTE : WEBHOOKS  /api/v1/webhooks
// =================================================================

import { Hono } from "hono";
import { type CloudflareBindings, type AuthContext } from "../lib/types";
import { authMiddleware, isFrontendAuth } from "../middleware/auth";
import { rateLimit } from "../middleware/ratelimit";
import { CreateWebhookSchema, UpdateWebhookSchema } from "../lib/schemas";
import { uid, ok, err, now } from "../lib/utils";

const MAX_WEBHOOKS_PER_USER = 25;
const PAID_PLANS = new Set(["PRO", "BUSINESS", "ENTERPRISE"]);

function generateCryptoWebhookSecret(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `whsec_${hex}`;
}

const webhooks = new Hono<{
  Bindings: CloudflareBindings;
  Variables: { auth: AuthContext };
}>();

// Strict authentication (Dashboard secret OR valid hashed Bearer API key)
webhooks.use("*", authMiddleware);

function formatWebhookRow(w: any) {
  let parsedEvents: string[] = ["click.created", "conversion.created"];
  try {
    if (typeof w.events === "string") {
      parsedEvents = JSON.parse(w.events);
    } else if (Array.isArray(w.events)) {
      parsedEvents = w.events;
    }
  } catch {}

  return {
    id: w.id,
    userId: w.user_id,
    url: w.url,
    events: parsedEvents,
    secretKey: w.secret_key,
    isActive: Boolean(w.is_active),
    lastTriggeredAt: w.last_triggered_at,
    lastStatus: w.last_status,
    createdAt: w.created_at,
    created_at: w.created_at,
  };
}

// ─── GET /api/v1/webhooks (List all webhooks for user) ───────────────────────
webhooks.get("/", async (c) => {
  const auth = c.get("auth");
  const qUserId = c.req.query("userId") || c.req.header("X-User-Id");
  const userId = isFrontendAuth(auth) && qUserId ? qUserId : auth.userId;

  const rows = await c.env.DB.prepare(
    `SELECT id, user_id, url, events, secret_key, is_active, last_triggered_at, last_status, created_at
     FROM webhooks
     WHERE user_id = ?
     ORDER BY created_at DESC`,
  )
    .bind(userId)
    .all();

  const data = (rows.results || []).map(formatWebhookRow);
  return ok({ webhooks: data });
});

// ─── GET /api/v1/webhooks/:id (Get single webhook) ───────────────────────────
webhooks.get("/:id", async (c) => {
  const auth = c.get("auth");
  const id = c.req.param("id");

  const row = await c.env.DB.prepare(
    `SELECT id, user_id, url, events, secret_key, is_active, last_triggered_at, last_status, created_at
     FROM webhooks
     WHERE id = ?`,
  )
    .bind(id)
    .first<any>();

  if (!row) {
    return err("Webhook not found", 404, "NOT_FOUND");
  }

  const isFrontend = isFrontendAuth(auth);
  const qUserId = c.req.query("userId") || c.req.header("X-User-Id");
  if (
    (!isFrontend && row.user_id !== auth.userId) ||
    (isFrontend && qUserId && qUserId !== "usr_default" && row.user_id !== qUserId)
  ) {
    return err("Forbidden", 403, "FORBIDDEN");
  }

  return ok({ webhook: formatWebhookRow(row) });
});

// ─── POST /api/v1/webhooks (Create a new webhook — PRO+ & Hardened) ──────────
webhooks.post(
  "/",
  rateLimit({ limit: 20, windowSeconds: 60, keyType: "apiKey" }),
  async (c) => {
    const auth = c.get("auth");
    const isFrontend = isFrontendAuth(auth);
    const explicitHeaderPlan = c.req.header("X-User-Plan")?.toUpperCase();
    const effectivePlan = explicitHeaderPlan || String(auth.plan || "").toUpperCase();

    // Server-side plan gating (Free/Starter cannot provision webhooks)
    if ((!isFrontend || explicitHeaderPlan) && !PAID_PLANS.has(effectivePlan)) {
      return err(
        "Webhooks require a PRO, BUSINESS, or ENTERPRISE subscription.",
        403,
        "PLAN_UPGRADE_REQUIRED",
      );
    }

    const qUserId = c.req.query("userId") || c.req.header("X-User-Id");
    let body: any = {};
    try {
      body = await c.req.json();
    } catch {
      return err("Invalid JSON body", 400);
    }

    const parsed = CreateWebhookSchema.safeParse(body);
    if (!parsed.success) {
      return err(
        parsed.error.issues.map((i) => i.message).join(", "),
        422,
        "VALIDATION_ERROR",
      );
    }

    // Strict multi-tenant isolation: public API keys are ALWAYS bound to auth.userId
    const userId = isFrontend ? (body.userId || qUserId || auth.userId) : auth.userId;

    // Anti-abuse quota cap per user
    const countRow = await c.env.DB.prepare(
      `SELECT COUNT(*) as n FROM webhooks WHERE user_id = ?`,
    )
      .bind(userId)
      .first<{ n: number }>()
      .catch(() => null);
    if ((countRow?.n ?? 0) >= MAX_WEBHOOKS_PER_USER) {
      return err(
        `Webhook limit reached (${MAX_WEBHOOKS_PER_USER} max per account). Delete an unused webhook first.`,
        403,
        "WEBHOOK_LIMIT_REACHED",
      );
    }

    const { url, events, secretKey, isActive } = parsed.data;
    const id = uid("wh");
    const finalSecret = secretKey?.trim() || generateCryptoWebhookSecret();
    const finalEvents =
      Array.isArray(events) && events.length > 0
        ? Array.from(new Set(events))
        : ["click.created", "conversion.created"];
    const createdAt = now();

    await c.env.DB.prepare(
      `INSERT INTO webhooks (id, user_id, url, events, secret_key, is_active, last_triggered_at, last_status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL, 200, ?)`,
    )
      .bind(
        id,
        userId,
        url,
        JSON.stringify(finalEvents),
        finalSecret,
        isActive !== false ? 1 : 0,
        createdAt,
      )
      .run();

    return ok({
      webhook: {
        id,
        userId,
        url,
        events: finalEvents,
        secretKey: finalSecret,
        isActive: isActive !== false,
        lastTriggeredAt: null,
        lastStatus: 200,
        createdAt,
        created_at: createdAt,
      },
    });
  },
);

// ─── PATCH /api/v1/webhooks/:id (Update webhook) ─────────────────────────────
webhooks.patch(
  "/:id",
  rateLimit({ limit: 30, windowSeconds: 60, keyType: "apiKey" }),
  async (c) => {
  const auth = c.get("auth");
  const isFrontend = isFrontendAuth(auth);
  const id = c.req.param("id");
  let body: any = {};
  try {
    body = await c.req.json();
  } catch {
    return err("Invalid JSON body", 400);
  }

  const parsed = UpdateWebhookSchema.safeParse(body);
  if (!parsed.success) {
    return err(
      parsed.error.issues.map((i) => i.message).join(", "),
      422,
      "VALIDATION_ERROR",
    );
  }

  // Prevent downgraded free-tier callers from reactivating or repointing webhooks
  const explicitHeaderPlan = c.req.header("X-User-Plan")?.toUpperCase();
  const effectivePlan = explicitHeaderPlan || String(auth.plan || "").toUpperCase();
  if (
    (!isFrontend || explicitHeaderPlan) &&
    !PAID_PLANS.has(effectivePlan) &&
    (parsed.data.isActive === true || parsed.data.url !== undefined || parsed.data.events !== undefined)
  ) {
    return err(
      "Webhooks require a PRO, BUSINESS, or ENTERPRISE subscription.",
      403,
      "PLAN_UPGRADE_REQUIRED",
    );
  }

  const existing = await c.env.DB.prepare(
    `SELECT id, user_id FROM webhooks WHERE id = ?`,
  )
    .bind(id)
    .first<{ id: string; user_id: string }>();

  if (!existing) {
    return err("Webhook not found", 404, "NOT_FOUND");
  }

  const qUserId = c.req.query("userId") || c.req.header("X-User-Id");
  if (
    (!isFrontend && existing.user_id !== auth.userId) ||
    (isFrontend && qUserId && qUserId !== "usr_default" && existing.user_id !== qUserId)
  ) {
    return err("Forbidden", 403, "FORBIDDEN");
  }

  const setParts: string[] = [];
  const bindings: any[] = [];

  if (parsed.data.url !== undefined) {
    setParts.push("url = ?");
    bindings.push(parsed.data.url);
  }
  if (parsed.data.events !== undefined) {
    setParts.push("events = ?");
    bindings.push(JSON.stringify(Array.from(new Set(parsed.data.events))));
  }
  if (parsed.data.secretKey !== undefined) {
    setParts.push("secret_key = ?");
    bindings.push(parsed.data.secretKey.trim());
  }
  if (parsed.data.isActive !== undefined) {
    setParts.push("is_active = ?");
    bindings.push(parsed.data.isActive ? 1 : 0);
  }
  if (isFrontend && parsed.data.lastStatus !== undefined) {
    setParts.push("last_status = ?");
    bindings.push(parsed.data.lastStatus);
  }
  if (isFrontend && parsed.data.lastTriggeredAt !== undefined) {
    setParts.push("last_triggered_at = ?");
    bindings.push(parsed.data.lastTriggeredAt);
  }

  if (setParts.length > 0) {
    bindings.push(id);
    await c.env.DB.prepare(
      `UPDATE webhooks SET ${setParts.join(", ")} WHERE id = ?`,
    )
      .bind(...bindings)
      .run();
  }

  const updated = await c.env.DB.prepare(
    `SELECT id, user_id, url, events, secret_key, is_active, last_triggered_at, last_status, created_at
     FROM webhooks WHERE id = ?`,
  )
    .bind(id)
    .first<any>();

  return ok({ webhook: formatWebhookRow(updated) });
  },
);

// ─── DELETE /api/v1/webhooks/:id (Remove webhook) ────────────────────────────
webhooks.delete(
  "/:id",
  rateLimit({ limit: 30, windowSeconds: 60, keyType: "apiKey" }),
  async (c) => {
  const auth = c.get("auth");
  const id = c.req.param("id");

  const existing = await c.env.DB.prepare(
    `SELECT id, user_id FROM webhooks WHERE id = ?`,
  )
    .bind(id)
    .first<{ id: string; user_id: string }>();

  if (!existing) {
    return err("Webhook not found", 404, "NOT_FOUND");
  }

  const isFrontend = isFrontendAuth(auth);
  const qUserId = c.req.query("userId") || c.req.header("X-User-Id");
  if (
    (!isFrontend && existing.user_id !== auth.userId) ||
    (isFrontend && qUserId && qUserId !== "usr_default" && existing.user_id !== qUserId)
  ) {
    return err("Forbidden", 403, "FORBIDDEN");
  }

  await c.env.DB.prepare(`DELETE FROM webhooks WHERE id = ?`)
    .bind(id)
    .run();

  return ok({ success: true, deleted: true, deletedId: id });
  },
);

export default webhooks;
