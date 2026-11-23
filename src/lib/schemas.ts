// =================================================================
// ZOD VALIDATION SCHEMAS & TYPES
// =================================================================

import { z } from "zod";

// ─── URL & SSRF Security Validators ───────────────────────────────────────────

const BLOCKED_EXACT_HOSTS = new Set([
  "localhost",
  "localhost.localdomain",
  "ip6-localhost",
  "ip6-loopback",
  "metadata",
  "metadata.google.internal",
  "metadata.goog",
  "instance-data",
]);

const BLOCKED_HOST_SUFFIXES = [
  ".localhost",
  ".local",
  ".internal",
  ".lan",
  ".home.arpa",
  ".localdomain",
];

function isPrivateOrReservedIpv4(host: string): boolean {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  const c = Number(m[3]);
  const d = Number(m[4]);
  if (a > 255 || b > 255 || c > 255 || d > 255) return true;

  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10.0.0.0/8 (RFC1918)
  if (a === 127) return true; // 127.0.0.0/8 (loopback)
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 (link-local & cloud metadata)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 (RFC1918)
  if (a === 192 && b === 168) return true; // 192.168.0.0/16 (RFC1918)
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 (CGNAT)
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return true; // IETF / TEST-NET-1
  if (a === 198 && (b === 18 || b === 19)) return true; // Benchmarking
  if (a >= 224) return true; // Multicast & reserved
  return false;
}

function isPrivateOrReservedIpv6(rawHost: string): boolean {
  const h = rawHost.replace(/^\[|\]$/g, "").toLowerCase();
  if (!h.includes(":")) return false;
  if (h === "::" || h === "::1" || h === "0:0:0:0:0:0:0:1" || h === "0:0:0:0:0:0:0:0") return true;
  if (h.startsWith("::ffff:")) return true; // IPv4-mapped IPv6
  if (h.startsWith("fe8") || h.startsWith("fe9") || h.startsWith("fea") || h.startsWith("feb")) return true; // fe80::/10 link-local
  if (h.startsWith("fc") || h.startsWith("fd")) return true; // fc00::/7 ULA
  if (h.startsWith("ff")) return true; // multicast
  return false;
}

/**
 * Validates and normalizes an external HTTP/HTTPS URL.
 * Rejects dangerous schemes (javascript:, data:, vbscript:, file:, blob:, ftp:, etc.)
 * and SSRF targets (localhost, RFC1918 private IPs, 169.254.169.254 cloud metadata, IPv6 loopback/ULA).
 */
export function normalizeSafeHttpUrl(raw: string): string | null {
  if (typeof raw !== "string") return null;
  const clean = raw.trim();
  if (!clean || clean.length > 2048) return null;
  if (/[\u0000-\u001F\u007F]/.test(clean)) return null;
  if (clean.startsWith("//")) return null;

  // If a protocol scheme is explicitly specified, ONLY http: or https: is allowed.
  const schemeMatch = clean.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/);
  let candidate = clean;
  if (schemeMatch) {
    const scheme = schemeMatch[1].toLowerCase();
    if (scheme !== "http" && scheme !== "https") {
      return null;
    }
  } else {
    candidate = `https://${clean}`;
  }

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return null;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return null;
  }

  const host = parsed.hostname.toLowerCase().replace(/\.$/, "");
  if (!host) return null;

  if (BLOCKED_EXACT_HOSTS.has(host)) return null;
  if (BLOCKED_HOST_SUFFIXES.some((s) => host.endsWith(s))) return null;

  if (host.startsWith("[") || host.includes(":")) {
    if (isPrivateOrReservedIpv6(host)) return null;
  } else {
    // Reject single-label hostnames (e.g., http://redis, http://db, http://2130706433)
    if (!host.includes(".")) return null;
    // Reject pure numeric/hex/octal obfuscated hosts
    if (/^(0x[0-9a-f]+|\d+)$/i.test(host)) return null;
    if (isPrivateOrReservedIpv4(host)) return null;
  }

  return candidate;
}

export function isSafeExternalHttpUrl(raw: string): boolean {
  return normalizeSafeHttpUrl(raw) !== null;
}

