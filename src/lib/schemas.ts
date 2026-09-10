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
  deviceTargeting: deviceTargeting,
  isActive:        z.boolean().default(true).optional(),
  expiresAt:       z.any().optional().nullable(),
  // ── New features & Social Preview ─────────────────────────────────────────
  password:        z.string().optional().nullable(),   // plain-text, hashed server-side
  tags:            z.any().optional().nullable(),
  isCloaked:       z.boolean().default(false).optional(),             // iframe cloak
  hideReferrer:    z.boolean().default(false).optional(),             // no-referrer policy
  metaTitle:       z.string().max(120).optional().nullable(),         // title for cloaked page
  ogTitle:         z.string().max(160).optional().nullable(),         // OpenGraph title for social networks
  ogDescription:   z.string().max(300).optional().nullable(),         // OpenGraph description
  ogImage:         z.string().optional().nullable(),                  // OpenGraph banner image URL or data URI
  qrCodeConfig:    z.any().optional().nullable(),
  routingRules:    z.any().optional().nullable(),
  userId:          z.string().optional().nullable(),
  maxClicks:       z.any().optional().nullable(),
  max_clicks:      z.any().optional().nullable(),
  fallbackUrl:     z.string().optional().nullable(),
  fallback_url:    z.string().optional().nullable(),
});

export type CreateLinkInput = z.infer<typeof CreateLinkSchema>;

// ─── Update Link (PATCH) ──────────────────────────────────────────────────────

export const UpdateLinkSchema = z.object({
  targetUrl:       safeUrl.optional(),
  slug:            z.string().min(1).max(64).regex(/^[a-zA-Z0-9_-]+$/).optional(),
  geoTargeting:    geoTargeting,
  deviceTargeting: deviceTargeting,
  routingRules:    z.any().optional().nullable(),
  routing_rules:   z.any().optional().nullable(),
  isActive:        z.boolean().optional(),
  expiresAt:       z.any().optional().nullable(),
  password:        z.string().min(1).max(64).optional().nullable(),   // null = remove password
  tags:            z.any().optional().nullable(),
  isCloaked:       z.boolean().optional(),
  hideReferrer:    z.boolean().optional(),
  metaTitle:       z.string().max(120).optional().nullable(),
  ogTitle:         z.string().max(160).optional().nullable(),
  ogDescription:   z.string().max(300).optional().nullable(),
  ogImage:         z.string().optional().nullable(),
  maxClicks:       z.any().optional().nullable(),
  max_clicks:      z.any().optional().nullable(),
  fallbackUrl:     z.string().optional().nullable(),
  fallback_url:    z.string().optional().nullable(),
}).refine(data => Object.values(data).some(v => v !== undefined), {
  message: 'At least one field must be provided for update',
});

export type UpdateLinkInput = z.infer<typeof UpdateLinkSchema>;


// ─── Conversion Tracking ──────────────────────────────────────────────────────

export const TrackConversionSchema = z.object({
  eventName: z.string().min(1).max(64),
  amount: z.number().min(0).default(0),
  currency: z.string().length(3).toUpperCase().default("EUR"),
  customerId: z.string().min(1).max(128),
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
