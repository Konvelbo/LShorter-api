// =================================================================
// ROUTE : TARGET & LIMIT ALERTS  /api/v1/targets
// =================================================================

import { Hono } from "hono";
import { type CloudflareBindings, type AuthContext } from "../lib/types";
import { authMiddleware, isFrontendAuth } from "../middleware/auth";
import { CreateTargetAlertSchema, UpdateTargetAlertSchema } from "../lib/schemas";
import { uid, ok, err, now } from "../lib/utils";

const targets = new Hono<{
  Bindings: CloudflareBindings;
  Variables: { auth: AuthContext };
}>();

// Ensure D1 table exists on first invocation
async function ensureTargetAlertsTable(db: D1Database) {
  try {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS target_alerts (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        link_id TEXT DEFAULT NULL,
        title TEXT,
        metric_type TEXT NOT NULL DEFAULT 'clicks',
        limit_value REAL,
        target_value REAL NOT NULL DEFAULT 1000,
        period TEXT NOT NULL DEFAULT 'month',
        current_value REAL DEFAULT 0,
        notify_expiration INTEGER DEFAULT 0,
        notify_expired INTEGER DEFAULT 0,
        notify_email INTEGER DEFAULT 1,
        notify_bell INTEGER DEFAULT 1,
        channel TEXT DEFAULT 'both',
        schedule TEXT DEFAULT 'instantly',
        status TEXT NOT NULL DEFAULT 'active',
        last_notified_at DATETIME DEFAULT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run().catch(() => {});
  } catch {}
}

// Strict authentication (Dashboard secret OR valid hashed Bearer API key)
targets.use("*", authMiddleware);

// ─── GET /api/v1/targets (List alerts for user) ──────────────────────────────
targets.get("/", async (c) => {
  const auth = c.get("auth");
  const qUserId = c.req.query("userId") || c.req.header("X-User-Id");
  const userId = isFrontendAuth(auth) && qUserId ? qUserId : auth.userId;

  await ensureTargetAlertsTable(c.env.DB);

  // 1. Fetch all alerts for user
  const rows = await c.env.DB.prepare(
    `SELECT ta.id, ta.user_id, ta.link_id,
            COALESCE(ta.title, l.meta_title, l.og_title, l.slug) as link_title,
            ta.metric_type, ta.period,
            COALESCE(ta.target_value, ta.limit_value, 1000) as target_value,
            ta.current_value,
            COALESCE(ta.notify_expired, ta.notify_expiration, 0) as notify_expired,
            COALESCE(ta.notify_email, CASE WHEN ta.channel IN ('both', 'email') THEN 1 ELSE 0 END, 1) as notify_email,
            COALESCE(ta.notify_bell, CASE WHEN ta.channel IN ('both', 'bell', 'in_app') THEN 1 ELSE 0 END, 1) as notify_bell,
            ta.status, ta.last_notified_at, ta.created_at, ta.updated_at,
            l.slug as link_slug, l.target_url, l.clicks_count
     FROM target_alerts ta
     LEFT JOIN links l ON ta.link_id = l.id
     WHERE ta.user_id = ?
     ORDER BY CASE WHEN ta.link_id IS NULL THEN 0 ELSE 1 END, ta.created_at DESC`
  )
    .bind(userId)
    .all();

  let alerts = (rows.results || []).map((r: any) => ({
    id: r.id,
    userId: r.user_id,
    linkId: r.link_id || null,
    linkTitle: r.link_title || (r.link_slug ? `lsho.cc/${r.link_slug}` : (r.link_id ? 'Custom Link' : 'All Links Aggregated')),
    slug: r.link_slug || (r.link_id ? null : 'global'),
    targetUrl: r.target_url || null,
    metricType: r.metric_type || "clicks",
    period: r.period || "month",
    targetValue: Number(r.target_value || 1000),
    currentValue: Number(r.link_id ? (r.clicks_count ?? r.current_value ?? 0) : (r.current_value ?? 0)),
    notifyExpired: Boolean(r.notify_expired && r.link_id),
    notifyEmail: Boolean(r.notify_email),
    notifyBell: Boolean(r.notify_bell),
    status: r.status || "active",
    lastNotifiedAt: r.last_notified_at || null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));

  // Auto-seed Global Monthly Target if not present yet
  const hasGlobal = alerts.some((a) => !a.linkId);
  if (!hasGlobal) {
    const globalId = `target_global_${userId}`;
    const timestamp = now();
    await c.env.DB.prepare(
      `INSERT INTO target_alerts (
         id, user_id, link_id, title, metric_type,
         limit_value, target_value, period,
         notify_expiration, notify_expired,
         channel, notify_email, notify_bell, schedule, status,
         created_at, updated_at
       )
       VALUES (?, ?, NULL, 'All Links Aggregated', 'clicks', 2500, 2500, 'month', 0, 0, 'both', 1, 1, 'instantly', 'active', ?, ?)`
    )
      .bind(globalId, userId, timestamp, timestamp)
      .run()
      .catch(() => {});

    alerts.unshift({
      id: globalId,
      userId,
      linkId: null,
      linkTitle: "All Links Aggregated",
      slug: "global",
      targetUrl: null,
      metricType: "clicks",
      period: "month",
      targetValue: 2500,
      currentValue: 0,
      notifyExpired: false,
      notifyEmail: true,
      notifyBell: true,
      status: "active",
      lastNotifiedAt: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }

  return ok(alerts);
});

// ─── POST /api/v1/targets (Create or Upsert alert — Dashboard ONLY) ──────────
targets.post("/", async (c) => {
  const auth = c.get("auth");
  const qUserId = c.req.query("userId") || c.req.header("X-User-Id");
  const isInternal = isFrontendAuth(auth);

  // The SDK / API keys must NOT be allowed to create notifications:
  if (!isInternal) {
    return err(
      "Creating target alerts and notifications via the SDK / API keys is disabled. Notifications must be configured directly from the LShorter Dashboard.",
      403,
      "FORBIDDEN_SDK_CREATE"
    );
  }

  let body: any = {};
  try {
    body = await c.req.json();
  } catch {
    return err("Invalid JSON body", 400);
  }

  const parsed = CreateTargetAlertSchema.safeParse(body);
  if (!parsed.success) {
    return err(
      parsed.error.issues.map((i) => i.message).join(", "),
      422,
      "VALIDATION_ERROR",
    );
  }

  const userId = body.userId || qUserId || auth.userId;
  await ensureTargetAlertsTable(c.env.DB);

  // Handle "both" metric type (clicks & revenue) by decomposing into two records
  const isBoth = parsed.data.metricType === "both";
  const targetsToProcess = isBoth
    ? [
        {
          ...parsed.data,
          metricType: "clicks" as const,
          targetValue: Math.max(1, Number(parsed.data.clicksTargetValue || parsed.data.targetValue) || 1000),
        },
        {
          ...parsed.data,
          metricType: "revenue" as const,
          targetValue: Math.max(1, Number(parsed.data.revenueTargetValue || parsed.data.targetValue) || 5000),
        },
      ]
    : [parsed.data];

  const results: any[] = [];

  for (const item of targetsToProcess) {
    const linkId = (!item.linkId || item.linkId === "global") ? null : item.linkId;

    // Secure Plan Gating & Link Ownership: Individual link alerts strictly require PRO, BUSINESS, or ENTERPRISE and link ownership
    if (linkId) {
      const linkRow = await c.env.DB.prepare(
        "SELECT id, user_id FROM links WHERE id = ? LIMIT 1"
      )
        .bind(linkId)
        .first<{ id: string; user_id: string }>()
        .catch(() => null);

      if (!linkRow) {
        return err("Link not found", 404, "NOT_FOUND");
      }
      if (linkRow.user_id !== userId) {
        return err("Forbidden: link does not belong to your account", 403, "FORBIDDEN");
      }

      const userPlanParam = (body.userPlan || body.plan || auth.plan || "").toUpperCase();
      const isProParam = userPlanParam === "PRO" || userPlanParam === "BUSINESS" || userPlanParam === "ENTERPRISE";
      let hasProPlan = false;

      if (c.env.DB) {
        const dbUser = await c.env.DB.prepare(
          "SELECT plan FROM users WHERE id = ? OR email = ? LIMIT 1"
        )
          .bind(userId, userId)
          .first<{ plan: string }>()
          .catch(() => null);

        if (dbUser) {
          const dbPlan = (dbUser.plan || "").toUpperCase();
          hasProPlan = dbPlan === "PRO" || dbPlan === "BUSINESS" || dbPlan === "ENTERPRISE";
        } else if (isInternal && isProParam) {
          hasProPlan = true;
        }
      } else if (isInternal && isProParam) {
        hasProPlan = true;
      }

      if (!hasProPlan) {
        return c.json(
          {
            success: false,
            code: "PLAN_UPGRADE_REQUIRED",
            error: "Individual link alerts require a Pro or Business subscription. Standard plans include Global Workspace Targets.",
          },
          403
        );
      }
    }

    const metricType = item.metricType === "revenue" ? "revenue" : "clicks";
    const period = ["day", "week", "month"].includes(item.period || "") ? item.period : "month";
    const targetValue = Math.max(1, Number(item.targetValue) || 1000);
    // Expiration alerts are strictly unselectable / disabled on global targets
    const notifyExpired = !linkId ? 0 : (item.notifyExpired ? 1 : 0);
    const notifyEmail = item.notifyEmail !== false ? 1 : 0;
    const notifyBell = item.notifyBell !== false ? 1 : 0;
    const status = item.status === "paused" ? "paused" : "active";
    const channel = (notifyEmail && notifyBell) ? "both" : notifyEmail ? "email" : notifyBell ? "in_app" : "none";
    const timestamp = now();

    // 1. Global target upsert (locked to monthly, 1 record per user & metricType)
    if (!linkId) {
      const existingGlobal = await c.env.DB.prepare(
        `SELECT id FROM target_alerts WHERE user_id = ? AND link_id IS NULL AND metric_type = ? LIMIT 1`
      )
        .bind(userId, metricType)
        .first<{ id: string }>()
        .catch(() => null);

      if (existingGlobal) {
        await c.env.DB.prepare(
          `UPDATE target_alerts
           SET metric_type = ?, period = 'month', target_value = ?, limit_value = ?,
               notify_expired = 0, notify_expiration = 0,
               notify_email = ?, notify_bell = ?, channel = ?, status = ?, updated_at = ?
           WHERE id = ?`
        )
          .bind(
            metricType,
            targetValue,
            targetValue,
            notifyEmail,
            notifyBell,
            channel,
            status,
            timestamp,
            existingGlobal.id
          )
          .run();

        results.push({
          id: existingGlobal.id,
          userId,
          linkId: null,
          metricType,
          period: "month",
          targetValue,
          notifyExpired: false,
          notifyEmail: Boolean(notifyEmail),
          notifyBell: Boolean(notifyBell),
          status,
          updated: true,
        });
        continue;
      }
    }

    // 2. Insert new target alert
    const id = body.id || uid("tgt");
    await c.env.DB.prepare(
      `INSERT INTO target_alerts (
         id, user_id, link_id, title, metric_type, period,
         limit_value, target_value, current_value,
         notify_expiration, notify_expired,
         channel, notify_email, notify_bell, schedule, status,
         created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, 'instantly', ?, ?, ?)`
    )
      .bind(
        id,
        userId,
        linkId,
        item.title || (linkId ? "Link Target Alert" : "Global Target Alert"),
        metricType,
        !linkId ? "month" : period,
        targetValue,
        targetValue,
        notifyExpired,
        notifyExpired,
        channel,
        notifyEmail,
        notifyBell,
        status,
        timestamp,
        timestamp
      )
      .run();

    results.push({
      id,
      userId,
      linkId,
      metricType,
      period: !linkId ? "month" : period,
      targetValue,
      currentValue: 0,
      notifyExpired: Boolean(notifyExpired),
      notifyEmail: Boolean(notifyEmail),
      notifyBell: Boolean(notifyBell),
      status,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }

  return ok(isBoth ? results : results[0]);
});

// ─── PATCH /api/v1/targets/:id (Update alert) ────────────────────────────────
targets.patch("/:id", async (c) => {
  const auth = c.get("auth");
  const isFrontend = isFrontendAuth(auth);
  const id = c.req.param("id");
  const qUserId = c.req.query("userId") || c.req.header("X-User-Id");
  const userId = isFrontend && qUserId ? qUserId : auth.userId;

  let body: any = {};
  try {
    body = await c.req.json();
  } catch {
    return err("Invalid JSON body", 400);
  }

  const parsed = UpdateTargetAlertSchema.safeParse(body);
  if (!parsed.success) {
    return err(
      parsed.error.issues.map((i) => i.message).join(", "),
      422,
      "VALIDATION_ERROR",
    );
  }

  await ensureTargetAlertsTable(c.env.DB);

  // Check alert existence and ownership
  const alert = await c.env.DB.prepare(
    `SELECT id, user_id, link_id, period, notify_email, notify_bell FROM target_alerts WHERE id = ?`
  ).bind(id).first<{ id: string; user_id: string; link_id: string | null; period: string; notify_email: number; notify_bell: number }>();

  if (!alert) return err("Target alert not found", 404, "NOT_FOUND");
  if (
    (!isFrontend && alert.user_id !== userId) ||
    (isFrontend && qUserId && qUserId !== "usr_default" && alert.user_id !== userId)
  ) {
    return err("Forbidden: alert does not belong to your account", 403, "FORBIDDEN");
  }

  const updates: string[] = [];
  const bindings: any[] = [];

  if (parsed.data.title !== undefined) {
    updates.push("title = ?");
    bindings.push(parsed.data.title);
  }

  if (parsed.data.metricType !== undefined && parsed.data.metricType !== "both") {
    updates.push("metric_type = ?");
    bindings.push(parsed.data.metricType);
  }

  // If global target, period is locked to "month"
  if (parsed.data.period !== undefined) {
    const finalPeriod = !alert.link_id ? "month" : parsed.data.period;
    updates.push("period = ?");
    bindings.push(finalPeriod);
  }

  if (parsed.data.targetValue !== undefined) {
    updates.push("target_value = ?", "limit_value = ?");
    bindings.push(parsed.data.targetValue, parsed.data.targetValue);
  }

  if (parsed.data.notifyExpired !== undefined) {
    updates.push(
      "notify_expired = CASE WHEN link_id IS NULL THEN 0 ELSE ? END",
      "notify_expiration = CASE WHEN link_id IS NULL THEN 0 ELSE ? END"
    );
    bindings.push(parsed.data.notifyExpired ? 1 : 0, parsed.data.notifyExpired ? 1 : 0);
  }

  if (parsed.data.notifyEmail !== undefined) {
    updates.push("notify_email = ?");
    bindings.push(parsed.data.notifyEmail ? 1 : 0);
  }

  if (parsed.data.notifyBell !== undefined) {
    updates.push("notify_bell = ?");
    bindings.push(parsed.data.notifyBell ? 1 : 0);
  }

  if (parsed.data.notifyEmail !== undefined || parsed.data.notifyBell !== undefined) {
    const hasEmail = parsed.data.notifyEmail !== undefined ? parsed.data.notifyEmail : Boolean(alert.notify_email);
    const hasBell = parsed.data.notifyBell !== undefined ? parsed.data.notifyBell : Boolean(alert.notify_bell);
    updates.push("channel = ?");
    bindings.push((hasEmail && hasBell) ? "both" : hasEmail ? "email" : hasBell ? "in_app" : "none");
  }

  if (parsed.data.status !== undefined) {
    updates.push("status = ?");
    bindings.push(parsed.data.status);
  }

  if (updates.length === 0) {
    return ok({ updated: id });
  }

  updates.push("updated_at = ?");
  bindings.push(now());
  bindings.push(id);

  await c.env.DB.prepare(
    `UPDATE target_alerts SET ${updates.join(", ")} WHERE id = ?`
  ).bind(...bindings).run();

  return ok({ updated: id });
});

// ─── DELETE /api/v1/targets/:id (Delete alert) ───────────────────────────────
targets.delete("/:id", async (c) => {
  const auth = c.get("auth");
  const isFrontend = isFrontendAuth(auth);
  const id = c.req.param("id");
  const qUserId = c.req.query("userId") || c.req.header("X-User-Id");
  const userId = isFrontend && qUserId ? qUserId : auth.userId;

  await ensureTargetAlertsTable(c.env.DB);

  const alert = await c.env.DB.prepare(
    `SELECT id, user_id, link_id FROM target_alerts WHERE id = ?`
  ).bind(id).first<{ id: string; user_id: string; link_id: string | null }>();

  if (!alert) return err("Target alert not found", 404, "NOT_FOUND");
  if (
    (!isFrontend && alert.user_id !== userId) ||
    (isFrontend && qUserId && qUserId !== "usr_default" && alert.user_id !== userId)
  ) {
    return err("Forbidden: alert does not belong to your account", 403, "FORBIDDEN");
  }

  // Prevent deleting the workspace global target
  if (!alert.link_id) {
    return err("Global workspace target cannot be deleted", 400, "BAD_REQUEST");
  }

  await c.env.DB.prepare(
    `DELETE FROM target_alerts WHERE id = ?`
  ).bind(id).run();

  return ok({ deleted: id });
});

export default targets;
