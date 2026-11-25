// =================================================================
// ROUTE : EDGE REDIRECT  GET /r/:slug  &  Custom Domain fallback
// Features: password protection, link cloaking, referrer hiding
// =================================================================

import { Context, Hono } from 'hono';
import { type CloudflareBindings } from '../lib/types';
import { parseDevice, resolveDeviceTarget, resolveGeoTarget, evaluateStructuredRoutingRules } from '../lib/device';
import { uid, now, sha256, getCountryName } from '../lib/utils';
import { isFrontendMasterRequest } from '../middleware/auth';
import { rateLimit } from '../middleware/ratelimit';
import { isSafeExternalHttpUrl } from '../lib/schemas';
import {
  REDIRECT_PIXEL_CSP,
  resolveRedirectActivePixels,
  incrementRedirectPixelCounts,
  renderRedirectPixelInterstitialHtml,
} from '../lib/pixels';

interface CachedLink {
  id: string;
  userId: string;
  slug?: string | null;
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
  bannerStyle?:    string | null;
  banner_style?:   string | null;
  twitterCard?:    string | null;
  twitter_card?:   string | null;
  maxClicks?:      number | null;
  max_clicks?:     number | null;
  fallbackUrl?:    string | null;
  fallback_url?:   string | null;
  pathLockMode?:    string | null;
  path_lock_mode?:  string | null;
  pathLockPrefix?:  string | null;
  path_lock_prefix?: string | null;
  pathLockMessage?: string | null;
  path_lock_message?: string | null;
  pathLockPassword?: string | null;
  path_lock_password?: string | null;
  pathLockAction?:  string | null;
  path_lock_action?: string | null;
  pathLockFallbackPath?: string | null;
  path_lock_fallback_path?: string | null;
  isActive?:        boolean;
  is_active?:       number;
  expiresAt?:       string | null;
  expires_at?:      string | null;
  pixels?:          unknown;
  pixel_ids?:       unknown;
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

function safeInlineJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function isSocialBot(userAgent: string): boolean {
  const ua = (userAgent || '').toLowerCase();
  if (!ua) return false;
  const isMobileWebView = ua.includes('iphone') || ua.includes('ipad') || ua.includes('android');
  return (
    ua.includes('twitterbot') ||
    ua.includes('xbot') ||
    ua.includes('facebookexternalhit') ||
    ua.includes('facebot') ||
    ua.includes('meta-externalagent') ||
    ua.includes('meta-externalfetcher') ||
    ua.includes('whatsapp') ||
    ua.includes('linkedinbot') ||
    ua.includes('discordbot') ||
    ua.includes('telegrambot') ||
    ua.includes('slackbot') ||
    ua.includes('slack-imgproxy') ||
    ua.includes('slack-imgbatcher') ||
    ua.includes('vkshare') ||
    ua.includes('pinterestbot') ||
    (ua.includes('pinterest/') && !isMobileWebView) ||
    (ua.includes('pinterest/') && (ua.includes('bot') || ua.includes('pinterest.com'))) ||
    ua.includes('applebot') ||
    ua.includes('bingbot') ||
    ua.includes('googlebot') ||
    ua.includes('skypeuripreview') ||
    ua.includes('microsoftpreview') ||
    ua.includes('embedly') ||
    ua.includes('quora link preview') ||
    ua.includes('outbrain') ||
    (ua.includes('threads') && !isMobileWebView) ||
    ua.includes('bluesky') ||
    ua.includes('mastodon/') ||
    ua.includes('redditbot') ||
    (ua.includes('snapchat') && !isMobileWebView) ||
    ua.includes('viber') ||
    ua.includes('line-poker') ||
    ua.includes('kakaotalk-scrap') ||
    ua.includes('bytespider') ||
    ua.includes('iframely') ||
    ua.includes('linkpreview') ||
    ua.includes('socialsharepreview') ||
    ua.includes('cardvalidator') ||
    ua.includes('unfurl')
  );
}

// ─── OpenGraph & Twitter Card Preview Page for Social Networks ────────────────
function socialPreviewPage(
  link: CachedLink,
  destination: string,
  shortUrl: string,
  apiOrigin: string,
  defaultDomain: string = 'lsho.cc',
): Response {
  const safeBaseOrigin = apiOrigin.replace(/\/+$/, '');
  const cleanDefaultDomain = (defaultDomain || 'lsho.cc').replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  const urlHost = (() => {
    try {
      return new URL(shortUrl).hostname || cleanDefaultDomain;
    } catch {
      return cleanDefaultDomain;
    }
  })();

  const title = link.ogTitle || link.metaTitle || 'LShorter — Smart Link Shortened';
  const description = link.ogDescription || 'Redirection instantanée optimisée par le réseau Edge mondial LShorter.';
  const rawBannerStyle = (link as any).bannerStyle || (link as any).banner_style;
  const rawTwitterCard = link.twitterCard || (link as any).twitter_card;
  const isLarge = rawTwitterCard === 'summary_large_image' || rawBannerStyle === 'large_banner';
  const isDefaultBanner = (rawTwitterCard === 'summary' || rawBannerStyle === 'default_banner') && !isLarge;
  const cardType = isDefaultBanner ? 'summary' : 'summary_large_image';
  const imgWidth = isDefaultBanner ? '600' : '1200';
  const imgHeight = isDefaultBanner ? '600' : '630';

  let image = link.ogImage || (link as any).banner_url || (link as any).bannerUrl || (link as any).imageUrl || '';
  if (image && image.startsWith('data:')) {
    image = '';
  } else if (image && !image.startsWith('http://') && !image.startsWith('https://')) {
    image = `${safeBaseOrigin}${image.startsWith('/') ? '' : '/'}${image}`;
  }

  const isSvgOrPlaceholder =
    !image ||
    image.includes('.svg') ||
    image.includes('dicebear') ||
    image.includes('default_banner') ||
    image.includes('default_icon');

  if (isSvgOrPlaceholder) {
    const encodedTitle = encodeURIComponent(title.substring(0, cardType === 'summary' ? 70 : 80));
    const encodedDesc = encodeURIComponent(description.substring(0, 160));
    const encodedSlug = encodeURIComponent(link.slug || '');
    image =
      cardType === 'summary'
        ? `https://${cleanDefaultDomain}/banners/og.png?card=summary&title=${encodedTitle}&desc=${encodedDesc}&slug=${encodedSlug}`
        : `https://${cleanDefaultDomain}/banners/og.png?title=${encodedTitle}&desc=${encodedDesc}&slug=${encodedSlug}`;
  }

  let imgType = 'image/jpeg';
  if (image.includes('.png') || image.includes('/api/og') || image.includes('/banners/og') || image.includes('/icon-512')) {
    imgType = 'image/png';
  } else if (image.includes('.webp')) {
    imgType = 'image/webp';
  } else if (image.includes('.gif')) {
    imgType = 'image/gif';
  }

  const isRestrictedLink = Boolean(
    (link as any).isPasswordProtected ||
      (link as any).is_password_protected ||
      link.passwordHash ||
      link.isCloaked ||
      ((link as any).pathLockMode && (link as any).pathLockMode !== 'off'),
  );
  const safeHref = isRestrictedLink ? shortUrl : destination;

  const html = `<!DOCTYPE html>
<html lang="fr" prefix="og: https://ogp.me/ns#">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="author" content="LShorter">
  <meta name="theme-color" content="#0066FF">
  <meta name="robots" content="index, follow, max-image-preview:large">
  <link rel="canonical" href="${escapeHtml(shortUrl)}">
  <link rel="image_src" href="${escapeHtml(image)}">

  <!-- Open Graph / Facebook / LinkedIn / WhatsApp / Telegram / Discord / Slack / Pinterest -->
  <meta property="og:site_name" content="LShorter">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${escapeHtml(shortUrl)}">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:image" content="${escapeHtml(image)}">
  <meta property="og:image:url" content="${escapeHtml(image)}">
  <meta property="og:image:secure_url" content="${escapeHtml(image)}">
  <meta property="og:image:type" content="${imgType}">
  <meta property="og:image:width" content="${imgWidth}">
  <meta property="og:image:height" content="${imgHeight}">
  <meta property="og:image:alt" content="${escapeHtml(title)}">

  <!-- Twitter / X Cards -->
  <meta name="twitter:card" content="${cardType}">
  <meta property="twitter:card" content="${cardType}">
  <meta name="twitter:site" content="@LShorter">
  <meta name="twitter:creator" content="@LShorter">
  <meta name="twitter:domain" content="${escapeHtml(urlHost)}">
  <meta name="twitter:url" content="${escapeHtml(shortUrl)}">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${escapeHtml(image)}">
  <meta property="twitter:image" content="${escapeHtml(image)}">
  <meta name="twitter:image:src" content="${escapeHtml(image)}">
  <meta name="twitter:image:alt" content="${escapeHtml(title)}">
  <meta name="twitter:image:width" content="${imgWidth}">
  <meta name="twitter:image:height" content="${imgHeight}">
</head>
<body style="background:#09090b;color:#fafafa;font-family:system-ui,-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px;box-sizing:border-box;">
  ${cardType === 'summary' ? `
  <div style="max-width:540px;width:100%;border-radius:14px;border:1px solid #27272a;overflow:hidden;background:#141416;box-shadow:0 10px 30px rgba(0,0,0,0.5);display:flex;align-items:center;padding:16px;gap:16px;box-sizing:border-box;">
    <img src="${escapeHtml(image)}" alt="${escapeHtml(title)}" style="width:96px;height:96px;min-width:96px;border-radius:10px;object-fit:cover;display:block;" />
    <div style="flex:1;min-width:0;">
      <span style="font-size:11px;font-weight:700;color:#0066FF;text-transform:uppercase;letter-spacing:0.5px;display:block;margin-bottom:4px;">${escapeHtml(link.slug || cleanDefaultDomain)}</span>
      <h2 style="margin:0 0 6px;font-size:15px;font-weight:600;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(title)}</h2>
      <p style="margin:0 0 12px;font-size:12px;color:#a1a1aa;line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${escapeHtml(description)}</p>
      <a href="${escapeHtml(safeHref)}" style="display:inline-block;padding:7px 14px;background:#0066FF;color:#fff;text-decoration:none;border-radius:6px;font-size:12px;font-weight:600;">Continuer &rarr;</a>
    </div>
  </div>
  ` : `
  <div style="max-width:540px;width:100%;border-radius:16px;border:1px solid #27272a;overflow:hidden;background:#141416;box-shadow:0 10px 30px rgba(0,0,0,0.5);">
    <img src="${escapeHtml(image)}" alt="${escapeHtml(title)}" style="width:100%;height:auto;display:block;aspect-ratio:1200/630;object-fit:cover;" />
    <div style="padding:20px;">
      <h2 style="margin:0 0 8px;font-size:18px;font-weight:600;color:#fff;">${escapeHtml(title)}</h2>
      <p style="margin:0 0 16px;font-size:13px;color:#a1a1aa;line-height:1.5;">${escapeHtml(description)}</p>
      <a href="${escapeHtml(safeHref)}" style="display:inline-block;padding:10px 20px;background:#0066FF;color:#fff;text-decoration:none;border-radius:8px;font-size:13px;font-weight:600;">Continuer vers le site &rarr;</a>
    </div>
  </div>
  `}
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=30, s-maxage=60, stale-while-revalidate=60',
      'Vary': 'User-Agent',
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
      <input type="hidden" name="_domain" value="${escapeHtml(domainName)}">
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

// ─── Cloaked link & PathLock™ Viewer ──────────────────────────────────────────
async function cloakedPage(destination: string, title: string | null, slug: string = '', link?: CachedLink): Promise<Response> {
  const safeDest = escapeHtml(destination);
  const safeTitle = escapeHtml(title || slug || 'LShorter — Lien Sécurisé');
  const safeSlug = escapeHtml(slug || '');
  const mode = link?.pathLockMode || link?.path_lock_mode || 'off';
  const isPathLocked = mode !== 'off';
  const rawPrefix = String(link?.pathLockPrefix || link?.path_lock_prefix || '');
  const action =
    mode === 'funnel' && (link?.pathLockAction === 'fallback' || link?.path_lock_action === 'fallback')
      ? 'fallback'
      : 'block';
  const rawFallbackPath = String(link?.pathLockFallbackPath || link?.path_lock_fallback_path || '').trim();
  const safePrefix = escapeHtml(rawPrefix);
  const cleanPrefix = safePrefix.replace(/^\/+/, '').replace(/\/+$/, '');
  const authorizedPath = cleanPrefix || safeSlug;

  // Build navigable authorized routes for clickable perimeter pills (Option 1)
  let destBaseOrigin = '';
  let destBasePath = '/';
  try {
    const parsedDest = new URL(destination.startsWith('http') ? destination : `https://${destination}`);
    destBaseOrigin = parsedDest.origin;
    destBasePath = parsedDest.pathname || '/';
  } catch {}
  const isBlacklistPrefix = /^(block:|blacklist:|deny:)/i.test(rawPrefix.trim());
  const navigableRoutes: Array<{ label: string; url: string }> = [];
  const seenNavPaths = new Set<string>();
  const addNavRoute = (p: string) => {
    const clean = '/' + String(p || '/').replace(/^\/+/, '').replace(/\/+$/, '');
    const key = clean.toLowerCase();
    if (seenNavPaths.has(key)) return;
    seenNavPaths.add(key);
    const fullUrl = destBaseOrigin ? `${destBaseOrigin}${clean}` : destination;
    navigableRoutes.push({ label: clean, url: fullUrl });
  };
  if (mode === 'strict' || isBlacklistPrefix) {
    addNavRoute(destBasePath);
  } else {
    addNavRoute(destBasePath);
    for (const tok of rawPrefix.split(/[,\n\r;| \t]+/)) {
      let item = tok.trim();
      if (!item || item === '*' || item === '/*' || item.startsWith('!') || item.startsWith('-')) continue;
      if (/^(https?:)?\/\//i.test(item)) {
        try { item = new URL(item.startsWith('//') ? `https:${item}` : item).pathname || '/'; } catch {}
      }
      item = (item.split(/[?#]/)[0] || '').replace(/\/\*+$/, '');
      if (item) addNavRoute(item);
    }
  }
  const perimeterButtonsHtml = navigableRoutes
    .map(
      (r) =>
        `<button type="button" class="gate-route-btn" data-route-url="${escapeHtml(r.url)}" onclick="navigateToAllowedRoute(this.getAttribute('data-route-url'))">${escapeHtml(r.label)}</button>`,
    )
    .join('');

  const safeMessage = escapeHtml(
    link?.pathLockMessage ||
    link?.path_lock_message ||
    (mode === 'strict'
      ? 'Le propriétaire de ce lien a restreint la navigation à cette page unique. Toute navigation externe est bloquée.'
      : 'Le propriétaire de ce lien a restreint la navigation au tunnel d\'accès autorisé. Toute navigation externe est verrouillée.')
  );
  const fallbackToastText = escapeHtml(
    link?.pathLockMessage ||
    link?.path_lock_message ||
    'Accès hors périmètre — redirection vers la page autorisée.'
  );
  const rawPassword = String(link?.pathLockPassword || link?.path_lock_password || '');
  const expectedPasswordHash = rawPassword ? await sha256(rawPassword) : '';

  let destOrigin = '';
  try {
    destOrigin = new URL(destination.startsWith('http') ? destination : `https://${destination}`).origin;
  } catch {}

  const html = `<!DOCTYPE html>
<html lang="fr" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <title>${safeTitle}</title>
  ${destOrigin ? `<link rel="dns-prefetch" href="${destOrigin}">\n  <link rel="preconnect" href="${destOrigin}">` : ''}
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { height: 100%; overflow: hidden; background: #0B0C0E; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #F5F6F8; }
    button { font-family: inherit; cursor: pointer; }

    /* Top Progress Bar for Instant Reload Feedback */
    #reload-progress {
      position: fixed; top: 0; left: 0; right: 0; height: 2.5px;
      background: linear-gradient(90deg, #2563EB, #38BDF8, #60A5FA);
      z-index: 10001; opacity: 0; transform: scaleX(0); transform-origin: left;
      transition: transform 0.3s ease, opacity 0.2s ease;
      pointer-events: none;
    }
    #reload-progress.loading {
      opacity: 1; transform: scaleX(0.85);
      animation: progressPulse 1s infinite alternate;
    }
    @keyframes progressPulse {
      0% { opacity: 0.6; }
      100% { opacity: 1; }
    }

    /* Topbar - Modern Glassmorphism with Smooth Landing-Navbar Animation */
    #topbar {
      position: fixed; top: 0; left: 0; right: 0;
      height: 60px; background: rgba(11, 12, 14, 0.95);
      backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      display: flex; align-items: center; justify-content: space-between;
      padding: 0 20px; z-index: 1000;
      transform: translateY(0); opacity: 1;
      transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.35s cubic-bezier(0.16, 1, 0.3, 1);
      will-change: transform, opacity;
    }
    #topbar.hidden-bar {
      transform: translateY(-100%);
      opacity: 0;
      pointer-events: none;
    }
    .tb-left { display: flex; align-items: center; gap: 12px; min-width: 0; }
    .tb-icon { width: 36px; height: 36px; border-radius: 10px; background: #2563EB; display: flex; align-items: center; justify-content: center; color: #fff; flex-shrink: 0; box-shadow: 0 4px 12px rgba(37, 99, 235, 0.25); }
    .tb-slug { font-size: 16px; font-weight: 700; color: #fff; letter-spacing: -0.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 260px; }
    .tb-badge { display: inline-flex; align-items: center; height: 28px; padding: 0 12px; border-radius: 999px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); font-size: 12px; font-weight: 600; color: #A9C4FF; white-space: nowrap; }
    .tb-badge.unlocked { background: rgba(16, 185, 129, 0.12); border-color: rgba(16, 185, 129, 0.35); color: #34d399; }

    .tb-right { display: flex; align-items: center; gap: 8px; }
    .btn-ghost { display: inline-flex; align-items: center; gap: 8px; height: 38px; padding: 0 14px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.1); background: transparent; color: #D5D9E2; font-size: 13.5px; font-weight: 500; transition: all 0.15s; }
    .btn-ghost:hover { background: rgba(255,255,255,0.07); color: #fff; }
    .btn-icon { width: 38px; height: 38px; padding: 0; justify-content: center; }

    /* Restore Floating Pill: Smooth Slide-in with high z-index 99999 */
    #restore-pill {
      position: fixed; top: 12px; left: 50%;
      transform: translateX(-50%) translateY(-24px) scale(0.95);
      height: 38px; padding: 0 16px; border-radius: 9999px;
      background: rgba(11, 12, 14, 0.95); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
      border: 1px solid rgba(255, 255, 255, 0.2);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
      display: flex; align-items: center; gap: 10px; cursor: pointer;
      z-index: 99999; font-size: 13px; font-weight: 600; color: #F5F6F8;
      opacity: 0; pointer-events: none;
      transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.4s cubic-bezier(0.16, 1, 0.3, 1), border-color 0.15s;
      will-change: transform, opacity;
    }
    #restore-pill.visible-pill {
      transform: translateX(-50%) translateY(0) scale(1);
      opacity: 1;
      pointer-events: auto;
    }
    #restore-pill:hover { border-color: #3b82f6; transform: translateX(-50%) translateY(0) scale(1.04); }
    .pill-icon { width: 22px; height: 22px; border-radius: 9999px; background: #2563EB; display: flex; align-items: center; justify-content: center; color: #fff; }

    /* Iframe Container - Pure GPU Transform, Zero Reflow, Zero White Band */
    #iframe-container {
      position: absolute; inset: 0; width: 100%; height: 100%;
      background: #0B0C0E;
      transform: translateY(60px);
      transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);
      will-change: transform;
    }
    #iframe-container.collapsed {
      transform: translateY(0);
    }
    iframe {
      width: 100%; height: 100%; border: none; display: block;
      background: transparent;
    }

    .spin-icon {
      animation: spin 0.75s linear infinite;
    }
    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    /* Blocking Gate Overlay */
    #blocking-gate {
      position: fixed; inset: 0; background: #0B0C0E;
      display: none; flex-direction: column; align-items: center; justify-content: center;
      padding: 16px; text-align: center; z-index: 10000; overflow-y: auto;
    }
    .gate-glows { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
    .gate-glow-1 { position: absolute; left: 15%; top: 15%; width: 560px; height: 72px; border-radius: 18px; background: rgba(255,255,255,0.08); filter: blur(20px); }
    .gate-glow-2 { position: absolute; right: 10%; top: 12%; width: 340px; height: 220px; border-radius: 24px; background: rgba(255,255,255,0.06); filter: blur(24px); }
    .gate-glow-3 { position: absolute; left: 15%; top: 45%; width: 330px; height: 210px; border-radius: 24px; background: rgba(255,255,255,0.05); filter: blur(24px); }
    .gate-glow-4 { position: absolute; right: 10%; top: 45%; width: 330px; height: 210px; border-radius: 24px; background: rgba(255,255,255,0.05); filter: blur(24px); }
    .gate-glow-center { position: absolute; left: 35%; top: 25%; width: 520px; height: 520px; border-radius: 50%; background: rgba(37,99,235,0.08); filter: blur(120px); }
    .gate-overlay { position: absolute; inset: 0; background: rgba(9,10,12,0.55); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); pointer-events: none; }

    /* Compact & Mobile Responsive Card: No background on mobile (<640px) */
    .gate-card {
      position: relative; z-index: 10; width: 100%; max-width: 390px;
      padding: 16px 10px; box-sizing: border-box; border-radius: 24px;
      background: transparent; border: 1px solid transparent;
      backdrop-filter: none; -webkit-backdrop-filter: none;
      box-shadow: none; display: flex; flex-direction: column; align-items: center; text-align: center;
      margin: auto; transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    }
    @media (min-width: 640px) {
      .gate-card {
        max-width: 420px;
        padding: 30px 26px;
        background: rgba(255,255,255,0.05);
        border: 1px solid rgba(255,255,255,0.12);
        backdrop-filter: blur(28px); -webkit-backdrop-filter: blur(28px);
        box-shadow: 0 24px 64px rgba(0,0,0,0.35);
      }
    }
    .gate-icon-badge {
      width: 56px; height: 56px; border-radius: 16px;
      background: rgba(37,99,235,0.14); border: 1px solid rgba(96,140,255,0.35);
      color: #8DB0FF; display: flex; align-items: center; justify-content: center;
    }
    .gate-pill {
      display: inline-flex; align-items: center; gap: 6px; margin-top: 18px;
      height: 28px; padding: 0 12px; border-radius: 999px;
      background: rgba(37,99,235,0.14); border: 1px solid rgba(96,140,255,0.35);
      color: #A9C4FF; font-size: 11px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase;
    }
    .gate-title {
      margin: 14px 0 0; font-size: 21px; line-height: 1.25; font-weight: 700;
      letter-spacing: -0.015em; color: #fff;
    }
    @media (min-width: 640px) {
      .gate-title { font-size: 24px; }
    }
    .gate-slug {
      margin: 8px 0 0; font-size: 14px; font-weight: 600; line-height: 1.4; color: #A9AFBA;
    }
    .gate-desc-box {
      width: 100%; box-sizing: border-box; margin-top: 12px; padding: 10px 14px;
      border-radius: 12px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1);
      font-size: 12.5px; line-height: 1.5; color: #D5D9E2; text-align: center; word-break: break-word;
    }
    .gate-perimeter {
      width: 100%; box-sizing: border-box; margin-top: 16px; min-height: 46px; padding: 10px 14px;
      display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px;
      border-radius: 12px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1);
    }
    .gate-perimeter span { font-size: 12.5px; color: #A9AFBA; }
    .gate-routes-wrap { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 6px; }
    .gate-route-btn {
      font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace; font-size: 12.5px; font-weight: 600;
      color: #A9C4FF; padding: 4px 10px; border-radius: 8px; background: rgba(0,0,0,0.35);
      border: 1px solid rgba(169,196,255,0.22); transition: background 0.15s, border-color 0.15s, color 0.15s;
    }
    .gate-route-btn:hover { background: rgba(37,99,235,0.22); border-color: rgba(96,165,250,0.55); color: #fff; }
    #fallback-toast {
      position: fixed; top: 72px; left: 50%; transform: translateX(-50%) translateY(-10px);
      z-index: 950; max-width: min(92vw, 460px); padding: 9px 14px; border-radius: 10px;
      background: rgba(17, 18, 22, 0.94); border: 1px solid rgba(255,255,255,0.14);
      color: #E4E7EC; font-size: 12.5px; font-weight: 500; box-shadow: 0 10px 28px rgba(0,0,0,0.45);
      opacity: 0; pointer-events: none; transition: opacity 0.2s ease, transform 0.2s ease;
    }
    #fallback-toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }
    .btn-primary {
      width: 100%; margin-top: 14px; height: 46px; display: flex; align-items: center; justify-content: center;
      gap: 8px; border: none; border-radius: 12px; background: #2563EB; color: #FFFFFF; font-size: 14.5px; font-weight: 600;
      box-shadow: 0 6px 20px rgba(37,99,235,0.35); transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .btn-primary:hover { filter: brightness(1.1); transform: translateY(-1px); }
    .btn-primary:active { transform: translateY(0); }
    .gate-divider { width: 100%; height: 1px; margin-top: 20px; background: rgba(255,255,255,0.1); }

    /* Dev Unlock Form */
    .dev-box { width: 100%; margin-top: 18px; display: flex; flex-direction: column; gap: 10px; text-align: left; }
    .dev-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    .dev-header-left { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; color: #fff; }
    .dev-header-right { font-size: 11px; font-weight: 500; color: #A9AFBA; white-space: nowrap; }
    .dev-input-wrap { position: relative; width: 100%; }
    .dev-input {
      width: 100%; box-sizing: border-box; height: 42px; padding: 0 44px 0 12px;
      border-radius: 10px; border: 1px solid rgba(255,255,255,0.14); background: rgba(0,0,0,0.3);
      color: #F5F6F8; font-family: inherit; font-size: 13.5px; outline: none; transition: border-color 0.15s;
    }
    .dev-input:focus { border-color: #2563EB; }
    .eye-toggle {
      position: absolute; top: 3px; right: 3px; width: 36px; height: 36px;
      display: flex; align-items: center; justify-content: center; border: none; border-radius: 8px;
      background: transparent; color: #A9AFBA; cursor: pointer; transition: color 0.15s;
    }
    .eye-toggle:hover { color: #fff; }
    .dev-btn {
      width: 100%; height: 42px; border-radius: 10px; border: 1px solid rgba(141,176,255,0.4);
      background: transparent; color: #A9C4FF; font-size: 13.5px; font-weight: 600; transition: background 0.15s;
    }
    .dev-btn:hover { background: rgba(255,255,255,0.06); }
    .dev-err { color: #f87171; font-size: 11.5px; margin-top: -4px; }

    .gate-footer { margin-top: 20px; font-size: 11px; color: #9096A3; text-align: center; }
  </style>
</head>
<body>

  <!-- Top Progress Bar for Instant Reload Feedback -->
  <div id="reload-progress"></div>

  <!-- Subtle Fallback Redirect Toast -->
  <div id="fallback-toast" role="status" aria-live="polite">${fallbackToastText}</div>

  <!-- Topbar -->
  <div id="topbar">
    <div class="tb-left">
      <div class="tb-icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"></path></svg>
      </div>
      <span class="tb-slug">${safeTitle}</span>
      ${
        isPathLocked
          ? `<span id="pathlock-badge" class="tb-badge">
               <span id="badge-text">PathLock™ ${mode === 'strict' ? 'Single-Page' : 'Funnel'}</span>
             </span>`
          : `<span class="tb-badge" style="color:#A1A1AA;">Protégé</span>`
      }
    </div>
    <div class="tb-right">
      <button type="button" id="btn-reload" class="btn-ghost" onclick="reloadIframe()" title="Actualiser la page">
        <svg id="reload-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"></path><path d="M21 3v5h-5"></path><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"></path><path d="M8 16H3v5"></path></svg>
        <span id="reload-text">Actualiser</span>
      </button>
      <button type="button" class="btn-ghost btn-icon" onclick="toggleTopbar()" title="Réduire la barre" aria-label="Réduire la barre">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6"></path></svg>
      </button>
    </div>
  </div>

  <!-- Restore Floating Pill (Appears when topbar is collapsed) -->
  <div id="restore-pill" onclick="toggleTopbar()" title="Afficher la barre" aria-label="Afficher la barre">
    <div class="pill-icon">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"></path></svg>
    </div>
    <span>Afficher la barre</span>
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8DB0FF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"></path></svg>
  </div>

  <!-- Iframe Container - Pure GPU Transform, Zero Reflow, Zero White Band -->
  <div id="iframe-container">
    <iframe id="main-iframe" src="${safeDest}" sandbox="allow-forms allow-modals allow-pointer-lock allow-popups allow-same-origin allow-scripts allow-downloads"></iframe>
  </div>

  <!-- PathLock Security Blocking Gate (Direct Child of Body, Full-Screen Overlay) -->
  <div id="blocking-gate">
    <!-- Glows -->
    <div class="gate-glows">
      <div class="gate-glow-1"></div>
      <div class="gate-glow-2"></div>
      <div class="gate-glow-3"></div>
      <div class="gate-glow-4"></div>
      <div class="gate-glow-center"></div>
    </div>
    <div class="gate-overlay"></div>

    <!-- Main Modal Card -->
    <div class="gate-card">
      <div class="gate-icon-badge">
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"></path><path d="M12 8v4"></path><path d="M12 16h.01"></path></svg>
      </div>

      <div class="gate-pill">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
        <span>ACCÈS HORS PÉRIMÈTRE BLOQUÉ</span>
      </div>

      <h1 class="gate-title">Navigation restreinte par le créateur du lien</h1>
      <p class="gate-slug">${safeTitle}</p>

      <!-- Description part -->
      <div class="gate-desc-box">${safeMessage}</div>

      <!-- Authorized perimeter box (clickable routes — Option 1) -->
      <div class="gate-perimeter">
        <span>Pages autorisées</span>
        <div class="gate-routes-wrap">${perimeterButtonsHtml || `<code>/${authorizedPath}</code>`}</div>
      </div>

      <!-- Return CTA button -->
      <button type="button" class="btn-primary" onclick="restoreOriginalPage()">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"><path d="m12 19-7-7 7-7"></path><path d="M19 12H5"></path></svg>
        <span>Revenir à la page autorisée</span>
      </button>

      <div class="gate-divider"></div>

      ${
        expectedPasswordHash
          ? `<div class="dev-box">
               <div class="dev-header">
                 <span class="dev-header-left">
                   <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8DB0FF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                   <span>Déverrouillage équipe / développeur</span>
                 </span>
                 <span class="dev-header-right">Accès complet</span>
               </div>
               <div class="dev-input-wrap">
                 <input type="password" id="unlock-pass" class="dev-input" placeholder="Mot de passe de déblocage…" onkeydown="if(event.key==='Enter') verifyDevPassword()">
                 <button type="button" class="eye-toggle" onclick="toggleEye()" aria-label="Afficher le mot de passe">
                   <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"></path><circle cx="12" cy="12" r="3"></circle></svg>
                 </button>
               </div>
               <div id="dev-error" class="dev-err" style="display:none;">Mot de passe incorrect.</div>
               <button type="button" class="dev-btn" onclick="verifyDevPassword()">Déverrouiller l’accès complet</button>
             </div>`
          : ''
      }

      <p class="gate-footer">Sécurisé par LShorter Edge Gate • PathLock™ Engine</p>
    </div>
  </div>

  <script>
    var isPathLocked = ${isPathLocked ? 'true' : 'false'};
    var targetUrl = ${safeInlineJson(destination)};
    var lockMode = ${safeInlineJson(mode)};
    var lockPrefix = ${safeInlineJson(rawPrefix)};
    var lockAction = ${safeInlineJson(action)};
    var lockFallbackPath = ${safeInlineJson(rawFallbackPath)};
    var slug = ${safeInlineJson(slug || '')};
    var fallbackToastTimer = null;

    function showFallbackToast() {
      var el = document.getElementById("fallback-toast");
      if (!el) return;
      el.classList.add("show");
      if (fallbackToastTimer) clearTimeout(fallbackToastTimer);
      fallbackToastTimer = setTimeout(function() {
        el.classList.remove("show");
      }, 2500);
    }

    function navigateToAllowedRoute(routeUrl) {
      if (!routeUrl) return restoreOriginalPage();
      var gate = document.getElementById("blocking-gate");
      var frame = document.getElementById("main-iframe");
      var icon = document.getElementById("reload-icon");
      var text = document.getElementById("reload-text");
      var prog = document.getElementById("reload-progress");
      if (icon) icon.classList.add("spin-icon");
      if (text) text.textContent = "Actualisation…";
      if (prog) {
        prog.style.transform = "scaleX(0.75)";
        prog.classList.add("loading");
      }
      if (gate) gate.style.display = "none";
      if (frame) {
        frame.src = routeUrl;
      }
    }
    var expectedPasswordHash = ${safeInlineJson(expectedPasswordHash)};

    var isDevUnlocked = false;
    try {
      if (sessionStorage.getItem("pathlock_unlocked_" + slug) === "true") {
        isDevUnlocked = true;
        updateBadgeToUnlocked();
      }
    } catch(e) {}

    function updateBadgeToUnlocked() {
      var badge = document.getElementById("pathlock-badge");
      var text = document.getElementById("badge-text");
      if (badge && text) {
        badge.className = "tb-badge unlocked";
        text.textContent = "🔓 Accès débloqué";
      }
    }

    function toggleTopbar() {
      var tb = document.getElementById("topbar");
      var container = document.getElementById("iframe-container");
      var pill = document.getElementById("restore-pill");
      var isHidden = tb.classList.contains("hidden-bar");
      if (isHidden) {
        tb.classList.remove("hidden-bar");
        container.classList.remove("collapsed");
        pill.classList.remove("visible-pill");
      } else {
        tb.classList.add("hidden-bar");
        container.classList.add("collapsed");
        pill.classList.add("visible-pill");
      }
    }

    function reloadIframe() {
      var frame = document.getElementById("main-iframe");
      var icon = document.getElementById("reload-icon");
      var text = document.getElementById("reload-text");
      var prog = document.getElementById("reload-progress");
      if (icon) icon.classList.add("spin-icon");
      if (text) text.textContent = "Actualisation…";
      if (prog) {
        prog.style.transform = "scaleX(0.75)";
        prog.classList.add("loading");
      }

      try {
        if (frame && frame.contentWindow && frame.contentWindow.location) {
          frame.contentWindow.location.reload();
          return;
        }
      } catch(e) {}

      if (frame) {
        frame.src = frame.src;
      }
    }

    function restoreOriginalPage() {
      var gate = document.getElementById("blocking-gate");
      var frame = document.getElementById("main-iframe");
      var icon = document.getElementById("reload-icon");
      var text = document.getElementById("reload-text");
      var prog = document.getElementById("reload-progress");
      if (icon) icon.classList.add("spin-icon");
      if (text) text.textContent = "Actualisation…";
      if (prog) {
        prog.style.transform = "scaleX(0.75)";
        prog.classList.add("loading");
      }
      gate.style.display = "none";
      if (frame) {
        frame.src = targetUrl;
      }
    }

    async function verifyDevPassword() {
      var input = document.getElementById("unlock-pass");
      var err = document.getElementById("dev-error");
      if (!input || !expectedPasswordHash) return;
      var val = input.value.trim();
      try {
        var bytes = new TextEncoder().encode(val);
        var digest = await crypto.subtle.digest("SHA-256", bytes);
        var hashHex = Array.from(new Uint8Array(digest)).map(function(b) {
          return b.toString(16).padStart(2, "0");
        }).join("");
        if (hashHex === expectedPasswordHash) {
          try { sessionStorage.setItem("pathlock_unlocked_" + slug, "true"); } catch(e){}
          isDevUnlocked = true;
          updateBadgeToUnlocked();
          document.getElementById("blocking-gate").style.display = "none";
          return;
        }
      } catch(e) {}
      if (err) err.style.display = "block";
    }

    function toggleEye() {
      var input = document.getElementById("unlock-pass");
      if (input) {
        input.type = input.type === "password" ? "text" : "password";
      }
    }

    function cleanRoute(p) {
      if (!p) return "";
      return p.split("/").filter(Boolean).join("/");
    }

    function checkPath(urlOrPath) {
      if (!isPathLocked || isDevUnlocked) return;
      try {
        var path = urlOrPath;
        if (urlOrPath.indexOf("http") === 0) {
          var u = new URL(urlOrPath);
          path = u.pathname;
        }
        var cleanAttempt = cleanRoute(path);
        var cleanPrefix = cleanRoute(lockPrefix);

        if (lockMode === "strict") {
          if (cleanAttempt !== cleanPrefix) {
            document.getElementById("blocking-gate").style.display = "flex";
          }
        } else if (lockMode === "funnel") {
          if (cleanPrefix && cleanAttempt.indexOf(cleanPrefix) !== 0) {
            document.getElementById("blocking-gate").style.display = "flex";
          }
        }
      } catch(e) {}
    }

    window.addEventListener("message", function(e) {
      if (!e.data || typeof e.data !== "object") return;
      if (e.data.type === "PATHLOCK_FALLBACK") {
        showFallbackToast();
        if (e.data.navigateUrl && e.data.fromNestedEmbed) {
          navigateToAllowedRoute(String(e.data.navigateUrl));
        }
        return;
      }
      if (e.data.type === "PATHLOCK_NAVIGATE") {
        if (e.data.blocked) {
          document.getElementById("blocking-gate").style.display = "flex";
          return;
        }
        checkPath(String(e.data.url || ""));
      }
    });

    var frame = document.getElementById("main-iframe");
    if (frame) {
      frame.addEventListener("load", function() {
        var icon = document.getElementById("reload-icon");
        var text = document.getElementById("reload-text");
        var prog = document.getElementById("reload-progress");
        if (icon) icon.classList.remove("spin-icon");
        if (text) text.textContent = "Actualiser";
        if (prog) {
          prog.style.transform = "scaleX(1)";
          setTimeout(function() {
            prog.classList.remove("loading");
            prog.style.opacity = "0";
            prog.style.transform = "scaleX(0)";
          }, 250);
        }
        try {
          if (frame.contentWindow && frame.contentWindow.location) {
            checkPath(frame.contentWindow.location.pathname);
          }
        } catch(e) {}
      });
    }
  </script>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'private, no-cache, must-revalidate',
      'X-Content-Type-Options': 'nosniff',
    },
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

  // 1. Try multi-key KV cache first (~1 ms) to avoid D1 reads entirely
  const keysToCheck = [
    `link:${domainName}:${decodedSlug}`,
    `link:lsho.cc:${decodedSlug}`,
    `link:default:${decodedSlug}`,
    `link:${decodedSlug}`,
    hyphenSlug !== decodedSlug ? `link:${domainName}:${hyphenSlug}` : null,
    hyphenSlug !== decodedSlug ? `link:lsho.cc:${hyphenSlug}` : null,
  ].filter(Boolean) as string[];

  let link: CachedLink | null = null;
  for (const key of keysToCheck) {
    const cached = await c.env.URL_KV.get(key, 'json').catch(() => null) as CachedLink | null;
    if (cached) {
      link = cached;
      break;
    }
  }

  // 2. Fallback to D1 if not cached
  if (!link) {
    let row: any = null;
    try {
      row = await c.env.DB.prepare(
        `SELECT id, user_id, target_url, routing_rules, geo_targeting, device_targeting,
                is_active, expires_at, password_hash, is_cloaked, hide_referrer, meta_title,
                og_title, og_description, og_image, twitter_card, banner_style, clicks_count, max_clicks, fallback_url,
                path_lock_mode, path_lock_prefix, path_lock_message, path_lock_password,
                path_lock_action, path_lock_fallback_path, pixels
         FROM links
         WHERE (slug = ? OR slug = ? OR slug = ? OR LOWER(slug) = LOWER(?) OR LOWER(slug) = LOWER(?))
         ORDER BY created_at DESC
         LIMIT 1`
      ).bind(decodedSlug, hyphenSlug, spaceSlug, decodedSlug, hyphenSlug).first();
    } catch {
      row = await c.env.DB.prepare(
        `SELECT id, user_id, target_url, routing_rules, geo_targeting, device_targeting,
                is_active, expires_at, password_hash, is_cloaked, hide_referrer, meta_title,
                og_title, og_description, og_image, clicks_count, max_clicks, fallback_url,
                path_lock_mode, path_lock_prefix, path_lock_message, path_lock_password
         FROM links
         WHERE (slug = ? OR slug = ? OR slug = ? OR LOWER(slug) = LOWER(?) OR LOWER(slug) = LOWER(?))
         ORDER BY created_at DESC
         LIMIT 1`
      ).bind(decodedSlug, hyphenSlug, spaceSlug, decodedSlug, hyphenSlug).first();
    }

    if (!row) return c.text('Short link not found', 404);
    if (row.is_active === 0) return c.text('This link has been paused.', 403);
    if (row.expires_at && new Date(row.expires_at) < new Date()) {
      try {
        const nowIso = new Date().toISOString();
        const purgeTasks = [
          c.env.DB.prepare(`UPDATE links SET is_active = 0, updated_at = ? WHERE id = ?`).bind(nowIso, row.id).run(),
          c.env.URL_KV.delete(`link:${domainName}:${decodedSlug}`),
          c.env.URL_KV.delete(`link:lsho.cc:${decodedSlug}`),
          c.env.URL_KV.delete(`link:${decodedSlug}`),
          hyphenSlug !== decodedSlug ? c.env.URL_KV.delete(`link:${domainName}:${hyphenSlug}`) : Promise.resolve(),
        ];
        c.executionCtx.waitUntil(Promise.all(purgeTasks));
      } catch {}
      return c.text('This link has expired.', 410);
    }

    const isDefaultBanner = row.banner_style === 'default_banner' || row.twitter_card === 'summary';
    const resolvedBannerStyle = isDefaultBanner ? 'default_banner' : 'large_banner';
    const resolvedTwitterCard = isDefaultBanner ? 'summary' : 'summary_large_image';

    link = {
      id:              row.id,
      userId:          row.user_id,
      slug:            row.slug || decodedSlug,
      targetUrl:       row.target_url,
      isActive:        row.is_active !== 0,
      expiresAt:       row.expires_at || null,
      routingRules:    row.routing_rules ? JSON.parse(row.routing_rules) : null,
      geoTargeting:    row.geo_targeting    ? JSON.parse(row.geo_targeting)    : null,
      deviceTargeting: row.device_targeting ? JSON.parse(row.device_targeting) : null,
      passwordHash:    row.password_hash,
      isCloaked:       row.is_cloaked,
      hideReferrer:    row.hide_referrer,
      metaTitle:       row.meta_title,
      ogTitle:         row.og_title,
      ogDescription:   row.og_description,
      ogImage:         row.og_image || (row as any).banner_url || null,
      bannerStyle:     resolvedBannerStyle,
      banner_style:    resolvedBannerStyle,
      twitterCard:     resolvedTwitterCard,
      twitter_card:    resolvedTwitterCard,
      maxClicks:       row.max_clicks,
      max_clicks:      row.max_clicks,
      fallbackUrl:     row.fallback_url,
      fallback_url:    row.fallback_url,
      pathLockMode:    row.path_lock_mode || 'off',
      path_lock_mode:  row.path_lock_mode || 'off',
      pathLockPrefix:  row.path_lock_prefix || null,
      path_lock_prefix: row.path_lock_prefix || null,
      pathLockMessage: row.path_lock_message || null,
      path_lock_message: row.path_lock_message || null,
      pathLockPassword: row.path_lock_password || null,
      path_lock_password: row.path_lock_password || null,
      pathLockAction:  row.path_lock_action || 'block',
      path_lock_action: row.path_lock_action || 'block',
      pathLockFallbackPath: row.path_lock_fallback_path || null,
      path_lock_fallback_path: row.path_lock_fallback_path || null,
      pixels:          row.pixels ? (typeof row.pixels === 'string' ? JSON.parse(row.pixels) : row.pixels) : [],
      pixel_ids:       row.pixels ? (typeof row.pixels === 'string' ? JSON.parse(row.pixels) : row.pixels) : [],
    };

    // Warm multi-key KV cache so future requests never query D1
    if (!link.passwordHash) {
      const payload = JSON.stringify(link);
      const warmPromises = [
        c.env.URL_KV.put(`link:${domainName}:${decodedSlug}`, payload, { expirationTtl: 86400 * 7 }),
        c.env.URL_KV.put(`link:lsho.cc:${decodedSlug}`, payload, { expirationTtl: 86400 * 7 }),
        c.env.URL_KV.put(`link:${decodedSlug}`, payload, { expirationTtl: 86400 * 7 }),
      ];
      try {
        c.executionCtx.waitUntil(Promise.all(warmPromises));
      } catch {
        await Promise.all(warmPromises).catch(() => {});
      }
    }
  }

  if (!link) return c.text('Short link not found', 404);

  // 2.2 Expiration & Deactivation check (for both cached and live links)
  const expTimeStr = link.expiresAt || (link as any).expires_at;
  const isLinkExpired = Boolean(expTimeStr) && new Date(expTimeStr).getTime() <= Date.now();
  const isLinkPaused = link.isActive === false || (link as any).is_active === 0;

  if (isLinkExpired) {
    try {
      const nowIso = new Date().toISOString();
      const purgeTasks = [
        c.env.DB.prepare(`UPDATE links SET is_active = 0, updated_at = ? WHERE id = ?`).bind(nowIso, link.id).run(),
        c.env.URL_KV.delete(`link:${domainName}:${decodedSlug}`),
        c.env.URL_KV.delete(`link:lsho.cc:${decodedSlug}`),
        c.env.URL_KV.delete(`link:${decodedSlug}`),
        hyphenSlug !== decodedSlug ? c.env.URL_KV.delete(`link:${domainName}:${hyphenSlug}`) : Promise.resolve(),
      ];
      c.executionCtx.waitUntil(Promise.all(purgeTasks));
    } catch {}
    return c.text('This link has expired.', 410);
  }

  if (isLinkPaused) {
    return c.text('This link has been paused.', 403);
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
      if (fallbackTarget && isSafeExternalHttpUrl(fallbackTarget)) {
        return c.redirect(fallbackTarget, 307);
      }
      return c.text('This link has reached its maximum access limit.', 410);
    }
  }

  // 3. Password protection check
  let authCookieToken = '';
  if (link.passwordHash) {
    authCookieToken = await sha256(`${link.id}:${link.passwordHash}:${c.env.HASH_SALT || 'lsh_cookie_v1'}`);
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
      // GET — show password form unless valid signed cookie
      const cookieHeader = c.req.header('cookie') ?? '';
      const cookieName   = `ql_auth_${link.id}`;
      const hasCookie    = cookieHeader
        .split(';')
        .map((part) => part.trim())
        .includes(`${cookieName}=${authCookieToken}`);
      if (!hasCookie) {
        return passwordPage(decodedSlug, domainName, false);
      }
    }
  }

  // 4. Resolve target URL (geo → device → default)
  const cfData  = (c.req.raw as any)?.cf || {};
  const ua      = c.req.header('user-agent') ?? '';
  const country = (
    c.req.header('x-country') ??
    c.req.header('cf-ipcountry') ??
    c.req.header('x-vercel-ip-country') ??
    cfData.country ??
    'XX'
  ).toUpperCase();
  const cityReq =
    c.req.header('x-city') ??
    c.req.header('cf-ipcity') ??
    cfData.city ??
    cfData.region ??
    null;
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

  // 5.5 Check for Social Crawler / Internal Probe / Prefetch
  const isBot = isSocialBot(ua);
  const isPreview = c.req.query('preview') === '1';

  // ─── 5.6 Early Return for Social Crawlers & Link Previews (Zero D1 Writes) ────
  if (isBot || isPreview) {
    const reqUrl = new URL(c.req.url);
    const fullShortUrl = `${reqUrl.protocol}//${reqUrl.host}${reqUrl.pathname}`;
    const apiOrigin = c.env.PUBLIC_API_URL || reqUrl.origin;
    return socialPreviewPage(
      link,
      destination,
      fullShortUrl,
      apiOrigin,
      c.env.DEFAULT_DOMAIN || 'lsho.cc',
    );
  }

  const isInternalProbe =
    c.req.header('x-internal-probe') === '1' ||
    c.req.header('x-crawler-prewarm') === '1' ||
    isFrontendMasterRequest(c);
  const purposeHeader = (c.req.header('purpose') || c.req.header('sec-purpose') || c.req.header('x-purpose') || c.req.header('x-moz') || '').toLowerCase();
  const isPrefetch = purposeHeader.includes('prefetch') || isInternalProbe;

  // 5. Record click in Cloudflare D1 for real visits (excluding bots, internal probes & browser prefetches)
  if (!isPrefetch && !isInternalProbe) {
    const clickId   = uid('clk');
    const timestamp = now();
    const rawIp     = c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for') ?? '127.0.0.1';
    const salt      = c.env.HASH_SALT ?? 'lshorter_rgpd_salt_2026';
    const ipHash    = await sha256(rawIp + salt);
    const referer   = c.req.header('referer') ?? 'Direct';
    const resolvedCountry = country && country !== 'XX' ? country : (c.req.header('cf-ipcountry') || cfData.country || 'XX');
    const countryName = getCountryName(resolvedCountry);
    let rawCity     = cityReq && cityReq !== 'Direct' && cityReq !== 'Unknown' ? cityReq : '';
    if (rawCity) {
      try { rawCity = decodeURIComponent(rawCity); } catch {}
    }
    const city      = rawCity;
    const linkId = link.id || (link as any).link_id || (link as any).linkId || '';
    const linkUserId = link.userId || (link as any).user_id || 'usr_anonymous';

    const throttleKey = `clk_th:${ipHash.substring(0, 16)}:${linkId || decodedSlug}`;

    const trackClick = async () => {
      try {
        const isThrottled = await c.env.URL_KV.get(throttleKey).catch(() => null);
        if (isThrottled) return;
        await c.env.URL_KV.put(throttleKey, '1', { expirationTtl: 15 }).catch(() => {});

        // 1. Update link clicks counter in D1 (strictly capped at max_clicks atomically)
        let updateRes: any;
        try {
          updateRes = await c.env.DB.prepare(
            `UPDATE links 
             SET clicks_count = COALESCE(clicks_count, 0) + 1, 
                 unique_clicks = COALESCE(unique_clicks, 0) + 1, 
                 updated_at = ? 
             WHERE (id = ? OR slug = ?)
               AND (max_clicks IS NULL OR max_clicks = 0 OR COALESCE(clicks_count, 0) < max_clicks)`
          ).bind(timestamp, linkId, decodedSlug).run();
        } catch {
          updateRes = await c.env.DB.prepare(
            `UPDATE links 
             SET clicks_count = COALESCE(clicks_count, 0) + 1, 
                 updated_at = ? 
             WHERE (id = ? OR slug = ?)
               AND (max_clicks IS NULL OR max_clicks = 0 OR COALESCE(clicks_count, 0) < max_clicks)`
          ).bind(timestamp, linkId, decodedSlug).run();
        }

        if (updateRes.meta.changes > 0) {
          // Detailed analytics event in D1
          await c.env.DB.prepare(
            `INSERT INTO click_events (id, link_id, user_id, slug, ip_masked, country_code, country_name, city, device, browser, os, referrer, resolved_url, timestamp)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).bind(clickId, linkId, linkUserId, decodedSlug, ipHash, resolvedCountry, countryName, city, device.type, device.browser, device.os, referer, destination, timestamp).run();
        }
      } catch (err) {
        console.error('[TrackClick Error]', err);
      }
    };

    try {
      c.executionCtx.waitUntil(trackClick());
    } catch {
      trackClick().catch(() => {});
    }
  }

  // Defense-in-depth: never redirect or frame a dangerous protocol / internal SSRF destination
  if (!isSafeExternalHttpUrl(destination)) {
    return c.text('Blocked unsafe destination URL.', 400);
  }

  // 6. Link Cloaking & PathLock™ — serve isolated viewer instead of redirect
  const isPathLocked = Boolean(
    (link.pathLockMode && link.pathLockMode !== 'off') ||
    (link.path_lock_mode && link.path_lock_mode !== 'off')
  );
  if (link.isCloaked || isPathLocked) {
    return await cloakedPage(destination, link.metaTitle, decodedSlug, link);
  }

  // 7. Security Headers + Referrer hiding + Retargeting Pixels / Redirect
  const headers: Record<string, string> = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
  };
  if (link.hideReferrer) {
    headers['Referrer-Policy'] = 'no-referrer';
  }

  // Set auth cookie if password was just verified via POST
  if (link.passwordHash && authCookieToken && c.req.method === 'POST') {
    const isHttps = c.req.url.startsWith('https://');
    headers['Set-Cookie'] = `ql_auth_${link.id}=${authCookieToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400${isHttps ? '; Secure' : ''}`;
  }

  // 7.5 Retargeting Pixels Interstitial (9 official platforms: Meta, Instagram, Google, YouTube, TikTok, LinkedIn, Pinterest, Snapchat, X)
  if (!isPrefetch && !isInternalProbe) {
    const activePixels = await resolveRedirectActivePixels(c.env.DB, link);
    if (activePixels.length > 0) {
      const incrementPromise = incrementRedirectPixelCounts(c.env.DB, activePixels);
      try {
        c.executionCtx.waitUntil(incrementPromise);
      } catch {
        incrementPromise.catch(() => {});
      }

      const html = renderRedirectPixelInterstitialHtml(
        destination,
        activePixels,
        link.ogTitle || link.metaTitle,
      );

      return new Response(html, {
        status: 200,
        headers: {
          ...headers,
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Security-Policy': REDIRECT_PIXEL_CSP,
          'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
          'X-Robots-Tag': 'noindex, nofollow',
        },
      });
    }
  }

  return new Response(null, {
    status: 302,
    headers: { Location: destination, ...headers },
  });
}

// Brute-force protection on password form POST submissions (20 req/min per IP)
const passwordFormRateLimit = rateLimit({ limit: 20, windowSeconds: 60, keyType: 'ip' });

// ─── Named-domain route  GET|POST /r/:slug ────────────────────────────────────
redirect.post('/r/:slug', passwordFormRateLimit, async (c) => {
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

redirect.get('/r/:slug', async (c) => {
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
redirect.post('/:slug', passwordFormRateLimit, async (c) => {
  const slug = c.req.param('slug');
  if (slug === 'api' || slug === 'health' || slug === 'favicon.ico') {
    return c.text('Not found', 404);
  }
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

redirect.get('/:slug', async (c) => {
  const slug = c.req.param('slug');
  if (slug === 'api' || slug === 'health' || slug === 'favicon.ico') {
    return c.text('Not found', 404);
  }
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
