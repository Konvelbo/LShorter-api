// =================================================================
// ROUTE : EDGE REDIRECT  GET /r/:slug  &  Custom Domain fallback
// Features: password protection, link cloaking, referrer hiding
// =================================================================

import { Context, Hono } from 'hono';
import { type CloudflareBindings } from '../lib/types';
import { parseDevice, resolveDeviceTarget, resolveGeoTarget, evaluateStructuredRoutingRules } from '../lib/device';
import { incrementClickCount } from '../middleware/ratelimit';
import { uid, now, sha256 } from '../lib/utils';

interface CachedLink {
  id: string;
  userId: string;
  targetUrl: string;
  routingRules:    any[] | null;
  geoTargeting:    Record<string, string> | null;
  deviceTargeting: Record<string, string> | null;
  passwordHash:    string | null;
  isCloaked:       number;
  hideReferrer:    number;
  metaTitle:       string | null;
  ogTitle?:        string | null;
  ogDescription?:  string | null;
  ogImage?:        string | null;
  maxClicks?:      number | null;
  max_clicks?:     number | null;
  fallbackUrl?:    string | null;
  fallback_url?:   string | null;
}

const redirect = new Hono<{ Bindings: CloudflareBindings }>();

function escapeHtml(str: string): string {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function isSocialBot(userAgent: string): boolean {
  const ua = (userAgent || '').toLowerCase();
  return (
    ua.includes('twitterbot') ||
    ua.includes('facebookexternalhit') ||
    ua.includes('whatsapp') ||
    ua.includes('linkedinbot') ||
    ua.includes('discordbot') ||
    ua.includes('telegrambot') ||
    ua.includes('slackbot') ||
    ua.includes('vkshare') ||
    ua.includes('pinterest') ||
    ua.includes('applebot') ||
    ua.includes('bingbot') ||
    ua.includes('googlebot') ||
    ua.includes('skypeuripreview') ||
    ua.includes('embedly') ||
    ua.includes('quora link preview') ||
    ua.includes('outbrain')
  );
}

// ─── OpenGraph & Twitter Card Preview Page for Social Networks ────────────────
function socialPreviewPage(link: CachedLink, destination: string, shortUrl: string): Response {
  const title = link.ogTitle || link.metaTitle || 'LShorter — Redirection Sécurisée';
  const description = link.ogDescription || 'Redirection instantanée optimisée par le réseau Edge mondial LShorter.';
  const image = link.ogImage || '';

  const html = `<!DOCTYPE html>
<html lang="fr" prefix="og: https://ogp.me/ns#">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="author" content="LShorter">

  <!-- Open Graph / Facebook / LinkedIn / WhatsApp -->
  <meta property="og:site_name" content="LShorter">
  <meta property="og:type" content="article">
  <meta property="og:url" content="${escapeHtml(shortUrl)}">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  ${image ? `<meta property="og:image" content="${escapeHtml(image)}">` : ''}
  ${image ? `<meta property="og:image:url" content="${escapeHtml(image)}">` : ''}
  ${image ? `<meta property="og:image:secure_url" content="${escapeHtml(image)}">` : ''}
  ${image ? `<meta property="og:image:width" content="1200">` : ''}
  ${image ? `<meta property="og:image:height" content="630">` : ''}
  ${image ? `<meta property="og:image:alt" content="${escapeHtml(title)}">` : ''}

  <!-- Twitter / X Cards (Large Banner Format) -->
  <meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}">
  <meta name="twitter:url" content="${escapeHtml(shortUrl)}">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  ${image ? `<meta name="twitter:image" content="${escapeHtml(image)}">` : ''}
  ${image ? `<meta name="twitter:image:src" content="${escapeHtml(image)}">` : ''}

  <!-- Instant Browser Redirect for real human visitors -->
  <meta http-equiv="refresh" content="0;url=${escapeHtml(destination)}">
  <script>window.location.replace("${escapeHtml(destination)}");</script>
</head>
<body style="background:#09090b;color:#fafafa;font-family:system-ui,-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
  <p style="font-size:14px;color:#a1a1aa;">Redirection vers <a href="${escapeHtml(destination)}" style="color:#ff6600;text-decoration:none;font-weight:bold;">${escapeHtml(destination)}</a>...</p>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}

// ─── Password-protected link — HTML form ───────────────────────────────────────
function passwordPage(slug: string, domainName: string, error = false): Response {
  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Lien protégé — QuickLink</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body {
      margin: 0; display: flex; align-items: center; justify-content: center;
      min-height: 100vh; font-family: system-ui, sans-serif;
      background: #0f172a; color: #e2e8f0;
    }
    .card {
      background: #1e293b; border: 1px solid #334155;
      border-radius: 12px; padding: 2rem; width: 100%; max-width: 380px;
      box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5);
    }
    h1 { margin: 0 0 0.5rem; font-size: 1.25rem; }
    p  { margin: 0 0 1.5rem; color: #94a3b8; font-size: 0.875rem; }
    input {
      width: 100%; padding: 0.75rem 1rem; border-radius: 8px;
      border: 1px solid ${error ? '#f87171' : '#334155'};
      background: #0f172a; color: #e2e8f0; font-size: 1rem; margin-bottom: 1rem;
      outline: none;
    }
    input:focus { border-color: #6366f1; }
    .error { color: #f87171; font-size: 0.8rem; margin: -0.5rem 0 0.75rem; }
    button {
      width: 100%; padding: 0.75rem; border-radius: 8px; border: none;
      background: #6366f1; color: #fff; font-size: 1rem; cursor: pointer;
      font-weight: 600; transition: background 0.2s;
    }
    button:hover { background: #4f46e5; }
    .lock { font-size: 2.5rem; margin-bottom: 1rem; }
  </style>
</head>
<body>
  <div class="card">
    <div class="lock">🔒</div>
    <h1>Lien protégé</h1>
    <p>Ce lien est protégé par un mot de passe. Veuillez le saisir pour continuer.</p>
    <form method="POST">
      <input type="hidden" name="_domain" value="${domainName}">
      <input type="password" name="password" placeholder="Mot de passe" autofocus autocomplete="current-password">
      ${error ? '<p class="error">Mot de passe incorrect. Réessayez.</p>' : ''}
      <button type="submit">Continuer →</button>
    </form>
  </div>
</body>
</html>`;
  return new Response(html, {
    status: error ? 401 : 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

// ─── Cloaked link — iframe page ───────────────────────────────────────────────
function cloakedPage(destination: string, title: string | null): Response {
  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  ${title ? `<title>${title}</title>` : '<title>QuickLink</title>'}
  <style>
    * { margin: 0; padding: 0; }
    html, body { height: 100%; overflow: hidden; }
    iframe { width: 100%; height: 100vh; border: none; display: block; }
  </style>
</head>
<body>
  <iframe src="${destination}" sandbox="allow-forms allow-modals allow-pointer-lock allow-popups allow-same-origin allow-scripts allow-top-navigation"></iframe>
</body>
</html>`;
  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

// ─── Shared redirect logic ────────────────────────────────────────────────────

async function handleRedirect(
  c: Context<{ Bindings: CloudflareBindings }>,
  rawSlug: string,
  domainName: string
): Promise<Response> {
  const decodedSlug = decodeURIComponent(rawSlug).trim();
  const hyphenSlug  = decodedSlug.replace(/\s+/g, '-');
  const spaceSlug   = decodedSlug.replace(/-/g, ' ');

  // 1. Try KV cache first (~1 ms)
  const kvKey  = `link:${domainName}:${decodedSlug}`;
  const cached = await c.env.URL_KV.get(kvKey, 'json').catch(() => null) as CachedLink | null;

  let link: CachedLink | null = cached;

  // 2. Fallback to D1 if not cached
  if (!link) {
    const row = await c.env.DB.prepare(
      `SELECT id, user_id, target_url, routing_rules, geo_targeting, device_targeting,
              is_active, expires_at, password_hash, is_cloaked, hide_referrer, meta_title,
              og_title, og_description, og_image, clicks_count, max_clicks, fallback_url
       FROM links
       WHERE (slug = ? OR slug = ? OR slug = ? OR LOWER(slug) = LOWER(?) OR LOWER(slug) = LOWER(?))
       ORDER BY created_at DESC
       LIMIT 1`
    ).bind(decodedSlug, hyphenSlug, spaceSlug, decodedSlug, hyphenSlug).first<{
      id: string; user_id: string; target_url: string; routing_rules: string | null;
      geo_targeting: string | null; device_targeting: string | null;
      is_active: number; expires_at: string | null;
      password_hash: string | null; is_cloaked: number; hide_referrer: number;
      meta_title: string | null;
      og_title: string | null; og_description: string | null; og_image: string | null;
      clicks_count: number | null; max_clicks: number | null; fallback_url: string | null;
    }>();

    if (!row) return c.text('Short link not found', 404);
    if (row.is_active === 0) return c.text('This link has been paused.', 403);
    if (row.expires_at && new Date(row.expires_at) < new Date()) return c.text('This link has expired.', 410);

    link = {
      id:              row.id,
      userId:          row.user_id,
      targetUrl:       row.target_url,
      routingRules:    row.routing_rules ? JSON.parse(row.routing_rules) : null,
      geoTargeting:    row.geo_targeting    ? JSON.parse(row.geo_targeting)    : null,
      deviceTargeting: row.device_targeting ? JSON.parse(row.device_targeting) : null,
      passwordHash:    row.password_hash,
      isCloaked:       row.is_cloaked,
      hideReferrer:    row.hide_referrer,
      metaTitle:       row.meta_title,
      ogTitle:         row.og_title,
      ogDescription:   row.og_description,
      ogImage:         row.og_image,
      maxClicks:       row.max_clicks,
      max_clicks:      row.max_clicks,
      fallbackUrl:     row.fallback_url,
      fallback_url:    row.fallback_url,
    };

    // Warm the KV cache
    if (!link.passwordHash) {
      await c.env.URL_KV.put(kvKey, JSON.stringify(link), { expirationTtl: 86400 }).catch(() => {});
    }
  }

  // 2.5 Strict Quota & Max Clicks check (checks live D1 counter)
  const configuredMaxClicks = link.maxClicks ?? link.max_clicks;
  if (configuredMaxClicks && configuredMaxClicks > 0) {
    const liveLink = await c.env.DB.prepare(
      `SELECT clicks_count, max_clicks, fallback_url FROM links WHERE id = ? OR slug = ? OR LOWER(slug) = LOWER(?) LIMIT 1`
    ).bind(link.id, decodedSlug, decodedSlug).first<{
      clicks_count: number | null;
      max_clicks: number | null;
      fallback_url: string | null;
    }>().catch(() => null);

    const liveClicks = liveLink?.clicks_count ?? 0;
    const liveMax = liveLink?.max_clicks ?? configuredMaxClicks;
    const fallbackTarget = liveLink?.fallback_url || link.fallbackUrl || link.fallback_url;

    if (liveMax > 0 && liveClicks >= liveMax) {
      if (fallbackTarget) {
        return c.redirect(fallbackTarget, 307);
      }
      return c.text('This link has reached its maximum access limit.', 410);
    }
  }

  // 3. Password protection check
  if (link.passwordHash) {
    // POST = form submission with password
    if (c.req.method === 'POST') {
      const form = await c.req.formData().catch(() => null);
      const submitted = form?.get('password')?.toString() ?? '';
      const submittedHash = await sha256(submitted);

      if (submittedHash !== link.passwordHash) {
        return passwordPage(decodedSlug, domainName, true); // wrong password
      }
      // Correct password — fall through to redirect below
    } else {
      // GET — show password form unless valid cookie
      const cookieHeader = c.req.header('cookie') ?? '';
      const cookieName   = `ql_auth_${link.id}`;
      const hasCookie    = cookieHeader.includes(`${cookieName}=${link.passwordHash}`);
      if (!hasCookie) {
        return passwordPage(decodedSlug, domainName, false);
      }
    }
  }

  // 4. Resolve target URL (geo → device → default)
  const ua      = c.req.header('user-agent') ?? '';
  const country = (
    c.req.header('x-country') ??
    c.req.header('cf-ipcountry') ??
    c.req.header('x-vercel-ip-country') ??
    'XX'
  ).toUpperCase();
  const cityReq = c.req.header('x-city') ?? c.req.header('cf-ipcity') ?? null;
  const device  = parseDevice(ua);

  let destination = link.targetUrl;

  // 1. Evaluate structured multi-condition routing rules (highest priority)
  if (link.routingRules) {
    const matchedUrl = evaluateStructuredRoutingRules(link.routingRules, {
      country,
      device,
      city: cityReq,
    });
    if (matchedUrl) {
      destination = matchedUrl;
    }
  }

  // 2. Fallback: Legacy Geo / Device targeting maps
  if (destination === link.targetUrl) {
    const geoOverride    = resolveGeoTarget(link.geoTargeting ? JSON.stringify(link.geoTargeting) : null, country);
    const deviceOverride = resolveDeviceTarget(link.deviceTargeting ? JSON.stringify(link.deviceTargeting) : null, device);
    destination = geoOverride ?? deviceOverride ?? link.targetUrl;
  }

  // 5. Fire-and-forget: record click asynchronously (RGPD compliant with Salted SHA-256)
  const clickId   = uid('clk');
  const timestamp = now();
  const rawIp     = c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for') ?? '127.0.0.1';
  const salt      = c.env.HASH_SALT ?? 'lshorter_rgpd_salt_2026';
  const ipHash    = await sha256(rawIp + salt);
  const referer   = c.req.header('referer') ?? 'Direct';
  const resolvedCountry = country && country !== 'XX' ? country : (c.req.header('cf-ipcountry') || 'BF');
  const city      = cityReq || (resolvedCountry === 'BF' ? 'Ouagadougou' : 'Direct');
  const linkId = link.id || (link as any).link_id || (link as any).linkId || '';
  const linkUserId = link.userId || (link as any).user_id || 'usr_anonymous';

  const trackClick = async () => {
    try {
      // 1. Update link clicks counter in D1 (strictly capped at max_clicks atomically)
      const updateRes = await c.env.DB.prepare(
        `UPDATE links 
         SET clicks_count = COALESCE(clicks_count, 0) + 1, 
             unique_clicks = COALESCE(unique_clicks, 0) + 1, 
             updated_at = ? 
         WHERE (id = ? OR slug = ?)
           AND (max_clicks IS NULL OR max_clicks = 0 OR COALESCE(clicks_count, 0) < max_clicks)`
      ).bind(timestamp, linkId, decodedSlug).run();

      if (updateRes.meta.changes > 0) {
        // 2. Increment user quota in KV
        await incrementClickCount(c.env.URL_KV, linkUserId).catch(() => {});

        // 3. Cache individual click in KV
        await c.env.URL_KV.put(
          `click:${linkId}:${clickId}`,
          JSON.stringify({ id: clickId, linkId, userId: linkUserId, country: resolvedCountry, device: device.key, os: device.os, timestamp }),
          { expirationTtl: 90 * 24 * 3600 }
        ).catch(() => {});

        // 4. Detailed analytics event in D1
        await c.env.DB.prepare(
          `INSERT INTO click_events (id, link_id, user_id, slug, ip_masked, country_code, city, device, browser, os, referrer, resolved_url, timestamp)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(clickId, linkId, linkUserId, decodedSlug, ipHash, resolvedCountry, city, device.type, device.browser, device.os, referer, destination, timestamp).run();
      }
    } catch (err) {
      console.error('[TrackClick Error]', err);
    }
  };

  try {
    await trackClick();
  } catch (err) {
    console.error('[TrackClick Error]', err);
  }

  // 5.5 Check for Social Crawler (Twitterbot, WhatsApp, Facebook, LinkedIn, Discord, etc.)
  if (isSocialBot(ua) || c.req.query('preview') === '1') {
    const reqUrl = new URL(c.req.url);
    const fullShortUrl = `${reqUrl.protocol}//${reqUrl.host}${reqUrl.pathname}`;
    return socialPreviewPage(link, destination, fullShortUrl);
  }

  // 6. Link Cloaking — serve iframe instead of redirect
  if (link.isCloaked) {
    return cloakedPage(destination, link.metaTitle);
  }

  // 7. Security Headers + Referrer hiding + redirect
  const headers: Record<string, string> = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
  };
  if (link.hideReferrer) {
    headers['Referrer-Policy'] = 'no-referrer';
  }

  // Set auth cookie if password was just verified via POST
  if (link.passwordHash && c.req.method === 'POST') {
    headers['Set-Cookie'] = `ql_auth_${link.id}=${link.passwordHash}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`;
  }

  return new Response(null, {
    status: 302,
    headers: { Location: destination, ...headers },
  });
}

