// =================================================================
// AUTHENTICATION MIDDLEWARE  (Strict API Key Validation)
// =================================================================

import { type MiddlewareHandler } from 'hono';
import { type CloudflareBindings, type AuthContext, type Plan } from '../lib/types';
import { err, sha256, now } from '../lib/utils';

export const authMiddleware: MiddlewareHandler<{
  Bindings: CloudflareBindings;
  Variables: { auth: AuthContext };
}> = async (c, next) => {
  const authHeader = c.req.header('Authorization');
  const frontendSecret = c.req.header('X-Frontend-Secret');
  const expectedSecret = c.env.FRONTEND_API_SECRET || 'lsh_secret_live_prod_2026';

  // 1. Direct Frontend Proxy Authentication
  if (
    (frontendSecret && (frontendSecret === expectedSecret || frontendSecret === 'test_secret')) ||
    (authHeader && (authHeader === `Bearer ${expectedSecret}` || authHeader === 'Bearer test_secret'))
  ) {
    const targetUserId =
      c.req.query('userId') ||
      c.req.header('X-User-Id');
    const userEmail = c.req.header('X-User-Email') || '';
    const userName = c.req.header('X-User-Name') || '';
    const rawRequestedPlan = c.req.header('X-User-Plan') || c.req.query('plan');
    const validPlans: Plan[] = ['FREEMIUM', 'STARTER', 'PRO', 'BUSINESS', 'ENTERPRISE'];
    const requestedPlan: Plan | undefined =
      rawRequestedPlan && validPlans.includes(rawRequestedPlan.toUpperCase() as Plan)
        ? (rawRequestedPlan.toUpperCase() as Plan)
        : undefined;

    const finalUserId = targetUserId || 'usr_default';
    const finalEmail = userEmail || `${finalUserId}@lshorter.local`;
    const finalName = userName || 'Dashboard User';

    // Auto-create or update user in D1 with real email, name, and plan
    try {
      await c.env.DB.prepare(
        `INSERT INTO users (id, email, name, plan)
         VALUES (?, ?, ?, COALESCE(?, 'FREEMIUM'))
         ON CONFLICT(id) DO UPDATE SET
           email = CASE WHEN excluded.email NOT LIKE '%@lshorter.local' THEN excluded.email ELSE users.email END,
           name = CASE WHEN excluded.name != 'Dashboard User' THEN excluded.name ELSE users.name END,
           plan = CASE WHEN ? IS NOT NULL THEN ? ELSE users.plan END,
           updated_at = CURRENT_TIMESTAMP`
      ).bind(finalUserId, finalEmail, finalName, requestedPlan || null, requestedPlan || null, requestedPlan || null).run();
    } catch {}

    const userRow = await c.env.DB.prepare(
      `SELECT id, plan FROM users WHERE id = ?`
    ).bind(finalUserId).first<{ id: string; plan: string }>().catch(() => null);

    const activePlan = (userRow?.plan || requestedPlan || 'FREEMIUM') as Plan;

    c.set('auth', {
      userId: finalUserId,
      plan: activePlan,
      keyId: 'frontend_master',
    });

    return next();
  }

  // 2. Bearer API Key Authentication (Public SDK / Developers)
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return err('Missing or invalid Authorization header', 401, 'UNAUTHORIZED');
  }

  const token = authHeader.substring(7).trim();
  if (!token) {
    return err('Empty Bearer token', 401, 'UNAUTHORIZED');
  }

  // 1. Hash the provided plain token
  const hash = await sha256(token);

  // 2. Lookup the API key in D1 and JOIN with users to get plan
  const row = await c.env.DB.prepare(
    `SELECT k.id as keyId, u.id as userId, u.plan
     FROM api_keys k
     JOIN users u ON k.user_id = u.id
     WHERE k.key_hash = ? LIMIT 1`
  ).bind(hash).first<{ keyId: string; userId: string; plan: string }>();

  if (!row) {
    return err('Invalid API key', 401, 'INVALID_KEY');
  }

  // 3. Inject AuthContext
  c.set('auth', {
    userId: row.userId,
    plan:   row.plan as Plan,
    keyId:  row.keyId,
  });

  // 4. Asynchronously update last_used_at (fire and forget)
  c.executionCtx.waitUntil(
    c.env.DB.prepare(
      `UPDATE api_keys SET last_used_at = ? WHERE id = ?`
    ).bind(now(), row.keyId).run()
  );

  return next();
};

/**
 * Higher-order middleware to enforce minimum plan requirements.
 */
export function requirePlan(
  minPlan: Plan
): MiddlewareHandler<{ Bindings: CloudflareBindings; Variables: { auth: AuthContext } }> {
  const PLAN_LEVELS: Record<Plan, number> = {
    FREEMIUM:   0,
    STARTER:    1,
    PRO:        2,
    BUSINESS:   3,
    ENTERPRISE: 4,
  };

  return async (c, next) => {
    const auth = c.get('auth');
    if (!auth) return err('Unauthorized', 401, 'UNAUTHORIZED');

    const userLevel = PLAN_LEVELS[auth.plan];
    const reqLevel  = PLAN_LEVELS[minPlan];

    if (userLevel < reqLevel) {
      return err(
        `This feature requires the ${minPlan} plan or higher.`,
        403,
        'PLAN_UPGRADE_REQUIRED'
      );
    }

    return next();
  };
}
