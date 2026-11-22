use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Pagination {
    pub page: u32,
    pub limit: u32,
    pub total: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaginatedResponse<T> {
    pub data: Vec<T>,
    pub pagination: Pagination,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AbVariation {
    pub url: String,
    pub weight: f64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateLinkOptions {
    pub target_url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub slug: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub domain_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub geo_targeting: Option<HashMap<String, String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub device_targeting: Option<HashMap<String, String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub routing_rules: Option<Vec<Value>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_active: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expires_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub password: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_cloaked: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hide_referrer: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub meta_title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub og_title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub og_description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub og_image: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub banner_style: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub twitter_card: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ab_variations: Option<Vec<AbVariation>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub main_weight: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub redirect_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pass_params: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_clicks: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fallback_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path_lock_mode: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path_lock_prefix: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path_lock_message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path_lock_password: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pixels: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinkResponse {
    pub id: String,
    pub short_url: String,
    pub slug: String,
    #[serde(default)]
    pub target_url: String,
    #[serde(default)]
    pub domain: Option<String>,
    #[serde(default)]
    pub is_active: Option<bool>,
    #[serde(default)]
    pub clicks: Option<u64>,
    #[serde(default)]
    pub tags: Option<Vec<String>>,
    #[serde(default)]
    pub pixels: Option<Vec<String>>,
    #[serde(default, alias = "created_at")]
    pub created_at: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomerInput {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub email: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub avatar_url: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackConversionOptions {
    pub event_name: String,
    pub link_id: String,
    pub amount: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub currency: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub click_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub customer: Option<CustomerInput>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversionResponse {
    pub id: String,
    pub event_name: String,
    pub amount: f64,
    #[serde(default)]
    pub currency: Option<String>,
    #[serde(default)]
    pub link_id: Option<String>,
    #[serde(default)]
    pub click_id: Option<String>,
    #[serde(default)]
    pub customer_email: Option<String>,
    #[serde(default)]
    pub customer_name: Option<String>,
    #[serde(default, alias = "created_at")]
    pub created_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalyticsDashboard {
    #[serde(default)]
    pub total_clicks: u64,
    #[serde(default)]
    pub unique_clicks: u64,
    #[serde(default)]
    pub tracked_revenue: f64,
    #[serde(default)]
    pub epc: Option<f64>,
    #[serde(default)]
    pub top_countries: Option<Vec<Value>>,
    #[serde(default)]
    pub top_devices: Option<Vec<Value>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DomainResponse {
    pub id: String,
    #[serde(default, alias = "domain_name")]
    pub domain: String,
    pub status: String,
    #[serde(default)]
    pub message: Option<String>,
    #[serde(default)]
    pub dns_records: Option<Vec<Value>>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateWebhookOptions {
    pub url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub events: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub secret_key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_active: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WebhookResponse {
    pub id: String,
    pub url: String,
    #[serde(default)]
    pub events: Vec<String>,
    #[serde(default)]
    pub is_active: bool,
    #[serde(default)]
    pub secret_key: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatePixelOptions {
    pub platform: String,
    pub pixel_id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_active: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PixelResponse {
    pub id: String,
    pub platform: String,
    pub pixel_id: String,
    pub name: String,
    #[serde(default)]
    pub is_active: bool,
    #[serde(default)]
    pub events_tracked_count: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TargetAlertResponse {
    pub id: String,
    pub metric_type: String,
    #[serde(default)]
    pub period: Option<String>,
    pub target_value: f64,
    #[serde(default)]
    pub current_value: f64,
    #[serde(default)]
    pub status: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeleteResponse {
    pub deleted: bool,
    #[serde(default)]
    pub id: Option<String>,
}
