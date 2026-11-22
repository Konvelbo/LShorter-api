package lshorter

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

// DefaultBaseURL is the global LShorter Cloudflare Edge API endpoint.
const DefaultBaseURL = "https://lshorter-api.fiatechnologiecam.workers.dev"

// Option customizes a Client instance.
type Option func(*Client)

// WithBaseURL overrides the default API base URL.
func WithBaseURL(baseURL string) Option {
	return func(c *Client) {
		base := strings.TrimRight(baseURL, "/")
		if base == "https://lsho.cc" || base == "https://api.lsho.cc" {
			base = DefaultBaseURL
		}
		c.baseURL = base
	}
}

// WithHTTPClient provides a custom *http.Client (timeout, transport, proxies).
func WithHTTPClient(httpClient *http.Client) Option {
	return func(c *Client) {
		if httpClient != nil {
			c.httpClient = httpClient
		}
	}
}

// Client is the official LShorter Go SDK entry point.
type Client struct {
	apiKey     string
	baseURL    string
	httpClient *http.Client

	Links         *LinksService
	Track         *TrackService
	Analytics     *AnalyticsService
	Domains       *DomainsService
	Webhooks      *WebhooksService
	Pixels        *PixelsService
	Notifications *NotificationsService
	Targets       *NotificationsService
}

// New creates a new LShorter API client.
func New(apiKey string, opts ...Option) *Client {
	c := &Client{
		apiKey:  strings.TrimSpace(apiKey),
		baseURL: DefaultBaseURL,
		httpClient: &http.Client{
			Timeout: 15 * time.Second,
		},
	}
	for _, opt := range opts {
		opt(c)
	}
	c.Links = &LinksService{c: c}
	c.Track = &TrackService{c: c}
	c.Analytics = &AnalyticsService{c: c}
	c.Domains = &DomainsService{c: c}
	c.Webhooks = &WebhooksService{c: c}
	c.Pixels = &PixelsService{c: c}
	c.Notifications = &NotificationsService{c: c}
	c.Targets = c.Notifications
	return c
}

type apiEnvelope struct {
	Success    bool            `json:"success"`
	Data       json.RawMessage `json:"data"`
	Pagination *Pagination     `json:"pagination"`
	Error      string          `json:"error"`
	Code       string          `json:"code"`
}

func (c *Client) doJSON(ctx context.Context, method, path string, query url.Values, body any, out any) (*Pagination, error) {
	fullURL := c.baseURL + path
	if len(query) > 0 {
		fullURL += "?" + query.Encode()
	}

	var bodyReader io.Reader
	if body != nil {
		raw, err := json.Marshal(body)
		if err != nil {
			return nil, err
		}
		bodyReader = bytes.NewReader(raw)
	}

	req, err := http.NewRequestWithContext(ctx, method, fullURL, bodyReader)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+c.apiKey)
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "lshorter-go/1.0.0")
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	rawResp, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	var env apiEnvelope
	if err := json.Unmarshal(rawResp, &env); err != nil {
		if resp.StatusCode >= 400 {
			return nil, &Error{Status: resp.StatusCode, Message: string(rawResp)}
		}
		return nil, err
	}

	if resp.StatusCode >= 400 || !env.Success {
		msg := env.Error
		if msg == "" {
			msg = fmt.Sprintf("HTTP %d", resp.StatusCode)
		}
		return nil, &Error{Status: resp.StatusCode, Code: env.Code, Message: msg}
	}

	if out != nil && len(env.Data) > 0 && string(env.Data) != "null" {
		if err := json.Unmarshal(env.Data, out); err != nil {
			return nil, err
		}
	}
	return env.Pagination, nil
}

func (c *Client) doText(ctx context.Context, path string, query url.Values) (string, error) {
	fullURL := c.baseURL + path
	if len(query) > 0 {
		fullURL += "?" + query.Encode()
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, fullURL, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+c.apiKey)
	req.Header.Set("User-Agent", "lshorter-go/1.0.0")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	rawResp, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}
	if resp.StatusCode >= 400 {
		var env apiEnvelope
		if json.Unmarshal(rawResp, &env) == nil && env.Error != "" {
			return "", &Error{Status: resp.StatusCode, Code: env.Code, Message: env.Error}
		}
		return "", &Error{Status: resp.StatusCode, Message: string(rawResp)}
	}
	return string(rawResp), nil
}