// ─── Shared primitives ────────────────────────────────────────────────────────

export const safeUrl = z
  .string()
  .min(1, "URL is required")
  .transform((v, ctx) => {
    const normalized = normalizeSafeHttpUrl(v);
    if (!normalized) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "URL must be a valid public http(s) URL (dangerous schemes and private/internal addresses are forbidden)",
      });
      return z.NEVER;
    }
    return normalized;
  });

export const optionalSafeUrl = z
  .union([z.string(), z.null(), z.undefined()])
  .optional()
  .transform((v, ctx) => {
    if (v === undefined) return undefined;
    if (v === null || v.trim() === "") return null;
    const normalized = normalizeSafeHttpUrl(v);
    if (!normalized) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "URL must be a valid public http(s) URL (dangerous schemes and private/internal addresses are forbidden)",
      });
      return z.NEVER;
    }
    return normalized;
  });

const safeUrlRecord = z
  .any()
  .optional()
  .nullable()
  .superRefine((val, ctx) => {
    if (val === undefined || val === null) return;
    if (typeof val !== "object" || Array.isArray(val)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Targeting map must be a key-value object of valid public http(s) URLs",
      });
      return;
    }
    for (const [key, target] of Object.entries(val as Record<string, unknown>)) {
      if (target === undefined || target === null || target === "") continue;
      if (typeof target !== "string" || !isSafeExternalHttpUrl(target)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `Invalid targeting URL for "${key}": must be a valid public http(s) URL`,
        });
      }
    }
  });

const safeAbVariations = z
  .any()
  .optional()
  .nullable()
  .superRefine((val, ctx) => {
    if (val === undefined || val === null) return;
    if (!Array.isArray(val)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "abVariations must be an array",
      });
      return;
    }
    val.forEach((item, idx) => {
      if (!item || typeof item !== "object") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [idx],
          message: "Each A/B variation must be an object with a valid url",
        });
        return;
      }
      const rawUrl = (item as Record<string, unknown>).url;
      if (typeof rawUrl !== "string" || !isSafeExternalHttpUrl(rawUrl)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [idx, "url"],
          message: "Each A/B variation url must be a valid public http(s) URL",
        });
      }
    });
  });

const safeRoutingRules = z
  .any()
  .optional()
  .nullable()
  .superRefine((val, ctx) => {
    if (val === undefined || val === null) return;
    if (!Array.isArray(val)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "routingRules must be an array",
      });
      return;
    }
    val.forEach((rule, idx) => {
      if (!rule || typeof rule !== "object") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [idx],
          message: "Each routing rule must be an object",
        });
        return;
      }
      const r = rule as Record<string, unknown>;
      for (const field of ["destinationUrl", "targetUrl", "url"] as const) {
        const u = r[field];
        if (u !== undefined && u !== null && u !== "") {
          if (typeof u !== "string" || !isSafeExternalHttpUrl(u)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: [idx, field],
              message: `Invalid routing rule ${field}: must be a valid public http(s) URL`,
            });
          }
        }
      }
    });
  });

const safeMaxClicks = z
  .any()
  .optional()
  .nullable()
  .transform((val, ctx) => {
    if (val === undefined) return undefined;
    if (val === null || val === "") return null;
    const num = typeof val === "number" ? val : Number(val);
    if (!Number.isFinite(num) || !Number.isInteger(num) || num < 1 || num > 1_000_000_000) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "maxClicks must be a positive integer (>= 1) or null",
      });
      return z.NEVER;
    }
    return num;
  });

const safeOgImage = z
  .union([z.string(), z.null(), z.undefined()])
  .optional()
  .superRefine((val, ctx) => {
    if (val === undefined || val === null || val.trim() === "") return;
    const clean = val.trim();
    if (/[\u0000-\u001F\u007F]/.test(clean)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid ogImage value" });
      return;
    }
    if (
      clean.startsWith("/banners/") ||
      clean.startsWith("/api/images/") ||
      clean.startsWith("/api/v1/images/") ||
      clean === "/default_banner.jpg" ||
      /^banner_[a-zA-Z0-9_.-]+\.(png|jpe?g|webp|gif)$/i.test(clean)
    ) {
      return;
    }
    if (/^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=\s]+$/i.test(clean)) {
      return;
    }
    if (!isSafeExternalHttpUrl(clean)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "ogImage must be a valid public http(s) URL, banner path, or safe image data URI (png/jpeg/webp/gif)",
      });
    }
  });

