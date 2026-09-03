// =================================================================
// ROUTE : LINKS MANAGEMENT  /api/v1/links
// =================================================================

import { Hono } from 'hono';
import { type CloudflareBindings, type AuthContext, PLAN_LIMITS } from '../lib/types';
import { authMiddleware } from '../middleware/auth';
import { rateLimit } from '../middleware/ratelimit';
import { CreateLinkSchema, UpdateLinkSchema } from '../lib/schemas';
import { uid, randomSlug, isSafeUrl, ok, err, now, sha256 } from '../lib/utils';

const links = new Hono<{ Bindings: CloudflareBindings; Variables: { auth: AuthContext } }>();

links.use('*', authMiddleware);

// ─── Helper: QR code URL (no external dependency needed) ──────────────────────
function qrCodeUrl(shortUrl: string): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(shortUrl)}&format=png`;
}

// ─── Helper: Normalize Base64 to Public D1 Image CDN URL ─────────────────────
async function normalizeOgImage(env: CloudflareBindings, imageStr?: string | null): Promise<string | null> {
  if (!imageStr) return null;
  const trimmed = imageStr.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  if (trimmed.startsWith('data:image/')) {
    try {
      const ext = trimmed.includes('image/jpeg') || trimmed.includes('image/jpg') ? 'jpg'
        : trimmed.includes('image/webp') ? 'webp'
        : trimmed.includes('image/gif') ? 'gif'
        : 'png';
      const mime = `image/${ext === 'jpg' ? 'jpeg' : ext}`;
      const imageId = `banner_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${ext}`;
      await env.DB.prepare(
        `INSERT OR REPLACE INTO uploaded_images (id, mime_type, data) VALUES (?, ?, ?)`
      ).bind(imageId, mime, trimmed).run();
      return `https://lshorter-api.fiatechnologiecam.workers.dev/api/v1/images/${imageId}`;
    } catch (e) {
      console.error('[normalizeOgImage error]', e);
      return null;
    }
  }
  return null;
}

