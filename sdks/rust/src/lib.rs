pub mod client;
pub mod error;
pub mod models;

use crate::client::HttpClient;
pub use crate::error::{LShorterError, Result};
pub use crate::models::*;
use reqwest::Method;
use serde_json::{json, Value};

/// Official LShorter Rust SDK client.
#[derive(Clone, Debug)]
pub struct LShorter {
    http: HttpClient,
}

impl LShorter {
    /// Creates a new LShorter client using the default global Cloudflare Edge endpoint.
    pub fn new(api_key: impl Into<String>) -> Self {
        Self {
            http: HttpClient::new(api_key, None),
        }
    }

    /// Creates a new LShorter client pointing to a custom base URL.
    pub fn with_base_url(api_key: impl Into<String>, base_url: impl Into<String>) -> Self {
        Self {
            http: HttpClient::new(api_key, Some(base_url.into())),
        }
    }

    pub fn links(&self) -> LinksResource<'_> {
        LinksResource { http: &self.http }
    }

    pub fn track(&self) -> TrackResource<'_> {
        TrackResource { http: &self.http }
    }

    pub fn analytics(&self) -> AnalyticsResource<'_> {
        AnalyticsResource { http: &self.http }
    }

    pub fn domains(&self) -> DomainsResource<'_> {
        DomainsResource { http: &self.http }
    }

    pub fn webhooks(&self) -> WebhooksResource<'_> {
        WebhooksResource { http: &self.http }
    }

    pub fn pixels(&self) -> PixelsResource<'_> {
        PixelsResource { http: &self.http }
    }

    pub fn notifications(&self) -> NotificationsResource<'_> {
        NotificationsResource { http: &self.http }
    }

    pub fn targets(&self) -> NotificationsResource<'_> {
        self.notifications()
    }
}

pub struct LinksResource<'a> {
    http: &'a HttpClient,
}

impl<'a> LinksResource<'a> {
    pub async fn create(&self, options: &CreateLinkOptions) -> Result<LinkResponse> {
        self.http
            .request(Method::POST, "/api/v1/links", Some(options), &[])
            .await
    }

    pub async fn list(&self, page: Option<u32>, limit: Option<u32>) -> Result<PaginatedResponse<LinkResponse>> {
        let mut q = Vec::new();
        if let Some(p) = page {
            q.push(("page", p.to_string()));
        }
        if let Some(l) = limit {
            q.push(("limit", l.to_string()));
        }
        self.http.request_paginated("/api/v1/links", &q).await
    }

    pub async fn get(&self, id: &str) -> Result<LinkResponse> {
        self.http
            .request::<LinkResponse, Value>(Method::GET, &format!("/api/v1/links/{id}"), None, &[])
            .await
    }

    pub async fn update(&self, id: &str, patch: &Value) -> Result<LinkResponse> {
        self.http
            .request(Method::PATCH, &format!("/api/v1/links/{id}"), Some(patch), &[])
            .await
    }

    pub async fn delete(&self, id: &str) -> Result<DeleteResponse> {
        self.http
            .request::<DeleteResponse, Value>(Method::DELETE, &format!("/api/v1/links/{id}"), None, &[])
            .await
    }
}

pub struct TrackResource<'a> {
    http: &'a HttpClient,
}

impl<'a> TrackResource<'a> {
    pub async fn conversion(&self, options: &TrackConversionOptions) -> Result<ConversionResponse> {
        let cust = options.customer.as_ref();
        let mut payload = json!({
            "eventName": options.event_name,
            "amount": options.amount,
            "currency": options.currency.clone().unwrap_or_else(|| "EUR".to_string()),
            "customerId": cust.and_then(|c| c.id.clone()).unwrap_or_else(|| "usr_anon".to_string()),
            "linkId": options.link_id,
            "clickId": options.click_id,
        });
        if let Some(obj) = payload.as_object_mut() {
            if let Some(email) = cust.and_then(|c| c.email.clone()) {
                obj.insert("customerEmail".to_string(), Value::String(email));
            }
            if let Some(name) = cust.and_then(|c| c.name.clone()) {
                obj.insert("customerName".to_string(), Value::String(name));
            }
            if let Some(avatar) = cust.and_then(|c| c.avatar_url.clone()) {
                obj.insert("customerAvatar".to_string(), Value::String(avatar));
            }
        }
        self.http
            .request(Method::POST, "/api/v1/track", Some(&payload), &[])
            .await
    }