const geoTargeting = safeUrlRecord;
const deviceTargeting = safeUrlRecord;

// ─── Users ────────────────────────────────────────────────────────────────────

export const CreateUserSchema = z.object({
  email: z.string().email("Invalid email format"),
  name: z.string().min(1).max(120).optional(),
  plan: z.enum(["FREEMIUM", "PRO", "BUSINESS", "STARTER", "ENTERPRISE"]).default("FREEMIUM"),
});

export type CreateUserInput = z.infer<typeof CreateUserSchema>;

// ─── API Keys ─────────────────────────────────────────────────────────────────

export const CreateApiKeySchema = z.object({
  name: z.string().min(1).max(64).default("Default Key"),
});

export type CreateApiKeyInput = z.infer<typeof CreateApiKeySchema>;

// ─── Links ────────────────────────────────────────────────────────────────────

export const CreateLinkSchema = z.object({
  targetUrl: safeUrl,
  slug: z
    .string()
    .min(1)
    .max(64)
    .regex(
      /^[a-zA-Z0-9_-]+$/,
      "Slug must be alphanumeric, dashes or underscores",
    )
    .optional()
    .nullable(),
  domainName:      z.string().optional().nullable(),
  geoTargeting:    geoTargeting,
  geo_targeting:   geoTargeting,
  deviceTargeting: deviceTargeting,
  device_targeting: deviceTargeting,
  isActive:        z.boolean().default(true).optional(),
  is_active:       z.any().optional().nullable(),
  expiresAt:       z.any().optional().nullable(),
  expires_at:      z.any().optional().nullable(),
  // ── New features & Social Preview ─────────────────────────────────────────
  password:        z.string().max(128).optional().nullable(),   // plain-text, hashed server-side
  tags:            z.any().optional().nullable(),
  isCloaked:       z.boolean().default(false).optional(),             // iframe cloak
  is_cloaked:      z.any().optional().nullable(),
  hideReferrer:    z.boolean().default(false).optional(),             // no-referrer policy
  hide_referrer:   z.any().optional().nullable(),
  metaTitle:       z.string().max(120).optional().nullable(),         // title for cloaked page
  meta_title:      z.string().max(120).optional().nullable(),
  ogTitle:         z.string().max(160).optional().nullable(),         // OpenGraph title for social networks
  og_title:        z.string().max(160).optional().nullable(),
  ogDescription:   z.string().max(300).optional().nullable(),         // OpenGraph description
  og_description:  z.string().max(300).optional().nullable(),
  ogImage:         safeOgImage,                                       // OpenGraph banner image URL or safe data URI
  og_image:        safeOgImage,
  bannerStyle:     z.enum(["default_banner", "large_banner"]).optional().nullable(),
  banner_style:    z.enum(["default_banner", "large_banner"]).optional().nullable(),
  twitterCard:     z.string().optional().nullable(),
  twitter_card:    z.string().optional().nullable(),
  qrCodeConfig:    z.any().optional().nullable(),
  routingRules:    safeRoutingRules,
  routing_rules:   safeRoutingRules,
  abVariations:    safeAbVariations,
  ab_variations:   safeAbVariations,
  mainWeight:      z.any().optional().nullable(),
  main_weight:     z.any().optional().nullable(),
  redirectType:    z.string().optional().nullable(),
  redirect_type:   z.string().optional().nullable(),
  passParams:      z.any().optional().nullable(),
  pass_params:     z.any().optional().nullable(),
  userId:          z.string().optional().nullable(),
  maxClicks:       safeMaxClicks,
  max_clicks:      safeMaxClicks,
  fallbackUrl:     optionalSafeUrl,
  fallback_url:    optionalSafeUrl,
  userPlan:        z.string().optional().nullable(),
  plan:            z.string().optional().nullable(),
  userEmail:       z.string().optional().nullable(),
  userName:        z.string().optional().nullable(),
  // ── PathLock™ Single-Page & Funnel Isolation ─────────────────────────────
  pathLockMode:    z.enum(["off", "strict", "funnel"]).optional().nullable(),
  path_lock_mode:  z.enum(["off", "strict", "funnel"]).optional().nullable(),
  pathLockPrefix:  z.string().max(255).optional().nullable(),
  path_lock_prefix: z.string().max(255).optional().nullable(),
  pathLockMessage: z.string().max(500).optional().nullable(),
  path_lock_message: z.string().max(500).optional().nullable(),
  pathLockPassword: z.string().max(100).optional().nullable(),
  path_lock_password: z.string().max(100).optional().nullable(),
  // ── Retargeting Pixels ───────────────────────────────────────────────────
  pixels:          z.any().optional().nullable(),
  pixelIds:        z.array(z.string().max(100)).max(25).optional().nullable(),
  pixel_ids:       z.array(z.string().max(100)).max(25).optional().nullable(),
});

