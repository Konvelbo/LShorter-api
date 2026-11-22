use lshorter::{CreateLinkOptions, CustomerInput, LShorter, TrackConversionOptions};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;

async fn spawn_mock_server() -> String {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();

    tokio::spawn(async move {
        loop {
            let Ok((mut socket, _)) = listener.accept().await else {
                break;
            };
            tokio::spawn(async move {
                let mut buf = vec![0u8; 8192];
                let n = socket.read(&mut buf).await.unwrap_or(0);
                let req = String::from_utf8_lossy(&buf[..n]);
                let first_line = req.lines().next().unwrap_or("");
                let mut parts = first_line.split_whitespace();
                let method = parts.next().unwrap_or("GET");
                let path = parts.next().unwrap_or("/");

                let authorized = req
                    .lines()
                    .any(|l| l.to_ascii_lowercase().starts_with("authorization: bearer lsh_live_test"));

                let (status, content_type, body) = if !authorized {
                    (
                        "401 Unauthorized",
                        "application/json",
                        r#"{"success":false,"error":"Unauthorized","code":"UNAUTHORIZED"}"#.to_string(),
                    )
                } else if method == "POST" && path == "/api/v1/links" {
                    (
                        "201 Created",
                        "application/json",
                        r#"{"success":true,"data":{"id":"link_01","shortUrl":"https://lsho.cc/summer-2026","slug":"summer-2026","targetUrl":"https://example.com"}}"#.to_string(),
                    )
                } else if method == "POST" && path == "/api/v1/track" {
                    (
                        "201 Created",
                        "application/json",
                        r#"{"success":true,"data":{"id":"conv_01","eventName":"purchase","amount":49.99,"currency":"EUR","customerEmail":"alice@example.com"}}"#.to_string(),
                    )
                } else if method == "GET" && path.starts_with("/api/v1/analytics/export") {
                    ("200 OK", "text/csv", "id,amount\nconv_01,49.99\n".to_string())
                } else if method == "GET" && path.starts_with("/api/v1/analytics") {
                    (
                        "200 OK",
                        "application/json",
                        r#"{"success":true,"data":{"totalClicks":120,"uniqueClicks":95,"trackedRevenue":499.0}}"#.to_string(),
                    )
                } else if method == "GET" && path == "/api/v1/pixels" {
                    (
                        "200 OK",
                        "application/json",
                        r#"{"success":true,"data":{"pixels":[{"id":"px_1","platform":"pinterest","pixelId":"26123","name":"Pin","isActive":true}]}}"#.to_string(),
                    )
                } else {
                    (
                        "404 Not Found",
                        "application/json",
                        r#"{"success":false,"error":"Not found"}"#.to_string(),
                    )
                };

                let resp = format!(
                    "HTTP/1.1 {status}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                    body.len()
                );
                let _ = socket.write_all(resp.as_bytes()).await;
            });
        }
    });

    format!("http://{addr}")
}

#[tokio::test]
async fn rust_sdk_end_to_end() {
    let base_url = spawn_mock_server().await;
    let client = LShorter::with_base_url("lsh_live_test", &base_url);

    let link = client
        .links()
        .create(&CreateLinkOptions {
            target_url: "https://example.com".to_string(),
            slug: Some("summer-2026".to_string()),
            ..Default::default()
        })
        .await
        .expect("create link");
    assert_eq!(link.id, "link_01");
    assert_eq!(link.short_url, "https://lsho.cc/summer-2026");

    let conv = client
        .track()
        .conversion(&TrackConversionOptions {
            event_name: "purchase".to_string(),
            link_id: link.id.clone(),
            amount: 49.99,
            currency: Some("EUR".to_string()),
            click_id: None,
            customer: Some(CustomerInput {
                email: Some("alice@example.com".to_string()),
                ..Default::default()
            }),
        })
        .await
        .expect("track conversion");
    assert_eq!(conv.id, "conv_01");
    assert_eq!(conv.customer_email.as_deref(), Some("alice@example.com"));

    let stats = client
        .analytics()
        .dashboard(Some("link_01"), None, None)
        .await
        .expect("analytics dashboard");
    assert_eq!(stats.total_clicks, 120);

    let csv = client
        .analytics()
        .export_csv(Some("link_01"))
        .await
        .expect("export csv");
    assert!(csv.contains("conv_01,49.99"));

    let pixels = client.pixels().list().await.expect("list pixels");
    assert_eq!(pixels[0].platform, "pinterest");

    let webhook_err = client.webhooks().create().await.unwrap_err();
    assert_eq!(webhook_err.status(), Some(403));

    let bad = LShorter::with_base_url("lsh_live_wrong", &base_url);
    let auth_err = bad.pixels().list().await.unwrap_err();
    assert_eq!(auth_err.status(), Some(401));
}
