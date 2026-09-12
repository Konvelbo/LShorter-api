// =================================================================
// @quicklink/sdk  — TypeScript Client SDK
// =================================================================
// Usage:
//   import { QuickLink } from './sdk';
//   const qk = new QuickLink({ apiKey: 'sk_live_...' });
//
//   // Create a short link
//   const link = await qk.links.create({ targetUrl: 'https://example.com' });
//
//   // Track a conversion
//   await qk.track.conversion({
//     eventName: 'purchase', amount: 49, currency: 'EUR',
//     customer: { id: 'usr_123', email: 'jean@example.com', name: 'Jean Dupont' },
//     linkId: 'link_xxx',
//   });
// =================================================================

// ─── Types ────────────────────────────────────────────────────────────────────

export type DeviceKey =
  | 'ios' | 'android' | 'tablet' | 'mobile'
  | 'windows' | 'mac' | 'linux' | 'desktop';

export type Plan = 'FREEMIUM' | 'STARTER' | 'PRO';

export interface QuickLinkConfig {
  /** Your API key (sk_live_... or sk_test_...) */
  apiKey: string;
  /** Override base URL for self-hosted instances */
  baseUrl?: string;
}

// ── Links ──────────────────────────────────────────────────────────────────────

export interface CreateLinkOptions {
  targetUrl:       string;
  slug?:           string;
  domainName?:     string;
  geoTargeting?:   Record<string, string>;
  deviceTargeting?: Partial<Record<DeviceKey, string>>;
  isActive?:       boolean;
  expiresAt?:      string;
}

export interface LinkResponse {
  id:              string;
  shortUrl:        string;
  slug:            string;
  domain:          string;
  targetUrl:       string;
  geoTargeting:    Record<string, string> | null;
  deviceTargeting: Partial<Record<DeviceKey, string>> | null;
  isActive:        boolean;
  expiresAt:       string | null;
  clicks:          number;
  created_at:      string;
}

export interface ListLinksOptions {
  page?:  number;
  limit?: number;
}

export interface PaginatedResponse<T> {
  data:       T[];
  pagination: { page: number; limit: number; total: number };
}

// ── Conversions ────────────────────────────────────────────────────────────────

export interface CustomerInput {
  /** Required: your internal customer / user ID */
  id: string;
}

export interface TrackConversionOptions {
  eventName:  string;
  amount?:    number;
  currency?:  string;
  customer:   CustomerInput;
  linkId:     string;
  clickId?:   string | null;
}

export interface ConversionResponse {
  id:                string;
  eventName:         string;
  amount:            number;
  currency:          string;
  customerId:        string;
  linkId:            string;
  clickId:           string | null;
  plan:              Plan;
  created_at:        string;
}

// ── Analytics ──────────────────────────────────────────────────────────────────

export interface AnalyticsOptions {
  linkId?: string;
  from?:   string;
  to?:     string;
}

export interface AnalyticsDashboard {
  clicks:      { total: number; thisMonth: number };
  conversions: Array<{ conversions: number; revenue: number; currency: string }>;
}

export interface TopStats {
  topCountries: Array<{ label: string; count: number }>;
  topDevices:   Array<{ label: string; count: number }>;
}

// ── Domains ────────────────────────────────────────────────────────────────────

export interface CreateDomainOptions {
  domain: string;
}

export interface DomainResponse {
  id:          string;
  domain:      string;
  status:      'pending' | 'active' | 'failed';
  dnsRecords:  Array<{ type: string; name: string; value: string; ttl: number; note: string }>;
  instructions: string[];
  created_at:  string;
}

// ── Users ──────────────────────────────────────────────────────────────────────

export interface CreateUserOptions {
  email: string;
  name?: string;
  plan?: Plan;
}

export interface UserResponse {
  id:         string;
  email:      string;
  name:       string | null;
  plan:       Plan;
  created_at: string;
}

export interface ApiKeyResponse {
  id:   string;
  key:  string;
  name: string;
}

// ─── HTTP Client ──────────────────────────────────────────────────────────────

class QuickLinkError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string
  ) {
    super(message);
    this.name = 'QuickLinkError';
  }
}

