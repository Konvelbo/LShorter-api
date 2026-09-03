// =================================================================
// RATE LIMITING & QUOTA MIDDLEWARE  (KV-backed)
// =================================================================

import { type MiddlewareHandler } from 'hono';
import { type CloudflareBindings, type AuthContext, PLAN_LIMITS } from '../lib/types';
import { err, monthBucket } from '../lib/utils';

interface RateLimitOptions {
  /** Max requests per window */
  limit: number;
  /** Window size in seconds */
  windowSeconds: number;
  /** Key type to rate-limit by */
  keyType: 'ip' | 'apiKey' | 'both';
}

/**
 * General-purpose rate limiter backed by Cloudflare KV.
 * Uses a sliding counter with TTL reset each window.
 */
export function rateLimit(opts: RateLimitOptions): MiddlewareHandler<{ Bindings: CloudflareBindings }> {
  return async (c, next) => {
    const ip = c.req.header('cf-connecting-ip') ?? 'unknown';
    const authHeader = c.req.header('Authorization') ?? '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7, 22) : 'anon'; // partial token as key hint
    const bucket = `rl:${opts.keyType === 'ip' ? ip : opts.keyType === 'apiKey' ? token : `${ip}:${token}`}`;

    const current = await c.env.URL_KV.get(bucket);
    const count = current ? parseInt(current, 10) : 0;

    if (count >= opts.limit) {
      c.header('Retry-After', String(opts.windowSeconds));
      return err(
        `Rate limit exceeded. Max ${opts.limit} requests per ${opts.windowSeconds}s window.`,
        429,
        'RATE_LIMIT_EXCEEDED'
      );
    }

    // Increment counter — preserve TTL on first write
    const writePromise = c.env.URL_KV.put(bucket, String(count + 1), {
      expirationTtl: opts.windowSeconds,
    }).catch(() => {});

    if (c.executionCtx?.waitUntil) {
      c.executionCtx.waitUntil(writePromise);
    } else {
      await writePromise;
    }

    return next();
  };
}

/**
 * Monthly click quota enforcer.
 * Checks how many clicks a user has recorded this month in KV.
 */
export const clickQuotaMiddleware: MiddlewareHandler<{
  Bindings: CloudflareBindings;
  Variables: { auth: AuthContext };
}> = async (c, next) => {
  const auth = c.get('auth');
  if (!auth) return next();

  const limit = PLAN_LIMITS[auth.plan]?.clicks ?? PLAN_LIMITS.FREEMIUM.clicks;
  const bucket = `clicks:${auth.userId}:${monthBucket()}`;
  const raw = await c.env.URL_KV.get(bucket);
  const used = raw ? parseInt(raw, 10) : 0;

  if (used >= limit) {
    return err(
      `Monthly click quota exceeded (${used}/${limit}). Upgrade your plan to continue.`,
      429,
      'QUOTA_EXCEEDED'
    );
  }

  return next();
};

/**
 * Increment the monthly click counter for a user (fire-and-forget).
 */
export async function incrementClickCount(
  kv: KVNamespace,
  userId: string
): Promise<void> {
  const bucket = `clicks:${userId}:${monthBucket()}`;
  const raw = await kv.get(bucket);
  const count = raw ? parseInt(raw, 10) : 0;
  // TTL: 35 days so the key definitely outlives any month
  await kv.put(bucket, String(count + 1), { expirationTtl: 35 * 24 * 3600 });
}
