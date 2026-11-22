// =================================================================
// RETARGETING PIXELS ENGINE (9 Official Ad Networks + Strict CSP)
// =================================================================

export type NormalizedPixelPlatform =
  | "meta"
  | "instagram"
  | "google"
  | "youtube"
  | "tiktok"
  | "linkedin"
  | "pinterest"
  | "snapchat"
  | "x";

export interface ActiveRedirectPixel {
  id?: string;
  platform: NormalizedPixelPlatform;
  pixelId: string;
}

const VALID_PIXEL_ID_REGEX = /^[A-Za-z0-9_-]{2,64}$/;

export const REDIRECT_PIXEL_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline' https://connect.facebook.net https://www.googletagmanager.com https://analytics.tiktok.com https://snap.licdn.com https://s.pinimg.com https://sc-static.net https://static.ads-twitter.com",
  "style-src 'unsafe-inline'",
  "img-src 'self' data: https://www.facebook.com https://www.google.com https://www.google-analytics.com https://*.google-analytics.com https://googleads.g.doubleclick.net https://analytics.tiktok.com https://px.ads.linkedin.com https://ct.pinterest.com https://analytics.pinterest.com https://tr.snapchat.com https://analytics.twitter.com https://t.co",
  "connect-src https://www.facebook.com https://connect.facebook.net https://www.google.com https://www.google-analytics.com https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com https://googleads.g.doubleclick.net https://analytics.tiktok.com https://px.ads.linkedin.com https://ct.pinterest.com https://analytics.pinterest.com https://tr.snapchat.com https://analytics.twitter.com https://t.co",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
].join("; ");