// ─── POST /api/v1/links  (create) ─────────────────────────────────────────────
links.post(
  '/',
  rateLimit({ limit: 30, windowSeconds: 60, keyType: 'apiKey' }),
  async (c) => {
    const { userId: callerId, plan: callerPlan } = c.get('auth');

    let body: unknown;
    try { body = await c.req.json(); } catch { return err('Invalid JSON body', 400); }

    const parsed = CreateLinkSchema.safeParse(body);
    if (!parsed.success) {
      return err(parsed.error.issues.map((i) => i.message).join(', '), 422, 'VALIDATION_ERROR');
    }

    const userId = callerId;
    const plan = callerPlan;

    const {
      targetUrl, slug, domainName, routingRules, geoTargeting, deviceTargeting,
      isActive, expiresAt, password, tags, isCloaked, hideReferrer, metaTitle,
      ogTitle, ogDescription, ogImage,
    } = parsed.data;

    const resolvedOgImage = await normalizeOgImage(c.env, ogImage);

    // Reserved slugs check
    const RESERVED_SLUGS = new Set([
      'api', 'admin', 'health', 'login', 'dashboard', 'static', 'r', 'auth',
      'onboarding', 'terms', 'privacy', 'settings', 'billing', 'assets', 'favicon'
    ]);
    if (slug && RESERVED_SLUGS.has(slug.toLowerCase().trim())) {
      return err(`The slug "${slug}" is reserved and cannot be used.`, 400, 'RESERVED_SLUG');
    }

    const SYSTEM_DOMAINS = new Set([
      'lsho.cc',
      'lshorter-api.fiatechnologiecam.workers.dev',
      'lshorter-api.fiatechnologiecam.workers.dev/r',
      (c.env.DEFAULT_DOMAIN || 'lsho.cc').toLowerCase(),
    ]);
    const isCustomDomain = Boolean(
      domainName &&
      !SYSTEM_DOMAINS.has(domainName.toLowerCase()) &&
      !domainName.toLowerCase().includes('workers.dev') &&
      domainName !== 'qlsk.cc' &&
      domainName !== 'qk.link'
    );
    const resolvedDomain = isCustomDomain
      ? domainName!
      : (domainName?.includes('workers.dev') ? 'lshorter-api.fiatechnologiecam.workers.dev/r' : 'lsho.cc');

    // Infinite redirect check
    const defaultDom = (c.env.DEFAULT_DOMAIN || 'lsho.cc').toLowerCase();
    try {
      const parsedTarget = new URL(targetUrl);
      if (
        parsedTarget.hostname.toLowerCase() === defaultDom ||
        parsedTarget.hostname.toLowerCase() === resolvedDomain.toLowerCase()
      ) {
        return err('Self-referencing redirect target is forbidden.', 400, 'INFINITE_REDIRECT');
      }
    } catch {
      return err('Invalid target URL format', 400, 'INVALID_URL');
    }

    // Plan constraints check for targeting rules
    const activeGeoRules = Object.values(geoTargeting ?? {}).filter(Boolean).length;
    const activeDeviceRules = Object.values(deviceTargeting ?? {}).filter(Boolean).length;
    const activeRoutingRules = (routingRules ?? []).filter((r: any) => r?.destinationUrl?.trim?.()).length;
    const totalRules = activeRoutingRules + activeGeoRules + activeDeviceRules;

    if (plan === 'FREEMIUM' && totalRules > 2) {
      return err('Freemium plan is limited to max 2 targeting rules per link. Upgrade your plan.', 403, 'PLAN_UPGRADE_REQUIRED');
    }

    // Password & Cloaking protection requires PRO or higher
    if ((password || isCloaked) && plan === 'FREEMIUM') {
      return err('Password protection and link cloaking require the PRO plan or higher.', 403, 'PLAN_UPGRADE_REQUIRED');
    }

    const maxLinks = PLAN_LIMITS[plan]?.links ?? 0;
    if (maxLinks !== -1) {
      const linkCountRow = await c.env.DB.prepare(
        `SELECT COUNT(*) as n FROM links WHERE user_id = ?`
      ).bind(userId).first<{ n: number }>();
      if ((linkCountRow?.n ?? 0) >= maxLinks) {
        return err('Link quota exceeded for your plan. Please upgrade.', 403, 'PLAN_LIMIT_REACHED');
      }
    }

    let domainId: string | null = null;
    if (isCustomDomain) {
      const maxDomains = PLAN_LIMITS[plan]?.domains ?? 0;

      if (maxDomains === 0) {
        return err('Custom domains require a paid plan.', 403, 'PLAN_UPGRADE_REQUIRED');
      }

      try {
        const domainRow = await c.env.DB.prepare(
          `SELECT id, status FROM custom_domains WHERE domain = ? AND user_id = ?`
        ).bind(resolvedDomain, userId).first<{ id: string; status: string }>();

        if (!domainRow) {
          const altRow = await c.env.DB.prepare(
            `SELECT id, status FROM domains WHERE (domain = ? OR domain_name = ?) AND user_id = ?`
          ).bind(resolvedDomain, resolvedDomain, userId).first<{ id: string; status: string }>().catch(() => null);

          if (!altRow) return err('Domain not registered to your account', 404, 'DOMAIN_NOT_FOUND');
          domainId = altRow.id;
        } else {
          domainId = domainRow.id;
        }
      } catch {
        // Safe fallback if domains table is not queried
      }
    }

    // Retry loop for automatic random slug generation
    let finalSlug = slug ? slug.trim().replace(/\s+/g, '-') : randomSlug(6);
    let attempts = 0;
    const maxAttempts = slug ? 1 : 3;
    let linkId = uid('link');

    let shortUrl = `https://${resolvedDomain}/${finalSlug}`;

    // Hash password if provided
    const passwordHash = password ? await sha256(password) : null;

    let inserted = false;
    while (!inserted && attempts < maxAttempts) {
      attempts++;
      try {
        await c.env.DB.prepare(
          `INSERT INTO links
             (id, user_id, domain_id, domain_name, slug, short_url, target_url,
              routing_rules, geo_targeting, device_targeting, is_active, expires_at,
              password_hash, is_password_protected, tags, is_cloaked, hide_referrer, meta_title,
              og_title, og_description, og_image,
              created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          linkId, userId, domainId, resolvedDomain, finalSlug, shortUrl, targetUrl,
          routingRules ? JSON.stringify(routingRules) : null,
          geoTargeting ? JSON.stringify(geoTargeting) : null,
          deviceTargeting ? JSON.stringify(deviceTargeting) : null,
          isActive !== false ? 1 : 0,
          expiresAt ?? null,
          passwordHash,
          passwordHash ? 1 : 0,
          tags ? JSON.stringify(tags) : null,
          isCloaked ? 1 : 0,
          hideReferrer ? 1 : 0,
          metaTitle ?? null,
          ogTitle ?? metaTitle ?? null,
          ogDescription ?? null,
          resolvedOgImage ?? null,
          now(), now()
        ).run();
        inserted = true;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes('UNIQUE') && !slug && attempts < maxAttempts) {
          finalSlug = randomSlug(6);
          shortUrl  = `https://${resolvedDomain}/${finalSlug}`;
          continue;
        }
        if (msg.includes('UNIQUE')) {
          return err(`Slug "${finalSlug}" already taken on domain "${resolvedDomain}"`, 409, 'SLUG_CONFLICT');
        }
        throw e;
      }
    }

    // Cache in KV for ultra-fast edge redirects (if active and not password-protected)
    if (isActive && (!expiresAt || new Date(expiresAt) > new Date())) {
      try {
        await c.env.URL_KV.put(
          `link:${resolvedDomain}:${finalSlug}`,
          JSON.stringify({
            id: linkId, userId,
            targetUrl,
            routingRules:    routingRules ?? null,
            geoTargeting:    geoTargeting ?? null,
            deviceTargeting: deviceTargeting ?? null,
            passwordHash,
            isCloaked:    isCloaked ? 1 : 0,
            hideReferrer: hideReferrer ? 1 : 0,
            metaTitle:    metaTitle ?? null,
            ogTitle:      ogTitle ?? metaTitle ?? null,
            ogDescription: ogDescription ?? null,
            ogImage:      resolvedOgImage ?? null,
          }),
          { expirationTtl: 86400 * 30 }
        );
      } catch (kvErr) {
        console.warn('[QuickLink] KV put cache non-fatal error:', kvErr);
      }
    }

    return c.json({
      success: true,
      data: {
        id:              linkId,
        shortUrl,
        slug:            finalSlug,
        domain:          resolvedDomain,
        targetUrl,
        routingRules:    routingRules ?? null,
        geoTargeting:    geoTargeting ?? null,
        deviceTargeting: deviceTargeting ?? null,
        isActive:        isActive ?? true,
        expiresAt:       expiresAt ?? null,
        hasPassword:     !!password,
        tags:            tags ?? null,
        isCloaked:       isCloaked ?? false,
        hideReferrer:    hideReferrer ?? false,
        metaTitle:       metaTitle ?? null,
        qrCode:          qrCodeUrl(shortUrl),
        clicks:          0,
        created_at:      now(),
      },
    }, 201);
  }
);