// ─── LinksService ─────────────────────────────────────────────────────────────

type LinksService struct{ c *Client }

func (s *LinksService) Create(ctx context.Context, opts CreateLinkOptions) (*LinkResponse, error) {
	var res LinkResponse
	if _, err := s.c.doJSON(ctx, http.MethodPost, "/api/v1/links", nil, opts, &res); err != nil {
		return nil, err
	}
	return &res, nil
}

func (s *LinksService) List(ctx context.Context, page, limit int) (*PaginatedResponse[LinkResponse], error) {
	q := url.Values{}
	if page > 0 {
		q.Set("page", strconv.Itoa(page))
	}
	if limit > 0 {
		q.Set("limit", strconv.Itoa(limit))
	}
	var items []LinkResponse
	pag, err := s.c.doJSON(ctx, http.MethodGet, "/api/v1/links", q, nil, &items)
	if err != nil {
		return nil, err
	}
	out := &PaginatedResponse[LinkResponse]{Data: items}
	if pag != nil {
		out.Pagination = *pag
	}
	return out, nil
}

func (s *LinksService) Get(ctx context.Context, id string) (*LinkResponse, error) {
	var res LinkResponse
	if _, err := s.c.doJSON(ctx, http.MethodGet, "/api/v1/links/"+url.PathEscape(id), nil, nil, &res); err != nil {
		return nil, err
	}
	return &res, nil
}

func (s *LinksService) Update(ctx context.Context, id string, opts CreateLinkOptions) (*LinkResponse, error) {
	var res LinkResponse
	if _, err := s.c.doJSON(ctx, http.MethodPatch, "/api/v1/links/"+url.PathEscape(id), nil, opts, &res); err != nil {
		return nil, err
	}
	return &res, nil
}

func (s *LinksService) Delete(ctx context.Context, id string) (*DeleteResponse, error) {
	var res DeleteResponse
	if _, err := s.c.doJSON(ctx, http.MethodDelete, "/api/v1/links/"+url.PathEscape(id), nil, nil, &res); err != nil {
		return nil, err
	}
	return &res, nil
}

// ─── TrackService ─────────────────────────────────────────────────────────────

type TrackService struct{ c *Client }

func (s *TrackService) Conversion(ctx context.Context, opts TrackConversionOptions) (*ConversionResponse, error) {
	currency := opts.Currency
	if currency == "" {
		currency = "EUR"
	}
	payload := map[string]any{
		"eventName":  opts.EventName,
		"amount":     opts.Amount,
		"currency":   currency,
		"customerId": "usr_anon",
		"linkId":     opts.LinkID,
	}
	if opts.ClickID != "" {
		payload["clickId"] = opts.ClickID
	}
	if opts.Customer != nil {
		if opts.Customer.ID != "" {
			payload["customerId"] = opts.Customer.ID
		}
		if opts.Customer.Email != "" {
			payload["customerEmail"] = opts.Customer.Email
		}
		if opts.Customer.Name != "" {
			payload["customerName"] = opts.Customer.Name
		} else if opts.Customer.FullName != "" {
			payload["customerName"] = opts.Customer.FullName
		}
		if opts.Customer.AvatarURL != "" {
			payload["customerAvatar"] = opts.Customer.AvatarURL
		}
	}

	var res ConversionResponse
	if _, err := s.c.doJSON(ctx, http.MethodPost, "/api/v1/track", nil, payload, &res); err != nil {
		return nil, err
	}
	return &res, nil
}

func (s *TrackService) List(ctx context.Context, page, limit int, linkID string) (*PaginatedResponse[ConversionResponse], error) {
	q := url.Values{}
	if page > 0 {
		q.Set("page", strconv.Itoa(page))
	}
	if limit > 0 {
		q.Set("limit", strconv.Itoa(limit))
	}
	if linkID != "" {
		q.Set("linkId", linkID)
	}
	var items []ConversionResponse
	pag, err := s.c.doJSON(ctx, http.MethodGet, "/api/v1/track", q, nil, &items)
	if err != nil {
		return nil, err
	}
	out := &PaginatedResponse[ConversionResponse]{Data: items}
	if pag != nil {
		out.Pagination = *pag
	}
	return out, nil
}

