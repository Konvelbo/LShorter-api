use crate::error::{LShorterError, Result};
use crate::models::{PaginatedResponse, Pagination};
use reqwest::{Client, Method};
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use serde_json::Value;

pub const DEFAULT_BASE_URL: &str = "https://lshorter-api.fiatechnologiecam.workers.dev";

#[derive(Debug, Deserialize)]
struct ApiEnvelope {
    success: bool,
    data: Option<Value>,
    pagination: Option<Pagination>,
    error: Option<String>,
    code: Option<String>,
}

#[derive(Clone, Debug)]
pub(crate) struct HttpClient {
    base_url: String,
    api_key: String,
    client: Client,
}

impl HttpClient {
    pub fn new(api_key: impl Into<String>, base_url: Option<String>) -> Self {
        let mut base = base_url
            .unwrap_or_else(|| DEFAULT_BASE_URL.to_string())
            .trim_end_matches('/')
            .to_string();
        if base == "https://lsho.cc" || base == "https://api.lsho.cc" {
            base = DEFAULT_BASE_URL.to_string();
        }
        let client = Client::builder()
            .user_agent("lshorter-rust/1.0.0")
            .build()
            .expect("failed to build reqwest client");
        Self {
            base_url: base,
            api_key: api_key.into(),
            client,
        }
    }

    pub async fn request<T, B>(
        &self,
        method: Method,
        path: &str,
        body: Option<&B>,
        query: &[(&str, String)],
    ) -> Result<T>
    where
        T: DeserializeOwned,
        B: Serialize + ?Sized,
    {
        let url = format!("{}{}", self.base_url, path);
        let mut req = self
            .client
            .request(method, &url)
            .bearer_auth(&self.api_key)
            .header("Accept", "application/json");

        if !query.is_empty() {
            req = req.query(query);
        }
        if let Some(payload) = body {
            req = req.json(payload);
        }

        let resp = req.send().await?;
        let status = resp.status().as_u16();
        let text = resp.text().await?;
        let envelope: ApiEnvelope = match serde_json::from_str(&text) {
            Ok(env) => env,
            Err(err) => {
                if status >= 400 {
                    return Err(LShorterError::api(status, text, None));
                }
                return Err(LShorterError::Json(err));
            }
        };

        if status >= 400 || !envelope.success {
            return Err(LShorterError::api(
                status,
                envelope.error.unwrap_or_else(|| format!("HTTP {status}")),
                envelope.code,
            ));
        }

        let data = envelope.data.unwrap_or(Value::Null);
        Ok(serde_json::from_value(data)?)
    }

    pub async fn request_paginated<T>(
        &self,
        path: &str,
        query: &[(&str, String)],
    ) -> Result<PaginatedResponse<T>>
    where
        T: DeserializeOwned,
    {
        let url = format!("{}{}", self.base_url, path);
        let mut req = self
            .client
            .get(&url)
            .bearer_auth(&self.api_key)
            .header("Accept", "application/json");

        if !query.is_empty() {
            req = req.query(query);
        }

        let resp = req.send().await?;
        let status = resp.status().as_u16();
        let text = resp.text().await?;
        let envelope: ApiEnvelope = match serde_json::from_str(&text) {
            Ok(env) => env,
            Err(err) => {
                if status >= 400 {
                    return Err(LShorterError::api(status, text, None));
                }
                return Err(LShorterError::Json(err));
            }
        };

        if status >= 400 || !envelope.success {
            return Err(LShorterError::api(
                status,
                envelope.error.unwrap_or_else(|| format!("HTTP {status}")),
                envelope.code,
            ));
        }

        let data: Vec<T> = serde_json::from_value(envelope.data.unwrap_or(Value::Array(vec![])))?;
        let pagination = envelope.pagination.unwrap_or(Pagination {
            page: 1,
            limit: data.len() as u32,
            total: data.len() as u64,
        });
        Ok(PaginatedResponse { data, pagination })
    }

    pub async fn request_text(&self, path: &str, query: &[(&str, String)]) -> Result<String> {
        let url = format!("{}{}", self.base_url, path);
        let mut req = self.client.get(&url).bearer_auth(&self.api_key);
        if !query.is_empty() {
            req = req.query(query);
        }
        let resp = req.send().await?;
        let status = resp.status().as_u16();
        if status >= 400 {
            let text = resp.text().await.unwrap_or_default();
            if let Ok(env) = serde_json::from_str::<ApiEnvelope>(&text) {
                return Err(LShorterError::api(
                    status,
                    env.error.unwrap_or_else(|| format!("HTTP {status}")),
                    env.code,
                ));
            }
            return Err(LShorterError::api(status, text, None));
        }
        Ok(resp.text().await?)
    }
}
