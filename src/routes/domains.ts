// =================================================================
// ROUTE : CUSTOM DOMAINS  /api/v1/domains
// =================================================================

import { Hono } from 'hono';
import { type CloudflareBindings, type AuthContext, PLAN_LIMITS } from '../lib/types';
import { authMiddleware, requirePlan } from '../middleware/auth';
import { rateLimit } from '../middleware/ratelimit';
import { CreateDomainSchema } from '../lib/schemas';
import { uid, ok, err, now } from '../lib/utils';

const domains = new Hono<{ Bindings: CloudflareBindings; Variables: { auth: AuthContext } }>();

domains.use('*', authMiddleware);

// ─── POST /api/v1/domains  (register a custom domain) ────────────────────────
domains.post(
  '/',
  rateLimit({ limit: 10, windowSeconds: 60, keyType: 'apiKey' }),
  async (c) => {
    const { userId, plan } = c.get('auth');

    let body: unknown;
    try { body = await c.req.json(); } catch { return err('Invalid JSON body', 400); }

    const parsed = CreateDomainSchema.safeParse(body);
    if (!parsed.success) {
      return err(parsed.error.issues.map((i) => i.message).join(', '), 422, 'VALIDATION_ERROR');
    }

    const { domain } = parsed.data;

    // Check domain quota for this plan
    const maxDomains = PLAN_LIMITS[plan]?.domains ?? 0;
    if (maxDomains === 0) {
      return err(
        `Custom domains are not available on the Free plan. Upgrade to Pro, Business, or Enterprise to connect custom domains.`,
        403,
        'PLAN_UPGRADE_REQUIRED'
      );
    }
    const usedRow = await c.env.DB.prepare(
      `SELECT COUNT(*) as n FROM custom_domains WHERE user_id = ?`
    ).bind(userId).first<{ n: number }>();

    if ((usedRow?.n ?? 0) >= maxDomains) {
      return err(
        `Domain limit reached (${usedRow?.n ?? 0}/${maxDomains}) for plan ${plan}. Upgrade to add more.`,
        403,
        'DOMAIN_LIMIT_REACHED'
      );
    }

    const domainId = uid('dom');

    try {
      await c.env.DB.prepare(
        `INSERT INTO custom_domains (id, user_id, domain, status, created_at)
         VALUES (?, ?, ?, 'pending', ?)`
      ).bind(domainId, userId, domain, now()).run();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('UNIQUE')) return err('Domain already registered', 409, 'DUPLICATE_DOMAIN');
      throw e;
    }

    // ── Cloudflare for SaaS: provision hostname ────────────────────────────
    let cfSaasResult: Record<string, unknown> = {};
    if (c.env.CF_ACCOUNT_ID && c.env.CF_API_TOKEN) {
      try {
        const cfRes = await fetch(
          `https://api.cloudflare.com/client/v4/zones/${c.env.CF_ACCOUNT_ID}/custom_hostnames`,
          {
            method:  'POST',
            headers: {
              'Authorization': `Bearer ${c.env.CF_API_TOKEN}`,
              'Content-Type':  'application/json',
            },
            body: JSON.stringify({
              hostname: domain,
              ssl: {
                method: 'txt',
                type:   'dv',
                settings: { min_tls_version: '1.2' },
              },
            }),
          }
        );
        if (cfRes.ok) {
          cfSaasResult = (await cfRes.json()) as Record<string, unknown>;
        }
      } catch {
        // CF provisioning failure is non-blocking — domain stays 'pending'
      }
    }

    const defaultDomain = c.env.DEFAULT_DOMAIN || 'lsho.cc';

    // DNS records to configure at registrar
    const dnsRecords = [
      {
        type:  'CNAME',
        name:  domain,
        value: defaultDomain,
        ttl:   3600,
        note:  `Point your domain to ${defaultDomain}`,
      },
      {
        type:  'TXT',
        name:  `_lshorter-verify.${domain}`,
        value: `lshorter-verify=${domainId}`,
        ttl:   3600,
        note:  'Domain ownership verification',
      },
    ];

    return c.json({
      success: true,
      data: {
        id:          domainId,
        domain_name: domain,
        status:      'pending',
        dnsRecords,
        cfSaas:      cfSaasResult,
        created_at:  now(),
        instructions: [
          `1. Add the CNAME record above at your DNS provider.`,
          `2. Add the TXT verification record above.`,
          `3. DNS propagation may take up to 48 h.`,
          `4. Once active, use domain "${domain}" when creating links.`,
        ],
      },
    }, 201);
  }
);

// ─── GET /api/v1/domains  (list user domains) ─────────────────────────────────
domains.get('/', async (c) => {
  const { userId } = c.get('auth');

  const { results } = await c.env.DB.prepare(
    `SELECT d.id, d.domain as domain_name, d.status, d.created_at,
            COUNT(l.id) as link_count
     FROM custom_domains d
     LEFT JOIN links l ON l.domain_id = d.id
     WHERE d.user_id = ?
     GROUP BY d.id
     ORDER BY d.created_at DESC`
  ).bind(userId).all();

  return ok(results);
});

// ─── GET /api/v1/domains/:id  (single domain) ────────────────────────────────
domains.get('/:id', async (c) => {
  const { userId } = c.get('auth');
  const id = c.req.param('id');

  const row = await c.env.DB.prepare(
    `SELECT id, domain as domain_name, status, created_at FROM custom_domains WHERE id = ? AND user_id = ?`
  ).bind(id, userId).first();

  if (!row) return err('Domain not found or forbidden', 404, 'NOT_FOUND');

  return ok(row);
});

// ─── DELETE /api/v1/domains/:id ───────────────────────────────────────────────
domains.delete('/:id', async (c) => {
  const { userId } = c.get('auth');
  const id = c.req.param('id');

  const row = await c.env.DB.prepare(
    `SELECT id, domain as domain_name FROM custom_domains WHERE id = ? AND user_id = ?`
  ).bind(id, userId).first<{ id: string; domain_name: string }>();

  if (!row) return err('Domain not found or forbidden', 404, 'NOT_FOUND');

  await c.env.DB.prepare(`DELETE FROM custom_domains WHERE id = ? AND user_id = ?`).bind(id, userId).run();

  return ok({ deleted: true, id, domain_name: row.domain_name });
});

// ─── POST /api/v1/domains/:id/verify  (trigger re-check) ─────────────────────
domains.post('/:id/verify', async (c) => {
  const { userId } = c.get('auth');
  const id = c.req.param('id');

  const row = await c.env.DB.prepare(
    `SELECT id, domain as domain_name, status FROM custom_domains WHERE id = ? AND user_id = ?`
  ).bind(id, userId).first<{ id: string; domain_name: string; status: string }>();

  if (!row) return err('Domain not found or forbidden', 404, 'NOT_FOUND');

  // In production: query Cloudflare for SaaS status and update accordingly.
  // Here we return the current status and instructions.
  return ok({
    id:     row.id,
    domain_name: row.domain_name,
    status: row.status,
    message: row.status === 'active'
      ? 'Domain is active and serving traffic.'
      : 'Domain is still pending. Ensure DNS records are configured and wait for propagation.',
  });
});

export default domains;