// ─── AnalyticsService ─────────────────────────────────────────────────────────

type AnalyticsService struct{ c *Client }

func (s *AnalyticsService) Dashboard(ctx context.Context, linkID, from, to string) (*AnalyticsDashboard, error) {
	q := url.Values{}
	if linkID != "" {
		q.Set("linkId", linkID)
	}
	if from != "" {
		q.Set("from", from)
	}
	if to != "" {
		q.Set("to", to)
	}
	var res AnalyticsDashboard
	if _, err := s.c.doJSON(ctx, http.MethodGet, "/api/v1/analytics", q, nil, &res); err != nil {
		return nil, err
	}
	return &res, nil
}

func (s *AnalyticsService) Top(ctx context.Context, linkID string) (map[string]any, error) {
	q := url.Values{}
	if linkID != "" {
		q.Set("linkId", linkID)
	}
	var res map[string]any
	if _, err := s.c.doJSON(ctx, http.MethodGet, "/api/v1/analytics/top", q, nil, &res); err != nil {
		return nil, err
	}
	return res, nil
}

func (s *AnalyticsService) Links(ctx context.Context, limit int) ([]map[string]any, error) {
	q := url.Values{}
	if limit > 0 {
		q.Set("limit", strconv.Itoa(limit))
	}
	var res []map[string]any
	if _, err := s.c.doJSON(ctx, http.MethodGet, "/api/v1/analytics/links", q, nil, &res); err != nil {
		return nil, err
	}
	return res, nil
}

func (s *AnalyticsService) ExportCSV(ctx context.Context, linkID string) (string, error) {
	q := url.Values{}
	if linkID != "" {
		q.Set("linkId", linkID)
	}
	return s.c.doText(ctx, "/api/v1/analytics/export", q)
}

// ─── DomainsService ───────────────────────────────────────────────────────────

type DomainsService struct{ c *Client }

func (s *DomainsService) Create(ctx context.Context, domain string) (*DomainResponse, error) {
	var res DomainResponse
	if _, err := s.c.doJSON(ctx, http.MethodPost, "/api/v1/domains", nil, map[string]string{"domain": domain}, &res); err != nil {
		return nil, err
	}
	return &res, nil
}

func (s *DomainsService) List(ctx context.Context) ([]map[string]any, error) {
	var res []map[string]any
	if _, err := s.c.doJSON(ctx, http.MethodGet, "/api/v1/domains", nil, nil, &res); err != nil {
		return nil, err
	}
	return res, nil
}

func (s *DomainsService) Verify(ctx context.Context, id string) (*DomainResponse, error) {
	var res DomainResponse
	if _, err := s.c.doJSON(ctx, http.MethodPost, "/api/v1/domains/"+url.PathEscape(id)+"/verify", nil, map[string]any{}, &res); err != nil {
		return nil, err
	}
	return &res, nil
}

func (s *DomainsService) Delete(ctx context.Context, id string) (*DeleteResponse, error) {
	var res DeleteResponse
	if _, err := s.c.doJSON(ctx, http.MethodDelete, "/api/v1/domains/"+url.PathEscape(id), nil, nil, &res); err != nil {
		return nil, err
	}
	return &res, nil
}

// ─── WebhooksService ──────────────────────────────────────────────────────────

type WebhooksService struct{ c *Client }

func (s *WebhooksService) Create(_ context.Context) (*WebhookResponse, error) {
	return nil, &Error{
		Status:  403,
		Message: "Creating webhooks via the SDK is disabled. Please configure your webhooks from the LShorter Dashboard (Settings > Webhooks).",
	}
}

func (s *WebhooksService) List(ctx context.Context) ([]WebhookResponse, error) {
	var raw json.RawMessage
	if _, err := s.c.doJSON(ctx, http.MethodGet, "/api/v1/webhooks", nil, nil, &raw); err != nil {
		return nil, err
	}
	var wrapped struct {
		Webhooks []WebhookResponse `json:"webhooks"`
	}
	if json.Unmarshal(raw, &wrapped) == nil && wrapped.Webhooks != nil {
		return wrapped.Webhooks, nil
	}
	var list []WebhookResponse
	if err := json.Unmarshal(raw, &list); err != nil {
		return nil, err
	}
	return list, nil
}