class HttpClient {
  private readonly baseUrl: string;
  private readonly apiKey:  string;

  constructor(config: QuickLinkConfig) {
    this.baseUrl = (config.baseUrl ?? 'https://api.lsho.cc').replace(/\/$/, '');
    this.apiKey  = config.apiKey;
  }

  private async request<T>(
    method:  'GET' | 'POST' | 'DELETE',
    path:    string,
    body?:   unknown,
    params?: Record<string, string | number | undefined>
  ): Promise<T> {
    let url = `${this.baseUrl}${path}`;

    if (params) {
      const qs = Object.entries(params)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join('&');
      if (qs) url += `?${qs}`;
    }

    const init: RequestInit = {
      method,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type':  'application/json',
        'Accept':        'application/json',
      },
    };

    if (body !== undefined) {
      init.body = JSON.stringify(body);
    }

    const res = await fetch(url, init);
    const json = (await res.json()) as { success: boolean; data?: T; error?: string; code?: string };

    if (!res.ok || !json.success) {
      throw new QuickLinkError(
        json.error ?? `HTTP ${res.status}`,
        res.status,
        json.code
      );
    }

    return json.data as T;
  }

  get<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
    return this.request<T>('GET', path, undefined, params);
  }

  post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  delete<T>(path: string): Promise<T> {
    return this.request<T>('DELETE', path);
  }
}

// ─── Module: Links ────────────────────────────────────────────────────────────

class LinksModule {
  constructor(private readonly http: HttpClient) {}

  create(options: CreateLinkOptions): Promise<LinkResponse> {
    return this.http.post<LinkResponse>('/api/v1/links', options);
  }

  list(options: ListLinksOptions = {}): Promise<PaginatedResponse<LinkResponse>> {
    return this.http.get<PaginatedResponse<LinkResponse>>('/api/v1/links', {
      page:  options.page,
      limit: options.limit,
    });
  }

  get(id: string): Promise<LinkResponse> {
    return this.http.get<LinkResponse>(`/api/v1/links/${id}`);
  }

  delete(id: string): Promise<{ deleted: boolean; id: string }> {
    return this.http.delete(`/api/v1/links/${id}`);
  }
}

// ─── Module: Track ────────────────────────────────────────────────────────────

class TrackModule {
  constructor(private readonly http: HttpClient) {}

  /**
   * Track a conversion event.
   *
   * @example
   * await qk.track.conversion({
   *   eventName: 'purchase',
   *   amount: 49.00,
   *   currency: 'EUR',
   *   customer: {
   *     id:    'usr_123',
   *     email: 'jean.dupont@gmail.com',   // Optional
   *     name:  'Jean Dupont',             // Optional
   *   },
   *   linkId: 'link_abc123',
   * });
   */
  conversion(options: TrackConversionOptions): Promise<ConversionResponse> {
    // Map SDK-friendly `customer` object → flat API payload
    const payload = {
      eventName:     options.eventName,
      amount:        options.amount  ?? 0,
      currency:      options.currency ?? 'EUR',
      customerId:    options.customer.id,
      linkId:        options.linkId,
      clickId:       options.clickId ?? null,
    };

    return this.http.post<ConversionResponse>('/api/v1/track', payload);
  }

  list(options: { page?: number; limit?: number; linkId?: string } = {}): Promise<
    PaginatedResponse<ConversionResponse>
  > {
    return this.http.get<PaginatedResponse<ConversionResponse>>('/api/v1/track', {
      page:   options.page,
      limit:  options.limit,
      linkId: options.linkId,
    });
  }
}

// ─── Module: Analytics ────────────────────────────────────────────────────────

class AnalyticsModule {
  constructor(private readonly http: HttpClient) {}

  dashboard(options: AnalyticsOptions = {}): Promise<AnalyticsDashboard> {
    return this.http.get<AnalyticsDashboard>('/api/v1/analytics', {
      linkId: options.linkId,
      from:   options.from,
      to:     options.to,
    });
  }

  top(options: { linkId?: string } = {}): Promise<TopStats> {
    return this.http.get<TopStats>('/api/v1/analytics/top', { linkId: options.linkId });
  }