export type CreateLinkInput = z.infer<typeof CreateLinkSchema>;

// ─── Update Link (PATCH) ──────────────────────────────────────────────────────

export const UpdateLinkSchema = z.object({
  targetUrl:       safeUrl.optional(),
  slug:            z.string().min(1).max(64).regex(/^[a-zA-Z0-9_-]+$/).optional(),
  domainName:      z.string().optional().nullable(),
  geoTargeting:    geoTargeting,
  geo_targeting:   geoTargeting,
  deviceTargeting: deviceTargeting,
  device_targeting: deviceTargeting,
  routingRules:    safeRoutingRules,
  routing_rules:   safeRoutingRules,
  abVariations:    safeAbVariations,
  ab_variations:   safeAbVariations,
  mainWeight:      z.any().optional().nullable(),
  main_weight:     z.any().optional().nullable(),
  redirectType:    z.string().optional().nullable(),
  redirect_type:   z.string().optional().nullable(),
  passParams:      z.any().optional().nullable(),
  pass_params:     z.any().optional().nullable(),
  isActive:        z.boolean().optional(),
  is_active:       z.any().optional().nullable(),
  expiresAt:       z.any().optional().nullable(),
  expires_at:      z.any().optional().nullable(),
  password:        z.string().max(128).optional().nullable(),   // null or "" = remove password
  tags:            z.any().optional().nullable(),
  isCloaked:       z.boolean().optional(),
  is_cloaked:      z.any().optional().nullable(),
  hideReferrer:    z.boolean().optional(),
  hide_referrer:   z.any().optional().nullable(),
  metaTitle:       z.string().max(120).optional().nullable(),
  meta_title:      z.string().max(120).optional().nullable(),
  ogTitle:         z.string().max(160).optional().nullable(),
  og_title:        z.string().max(160).optional().nullable(),
  ogDescription:   z.string().max(300).optional().nullable(),
  og_description:  z.string().max(300).optional().nullable(),
  ogImage:         safeOgImage,
  og_image:        safeOgImage,
  bannerStyle:     z.enum(["default_banner", "large_banner"]).optional().nullable(),
  banner_style:    z.enum(["default_banner", "large_banner"]).optional().nullable(),
  twitterCard:     z.string().optional().nullable(),
  twitter_card:    z.string().optional().nullable(),
  maxClicks:       safeMaxClicks,
  max_clicks:      safeMaxClicks,
  fallbackUrl:     optionalSafeUrl,
  fallback_url:    optionalSafeUrl,
  pathLockMode:    z.enum(["off", "strict", "funnel"]).optional().nullable(),
  path_lock_mode:  z.enum(["off", "strict", "funnel"]).optional().nullable(),
  pathLockPrefix:  z.string().max(255).optional().nullable(),
  path_lock_prefix: z.string().max(255).optional().nullable(),
  pathLockMessage: z.string().max(500).optional().nullable(),
  path_lock_message: z.string().max(500).optional().nullable(),
  pathLockPassword: z.string().max(100).optional().nullable(),
  path_lock_password: z.string().max(100).optional().nullable(),
  pixels:          z.any().optional().nullable(),
  pixelIds:        z.array(z.string().max(100)).max(25).optional().nullable(),
  pixel_ids:       z.array(z.string().max(100)).max(25).optional().nullable(),
  userPlan:        z.string().optional().nullable(),
  plan:            z.string().optional().nullable(),
}).refine(data => Object.values(data).some(v => v !== undefined), {
  message: 'At least one field must be provided for update',
});