func (s *WebhooksService) Update(ctx context.Context, id string, patch map[string]any) (*WebhookResponse, error) {
	var raw json.RawMessage
	if _, err := s.c.doJSON(ctx, http.MethodPatch, "/api/v1/webhooks/"+url.PathEscape(id), nil, patch, &raw); err != nil {
		return nil, err
	}
	var wrapped struct {
		Webhook *WebhookResponse `json:"webhook"`
	}
	if json.Unmarshal(raw, &wrapped) == nil && wrapped.Webhook != nil {
		return wrapped.Webhook, nil
	}
	var res WebhookResponse
	if err := json.Unmarshal(raw, &res); err != nil {
		return nil, err
	}
	return &res, nil
}

func (s *WebhooksService) Delete(ctx context.Context, id string) (*DeleteResponse, error) {
	var res DeleteResponse
	if _, err := s.c.doJSON(ctx, http.MethodDelete, "/api/v1/webhooks/"+url.PathEscape(id), nil, nil, &res); err != nil {
		return nil, err
	}
	return &res, nil
}

// ─── PixelsService ────────────────────────────────────────────────────────────

type PixelsService struct{ c *Client }

func (s *PixelsService) Create(_ context.Context) (*PixelResponse, error) {
	return nil, &Error{
		Status:  403,
		Message: "Creating retargeting pixels via the SDK is disabled. Please register your pixels from the LShorter Dashboard (Settings > Retargeting Pixels).",
	}
}

func (s *PixelsService) List(ctx context.Context) ([]PixelResponse, error) {
	var raw json.RawMessage
	if _, err := s.c.doJSON(ctx, http.MethodGet, "/api/v1/pixels", nil, nil, &raw); err != nil {
		return nil, err
	}
	var wrapped struct {
		Pixels []PixelResponse `json:"pixels"`
	}
	if json.Unmarshal(raw, &wrapped) == nil && wrapped.Pixels != nil {
		return wrapped.Pixels, nil
	}
	var list []PixelResponse
	if err := json.Unmarshal(raw, &list); err != nil {
		return nil, err
	}
	return list, nil
}

func (s *PixelsService) Update(ctx context.Context, id string, patch map[string]any) (*PixelResponse, error) {
	var raw json.RawMessage
	if _, err := s.c.doJSON(ctx, http.MethodPatch, "/api/v1/pixels/"+url.PathEscape(id), nil, patch, &raw); err != nil {
		return nil, err
	}
	var wrapped struct {
		Pixel *PixelResponse `json:"pixel"`
	}
	if json.Unmarshal(raw, &wrapped) == nil && wrapped.Pixel != nil {
		return wrapped.Pixel, nil
	}
	var res PixelResponse
	if err := json.Unmarshal(raw, &res); err != nil {
		return nil, err
	}
	return &res, nil
}

func (s *PixelsService) Delete(ctx context.Context, id string) (*DeleteResponse, error) {
	var res DeleteResponse
	if _, err := s.c.doJSON(ctx, http.MethodDelete, "/api/v1/pixels/"+url.PathEscape(id), nil, nil, &res); err != nil {
		return nil, err
	}
	return &res, nil
}

// ─── NotificationsService ─────────────────────────────────────────────────────

type NotificationsService struct{ c *Client }

func (s *NotificationsService) Create(_ context.Context) (*TargetAlertResponse, error) {
	return nil, &Error{
		Status:  403,
		Message: "Creating target alerts and notifications via the SDK is disabled. Notifications must be configured directly from the LShorter Dashboard (Settings > Notifications).",
	}
}

func (s *NotificationsService) List(ctx context.Context) ([]TargetAlertResponse, error) {
	var list []TargetAlertResponse
	if _, err := s.c.doJSON(ctx, http.MethodGet, "/api/v1/targets", nil, nil, &list); err != nil {
		return nil, err
	}
	return list, nil
}

func (s *NotificationsService) Get(ctx context.Context, id string) (*TargetAlertResponse, error) {
	alerts, err := s.List(ctx)
	if err != nil {
		return nil, err
	}
	for i := range alerts {
		if alerts[i].ID == id {
			return &alerts[i], nil
		}
	}
	return nil, &Error{Status: 404, Message: "Target alert not found"}
}