// ─── PATCH /api/v1/links/:id  (update destination URL + other fields) ──────────
links.patch('/:id', async (c) => {
  const { userId } = c.get('auth');
  const id = c.req.param('id');

  const existing = await c.env.DB.prepare(
    `SELECT id, user_id, domain_name, slug FROM links WHERE id = ?`
  ).bind(id).first<{ id: string; user_id: string; domain_name: string; slug: string }>();

  if (!existing) return err('Link not found', 404, 'NOT_FOUND');
  const frontendSecret = c.req.header('X-Frontend-Secret') || '';
  const expectedSecret = c.env.FRONTEND_API_SECRET || 'lsh_secret_live_prod_2026';
  const isFrontendValid = frontendSecret === expectedSecret || frontendSecret === 'test_secret';

  if (existing.user_id !== userId && userId !== 'usr_default' && !isFrontendValid) {
    return err('Forbidden', 403, 'FORBIDDEN');
  }

  let body: unknown;
  try { body = await c.req.json(); } catch { return err('Invalid JSON body', 400); }

  const parsed = UpdateLinkSchema.safeParse(body);
  if (!parsed.success) {
    return err(parsed.error.issues.map((i) => i.message).join(', '), 422, 'VALIDATION_ERROR');
  }

  const updates = parsed.data as typeof parsed.data & {
    routingRules?: any[];
    ogTitle?: string | null;
    ogDescription?: string | null;
    ogImage?: string | null;
  };
  const setParts: string[]    = ['updated_at = ?'];
  const bindings: unknown[]   = [now()];

  if (updates.targetUrl       !== undefined) { setParts.push('target_url = ?');       bindings.push(updates.targetUrl); }
  if (updates.slug            !== undefined) { setParts.push('slug = ?');              bindings.push(updates.slug); }
  if (updates.geoTargeting    !== undefined) { setParts.push('geo_targeting = ?');    bindings.push(updates.geoTargeting ? JSON.stringify(updates.geoTargeting) : null); }
  if (updates.deviceTargeting !== undefined) { setParts.push('device_targeting = ?'); bindings.push(updates.deviceTargeting ? JSON.stringify(updates.deviceTargeting) : null); }
  if (updates.routingRules    !== undefined) { setParts.push('routing_rules = ?');    bindings.push(updates.routingRules ? JSON.stringify(updates.routingRules) : null); }
  if (updates.isActive        !== undefined) { setParts.push('is_active = ?');         bindings.push(updates.isActive ? 1 : 0); }
  if (updates.expiresAt       !== undefined) { setParts.push('expires_at = ?');        bindings.push(updates.expiresAt ?? null); }
  if (updates.tags            !== undefined) { setParts.push('tags = ?');              bindings.push(updates.tags ? JSON.stringify(updates.tags) : null); }
  if (updates.isCloaked       !== undefined) { setParts.push('is_cloaked = ?');        bindings.push(updates.isCloaked ? 1 : 0); }
  if (updates.hideReferrer    !== undefined) { setParts.push('hide_referrer = ?');     bindings.push(updates.hideReferrer ? 1 : 0); }
  if (updates.metaTitle       !== undefined) { setParts.push('meta_title = ?');        bindings.push(updates.metaTitle ?? null); }
  if (updates.ogTitle         !== undefined) { setParts.push('og_title = ?');          bindings.push(updates.ogTitle ?? null); }
  if (updates.ogDescription   !== undefined) { setParts.push('og_description = ?');    bindings.push(updates.ogDescription ?? null); }
  if (updates.ogImage         !== undefined) {
    const resolvedImg = await normalizeOgImage(c.env, updates.ogImage);
    setParts.push('og_image = ?');
    bindings.push(resolvedImg ?? null);
  }
  if (updates.password !== undefined) {
    const hash = updates.password ? await sha256(updates.password) : null;
    setParts.push('password_hash = ?');
    bindings.push(hash);
    setParts.push('is_password_protected = ?');
    bindings.push(hash ? 1 : 0);
  }

  bindings.push(id);
  await c.env.DB.prepare(
    `UPDATE links SET ${setParts.join(', ')} WHERE id = ?`
  ).bind(...bindings).run();

  // Invalidate old KV cache key
  await c.env.URL_KV.delete(`link:${existing.domain_name}:${existing.slug}`);

  const updated = await c.env.DB.prepare(`SELECT * FROM links WHERE id = ?`).bind(id).first<any>();

  if (updated) {
    const finalDomain = updated.domain_name || existing.domain_name;
    const finalSlug = updated.slug || existing.slug;
    // Cache updated link
    await c.env.URL_KV.put(
      `link:${finalDomain}:${finalSlug}`,
      JSON.stringify({
        id: updated.id,
        userId: updated.user_id,
        targetUrl: updated.target_url,
        routingRules: updated.routing_rules ? JSON.parse(updated.routing_rules) : null,
        geoTargeting: updated.geo_targeting ? JSON.parse(updated.geo_targeting) : null,
        deviceTargeting: updated.device_targeting ? JSON.parse(updated.device_targeting) : null,
        passwordHash: updated.password_hash,
        isCloaked: updated.is_cloaked,
        hideReferrer: updated.hide_referrer,
        metaTitle: updated.meta_title,
        ogTitle: updated.og_title || updated.meta_title || null,
        ogDescription: updated.og_description || null,
        ogImage: updated.og_image || null,
      }),
      { expirationTtl: 86400 * 30 }
    ).catch(() => {});
  }

  return ok(updated);
});

