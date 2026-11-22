use thiserror::Error;

/// Error type returned by all LShorter SDK operations.
#[derive(Debug, Error)]
pub enum LShorterError {
    #[error("LShorter API error (HTTP {status}): {message}")]
    Api {
        status: u16,
        code: Option<String>,
        message: String,
    },

    #[error("HTTP transport error: {0}")]
    Http(#[from] reqwest::Error),

    #[error("JSON serialization error: {0}")]
    Json(#[from] serde_json::Error),
}

impl LShorterError {
    pub fn api(status: u16, message: impl Into<String>, code: Option<String>) -> Self {
        Self::Api {
            status,
            code,
            message: message.into(),
        }
    }

    pub fn status(&self) -> Option<u16> {
        match self {
            Self::Api { status, .. } => Some(*status),
            Self::Http(err) => err.status().map(|s| s.as_u16()),
            Self::Json(_) => None,
        }
    }
}

pub type Result<T> = std::result::Result<T, LShorterError>;
