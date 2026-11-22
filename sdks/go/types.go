package lshorter

// Pagination metadata returned by list endpoints.
type Pagination struct {
	Page  int `json:"page"`
	Limit int `json:"limit"`
	Total int `json:"total"`
}

// PaginatedResponse wraps a slice of items alongside pagination details.
type PaginatedResponse[T any] struct {
	Data       []T        `json:"data"`
	Pagination Pagination `json:"pagination"`
}

// AbVariation defines an A/B testing destination URL and traffic weight.
type AbVariation struct {
	URL    string  `json:"url"`
	Weight float64 `json:"weight"`
}

// CreateLinkOptions configures a short link creation or update request.
type CreateLinkOptions struct {
	TargetURL        string            `json:"targetUrl,omitempty"`
	Slug             string            `json:"slug,omitempty"`
	DomainName       string            `json:"domainName,omitempty"`
	GeoTargeting     map[string]string `json:"geoTargeting,omitempty"`
	DeviceTargeting  map[string]string `json:"deviceTargeting,omitempty"`
	RoutingRules     []map[string]any  `json:"routingRules,omitempty"`
	IsActive         *bool             `json:"isActive,omitempty"`
	ExpiresAt        string            `json:"expiresAt,omitempty"`
	Password         string            `json:"password,omitempty"`
	Tags             []string          `json:"tags,omitempty"`
	IsCloaked        *bool             `json:"isCloaked,omitempty"`
	HideReferrer     *bool             `json:"hideReferrer,omitempty"`
	MetaTitle        string            `json:"metaTitle,omitempty"`
	OgTitle          string            `json:"ogTitle,omitempty"`
	OgDescription    string            `json:"ogDescription,omitempty"`
	OgImage          string            `json:"ogImage,omitempty"`
	BannerStyle      string            `json:"bannerStyle,omitempty"`
	TwitterCard      string            `json:"twitterCard,omitempty"`
	AbVariations     []AbVariation     `json:"abVariations,omitempty"`
	MainWeight       *float64          `json:"mainWeight,omitempty"`
	RedirectType     string            `json:"redirectType,omitempty"`
	PassParams       *bool             `json:"passParams,omitempty"`
	MaxClicks        *int              `json:"maxClicks,omitempty"`
	FallbackURL      string            `json:"fallbackUrl,omitempty"`
	PathLockMode     string            `json:"pathLockMode,omitempty"`
	PathLockPrefix   string            `json:"pathLockPrefix,omitempty"`
	PathLockMessage  string            `json:"pathLockMessage,omitempty"`
	PathLockPassword string            `json:"pathLockPassword,omitempty"`
	Pixels           []string          `json:"pixels,omitempty"`
}

// LinkResponse represents a short link returned by LShorter.
type LinkResponse struct {
	ID         string            `json:"id"`
	ShortURL   string            `json:"shortUrl"`
	Slug       string            `json:"slug"`
	Domain     string            `json:"domain,omitempty"`
	TargetURL  string            `json:"targetUrl"`
	IsActive   bool              `json:"isActive"`
	Clicks     int               `json:"clicks,omitempty"`
	Tags       []string          `json:"tags,omitempty"`
	Pixels     []string          `json:"pixels,omitempty"`
	Geo        map[string]string `json:"geoTargeting,omitempty"`
	Devices    map[string]string `json:"deviceTargeting,omitempty"`
	CreatedAt  string            `json:"created_at,omitempty"`
}

// CustomerInput holds optional customer attribution details for a conversion.
type CustomerInput struct {
	ID        string `json:"id,omitempty"`
	Email     string `json:"email,omitempty"`
	Name      string `json:"name,omitempty"`
	FullName  string `json:"fullName,omitempty"`
	AvatarURL string `json:"avatarUrl,omitempty"`
}

// TrackConversionOptions describes a conversion event to attribute to a link.
type TrackConversionOptions struct {
	EventName string         `json:"eventName"`
	Amount    float64        `json:"amount"`
	Currency  string         `json:"currency,omitempty"`
	LinkID    string         `json:"linkId"`
	ClickID   string         `json:"clickId,omitempty"`
	Customer  *CustomerInput `json:"customer,omitempty"`
}

// ConversionResponse is returned after recording a conversion.
type ConversionResponse struct {
	ID            string  `json:"id"`
	EventName     string  `json:"eventName"`
	Amount        float64 `json:"amount"`
	Currency      string  `json:"currency"`
	CustomerEmail string  `json:"customerEmail,omitempty"`
	CustomerName  string  `json:"customerName,omitempty"`
	LinkID        string  `json:"linkId"`
	ClickID       string  `json:"clickId,omitempty"`
	CreatedAt     string  `json:"created_at,omitempty"`
}

// AnalyticsDashboard contains aggregated click and revenue telemetry.
type AnalyticsDashboard struct {
	TotalClicks    int              `json:"totalClicks"`
	UniqueClicks   int              `json:"uniqueClicks"`
	TrackedRevenue float64          `json:"trackedRevenue"`
	EPC            float64          `json:"epc,omitempty"`
	TopCountries   []map[string]any `json:"topCountries,omitempty"`
	TopDevices     []map[string]any `json:"topDevices,omitempty"`
}

// DomainResponse represents a custom branded domain.
type DomainResponse struct {
	ID         string           `json:"id"`
	Domain     string           `json:"domain"`
	Status     string           `json:"status"`
	Message    string           `json:"message,omitempty"`
	DNSRecords []map[string]any `json:"dnsRecords,omitempty"`
}

// WebhookResponse represents a configured webhook subscription.
type WebhookResponse struct {
	ID        string   `json:"id"`
	URL       string   `json:"url"`
	Events    []string `json:"events"`
	SecretKey string   `json:"secretKey,omitempty"`
	IsActive  bool     `json:"isActive"`
}

// PixelResponse represents a configured retargeting pixel.
type PixelResponse struct {
	ID                 string `json:"id"`
	Platform           string `json:"platform"`
	PixelID            string `json:"pixelId"`
	Name               string `json:"name"`
	IsActive           bool   `json:"isActive"`
	EventsTrackedCount int    `json:"eventsTrackedCount,omitempty"`
}

// TargetAlertResponse represents a read-only click or revenue goal alert.
type TargetAlertResponse struct {
	ID           string  `json:"id"`
	MetricType   string  `json:"metricType"`
	Period       string  `json:"period,omitempty"`
	TargetValue  float64 `json:"targetValue"`
	CurrentValue float64 `json:"currentValue"`
	Status       string  `json:"status,omitempty"`
}

// DeleteResponse represents a deletion confirmation.
type DeleteResponse struct {
	Deleted bool   `json:"deleted"`
	ID      string `json:"id,omitempty"`
}