    pub async fn list(
        &self,
        page: Option<u32>,
        limit: Option<u32>,
        link_id: Option<&str>,
    ) -> Result<PaginatedResponse<ConversionResponse>> {
        let mut q = Vec::new();
        if let Some(p) = page {
            q.push(("page", p.to_string()));
        }
        if let Some(l) = limit {
            q.push(("limit", l.to_string()));
        }
        if let Some(lid) = link_id {
            q.push(("linkId", lid.to_string()));
        }
        self.http.request_paginated("/api/v1/track", &q).await
    }
}

pub struct AnalyticsResource<'a> {
    http: &'a HttpClient,
}

impl<'a> AnalyticsResource<'a> {
    pub async fn dashboard(
        &self,
        link_id: Option<&str>,
        from: Option<&str>,
        to: Option<&str>,
    ) -> Result<AnalyticsDashboard> {
        let mut q = Vec::new();
        if let Some(lid) = link_id {
            q.push(("linkId", lid.to_string()));
        }
        if let Some(f) = from {
            q.push(("from", f.to_string()));
        }
        if let Some(t) = to {
            q.push(("to", t.to_string()));
        }
        self.http
            .request::<AnalyticsDashboard, Value>(Method::GET, "/api/v1/analytics", None, &q)
            .await
    }

    pub async fn top(&self, link_id: Option<&str>) -> Result<Value> {
        let mut q = Vec::new();
        if let Some(lid) = link_id {
            q.push(("linkId", lid.to_string()));
        }
        self.http
            .request::<Value, Value>(Method::GET, "/api/v1/analytics/top", None, &q)
            .await
    }

    pub async fn links(&self, limit: Option<u32>) -> Result<Vec<Value>> {
        let mut q = Vec::new();
        if let Some(l) = limit {
            q.push(("limit", l.to_string()));
        }
        self.http
            .request::<Vec<Value>, Value>(Method::GET, "/api/v1/analytics/links", None, &q)
            .await
    }

    pub async fn export_csv(&self, link_id: Option<&str>) -> Result<String> {
        let mut q = Vec::new();
        if let Some(lid) = link_id {
            q.push(("linkId", lid.to_string()));
        }
        self.http.request_text("/api/v1/analytics/export", &q).await
    }
}

pub struct DomainsResource<'a> {
    http: &'a HttpClient,
}

impl<'a> DomainsResource<'a> {
    pub async fn create(&self, domain: &str) -> Result<DomainResponse> {
        let body = json!({ "domain": domain });
        self.http
            .request(Method::POST, "/api/v1/domains", Some(&body), &[])
            .await
    }

    pub async fn list(&self) -> Result<Vec<Value>> {
        self.http
            .request::<Vec<Value>, Value>(Method::GET, "/api/v1/domains", None, &[])
            .await
    }

    pub async fn get(&self, id: &str) -> Result<Value> {
        self.http
            .request::<Value, Value>(Method::GET, &format!("/api/v1/domains/{id}"), None, &[])
            .await
    }

    pub async fn verify(&self, id: &str) -> Result<DomainResponse> {
        let empty = json!({});
        self.http
            .request(Method::POST, &format!("/api/v1/domains/{id}/verify"), Some(&empty), &[])
            .await
    }

    pub async fn delete(&self, id: &str) -> Result<DeleteResponse> {
        self.http
            .request::<DeleteResponse, Value>(Method::DELETE, &format!("/api/v1/domains/{id}"), None, &[])
            .await
    }
}

pub struct WebhooksResource<'a> {
    http: &'a HttpClient,
}

impl<'a> WebhooksResource<'a> {
    pub async fn create(&self, options: &CreateWebhookOptions) -> Result<WebhookResponse> {
        let val = self
            .http
            .request::<Value, CreateWebhookOptions>(Method::POST, "/api/v1/webhooks", Some(options), &[])
            .await?;
        let item = val.get("webhook").cloned().unwrap_or(val);
        Ok(serde_json::from_value(item)?)
    }