export type UpdateLinkInput = z.infer<typeof UpdateLinkSchema>;


// ─── Conversion Tracking ──────────────────────────────────────────────────────

export const TrackConversionSchema = z.object({
  eventName: z.string().min(1).max(64),
  amount: z.number().min(0).default(0),
  currency: z.string().length(3).toUpperCase().default("EUR"),
  customerId: z.string().min(1).max(128).optional().nullable(),
  customerEmail: z.string().optional().nullable(),
  customerName: z.string().max(120).optional().nullable(),
  customerFullName: z.string().max(120).optional().nullable(),
  customerAvatar: z.string().optional().nullable(),
  avatarUrl: z.string().optional().nullable(),
  avatar: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  name: z.string().optional().nullable(),
  fullName: z.string().optional().nullable(),
  customer: z.object({
    id: z.string().optional().nullable(),
    email: z.string().optional().nullable(),
    name: z.string().optional().nullable(),
    fullName: z.string().optional().nullable(),
    avatarUrl: z.string().optional().nullable(),
    avatar: z.string().optional().nullable(),
  }).optional().nullable(),
  linkId: z.string().min(1),
  clickId: z.string().optional().nullable(),
});

export type TrackConversionInput = z.infer<typeof TrackConversionSchema>;

// ─── Custom Domains ───────────────────────────────────────────────────────────

export const CreateDomainSchema = z.object({
  domain: z
    .string()
    .min(3)
    .max(253)
    .regex(
      /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/,
      "Invalid domain name",
    ),
});

export type CreateDomainInput = z.infer<typeof CreateDomainSchema>;

// ─── Analytics query params ───────────────────────────────────────────────────

export const AnalyticsQuerySchema = z.object({
  linkId: z.string().optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  groupBy: z.enum(["country", "device", "day"]).optional(),
});

export type AnalyticsQuery = z.infer<typeof AnalyticsQuerySchema>;

// ─── Retargeting Pixels (9 Official Ad Networks + Aliases) ────────────────────

export const PIXEL_PLATFORMS = [
  "meta",
  "facebook",
  "instagram",
  "google",
  "google_tag",
  "youtube",
  "tiktok",
  "linkedin",
  "pinterest",
  "snapchat",
  "x",
  "twitter",
] as const;

const safePixelId = z
  .string()
  .trim()
  .regex(
    /^[A-Za-z0-9_-]{2,64}$/,
    "Invalid pixel ID format (alphanumeric, dashes and underscores, 2-64 characters)",
  );

export const CreatePixelSchema = z.object({
  platform: z.enum(PIXEL_PLATFORMS),
  pixelId: safePixelId,
  name: z
    .string()
    .trim()
    .min(1, "Pixel name is required")
    .max(100, "Pixel name is too long")
    .regex(/^[^<>]+$/, "Pixel name cannot contain HTML characters"),
  isActive: z.boolean().default(true).optional(),
});

export type CreatePixelInput = z.infer<typeof CreatePixelSchema>;

export const UpdatePixelSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[^<>]+$/, "Pixel name cannot contain HTML characters")
    .optional(),
  pixelId: safePixelId.optional(),
  isActive: z.boolean().optional(),
});

export type UpdatePixelInput = z.infer<typeof UpdatePixelSchema>;

// ─── Webhooks ─────────────────────────────────────────────────────────────────