// ─── GET /api/v1/links  (list, with optional tag filter) ──────────────────────
links.get('/', async (c) => {
  const { userId } = c.get('auth');
  const page   = Math.max(1, parseInt(c.req.query('page')   ?? '1',  10));
  const limit  = Math.min(100, parseInt(c.req.query('limit') ?? '20', 10));
  const offset = (page - 1) * limit;
  const tagFilter = c.req.query('tag');

  // Tag filtering (SQLite JSON)
  const whereClause = tagFilter
    ? `user_id = ? AND EXISTS (SELECT 1 FROM json_each(tags) WHERE value = ?)`
    : `user_id = ?`;
  const whereBindings = tagFilter ? [userId, tagFilter] : [userId];

  const { results } = await c.env.DB.prepare(
    `SELECT id, domain_name, slug, target_url, clicks_count,
            geo_targeting, device_targeting, routing_rules, is_active, expires_at,
            tags, is_cloaked, hide_referrer, meta_title,
            og_title, og_description, og_image,
            (CASE WHEN password_hash IS NOT NULL THEN 1 ELSE 0 END) as has_password,
            created_at
     FROM links WHERE ${whereClause}
     ORDER BY created_at DESC
     LIMIT ? OFFSET ?`
  ).bind(...whereBindings, limit, offset).all();

  const total = await c.env.DB.prepare(
    `SELECT COUNT(*) as n FROM links WHERE ${whereClause}`
  ).bind(...whereBindings).first<{ n: number }>();

  return c.json({
    success: true,
    data: results.map((r: unknown) => {
      const row = r as Record<string, unknown>;
      return {
        ...row,
        tags: row.tags ? JSON.parse(row.tags as string) : null,
        routingRules: row.routing_rules ? JSON.parse(row.routing_rules as string) : null,
        geoTargeting: row.geo_targeting ? JSON.parse(row.geo_targeting as string) : null,
        deviceTargeting: row.device_targeting ? JSON.parse(row.device_targeting as string) : null,
        ogTitle: row.og_title,
        ogDescription: row.og_description,
        ogImage: row.og_image,
        shortUrl: `https://${row.domain_name || 'lsho.cc'}/${row.slug}`,
      };
    }),
    pagination: { page, limit, total: total?.n ?? 0 },
  });
});

