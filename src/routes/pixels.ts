// =================================================================
// ROUTE : RETARGETING PIXELS  /api/v1/pixels
// =================================================================

import { Hono } from "hono";
import { type CloudflareBindings, type AuthContext } from "../lib/types";
import { authMiddleware, isFrontendAuth } from "../middleware/auth";
import { rateLimit } from "../middleware/ratelimit";
import { CreatePixelSchema, UpdatePixelSchema } from "../lib/schemas";
import { uid, ok, err, now } from "../lib/utils";

const MAX_PIXELS_PER_USER = 50;
const PAID_PLANS = new Set(["PRO", "BUSINESS", "ENTERPRISE"]);

const pixels = new Hono<{
  Bindings: CloudflareBindings;
  Variables: { auth: AuthContext };
}>();

// Strict authentication (Dashboard secret OR valid hashed Bearer API key)
pixels.use("*", authMiddleware);

function formatPixelRow(p: any) {
  return {
    id: p.id,
    userId: p.user_id,
    platform: p.platform,
    pixelId: p.pixel_id,
    name: p.name,
    isActive: Boolean(p.is_active),
    eventsTrackedCount: Number(p.events_tracked_count || 0),
    createdAt: p.created_at,
  };
}

// ─── GET /api/v1/pixels (List all retargeting pixels for user) ───────────────
pixels.get("/", async (c) => {
  const auth = c.get("auth");
  const qUserId = c.req.query("userId") || c.req.header("X-User-Id");
  const userId = isFrontendAuth(auth) && qUserId ? qUserId : auth.userId;

  const rows = await c.env.DB.prepare(
    `SELECT id, user_id, platform, pixel_id, name, is_active, events_tracked_count, created_at
     FROM retargeting_pixels
     WHERE user_id = ?
     ORDER BY created_at DESC`,
  )
    .bind(userId)
    .all();

  const data = (rows.results || []).map(formatPixelRow);
  return ok({ pixels: data });
});

// ─── GET /api/v1/pixels/:id (Get single pixel) ───────────────────────────────
pixels.get("/:id", async (c) => {
  const auth = c.get("auth");
  const id = c.req.param("id");

  const row = await c.env.DB.prepare(
    `SELECT id, user_id, platform, pixel_id, name, is_active, events_tracked_count, created_at
     FROM retargeting_pixels
     WHERE id = ?`,
  )
    .bind(id)
    .first<any>();

  if (!row) {
    return err("Pixel not found", 404, "NOT_FOUND");
  }

  if (!isFrontendAuth(auth) && row.user_id !== auth.userId) {
    return err("Forbidden", 403, "FORBIDDEN");
  }

  return ok({ pixel: formatPixelRow(row) });
});