export const WEBHOOK_EVENTS = [
  "click.created",
  "click.unique",
  "conversion.created",
  "link.created",
  "link.updated",
  "link.deleted",
  "link.expired",
  "qr.scanned",
  "target.reached",
  "subscription.activated",
  "subscription.cancelled",
  "subscription.renewed",
] as const;

const SELF_WEBHOOK_HOSTS = new Set([
  "lsho.cc",
  "www.lsho.cc",
  "api.lsho.cc",
]);

const safeWebhookUrl = safeUrl.refine(
  (u) => {
    try {
      const host = new URL(u).hostname.toLowerCase().replace(/\.$/, "");
      if (
        SELF_WEBHOOK_HOSTS.has(host) ||
        host.endsWith(".lsho.cc") ||
        host.endsWith(".workers.dev")
      ) {
        return false;
      }
      return true;
    } catch {
      return false;
    }
  },
  "Self-referencing LShorter webhook URLs are forbidden",
);

const optionalWebhookSecret = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  z.string().trim().min(8, "Webhook secretKey must be at least 8 characters").max(256).optional(),
);

const optionalWebhookName = z.preprocess(
  (v) => (typeof v === "string" ? v.trim() : v),
  z
    .string()
    .max(100, "Webhook name must be at most 100 characters")
    .refine((s) => !/[<>]/.test(s), "Webhook name cannot contain HTML characters")
    .optional(),
);

export const CreateWebhookSchema = z.object({
  name: optionalWebhookName,
  url: safeWebhookUrl,
  events: z
    .array(z.enum(WEBHOOK_EVENTS))
    .min(1, "At least one webhook event is required")
    .max(20, "At most 20 webhook events are allowed")
    .default(["click.created", "conversion.created"])
    .optional(),
  secretKey: optionalWebhookSecret,
  isActive: z.boolean().default(true).optional(),
});

export type CreateWebhookInput = z.infer<typeof CreateWebhookSchema>;

export const UpdateWebhookSchema = z.object({
  name: optionalWebhookName,
  url: safeWebhookUrl.optional(),
  events: z.array(z.enum(WEBHOOK_EVENTS)).min(1).max(20).optional(),
  isActive: z.boolean().optional(),
  lastStatus: z.number().optional(),
  lastTriggeredAt: z.string().optional(),
});

export type UpdateWebhookInput = z.infer<typeof UpdateWebhookSchema>;

// ─── Target Alerts (Notifications Dashboard) ──────────────────────────────────

export const CreateTargetAlertSchema = z.object({
  id: z.string().optional().nullable(),
  userId: z.string().optional().nullable(),
  userEmail: z.string().optional().nullable(),
  userPlan: z.string().optional().nullable(),
  plan: z.string().optional().nullable(),
  linkId: z.string().optional().nullable(),
  title: z.string().max(120).optional().nullable(),
  metricType: z.enum(["clicks", "revenue", "both"]).default("clicks").optional(),
  period: z.enum(["day", "week", "month"]).default("month").optional(),
  targetValue: z.number().positive().optional(),
  clicksTargetValue: z.number().positive().optional(),
  revenueTargetValue: z.number().positive().optional(),
  notifyExpired: z.boolean().default(false).optional(),
  notifyEmail: z.boolean().default(true).optional(),
  notifyBell: z.boolean().default(true).optional(),
  status: z.enum(["active", "paused", "reached"]).default("active").optional(),
});

export type CreateTargetAlertInput = z.infer<typeof CreateTargetAlertSchema>;

export const UpdateTargetAlertSchema = z.object({
  title: z.string().max(120).optional().nullable(),
  metricType: z.enum(["clicks", "revenue", "both"]).optional(),
  period: z.enum(["day", "week", "month"]).optional(),
  targetValue: z.number().positive().optional(),
  clicksTargetValue: z.number().positive().optional(),
  revenueTargetValue: z.number().positive().optional(),
  notifyExpired: z.boolean().optional(),
  notifyEmail: z.boolean().optional(),
  notifyBell: z.boolean().optional(),
  status: z.enum(["active", "paused", "reached"]).optional(),
});

export type UpdateTargetAlertInput = z.infer<typeof UpdateTargetAlertSchema>;