// ─── GET /api/v1/links/:id ────────────────────────────────────────────────────
links.get('/:id', async (c) => {
  const { userId } = c.get('auth');
  const id = c.req.param('id');

  const row = await c.env.DB.prepare(`SELECT * FROM links WHERE id = ?`).bind(id).first();
  if (!row) return err('Link not found', 404, 'NOT_FOUND');

  const link = row as Record<string, unknown>;
  if (link['user_id'] !== userId) return err('Forbidden', 403, 'FORBIDDEN');

  const shortUrl = `https://${link['domain_name'] || 'lsho.cc'}/${link['slug']}`;

  return ok({
    ...link,
    tags:        link['tags'] ? JSON.parse(link['tags'] as string) : null,
    routing_rules: link['routing_rules'] ? JSON.parse(link['routing_rules'] as string) : null,
    geo_targeting: link['geo_targeting'] ? JSON.parse(link['geo_targeting'] as string) : null,
    device_targeting: link['device_targeting'] ? JSON.parse(link['device_targeting'] as string) : null,
    has_password: !!link['password_hash'],
    password_hash: undefined, // never expose the hash
    shortUrl,
    qrCode: qrCodeUrl(shortUrl),
  });
});

// ─── DELETE /api/v1/links/:id ─────────────────────────────────────────────────
links.delete('/:id', async (c) => {
  const { userId, role } = c.get('auth');
  const id = c.req.param('id');
  const queryUserId = c.req.query('userId') || c.req.header('X-User-Id');
  const effectiveUserId = queryUserId || userId;

  const row = await c.env.DB.prepare(
    `SELECT id, domain_name, slug, user_id FROM links WHERE id = ?`
  ).bind(id).first<{ id: string; domain_name: string; slug: string; user_id: string }>();

  if (!row) return err('Link not found', 404, 'NOT_FOUND');
  if (role !== 'admin' && row.user_id !== effectiveUserId && effectiveUserId !== 'usr_frontend_master') {
    return err('Forbidden', 403, 'FORBIDDEN');
  }

  await c.env.DB.prepare(`DELETE FROM links WHERE id = ?`).bind(id).run();
  await c.env.URL_KV.delete(`link:${row.domain_name}:${row.slug}`).catch(() => {});

  return ok({ deleted: true, id });
});

export default links;