export function normalizePixelPlatform(raw: unknown): NormalizedPixelPlatform | null {
  const val = String(raw ?? "").trim().toLowerCase();
  if (val === "meta" || val === "facebook" || val === "fb") return "meta";
  if (val === "instagram" || val === "ig") return "instagram";
  if (val === "google" || val === "google_tag" || val === "ga4" || val === "gtag") return "google";
  if (val === "youtube" || val === "yt") return "youtube";
  if (val === "tiktok" || val === "tt") return "tiktok";
  if (val === "linkedin" || val === "li") return "linkedin";
  if (val === "pinterest" || val === "pin") return "pinterest";
  if (val === "snapchat" || val === "snap") return "snapchat";
  if (val === "x" || val === "twitter" || val === "tw" || val === "x_ads") return "x";
  return null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeInlineJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function parseRawPixels(raw: unknown): unknown[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * Resolves all active retargeting pixels for a link against D1 so live pause
 * (`is_active = 0`) and deletions take effect immediately.
 */
export async function resolveRedirectActivePixels(
  db: D1Database | undefined,
  link: Record<string, any>,
): Promise<ActiveRedirectPixel[]> {
  const rawEntries = parseRawPixels(link.pixels ?? link.pixel_ids ?? link.pixelIds);
  if (rawEntries.length === 0) return [];

  const ownerId = String(link.userId || link.user_id || "");
  const ownerMap = new Map<string, Record<string, any>>();
  let hasAuthoritativeStore = false;

  if (db && ownerId) {
    try {
      const res = await db
        .prepare(
          `SELECT id, platform, pixel_id, is_active FROM retargeting_pixels WHERE user_id = ?`,
        )
        .bind(ownerId)
        .all<Record<string, any>>();
      if (Array.isArray(res?.results)) {
        hasAuthoritativeStore = true;
        for (const row of res.results) {
          if (row.id) ownerMap.set(String(row.id), row);
          if (row.pixel_id) ownerMap.set(String(row.pixel_id), row);
        }
      }
    } catch {
      hasAuthoritativeStore = false;
    }
  }

  const out: ActiveRedirectPixel[] = [];
  const seen = new Set<string>();

  for (const entry of rawEntries) {
    if (!entry) continue;
    let cand: Record<string, any> | null = null;

    if (typeof entry === "string") {
      cand = ownerMap.get(entry.trim()) ?? null;
    } else if (typeof entry === "object") {
      const obj = entry as Record<string, any>;
      const idKey = obj.id ? String(obj.id).trim() : "";
      const pidKey = String(obj.pixelId || obj.pixel_id || "").trim();
      const matched = (idKey && ownerMap.get(idKey)) || (pidKey && ownerMap.get(pidKey)) || null;
      // When the authoritative D1 retargeting_pixels store is available, ONLY allow
      // pixels that exist and are owned by the link's user (prevents unregistered inline
      // pixel injection via SDK/API calls).
      if (hasAuthoritativeStore) {
        if (!matched) continue;
        cand = { ...obj, ...matched };
      } else {
        cand = matched ? { ...obj, ...matched } : obj;
      }
    }

    if (!cand) continue;
    if (cand.isActive === false || cand.is_active === false || cand.is_active === 0) {
      continue;
    }

    const platform = normalizePixelPlatform(cand.platform || cand.type);
    const pixelId = String(cand.pixelId || cand.pixel_id || "").trim();
    if (!platform || !VALID_PIXEL_ID_REGEX.test(pixelId)) continue;

    const dedup = `${platform}:${pixelId}`;
    if (seen.has(dedup)) continue;
    seen.add(dedup);

    out.push({
      id: cand.id ? String(cand.id) : undefined,
      platform,
      pixelId,
    });
  }

  return out;
}

export async function incrementRedirectPixelCounts(
  db: D1Database | undefined,
  pixels: ActiveRedirectPixel[],
): Promise<void> {
  if (!db || pixels.length === 0) return;
  try {
    const ids = pixels.map((p) => p.id).filter((id): id is string => Boolean(id));
    if (ids.length === 0) return;
    const placeholders = ids.map(() => "?").join(",");
    await db
      .prepare(
        `UPDATE retargeting_pixels
         SET events_tracked_count = COALESCE(events_tracked_count, 0) + 1
         WHERE id IN (${placeholders})`,
      )
      .bind(...ids)
      .run();
  } catch {
    // Non-fatal telemetry update
  }
}

function buildSnippet(pixel: ActiveRedirectPixel): { headScript: string; noscript: string } {
  const idLit = safeInlineJson(pixel.pixelId);
  const idAttr = encodeURIComponent(pixel.pixelId);

  switch (pixel.platform) {
    case "meta":
    case "instagram":
      return {
        headScript: `<script>!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init',${idLit});fbq('track','PageView');</script>`,
        noscript: `<noscript><img height="1" width="1" style="display:none" alt="" src="https://www.facebook.com/tr?id=${idAttr}&ev=PageView&noscript=1" /></noscript>`,
      };
    case "google":
    case "youtube":
      return {
        headScript: `<script async src="https://www.googletagmanager.com/gtag/js?id=${idAttr}"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config',${idLit});</script>`,
        noscript: "",
      };
    case "tiktok":
      return {
        headScript: `<script>!function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=['page','track','identify','instances','debug','on','off','once','ready','alias','group','enableCookie','disableCookie'];ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.load=function(e){var i='https://analytics.tiktok.com/i18n/pixel/events.js';var s=d.createElement('script');s.async=!0;s.src=i+'?sdkid='+encodeURIComponent(e)+'&lib='+t;var a=d.getElementsByTagName('script')[0];a.parentNode.insertBefore(s,a);};ttq.load(${idLit});ttq.page();}(window,document,'ttq');</script>`,
        noscript: "",
      };
    case "linkedin":
      return {
        headScript: `<script>window._linkedin_data_partner_ids=window._linkedin_data_partner_ids||[];window._linkedin_data_partner_ids.push(${idLit});(function(l){if(!l){window.lintrk=function(a,b){window.lintrk.q.push([a,b])};window.lintrk.q=[]}var s=document.getElementsByTagName('script')[0];var b=document.createElement('script');b.type='text/javascript';b.async=!0;b.src='https://snap.licdn.com/li.lms-analytics/insight.min.js';s.parentNode.insertBefore(b,s);})(window.lintrk);</script>`,
        noscript: `<noscript><img height="1" width="1" style="display:none" alt="" src="https://px.ads.linkedin.com/collect/?pid=${idAttr}&fmt=gif" /></noscript>`,
      };
    case "pinterest":
      return {
        headScript: `<script>!function(e){if(!window.pintrk){window.pintrk=function(){window.pintrk.queue.push(Array.prototype.slice.call(arguments))};var n=window.pintrk;n.queue=[],n.version="3.0";var t=document.createElement("script");t.async=!0,t.src=e;var r=document.getElementsByTagName("script")[0];r.parentNode.insertBefore(t,r)}}("https://s.pinimg.com/ct/core.js");pintrk('load',${idLit});pintrk('page');</script>`,
        noscript: `<noscript><img height="1" width="1" style="display:none" alt="" src="https://ct.pinterest.com/v3/?event=init&tid=${idAttr}&noscript=1" /></noscript>`,
      };
    case "snapchat":
      return {
        headScript: `<script>(function(e,t,n){if(e.snaptr)return;var a=e.snaptr=function(){a.handleRequest?a.handleRequest.apply(a,arguments):a.queue.push(arguments)};a.queue=[];var s='script';var r=t.createElement(s);r.async=!0;r.src=n;var u=t.getElementsByTagName(s)[0];u.parentNode.insertBefore(r,u);})(window,document,'https://sc-static.net/scevent.min.js');snaptr('init',${idLit});snaptr('track','PAGE_VIEW');</script>`,
        noscript: "",
      };
    case "x":
      return {
        headScript: `<script>!function(e,t,n,s,u,a){e.twq||(s=e.twq=function(){s.exe?s.exe.apply(s,arguments):s.queue.push(arguments);},s.version='1.1',s.queue=[],u=t.createElement(n),u.async=!0,u.src='https://static.ads-twitter.com/uwt.js',a=t.getElementsByTagName(n)[0],a.parentNode.insertBefore(u,a))}(window,document,'script');twq('config',${idLit});</script>`,
        noscript: "",
      };
  }
}

export function renderRedirectPixelInterstitialHtml(
  destination: string,
  pixels: ActiveRedirectPixel[],
  title?: string | null,
): string {
  const safeTarget = /^https?:\/\//i.test(destination) ? destination : "https://lsho.cc";
  const escapedHref = escapeHtml(safeTarget);
  const inlineDest = safeInlineJson(safeTarget);
  const titleText = escapeHtml(title || "Redirecting...");
  const snippets = pixels.map(buildSnippet);
  const headScripts = snippets.map((s) => s.headScript).filter(Boolean).join("\n");
  const noscripts = snippets.map((s) => s.noscript).filter(Boolean).join("\n");

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="robots" content="noindex, nofollow" />
  <title>${titleText}</title>
  <meta http-equiv="refresh" content="1;url=${escapedHref}" />
  ${headScripts}
  <style>
    body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#09090b;color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;}
    .box{text-align:center;padding:24px;max-width:360px;}
    .spinner{width:28px;height:28px;border:2.5px solid #27272a;border-top-color:#0066ff;border-radius:9999px;margin:0 auto 14px;animation:spin .7s linear infinite;}
    @keyframes spin{to{transform:rotate(360deg);}}
    a{color:#60a5fa;font-size:13px;text-decoration:none;}
  </style>
</head>
<body>
  <div class="box">
    <div class="spinner"></div>
    <p style="margin:0 0 8px;font-size:14px;color:#e4e4e7;">Redirection en cours...</p>
    <a href="${escapedHref}" rel="noopener noreferrer">Continuer vers la destination &rarr;</a>
  </div>
  ${noscripts}
  <script>(function(){var target=${inlineDest};setTimeout(function(){window.location.replace(target);},450);})();</script>
</body>
</html>`;
}