// ─── Named-domain route  GET|POST /r/:slug ────────────────────────────────────
redirect.on(['GET', 'POST'], '/r/:slug', async (c) => {
  const slug          = c.req.param('slug');
  const host          = c.req.header('host') ?? c.env.DEFAULT_DOMAIN ?? 'lsho.cc';
  const rawDomain     = host.split(':')[0];
  const defaultDomain = c.env.DEFAULT_DOMAIN ?? 'lsho.cc';
  const isDefaultOrWorker =
    rawDomain.endsWith('.workers.dev') ||
    rawDomain === defaultDomain ||
    rawDomain === 'localhost' ||
    rawDomain === '127.0.0.1';
  const domainName = isDefaultOrWorker ? defaultDomain : rawDomain;

  return handleRedirect(c, slug, domainName);
});

// ─── Direct /:slug fallback ──────────────────────────────────────────────────
redirect.on(['GET', 'POST'], '/:slug', async (c) => {
  const slug = c.req.param('slug');
  const host = c.req.header('host') ?? c.env.DEFAULT_DOMAIN ?? 'lsho.cc';
  const rawDomain = host.split(':')[0];
  const defaultDomain = c.env.DEFAULT_DOMAIN ?? 'lsho.cc';
  const isDefaultOrWorker =
    rawDomain.endsWith('.workers.dev') ||
    rawDomain === defaultDomain ||
    rawDomain === 'localhost' ||
    rawDomain === '127.0.0.1';
  const domainName = isDefaultOrWorker ? defaultDomain : rawDomain;

  return handleRedirect(c, slug, domainName);
});

export default redirect;
