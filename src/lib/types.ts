// =================================================================
// CLOUDFLARE BINDINGS & SHARED TYPES  (v3 — LShorter Master)
// =================================================================

export interface CloudflareBindings {
  URL_KV: KVNamespace;
  DB: D1Database;
  DEFAULT_DOMAIN: string;
  CF_ACCOUNT_ID: string;
  CF_API_TOKEN: string;
  FRONTEND_API_SECRET: string;
  HASH_SALT?: string;
  ALLOWED_ORIGINS?: string;
}

// ─── Plan ────────────────────────────────────────────────────────────────────

export type Plan = 'FREE' | 'FREEMIUM' | 'PRO' | 'BUSINESS' | 'STARTER' | 'ENTERPRISE';

export interface PlanQuotaSpec {
  clicks: number;
  domains: number;
  links: number;
  rateLimit: number;
  overageAllowed: boolean;
  overageUnlimited: boolean;
  overageBatchSize: number;
  overageCostPerBatch: number;
  overageLabel: string;
}

export const PLAN_LIMITS: Record<Plan, PlanQuotaSpec> = {
  FREE:       { clicks: 10_000,    domains: 3,  links: 50,    rateLimit: 60,     overageAllowed: false, overageUnlimited: false, overageBatchSize: 0,       overageCostPerBatch: 0,   overageLabel: 'Hard limit at 10,000 clicks/mo' },
  FREEMIUM:   { clicks: 10_000,    domains: 3,  links: 50,    rateLimit: 60,     overageAllowed: false, overageUnlimited: false, overageBatchSize: 0,       overageCostPerBatch: 0,   overageLabel: 'Hard limit at 10,000 clicks/mo' },
  STARTER:    { clicks: 10_000,    domains: 3,  links: 50,    rateLimit: 60,     overageAllowed: false, overageUnlimited: false, overageBatchSize: 0,       overageCostPerBatch: 0,   overageLabel: 'Hard limit at 10,000 clicks/mo' },
  PRO:        { clicks: 150_000,   domains: 6,  links: 1_000, rateLimit: 200,    overageAllowed: true,  overageUnlimited: false, overageBatchSize: 50_000,  overageCostPerBatch: 3.0, overageLabel: '$3 per additional 50,000 clicks/mo' },
  BUSINESS:   { clicks: 500_000,   domains: 15, links: -1,    rateLimit: 600,    overageAllowed: true,  overageUnlimited: false, overageBatchSize: 125_000, overageCostPerBatch: 8.0, overageLabel: '$8 per additional 125,000 clicks/mo' },
  ENTERPRISE: { clicks: -1,        domains: -1, links: -1,    rateLimit: 1400,   overageAllowed: true,  overageUnlimited: true,  overageBatchSize: 0,       overageCostPerBatch: 0,   overageLabel: 'Unlimited clicks included ($0 extra)' },
};

export function computePlanOverage(plan: Plan, clicksThisMonth: number) {
  const spec = PLAN_LIMITS[plan] || PLAN_LIMITS.FREEMIUM;
  if (spec.clicks === -1 || spec.overageUnlimited) {
    return {
      allowed: true,
      unlimited: true,
      batchSize: 0,
      costPerBatch: 0,
      label: spec.overageLabel || 'Unlimited clicks included ($0 extra)',
      overageClicks: 0,
      batches: 0,
      estimatedCost: 0,
    };
  }
  const overageClicks = Math.max(0, clicksThisMonth - spec.clicks);
  const batches =
    !spec.overageUnlimited && spec.overageBatchSize > 0 && overageClicks > 0
      ? Math.ceil(overageClicks / spec.overageBatchSize)
      : 0;
  const estimatedCost =
    !spec.overageUnlimited && batches > 0
      ? Number((batches * spec.overageCostPerBatch).toFixed(2))
      : 0;

  return {
    allowed: spec.overageAllowed,
    unlimited: spec.overageUnlimited,
    batchSize: spec.overageBatchSize,
    costPerBatch: spec.overageCostPerBatch,
    label: spec.overageLabel,
    overageClicks,
    batches,
    estimatedCost,
  };
}

export const CUSTOM_DOMAIN_LIMITS: Record<Plan, number> = {
  FREE: 3,
  FREEMIUM: 3,
  STARTER: 3,
  PRO: 6,
  BUSINESS: 15,
  ENTERPRISE: -1,
};

// ─── Auth context ─────────────────────────────────────────────────────────────

export interface AuthContext {
  userId: string;
  plan: Plan;
  keyId: string;
  role?: string;
}

// ─── DB Row types ─────────────────────────────────────────────────────────────

export interface UserRow {
  id: string;
  email: string;
  name: string | null;
  plan: Plan;
  clicks_this_month: number;
  clicks_limit: number;
  domains_limit: number;
  links_limit: number;
  two_factor_enabled: number;
  created_at: string;
  updated_at: string;
}

export interface ApiKeyRow {
  id: string;
  user_id: string;
  key_hash: string;
  name: string;
  scope: string;
  rate_limit: number;
  last_used_at: string | null;
  created_at: string;
}

export interface CachedLink {
  id: string;
  user_id: string;
  targetUrl: string;
  isActive: boolean;
  passwordHash: string | null;
  isCloaked: boolean;
  hideReferrer: boolean;
  metaTitle: string | null;
  ogTitle?: string | null;
  ogDescription?: string | null;
  ogImage?: string | null;
  twitterCard?: string | null;
  twitter_card?: string | null;
  routingRules: any[] | null;
  expiresAt: string | null;
}

export interface LinkRow {
  id: string;
  user_id: string;
  domain_id: string | null;
  domain_name: string;
  slug: string;
  short_url: string;
  target_url: string;
  qr_code_config: string | null;
  clicks_count: number;
  unique_clicks: number;
  conversions_count: number;
  revenue: number;
  routing_rules: string | null;
  geo_targeting: string | null;
  device_targeting: string | null;
  password_hash: string | null;
  is_password_protected: number;
  is_cloaked: number;
  meta_title: string | null;
  og_title?: string | null;
  og_description?: string | null;
  og_image?: string | null;
  twitter_card?: string | null;
  twitterCard?: string | null;
  hide_referrer: number;
  tags: string | null;
  expires_at: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface CustomDomainRow {
  id: string;
  user_id: string;
  domain: string;
  status: string;
  is_default: number;
  created_at: string;
}

export interface ClickEventRow {
  id: string;
  link_id: string;
  user_id: string;
  slug: string;
  ip_masked: string;
  country_code: string | null;
  country_name: string | null;
  city: string | null;
  device: string | null;
  browser: string | null;
  os: string | null;
  referrer: string | null;
  resolved_url: string;
  is_unique: number;
  conversion_amount: number;
  timestamp: string;
}

export interface TargetAlertRow {
  id: string;
  user_id: string;
  link_id: string | null;
  metric_type: "clicks" | "revenue";
  period: "day" | "week" | "month";
  target_value: number;
  current_value: number;
  notify_expired: number;
  notify_email: number;
  notify_bell: number;
  status: "active" | "paused" | "reached";
  last_notified_at: string | null;
  created_at: string;
  updated_at: string;
}

// ─── API Response envelope ────────────────────────────────────────────────────

export interface ApiSuccess<T = unknown> {
  success: true;
  data: T;
}

export interface ApiError {
  success: false;
  error: string;
  code?: string;
}

export type ApiResponse<T = unknown> = ApiSuccess<T> | ApiError;
