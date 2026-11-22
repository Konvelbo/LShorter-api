// =================================================================
// AUTHENTICATION MIDDLEWARE  (Strict API Key Validation)
// =================================================================

import { type Context, type MiddlewareHandler } from 'hono';
import { type CloudflareBindings, type AuthContext, type Plan, PLAN_LIMITS } from '../lib/types';
import { err, sha256, now } from '../lib/utils';

// In-memory Worker cache to avoid hitting D1 (INSERT + SELECT) on every single API request
const userAuthCache = new Map<
  string,
  { plan: Plan; email: string; name: string; expiresAt: number }
>();
const AUTH_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function timingSafeEqualStr(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Strictly validates that an incoming request carries the exact configured
 * FRONTEND_API_SECRET (never accepts test strings or prefix heuristics).
 */
export function isFrontendMasterRequest(c: Context<any, any, any>): boolean {
  // Fail-closed: FRONTEND_API_SECRET MUST be explicitly configured via Wrangler secret / env.
  // Never fall back to a hardcoded secret in source code.
  const expectedSecret = ((c.env as CloudflareBindings)?.FRONTEND_API_SECRET || '').trim();
  if (!expectedSecret) return false;
  const frontendSecret = (c.req.header('X-Frontend-Secret') || '').trim();
  const authHeader = c.req.header('Authorization') || '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

  return (
    (Boolean(frontendSecret) && timingSafeEqualStr(frontendSecret, expectedSecret)) ||
    (Boolean(bearer) && timingSafeEqualStr(bearer, expectedSecret))
  );
}

/**
 * Returns true ONLY when the authenticated context came from the trusted
 * LShorter Frontend Dashboard (never for public API keys).
 */
export function isFrontendAuth(auth: AuthContext | undefined): boolean {
  return auth?.keyId === 'frontend_master';
}

export const authMiddleware: MiddlewareHandler<{
  Bindings: CloudflareBindings;
  Variables: { auth: AuthContext };
}> = async (c, next) => {
  const authHeader = c.req.header('Authorization');

  // 1. Direct Frontend Proxy Authentication (strict constant-time match)
  if (isFrontendMasterRequest(c)) {
    const targetUserId =
      c.req.query('userId') ||
      c.req.header('X-User-Id');
    const userEmail = c.req.header('X-User-Email') || '';
    const userName = c.req.header('X-User-Name') || '';
    const rawRequestedPlan = c.req.header('X-User-Plan') || c.req.query('plan');
    const validPlans: Plan[] = ['FREE', 'FREEMIUM', 'STARTER', 'PRO', 'BUSINESS', 'ENTERPRISE'];
    const requestedPlan: Plan | undefined =
      rawRequestedPlan && validPlans.includes(rawRequestedPlan.toUpperCase() as Plan)
        ? (rawRequestedPlan.toUpperCase() as Plan)
        : undefined;

    const finalUserId = targetUserId || 'usr_default';
    const finalEmail = userEmail || `${finalUserId}@lshorter.local`;
    const finalName = userName || 'Dashboard User';

    const nowMs = Date.now();

    // Fast path 1: In-memory cache (~0 ms)
    const cached = userAuthCache.get(finalUserId);
    if (
      cached &&
      cached.expiresAt > nowMs &&
      (!requestedPlan || cached.plan === requestedPlan)
    ) {
      c.set('auth', {
        userId: finalUserId,
        plan: cached.plan,
        keyId: 'frontend_master',
      });
      return next();
    }

    // Fast path 2: Distributed Cloudflare KV cache across all PoPs (~1 ms, ZERO D1 reads)
    const kvAuthKey = `user:auth:${finalUserId}`;
    const kvAuth = await c.env.URL_KV?.get<{ plan: Plan; email: string; name: string }>(kvAuthKey, 'json').catch(() => null);
    if (kvAuth && (!requestedPlan || kvAuth.plan === requestedPlan)) {
      userAuthCache.set(finalUserId, {
        plan: kvAuth.plan,
        email: kvAuth.email || finalEmail,
        name: kvAuth.name || finalName,
        expiresAt: nowMs + AUTH_CACHE_TTL_MS,
      });
      c.set('auth', {
        userId: finalUserId,
        plan: kvAuth.plan,
        keyId: 'frontend_master',
      });
      return next();
    }

    // Fallback: Check existing user in D1 only on cold start / cache miss
    const existingRow = await c.env.DB.prepare(
      `SELECT id, plan FROM users WHERE id = ?`
    ).bind(finalUserId).first<{ id: string; plan: string }>().catch(() => null);

    if (existingRow && (!requestedPlan || existingRow.plan === requestedPlan)) {
      const resolvedPlan = (existingRow.plan || 'FREEMIUM') as Plan;
      userAuthCache.set(finalUserId, {
        plan: resolvedPlan,
        email: finalEmail,
        name: finalName,
        expiresAt: nowMs + AUTH_CACHE_TTL_MS,
      });
      // Warm KV cache for 1 hour
      c.executionCtx.waitUntil(
        c.env.URL_KV.put(kvAuthKey, JSON.stringify({ plan: resolvedPlan, email: finalEmail, name: finalName }), { expirationTtl: 3600 }).catch(() => {})
      );
      c.set('auth', {
        userId: finalUserId,
        plan: resolvedPlan,
        keyId: 'frontend_master',
      });
      return next();
    }

    const activeRequestedPlan: Plan = requestedPlan || 'FREEMIUM';
    const safeDbPlan: Plan = validPlans.includes(activeRequestedPlan)
      ? (activeRequestedPlan === 'FREE' ? 'FREEMIUM' : activeRequestedPlan)
      : 'FREEMIUM';
    const limits = PLAN_LIMITS[safeDbPlan] || PLAN_LIMITS.FREEMIUM;

    // Only write to D1 when user truly does not exist yet or plan changed
    try {
      await c.env.DB.prepare(
        `INSERT INTO users (id, email, name, plan, clicks_limit, domains_limit, links_limit)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           plan = excluded.plan,
           clicks_limit = excluded.clicks_limit,
           domains_limit = excluded.domains_limit,
           links_limit = excluded.links_limit,
           updated_at = CURRENT_TIMESTAMP`
      ).bind(
        finalUserId,
        finalEmail,
        finalName,
        safeDbPlan,
        limits.clicks,
        limits.domains,
        limits.links
      ).run();
    } catch {}

    try {
      c.executionCtx.waitUntil(
        c.env.URL_KV.put(kvAuthKey, JSON.stringify({ plan: activeRequestedPlan, email: finalEmail, name: finalName }), { expirationTtl: 3600 }).catch(() => {})
      );
    } catch {
      c.env.URL_KV.put(kvAuthKey, JSON.stringify({ plan: activeRequestedPlan, email: finalEmail, name: finalName }), { expirationTtl: 3600 }).catch?.(() => {});
    }

    userAuthCache.set(finalUserId, {
      plan: activeRequestedPlan,
      email: finalEmail,
      name: finalName,
      expiresAt: nowMs + AUTH_CACHE_TTL_MS,
    });

    c.set('auth', {
      userId: finalUserId,
      plan: activeRequestedPlan,
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

  // 2. Lookup the API key in D1 and LEFT JOIN with users to get plan (least-privilege fallback: FREEMIUM)
  const row = await c.env.DB.prepare(
    `SELECT k.id as keyId, k.user_id as userId, COALESCE(u.plan, 'FREEMIUM') as plan
     FROM api_keys k
     LEFT JOIN users u ON k.user_id = u.id
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
  try {
    c.executionCtx.waitUntil(
      c.env.DB.prepare(
        `UPDATE api_keys SET last_used_at = ? WHERE id = ?`
      ).bind(now(), row.keyId).run()
    );
  } catch {
    c.env.DB.prepare(
      `UPDATE api_keys SET last_used_at = ? WHERE id = ?`
    ).bind(now(), row.keyId).run().catch?.(() => {});
  }

  return next();
};

/**
 * Higher-order middleware to enforce minimum plan requirements.
 */
export function requirePlan(
  minPlan: Plan
): MiddlewareHandler<{ Bindings: CloudflareBindings; Variables: { auth: AuthContext } }> {
  const PLAN_LEVELS: Record<Plan, number> = {
    FREE:       0,
    FREEMIUM:   0,
    STARTER:    0,
    PRO:        1,
    BUSINESS:   2,
    ENTERPRISE: 3,
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