// ─── POST /api/v1/pixels (Register a new pixel — PRO+ & Hardened) ────────────
pixels.post(
  "/",
  rateLimit({ limit: 20, windowSeconds: 60, keyType: "apiKey" }),
  async (c) => {
    const auth = c.get("auth");
    const isFrontend = isFrontendAuth(auth);

    // Server-side plan gating for public API keys (Free/Starter cannot create pixels)
    if (!isFrontend && !PAID_PLANS.has(String(auth.plan || "").toUpperCase())) {
      return err(
        "Retargeting pixels require a PRO, BUSINESS, or ENTERPRISE subscription.",
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

    const normalizedBody = {
      ...body,
      platform: typeof body?.platform === "string"
        ? body.platform.trim().toLowerCase()
        : typeof body?.type === "string"
          ? body.type.trim().toLowerCase()
          : body?.platform,
    };

    const parsed = CreatePixelSchema.safeParse(normalizedBody);
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
      `SELECT COUNT(*) as n FROM retargeting_pixels WHERE user_id = ?`,
    )
      .bind(userId)
      .first<{ n: number }>()
      .catch(() => null);
    if ((countRow?.n ?? 0) >= MAX_PIXELS_PER_USER) {
      return err(
        `Retargeting pixel limit reached (${MAX_PIXELS_PER_USER} max per account). Delete an unused pixel first.`,
        403,
        "PIXEL_LIMIT_REACHED",
      );
    }

    const { platform, pixelId, name, isActive } = parsed.data;
    const id = uid("px");
    const createdAt = now();

    await c.env.DB.prepare(
      `INSERT INTO retargeting_pixels (id, user_id, platform, pixel_id, name, is_active, events_tracked_count, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
    )
      .bind(id, userId, platform, pixelId.trim(), name.trim(), isActive !== false ? 1 : 0, createdAt)
      .run();

    return ok({
      pixel: {
        id,
        userId,
        platform,
        pixelId: pixelId.trim(),
        name: name.trim(),
        isActive: isActive !== false,
        eventsTrackedCount: 0,
        createdAt,
      },
    });
  },
);

// ─── PATCH /api/v1/pixels/:id (Update pixel configuration) ───────────────────
pixels.patch(
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

  const parsed = UpdatePixelSchema.safeParse(body);
  if (!parsed.success) {
    return err(
      parsed.error.issues.map((i) => i.message).join(", "),
      422,
      "VALIDATION_ERROR",
    );
  }

  if (
    !isFrontend &&
    !PAID_PLANS.has(String(auth.plan || "").toUpperCase()) &&
    (parsed.data.isActive === true || parsed.data.pixelId !== undefined)
  ) {
    return err(
      "Retargeting pixels require a PRO, BUSINESS, or ENTERPRISE subscription.",
      403,
      "PLAN_UPGRADE_REQUIRED",
    );
  }

  const existing = await c.env.DB.prepare(
    `SELECT id, user_id FROM retargeting_pixels WHERE id = ?`,
  )
    .bind(id)
    .first<{ id: string; user_id: string }>();

  if (!existing) {
    return err("Pixel not found", 404, "NOT_FOUND");
  }

  if (!isFrontendAuth(auth) && existing.user_id !== auth.userId) {
    return err("Forbidden", 403, "FORBIDDEN");
  }

  const setParts: string[] = [];
  const bindings: any[] = [];

  if (parsed.data.name !== undefined) {
    setParts.push("name = ?");
    bindings.push(parsed.data.name.trim());
  }
  if (parsed.data.pixelId !== undefined) {
    setParts.push("pixel_id = ?");
    bindings.push(parsed.data.pixelId.trim());
  }
  if (parsed.data.isActive !== undefined) {
    setParts.push("is_active = ?");
    bindings.push(parsed.data.isActive ? 1 : 0);
  }

  if (setParts.length > 0) {
    bindings.push(id);
    await c.env.DB.prepare(
      `UPDATE retargeting_pixels SET ${setParts.join(", ")} WHERE id = ?`,
    )
      .bind(...bindings)
      .run();
  }

  const updated = await c.env.DB.prepare(
    `SELECT id, user_id, platform, pixel_id, name, is_active, events_tracked_count, created_at
     FROM retargeting_pixels WHERE id = ?`,
  )
    .bind(id)
    .first<any>();

  return ok({ pixel: formatPixelRow(updated) });
  },
);

// ─── DELETE /api/v1/pixels/:id (Remove pixel) ────────────────────────────────
pixels.delete(
  "/:id",
  rateLimit({ limit: 30, windowSeconds: 60, keyType: "apiKey" }),
  async (c) => {
  const auth = c.get("auth");
  const id = c.req.param("id");

  const existing = await c.env.DB.prepare(
    `SELECT id, user_id FROM retargeting_pixels WHERE id = ?`,
  )
    .bind(id)
    .first<{ id: string; user_id: string }>();

  if (!existing) {
    return err("Pixel not found", 404, "NOT_FOUND");
  }

  if (!isFrontendAuth(auth) && existing.user_id !== auth.userId) {
    return err("Forbidden", 403, "FORBIDDEN");
  }

  await c.env.DB.prepare(`DELETE FROM retargeting_pixels WHERE id = ?`)
    .bind(id)
    .run();

  return ok({ success: true, deleted: true, deletedId: id });
  },
);

export default pixels;