    pub async fn list(&self) -> Result<Vec<WebhookResponse>> {
        let val = self
            .http
            .request::<Value, Value>(Method::GET, "/api/v1/webhooks", None, &[])
            .await?;
        let arr = val.get("webhooks").cloned().unwrap_or(val);
        Ok(serde_json::from_value(arr)?)
    }

    pub async fn get(&self, id: &str) -> Result<WebhookResponse> {
        let val = self
            .http
            .request::<Value, Value>(Method::GET, &format!("/api/v1/webhooks/{id}"), None, &[])
            .await?;
        let item = val.get("webhook").cloned().unwrap_or(val);
        Ok(serde_json::from_value(item)?)
    }

    pub async fn update(&self, id: &str, patch: &Value) -> Result<WebhookResponse> {
        let val = self
            .http
            .request::<Value, Value>(Method::PATCH, &format!("/api/v1/webhooks/{id}"), Some(patch), &[])
            .await?;
        let item = val.get("webhook").cloned().unwrap_or(val);
        Ok(serde_json::from_value(item)?)
    }

    pub async fn delete(&self, id: &str) -> Result<DeleteResponse> {
        self.http
            .request::<DeleteResponse, Value>(Method::DELETE, &format!("/api/v1/webhooks/{id}"), None, &[])
            .await
    }
}

pub struct PixelsResource<'a> {
    http: &'a HttpClient,
}

impl<'a> PixelsResource<'a> {
    pub async fn create(&self, options: &CreatePixelOptions) -> Result<PixelResponse> {
        let val = self
            .http
            .request::<Value, CreatePixelOptions>(Method::POST, "/api/v1/pixels", Some(options), &[])
            .await?;
        let item = val.get("pixel").cloned().unwrap_or(val);
        Ok(serde_json::from_value(item)?)
    }

    pub async fn list(&self) -> Result<Vec<PixelResponse>> {
        let val = self
            .http
            .request::<Value, Value>(Method::GET, "/api/v1/pixels", None, &[])
            .await?;
        let arr = val.get("pixels").cloned().unwrap_or(val);
        Ok(serde_json::from_value(arr)?)
    }

    pub async fn get(&self, id: &str) -> Result<PixelResponse> {
        let val = self
            .http
            .request::<Value, Value>(Method::GET, &format!("/api/v1/pixels/{id}"), None, &[])
            .await?;
        let item = val.get("pixel").cloned().unwrap_or(val);
        Ok(serde_json::from_value(item)?)
    }

    pub async fn update(&self, id: &str, patch: &Value) -> Result<PixelResponse> {
        let val = self
            .http
            .request::<Value, Value>(Method::PATCH, &format!("/api/v1/pixels/{id}"), Some(patch), &[])
            .await?;
        let item = val.get("pixel").cloned().unwrap_or(val);
        Ok(serde_json::from_value(item)?)
    }

    pub async fn delete(&self, id: &str) -> Result<DeleteResponse> {
        self.http
            .request::<DeleteResponse, Value>(Method::DELETE, &format!("/api/v1/pixels/{id}"), None, &[])
            .await
    }
}

pub struct NotificationsResource<'a> {
    http: &'a HttpClient,
}

impl<'a> NotificationsResource<'a> {
    pub async fn create(&self) -> Result<TargetAlertResponse> {
        Err(LShorterError::api(
            403,
            "Creating target alerts and notifications via the SDK is disabled. Notifications must be configured directly from the LShorter Dashboard (Settings > Notifications).",
            None,
        ))
    }

    pub async fn list(&self) -> Result<Vec<TargetAlertResponse>> {
        let val = self
            .http
            .request::<Value, Value>(Method::GET, "/api/v1/targets", None, &[])
            .await?;
        let arr = val.get("data").cloned().unwrap_or(val);
        Ok(serde_json::from_value(arr)?)
    }

    pub async fn get(&self, id: &str) -> Result<TargetAlertResponse> {
        let alerts = self.list().await?;
        alerts
            .into_iter()
            .find(|a| a.id == id)
            .ok_or_else(|| LShorterError::api(404, "Target alert not found", None))
    }
}
