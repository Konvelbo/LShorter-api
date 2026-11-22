# LShorter — Official Python SDK

Official zero-dependency Python SDK for [LShorter](https://lsho.cc): ultra-fast edge URL shortening, dynamic geo/device routing, PathLock™, retargeting pixels, webhooks, and conversion attribution.

## Installation

```bash
pip install lshorter
```

## Quickstart

```python
import os
from lshorter import LShorter, LShorterError

lsh = LShorter(api_key=os.environ["LSHORTER_API_KEY"])

# 1. Create a short link with targeting & PathLock™
link = lsh.links.create({
    "targetUrl": "https://my-store.com/summer-sale",
    "slug": "summer-2026",
    "geoTargeting": {
        "FR": "https://my-store.fr/summer-sale",
        "US": "https://my-store.com/us-sale",
    },
    "deviceTargeting": {
        "ios": "https://apps.apple.com/app/id123456789",
        "android": "https://play.google.com/store/apps/details?id=com.store",
    },
    "pixels": ["px_meta_main", "px_tiktok_main"],
})
print("Short URL:", link["shortUrl"])

# 2. Track a conversion
lsh.track.conversion(
    event_name="purchase",
    amount=49.99,
    currency="EUR",
    link_id=link["id"],
    click_id="clk_abc123",
    customer={
        "id": "usr_123",
        "email": "alex@example.com",
        "name": "Alex Johnson",
        "avatarUrl": "https://example.com/avatars/alex.jpg",
    },
)

# 3. Query real-time analytics
stats = lsh.analytics.dashboard(link_id=link["id"])
print("Clicks:", stats["totalClicks"], "Revenue:", stats["trackedRevenue"])
```

## Available Modules

| Module | Methods |
| :--- | :--- |
| `lsh.links` | `create`, `list`, `get`, `update`, `delete` |
| `lsh.track` | `conversion`, `list` |
| `lsh.analytics` | `dashboard`, `top`, `links`, `export_csv` |
| `lsh.domains` | `create`, `list`, `get`, `verify`, `delete` |
| `lsh.webhooks` | `list`, `get`, `update`, `delete` *(creation via Dashboard only)* |
| `lsh.pixels` | `list`, `get`, `update`, `delete` *(creation via Dashboard only)* |
| `lsh.notifications` / `lsh.targets` | `list`, `get` *(read-only)* |