  /**
   * Export conversions as a CSV string. Requires PRO plan.
   */
  async exportCsv(options: { linkId?: string } = {}): Promise<string> {
    const url = new URL(
      `${(this.http as unknown as { baseUrl: string }).baseUrl}/api/v1/analytics/export`
    );
    if (options.linkId) url.searchParams.set('linkId', options.linkId);

    const res = await fetch(url.toString(), {
      headers: {
        'Authorization': `Bearer ${(this.http as unknown as { apiKey: string }).apiKey}`,
      },
    });

    if (!res.ok) {
      const json = await res.json() as { error?: string };
      throw new QuickLinkError(json.error ?? `HTTP ${res.status}`, res.status);
    }
    return res.text();
  }

  links(options: { limit?: number } = {}): Promise<unknown[]> {
    return this.http.get<unknown[]>('/api/v1/analytics/links', { limit: options.limit });
  }
}

// ─── Module: Domains ─────────────────────────────────────────────────────────

class DomainsModule {
  constructor(private readonly http: HttpClient) {}

  create(options: CreateDomainOptions): Promise<DomainResponse> {
    return this.http.post<DomainResponse>('/api/v1/domains', options);
  }

  list(): Promise<unknown[]> {
    return this.http.get<unknown[]>('/api/v1/domains');
  }

  get(id: string): Promise<unknown> {
    return this.http.get(`/api/v1/domains/${id}`);
  }

  delete(id: string): Promise<{ deleted: boolean }> {
    return this.http.delete(`/api/v1/domains/${id}`);
  }

  verify(id: string): Promise<{ id: string; domain: string; status: string; message: string }> {
    return this.http.post(`/api/v1/domains/${id}/verify`, {});
  }
}

// ─── Module: Users ────────────────────────────────────────────────────────────

class UsersModule {
  constructor(private readonly http: HttpClient) {}

  create(options: CreateUserOptions): Promise<UserResponse> {
    return this.http.post<UserResponse>('/api/v1/users', options);
  }

  me(): Promise<UserResponse> {
    return this.http.get<UserResponse>('/api/v1/users/me');
  }

  createApiKey(
    userId: string,
    name = 'Default Key'
  ): Promise<ApiKeyResponse> {
    return this.http.post<ApiKeyResponse>(`/api/v1/users/${userId}/keys`, { name });
  }

  listApiKeys(userId: string): Promise<unknown[]> {
    return this.http.get<unknown[]>(`/api/v1/users/${userId}/keys`);
  }

  deleteApiKey(userId: string, keyId: string): Promise<{ deleted: boolean }> {
    return this.http.delete(`/api/v1/users/${userId}/keys/${keyId}`);
  }
}

// ─── Main SDK Class ───────────────────────────────────────────────────────────

/**
 * LShorter SDK Client
 *
 * @example
 * const lsh = new LShorter({ apiKey: 'lsh_live_...' });
 *
 * // Create a link
 * const link = await lsh.links.create({
 *   targetUrl: 'https://example.com/product',
 * });
 *
 * // Track conversion
 * await lsh.track.conversion({
 *   eventName: 'purchase', amount: 49, currency: 'EUR',
 *   linkId: 'link_abc123',
 * });
 */
export class LShorter {
  public readonly links:     LinksModule;
  public readonly track:     TrackModule;
  public readonly analytics: AnalyticsModule;
  public readonly domains:   DomainsModule;
  public readonly users:     UsersModule;

  private readonly http: HttpClient;

  constructor(config: QuickLinkConfig) {
    this.http      = new HttpClient(config);
    this.links     = new LinksModule(this.http);
    this.track     = new TrackModule(this.http);
    this.analytics = new AnalyticsModule(this.http);
    this.domains   = new DomainsModule(this.http);
    this.users     = new UsersModule(this.http);
  }
}

// Alias for backward compatibility
export const QuickLink = LShorter;

// Re-export error class for instanceof checks in consumer code
export { QuickLinkError, QuickLinkError as LShorterError };

// ─── Default export ───────────────────────────────────────────────────────────

export default LShorter;
