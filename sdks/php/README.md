# LShorter — Official PHP SDK

Zero-dependency PHP 8.1+ SDK for [LShorter](https://lsho.cc): ultra-fast edge URL shortening, dynamic geo/device routing, PathLock™, retargeting pixels, webhooks, and conversion attribution.

## Installation

```bash
composer require lshorter/lshorter-php
```

## Quickstart

```php
<?php

require __DIR__ . '/vendor/autoload.php';

use LShorter\LShorter;

$lsh = new LShorter(getenv('LSHORTER_API_KEY'));

// 1. Create a short link with geo-targeting & pixels
$link = $lsh->links->create([
    'targetUrl' => 'https://my-store.com/summer-sale',
    'slug' => 'summer-2026',
    'geoTargeting' => [
        'FR' => 'https://my-store.fr/summer-sale',
        'US' => 'https://my-store.com/us-sale',
    ],
    'pixels' => ['px_meta_main'],
]);

echo "Short URL: " . $link['shortUrl'] . PHP_EOL;

// 2. Track a conversion
$lsh->track->conversion([
    'eventName' => 'purchase',
    'amount' => 49.99,
    'currency' => 'EUR',
    'linkId' => $link['id'],
    'customer' => [
        'email' => 'alex@example.com',
        'name' => 'Alex Johnson',
        'avatarUrl' => 'https://example.com/avatars/alex.jpg',
    ],
]);

// 3. Query real-time analytics
$stats = $lsh->analytics->dashboard($link['id']);
echo "Clicks: " . $stats['totalClicks'] . " | Revenue: " . $stats['trackedRevenue'] . PHP_EOL;
```
