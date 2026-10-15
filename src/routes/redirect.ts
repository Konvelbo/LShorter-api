// =================================================================
// ROUTE : EDGE REDIRECT  GET /r/:slug  &  Custom Domain fallback
// Features: password protection, link cloaking, referrer hiding
// =================================================================

import { Context, Hono } from 'hono';
import { type CloudflareBindings } from '../lib/types';
import { parseDevice, resolveDeviceTarget, resolveGeoTarget, evaluateStructuredRoutingRules } from '../lib/device';
import { uid, now, sha256, getCountryName } from '../lib/utils';

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
  isActive?:        boolean;
  is_active?:       number;
  expiresAt?:       string | null;
  expires_at?:      string | null;
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
    ua.includes('outbrain') ||
    ua.includes('threads') ||
    ua.includes('bluesky') ||
    ua.includes('mastodon') ||
    ua.includes('redditbot')
  );
}

// ─── OpenGraph & Twitter Card Preview Page for Social Networks ────────────────
function socialPreviewPage(link: CachedLink, destination: string, shortUrl: string): Response {
  const title = link.ogTitle || link.metaTitle || 'LShorter — Smart Link Shortened';
  const description = link.ogDescription || 'Redirection instantanée optimisée par le réseau Edge mondial LShorter.';
  const rawBannerStyle = (link as any).bannerStyle || (link as any).banner_style;
  const rawTwitterCard = link.twitterCard || (link as any).twitter_card;
  const isLarge = rawTwitterCard === 'summary_large_image' || rawBannerStyle === 'large_banner';
  const isDefaultBanner = (rawTwitterCard === 'summary' || rawBannerStyle === 'default_banner') && !isLarge;
  const cardType = isDefaultBanner ? 'summary' : 'summary_large_image';
  const imgWidth = isDefaultBanner ? '512' : '1200';
  const imgHeight = isDefaultBanner ? '512' : '630';

  let image = link.ogImage || (link as any).banner_url || (link as any).bannerUrl || (link as any).imageUrl || '';
  if (image && !image.startsWith('http://') && !image.startsWith('https://')) {
    image = `https://lshorter-api.fiatechnologiecam.workers.dev${image.startsWith('/') ? '' : '/'}${image}`;
  }

  if (cardType === 'summary') {
    if (!image || image.includes('/api/og') || image.includes('default_banner')) {
      image = 'https://lshorter-api.fiatechnologiecam.workers.dev/api/v1/images/default_icon.png';
    }
  } else {
    if (!image) {
      image = 'https://lshorter-api.fiatechnologiecam.workers.dev/api/v1/images/default_banner.jpg';
    }
  }

  let imgType = 'image/jpeg';
  if (image.includes('.png') || image.includes('/api/og') || image.includes('/icon-512')) {
    imgType = 'image/png';
  } else if (image.includes('.webp')) {
    imgType = 'image/webp';
  } else if (image.includes('.gif')) {
    imgType = 'image/gif';
  }

  const html = `<!DOCTYPE html>
<html lang="fr" prefix="og: https://ogp.me/ns#">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="author" content="LShorter">
  <meta name="theme-color" content="#465FFF">

  <!-- Open Graph / Facebook / LinkedIn / WhatsApp / Telegram / Discord -->
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
  <meta name="twitter:domain" content="lsho.cc">
  <meta name="twitter:url" content="${escapeHtml(shortUrl)}">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${escapeHtml(image)}">
  <meta property="twitter:image" content="${escapeHtml(image)}">
  <meta name="twitter:image:src" content="${escapeHtml(image)}">
  <meta name="twitter:image:alt" content="${escapeHtml(title)}">
</head>
<body style="background:#09090b;color:#fafafa;font-family:system-ui,-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px;box-sizing:border-box;">
  ${cardType === 'summary' ? `
  <div style="max-width:540px;width:100%;border-radius:14px;border:1px solid #27272a;overflow:hidden;background:#141416;box-shadow:0 10px 30px rgba(0,0,0,0.5);display:flex;align-items:center;padding:16px;gap:16px;box-sizing:border-box;">
    <img src="${escapeHtml(image)}" alt="${escapeHtml(title)}" style="width:96px;height:96px;min-width:96px;border-radius:10px;object-fit:cover;display:block;" />
    <div style="flex:1;min-width:0;">
      <span style="font-size:11px;font-weight:700;color:#f97316;text-transform:uppercase;letter-spacing:0.5px;display:block;margin-bottom:4px;">${escapeHtml(link.slug || 'lsho.cc')}</span>
      <h2 style="margin:0 0 6px;font-size:15px;font-weight:600;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(title)}</h2>
      <p style="margin:0 0 12px;font-size:12px;color:#a1a1aa;line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${escapeHtml(description)}</p>
      <a href="${escapeHtml(destination)}" style="display:inline-block;padding:7px 14px;background:#465FFF;color:#fff;text-decoration:none;border-radius:6px;font-size:12px;font-weight:600;">Continuer &rarr;</a>
    </div>
  </div>
  ` : `
  <div style="max-width:540px;width:100%;border-radius:16px;border:1px solid #27272a;overflow:hidden;background:#141416;box-shadow:0 10px 30px rgba(0,0,0,0.5);">
    <img src="${escapeHtml(image)}" alt="${escapeHtml(title)}" style="width:100%;height:auto;display:block;aspect-ratio:1200/630;object-fit:cover;" />
    <div style="padding:20px;">
      <h2 style="margin:0 0 8px;font-size:18px;font-weight:600;color:#fff;">${escapeHtml(title)}</h2>
      <p style="margin:0 0 16px;font-size:13px;color:#a1a1aa;line-height:1.5;">${escapeHtml(description)}</p>
      <a href="${escapeHtml(destination)}" style="display:inline-block;padding:10px 20px;background:#465FFF;color:#fff;text-decoration:none;border-radius:8px;font-size:13px;font-weight:600;">Continuer vers le site &rarr;</a>
    </div>
  </div>
  `}
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=300, s-maxage=3600',
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

// ─── Cloaked link & PathLock™ Viewer ──────────────────────────────────────────
function cloakedPage(destination: string, title: string | null, slug: string = '', link?: CachedLink): Response {
  const safeDest = escapeHtml(destination);
  const safeTitle = escapeHtml(title || slug || 'LShorter — Lien Sécurisé');
  const safeSlug = escapeHtml(slug || '');
  const mode = link?.pathLockMode || link?.path_lock_mode || 'off';
  const isPathLocked = mode !== 'off';
  const safePrefix = escapeHtml(link?.pathLockPrefix || link?.path_lock_prefix || '');
  const safeMessage = escapeHtml(
    link?.pathLockMessage ||
    link?.path_lock_message ||
    (mode === 'strict'
      ? 'Le propriétaire de ce lien a restreint la navigation à cette page unique.'
      : 'Le propriétaire de ce lien a restreint la navigation au tunnel d\\\'accès autorisé.')
  );
  const safePassword = escapeHtml(link?.pathLockPassword || link?.path_lock_password || '');

  const html = `<!DOCTYPE html>
<html lang="fr" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <title>${safeTitle}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { height: 100%; overflow: hidden; background: #09090b; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #fff; }
    
    /* Topbar - Ergonomic & Compact (34px height) */
    #topbar {
      position: fixed; top: 0; left: 0; right: 0;
      height: 34px; background: #141418; border-bottom: 1px solid #222226;
      display: flex; align-items: center; justify-content: space-between;
      padding: 0 12px; z-index: 999;
      transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
      box-shadow: 0 1px 4px rgba(0,0,0,0.5);
    }
    #topbar.hidden-bar {
      transform: translateY(-100%);
      pointer-events: none;
    }
    .tb-left { display: flex; align-items: center; gap: 8px; min-width: 0; }
    .tb-logo { width: 18px; height: 18px; border-radius: 4px; background: #f97316; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 9px; color: #fff; flex-shrink: 0; }
    .tb-slug { font-family: monospace; font-size: 11.5px; font-weight: 600; color: #f4f4f5; }
    .tb-badge { font-size: 9.5px; font-weight: 700; padding: 1.5px 6px; border-radius: 4px; border: 1px solid; display: inline-flex; align-items: center; gap: 3px; line-height: 1.2; }
    .tb-badge.locked { background: rgba(16, 185, 129, 0.1); border-color: rgba(16, 185, 129, 0.25); color: #34d399; }
    .tb-badge.unlocked { background: rgba(16, 185, 129, 0.2); border-color: rgba(16, 185, 129, 0.5); color: #10b981; }
    
    .tb-right { display: flex; align-items: center; gap: 6px; }
    .tb-btn { background: #222226; color: #d4d4d8; border: 1px solid #333338; border-radius: 5px; padding: 2.5px 8px; font-size: 10.5px; font-weight: 600; cursor: pointer; transition: all 0.15s; text-decoration: none; }
    .tb-btn:hover { background: #333338; color: #fff; }
    .tb-btn-orange { background: rgba(249, 115, 22, 0.12); color: #fb923c; border-color: rgba(249, 115, 22, 0.28); }
    .tb-btn-orange:hover { background: rgba(249, 115, 22, 0.22); color: #fff; }

    /* Restore Floating Pill: Fixed, Top Center, z-index 1000 */
    #restore-pill {
      position: fixed; top: 10px; left: 50%; transform: translateX(-50%);
      background: rgba(20, 20, 24, 0.95); backdrop-filter: blur(10px);
      border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 9999px;
      padding: 4px 12px; font-size: 11px; font-weight: 600; color: #e4e4e7;
      display: none; align-items: center; gap: 6px; cursor: pointer;
      z-index: 1000; box-shadow: 0 4px 16px rgba(0,0,0,0.6);
      transition: all 0.2s ease;
    }
    #restore-pill:hover { border-color: #f97316; color: #fff; transform: translateX(-50%) translateY(-1px); }

    /* Iframe Container: 100% full screen with zero black bar */
    #iframe-container {
      position: fixed; inset: 0; width: 100%; height: 100%;
      padding-top: 34px; background: #fff;
      transition: padding-top 0.25s cubic-bezier(0.16, 1, 0.3, 1);
    }
    #iframe-container.full-height {
      padding-top: 0 !important;
    }
    iframe { width: 100%; height: 100%; border: none; display: block; background: #fff; }

    /* Blocking Gate */
    #blocking-gate {
      position: absolute; inset: 0; background: rgba(9, 9, 12, 0.96); backdrop-filter: blur(12px);
      display: none; flex-direction: column; align-items: center; justify-content: center;
      padding: 24px; text-align: center; z-index: 99;
    }
    .gate-shield { width: 64px; height: 64px; border-radius: 12px; background: rgba(249, 115, 22, 0.1); border: 1px solid rgba(249, 115, 22, 0.35); display: flex; align-items: center; justify-content: center; font-size: 28px; margin-bottom: 16px; }
    .gate-tag { display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: 6px; background: rgba(239, 68, 68, 0.12); border: 1px solid rgba(239, 68, 68, 0.3); color: #f87171; font-size: 11px; font-weight: 700; text-transform: uppercase; margin-bottom: 12px; }
    .gate-title { font-size: 22px; font-weight: 900; margin-bottom: 8px; max-width: 480px; }
    .gate-desc { font-size: 13px; color: #a1a1aa; max-width: 440px; line-height: 1.5; margin-bottom: 20px; }
    .gate-btn { padding: 10px 20px; border-radius: 8px; background: #f97316; color: #fff; font-weight: 700; font-size: 13px; border: none; cursor: pointer; text-decoration: none; box-shadow: 0 4px 14px rgba(249, 115, 22, 0.35); transition: background 0.2s; }
    .gate-btn:hover { background: #ea580c; }

    /* Dev Bypass Form */
    .dev-bypass-box { margin-top: 20px; background: #141418; border: 1px solid #27272a; border-radius: 8px; padding: 14px; width: 100%; max-width: 360px; text-align: left; }
    .dev-title { font-size: 11px; font-weight: 700; color: #f4f4f5; display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
    .dev-input-wrap { position: relative; margin-bottom: 8px; }
    .dev-input { width: 100%; height: 34px; background: #09090b; border: 1px solid #27272a; border-radius: 6px; padding: 0 32px 0 10px; color: #fff; font-size: 12px; outline: none; }
    .dev-input:focus { border-color: #f97316; }
    .eye-toggle { position: absolute; right: 8px; top: 50%; transform: translateY(-50%); background: none; border: none; color: #71717a; cursor: pointer; font-size: 14px; padding: 2px; }
    .eye-toggle:hover { color: #fff; }
    .dev-submit-btn { width: 100%; padding: 8px; border-radius: 6px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.12); color: #fff; font-size: 11px; font-weight: 700; cursor: pointer; }
    .dev-submit-btn:hover { background: rgba(255,255,255,0.15); }
    .dev-err { color: #f87171; font-size: 11px; margin-bottom: 6px; }
  </style>
</head>
<body>

  <!-- Topbar -->
  <div id="topbar">
    <div class="tb-left">
      <div class="tb-logo">LS</div>
      <span class="tb-slug">/${safeSlug}</span>
      ${
        isPathLocked
          ? `<span id="pathlock-badge" class="tb-badge locked">
               <span>●</span>
               <span id="badge-text">PathLock™ ${mode === 'strict' ? 'Mono-Page' : 'Funnel'}</span>
             </span>`
          : ''
      }
    </div>
    <div class="tb-right">
      <button type="button" class="tb-btn" onclick="restoreOriginalPage()">Page autorisée</button>
      <button type="button" class="tb-btn tb-btn-orange" onclick="toggleTopbar()">Masquer ▲</button>
    </div>
  </div>

  <!-- Restore Floating Pill -->
  <div id="restore-pill" onclick="toggleTopbar()">
    <span style="color:#f97316;">LS</span>
    <span>Afficher la barre ▼</span>
  </div>

  <!-- Iframe Container -->
  <div id="iframe-container">
    <iframe id="main-iframe" src="${safeDest}" sandbox="allow-forms allow-modals allow-pointer-lock allow-popups allow-same-origin allow-scripts allow-downloads"></iframe>

    <!-- PathLock Security Blocking Gate -->
    <div id="blocking-gate">
      <div class="gate-shield">🛡️</div>
      <div class="gate-tag">🔒 Accès Hors Périmètre Bloqué</div>
      <h2 class="gate-title">Navigation Restreinte par le Créateur du Lien</h2>
      <p class="gate-desc">${safeMessage}</p>

      <button type="button" class="gate-btn" onclick="restoreOriginalPage()">← Revenir à la page autorisée</button>

      ${
        safePassword
          ? `<div class="dev-bypass-box">
               <div class="dev-title">
                 <span>🔒 Déverrouillage Équipe / Développeur</span>
                 <span style="color:#71717a; font-weight:normal;">Accès libre</span>
               </div>
               <div class="dev-input-wrap">
                 <input type="password" id="dev-pass-input" class="dev-input" placeholder="Mot de passe..." onkeydown="if(event.key==='Enter') verifyDevPassword()">
                 <button type="button" class="eye-toggle" onclick="toggleEye()">👁️</button>
               </div>
               <div id="dev-error" class="dev-err" style="display:none;">Mot de passe incorrect.</div>
               <button type="button" class="dev-submit-btn" onclick="verifyDevPassword()">Déverrouiller l'accès complet</button>
             </div>`
          : ''
      }
    </div>
  </div>

  <script>
    var isPathLocked = ${isPathLocked ? 'true' : 'false'};
    var targetUrl = "${safeDest}";
    var lockMode = "${mode}";
    var lockPrefix = "${safePrefix}";
    var slug = "${safeSlug}";
    var expectedPassword = "${safePassword}";

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
        text.textContent = "🔓 Accés debloqué";
      }
    }

    function toggleTopbar() {
      var tb = document.getElementById("topbar");
      var container = document.getElementById("iframe-container");
      var pill = document.getElementById("restore-pill");
      var isHidden = tb.classList.contains("hidden-bar");
      if (isHidden) {
        tb.classList.remove("hidden-bar");
        container.classList.remove("full-height");
        pill.style.display = "none";
      } else {
        tb.classList.add("hidden-bar");
        container.classList.add("full-height");
        pill.style.display = "flex";
      }
    }

    function restoreOriginalPage() {
      var gate = document.getElementById("blocking-gate");
      var frame = document.getElementById("main-iframe");
      gate.style.display = "none";
      frame.src = targetUrl;
    }

    function verifyDevPassword() {
      var input = document.getElementById("dev-pass-input");
      var err = document.getElementById("dev-error");
      if (!input) return;
      var val = input.value.trim();
      if (val === expectedPassword) {
        try { sessionStorage.setItem("pathlock_unlocked_" + slug, "true"); } catch(e){}
        isDevUnlocked = true;
        updateBadgeToUnlocked();
        document.getElementById("blocking-gate").style.display = "none";
      } else {
        if (err) err.style.display = "block";
      }
    }

    function toggleEye() {
      var input = document.getElementById("dev-pass-input");
      if (input) {
        input.type = input.type === "password" ? "text" : "password";
      }
    }

    function checkPath(urlOrPath) {
      if (!isPathLocked || isDevUnlocked) return;
      try {
        var path = urlOrPath;
        if (urlOrPath.indexOf("http") === 0) {
          var u = new URL(urlOrPath);
          path = u.pathname;
        }
        var cleanAttempt = path.replace(/^\\/+/, "").replace(/\\/+$/, "");
        var cleanPrefix = lockPrefix.replace(/^\\/+/, "").replace(/\\/+$/, "");

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
      if (e.data && typeof e.data === "object" && e.data.type === "PATHLOCK_NAVIGATE") {
        checkPath(String(e.data.url || ""));
      }
    });

    var frame = document.getElementById("main-iframe");
    if (frame) {
      frame.addEventListener("load", function() {
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
                path_lock_mode, path_lock_prefix, path_lock_message, path_lock_password
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
    return socialPreviewPage(link, destination, fullShortUrl);
  }

  const reqFrontendSecret = c.req.header('x-frontend-secret');
  const expectedFrontendSecret = c.env.FRONTEND_API_SECRET || 'lsh_secret_live_prod_2026';
  const isInternalProbe =
    c.req.header('x-internal-probe') === '1' ||
    c.req.header('x-crawler-prewarm') === '1' ||
    Boolean(reqFrontendSecret && reqFrontendSecret === expectedFrontendSecret);
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

  // 6. Link Cloaking & PathLock™ — serve isolated viewer instead of redirect
  const isPathLocked = Boolean(
    (link.pathLockMode && link.pathLockMode !== 'off') ||
    (link.path_lock_mode && link.path_lock_mode !== 'off')
  );
  if (link.isCloaked || isPathLocked) {
    return cloakedPage(destination, link.metaTitle, decodedSlug, link);
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
