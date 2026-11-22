# LShorter — Official Rust SDK

Official async Rust SDK for [LShorter](https://lsho.cc): ultra-fast edge URL shortening, dynamic routing, PathLock™, retargeting pixels, webhooks, and conversion tracking.

## Installation

```bash
cargo add lshorter-api
```

## Quickstart

```rust
use lshorter::{CreateLinkOptions, CustomerInput, LShorter, TrackConversionOptions};
use std::collections::HashMap;

#[tokio::main]
async fn main() -> lshorter::Result<()> {
    let api_key = std::env::var("LSHORTER_API_KEY").expect("LSHORTER_API_KEY missing");
    let client = LShorter::new(api_key);

    // 1. Create a short link with geo-targeting
    let mut geo = HashMap::new();
    geo.insert("FR".to_string(), "https://my-store.fr/summer".to_string());
    geo.insert("US".to_string(), "https://my-store.com/us-summer".to_string());

    let link = client
        .links()
        .create(&CreateLinkOptions {
            target_url: "https://my-store.com/summer-sale".to_string(),
            slug: Some("summer-2026".to_string()),
            geo_targeting: Some(geo),
            ..Default::default()
        })
        .await?;
    println!("Short URL: {}", link.short_url);

    // 2. Track a conversion
    client
        .track()
        .conversion(&TrackConversionOptions {
            event_name: "purchase".to_string(),
            link_id: link.id.clone(),
            amount: 49.99,
            currency: Some("EUR".to_string()),
            click_id: Some("clk_abc123".to_string()),
            customer: Some(CustomerInput {
                id: Some("usr_123".to_string()),
                email: Some("alex@example.com".to_string()),
                name: Some("Alex Johnson".to_string()),
                avatar_url: Some("https://example.com/avatars/alex.jpg".to_string()),
            }),
        })
        .await?;

    // 3. Query analytics
    let stats = client.analytics().dashboard(Some(&link.id), None, None).await?;
    println!("Clicks: {}, Revenue: {}", stats.total_clicks, stats.tracked_revenue);

    Ok(())
}
```
