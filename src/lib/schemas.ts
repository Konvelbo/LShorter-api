// =================================================================
// ZOD VALIDATION SCHEMAS & TYPES
// =================================================================

import { z } from "zod";

// ─── Shared primitives ────────────────────────────────────────────────────────

const safeUrl = z
  .string()
  .min(1)
  .transform((v) => {
    let clean = v.trim();
    if (!clean.startsWith("http://") && !clean.startsWith("https://")) {
      clean = `https://${clean}`;
    }
    return clean;
  });

const geoTargeting = z.any().optional().nullable();
const deviceTargeting = z.any().optional().nullable();

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
  password:        z.string().optional().nullable(),   // plain-text, hashed server-side
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
  ogImage:         z.string().optional().nullable(),                  // OpenGraph banner image URL or data URI
  og_image:        z.string().optional().nullable(),
  bannerStyle:     z.enum(["default_banner", "large_banner"]).optional().nullable(),
  banner_style:    z.enum(["default_banner", "large_banner"]).optional().nullable(),
  twitterCard:     z.string().optional().nullable(),
  twitter_card:    z.string().optional().nullable(),
  qrCodeConfig:    z.any().optional().nullable(),
  routingRules:    z.any().optional().nullable(),
  routing_rules:   z.any().optional().nullable(),
  abVariations:    z.any().optional().nullable(),
  ab_variations:   z.any().optional().nullable(),
  mainWeight:      z.any().optional().nullable(),
  main_weight:     z.any().optional().nullable(),
  redirectType:    z.string().optional().nullable(),
  redirect_type:   z.string().optional().nullable(),
  passParams:      z.any().optional().nullable(),
  pass_params:     z.any().optional().nullable(),
  userId:          z.string().optional().nullable(),
  maxClicks:       z.any().optional().nullable(),
  max_clicks:      z.any().optional().nullable(),
  fallbackUrl:     z.string().optional().nullable(),
  fallback_url:    z.string().optional().nullable(),
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
  pixelIds:        z.array(z.string()).optional().nullable(),
  pixel_ids:       z.array(z.string()).optional().nullable(),
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
  routingRules:    z.any().optional().nullable(),
  routing_rules:   z.any().optional().nullable(),
  abVariations:    z.any().optional().nullable(),
  ab_variations:   z.any().optional().nullable(),
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
  password:        z.string().max(64).optional().nullable(),   // null or "" = remove password
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
  ogImage:         z.string().optional().nullable(),
  og_image:        z.string().optional().nullable(),
  bannerStyle:     z.enum(["default_banner", "large_banner"]).optional().nullable(),
  banner_style:    z.enum(["default_banner", "large_banner"]).optional().nullable(),
  twitterCard:     z.string().optional().nullable(),
  twitter_card:    z.string().optional().nullable(),
  maxClicks:       z.any().optional().nullable(),
  max_clicks:      z.any().optional().nullable(),
  fallbackUrl:     z.string().optional().nullable(),
  fallback_url:    z.string().optional().nullable(),
  pathLockMode:    z.enum(["off", "strict", "funnel"]).optional().nullable(),
  path_lock_mode:  z.enum(["off", "strict", "funnel"]).optional().nullable(),
  pathLockPrefix:  z.string().max(255).optional().nullable(),
  path_lock_prefix: z.string().max(255).optional().nullable(),
  pathLockMessage: z.string().max(500).optional().nullable(),
  path_lock_message: z.string().max(500).optional().nullable(),
  pathLockPassword: z.string().max(100).optional().nullable(),
  path_lock_password: z.string().max(100).optional().nullable(),
  pixels:          z.any().optional().nullable(),
  pixelIds:        z.array(z.string()).optional().nullable(),
  pixel_ids:       z.array(z.string()).optional().nullable(),
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

// ─── Retargeting Pixels ───────────────────────────────────────────────────────

export const CreatePixelSchema = z.object({
  platform: z.enum(["facebook", "google_tag", "tiktok", "linkedin"]),
  pixelId: z.string().min(1).max(100),
  name: z.string().min(1).max(100),
  isActive: z.boolean().default(true).optional(),
});

export type CreatePixelInput = z.infer<typeof CreatePixelSchema>;

export const UpdatePixelSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  pixelId: z.string().min(1).max(100).optional(),
  isActive: z.boolean().optional(),
});

export type UpdatePixelInput = z.infer<typeof UpdatePixelSchema>;

// ─── Webhooks ─────────────────────────────────────────────────────────────────

export const CreateWebhookSchema = z.object({
  url: safeUrl,
  events: z.array(z.string()).default(["click.created", "conversion.created"]).optional(),
  secretKey: z.string().optional(),
  isActive: z.boolean().default(true).optional(),
});

export type CreateWebhookInput = z.infer<typeof CreateWebhookSchema>;

export const UpdateWebhookSchema = z.object({
  url: safeUrl.optional(),
  events: z.array(z.string()).optional(),
  secretKey: z.string().optional(),
  isActive: z.boolean().optional(),
  lastStatus: z.number().optional(),
  lastTriggeredAt: z.string().optional(),
});

export type UpdateWebhookInput = z.infer<typeof UpdateWebhookSchema>;

// ─── Target Alerts (Notifications Dashboard) ──────────────────────────────────

export const CreateTargetAlertSchema = z.object({
  linkId: z.string().optional().nullable(),
  metricType: z.enum(["clicks", "revenue"]).default("clicks").optional(),
  period: z.enum(["day", "week", "month"]).default("month").optional(),
  targetValue: z.number().positive(),
  notifyExpired: z.boolean().default(true).optional(),
  notifyEmail: z.boolean().default(true).optional(),
  notifyBell: z.boolean().default(true).optional(),
  status: z.enum(["active", "paused", "reached"]).default("active").optional(),
});

export type CreateTargetAlertInput = z.infer<typeof CreateTargetAlertSchema>;

export const UpdateTargetAlertSchema = z.object({
  metricType: z.enum(["clicks", "revenue"]).optional(),
  period: z.enum(["day", "week", "month"]).optional(),
  targetValue: z.number().positive().optional(),
  notifyExpired: z.boolean().optional(),
  notifyEmail: z.boolean().optional(),
  notifyBell: z.boolean().optional(),
  status: z.enum(["active", "paused", "reached"]).optional(),
});

export type UpdateTargetAlertInput = z.infer<typeof UpdateTargetAlertSchema>;
