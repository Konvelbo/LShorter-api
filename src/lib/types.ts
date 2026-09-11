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

export type Plan = 'FREEMIUM' | 'PRO' | 'BUSINESS' | 'STARTER' | 'ENTERPRISE';

export const PLAN_LIMITS: Record<Plan, { clicks: number; domains: number; links: number }> = {
  FREEMIUM:   { clicks: 100_000,   domains: 3,  links: 1_000 },
  STARTER:    { clicks: 100_000,   domains: 3,  links: 1_000 },
  PRO:        { clicks: 1_000_000, domains: 15, links: -1 },
  BUSINESS:   { clicks: -1,        domains: 50, links: -1 },
  ENTERPRISE: { clicks: -1,        domains: 50, links: -1 },
};

export const CUSTOM_DOMAIN_LIMITS: Record<Plan, number> = {
  FREEMIUM: 3,
  STARTER: 3,
  PRO: 15,
  BUSINESS: 50,
  ENTERPRISE: 50,
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
