// =================================================================
// ROUTE : CONVERSION TRACKING  POST /api/v1/track
// =================================================================

import { Hono } from 'hono';
import { type CloudflareBindings, type AuthContext } from '../lib/types';
import { authMiddleware } from '../middleware/auth';
import { rateLimit } from '../middleware/ratelimit';
import { TrackConversionSchema } from '../lib/schemas';
import { uid, ok, err, now } from '../lib/utils';

const track = new Hono<{ Bindings: CloudflareBindings; Variables: { auth: AuthContext } }>();

track.use('*', authMiddleware);

// ─── POST /api/v1/track ───────────────────────────────────────────────────────
track.post(
  '/',
  rateLimit({ limit: 100, windowSeconds: 60, keyType: 'apiKey' }),
  async (c) => {
    const auth = c.get('auth');

    let body: unknown;
    try { body = await c.req.json(); } catch { return err('Invalid JSON body', 400); }

    const parsed = TrackConversionSchema.safeParse(body);
    if (!parsed.success) {
      return err(parsed.error.issues.map((i) => i.message).join(', '), 422, 'VALIDATION_ERROR');
    }

    const {
      eventName,
      amount,
      currency,
      customerId,
      linkId,
      clickId,
    } = parsed.data;

    // Verify the link exists and belongs to the calling user
    const link = await c.env.DB.prepare(
      `SELECT id, user_id FROM links WHERE id = ?`
    ).bind(linkId).first<{ id: string; user_id: string }>();

    if (!link) return err('Link not found', 404, 'LINK_NOT_FOUND');

    if (link.user_id !== auth.userId) {
      return err('Forbidden: link does not belong to your account', 403, 'FORBIDDEN');
    }

    const conversionId = uid('evt');

    await c.env.DB.prepare(
      `INSERT INTO conversions
         (id, link_id, user_id, event_name, amount, currency,
          customer_id, click_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      conversionId,
      linkId,
      auth.userId,
      eventName,
      amount,
      currency,
      customerId,
      clickId ?? null,
      now()
    ).run();

    return c.json({
      success: true,
      data: {
        id:            conversionId,
        eventName,
        amount,
        currency,
        customerId,
        linkId,
        clickId:       clickId ?? null,
        plan:          auth.plan,
        created_at:    now(),
      },
    }, 201);
  }
);

// ─── GET /api/v1/track  (list conversions) ────────────────────────────────────
track.get('/', async (c) => {
  const { userId } = c.get('auth');
  const page   = Math.max(1, parseInt(c.req.query('page')  ?? '1',  10));
  const limit  = Math.min(100, parseInt(c.req.query('limit') ?? '20', 10));
  const offset = (page - 1) * limit;
  const linkId = c.req.query('linkId');

  const whereClause = linkId
    ? `user_id = ? AND link_id = ?`
    : `user_id = ?`;
  const bindings: (string | number)[] = linkId
    ? [userId, linkId, limit, offset]
    : [userId, limit, offset];

  const { results } = await c.env.DB.prepare(
    `SELECT id, link_id, event_name, amount, currency, customer_id, click_id, created_at
     FROM conversions
     WHERE ${whereClause}
     ORDER BY created_at DESC
     LIMIT ? OFFSET ?`
  ).bind(...bindings).all();

  const total = await c.env.DB.prepare(
    `SELECT COUNT(*) as n FROM conversions WHERE ${whereClause.split('LIMIT')[0]}`
  ).bind(...bindings.slice(0, linkId ? 2 : 1)).first<{ n: number }>();

  return ok({ data: results, pagination: { page, limit, total: total?.n ?? 0 } });
});

export default track;
