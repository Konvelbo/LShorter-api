# LShorter — Official Go SDK

Zero-dependency Go SDK for [LShorter](https://lsho.cc): ultra-fast edge URL shortening, dynamic geo/device routing, PathLock™, retargeting pixels, webhooks, and conversion attribution.

## Installation

```bash
go get github.com/Konvelbo/LShorter-api/sdks/go
```

## Quickstart

```go
package main

import (
	"context"
	"fmt"
	"log"
	"os"

	lshorter "github.com/Konvelbo/LShorter-api/sdks/go"
)

func main() {
	ctx := context.Background()
	client := lshorter.New(os.Getenv("LSHORTER_API_KEY"))

	// 1. Create a short link with geo-targeting
	link, err := client.Links.Create(ctx, lshorter.CreateLinkOptions{
		TargetURL: "https://my-store.com/summer-sale",
		Slug:      "summer-2026",
		GeoTargeting: map[string]string{
			"FR": "https://my-store.fr/summer-sale",
			"US": "https://my-store.com/us-sale",
		},
		Pixels: []string{"px_meta_main"},
	})
	if err != nil {
		log.Fatal(err)
	}
	fmt.Println("Short URL:", link.ShortURL)

	// 2. Track a conversion
	_, err = client.Track.Conversion(ctx, lshorter.TrackConversionOptions{
		EventName: "purchase",
		Amount:    49.99,
		Currency:  "EUR",
		LinkID:    link.ID,
		Customer: &lshorter.CustomerInput{
			Email: "alex@example.com",
			Name:  "Alex Johnson",
		},
	})
	if err != nil {
		log.Fatal(err)
	}

	// 3. Query real-time analytics
	stats, err := client.Analytics.Dashboard(ctx, link.ID, "", "")
	if err != nil {
		log.Fatal(err)
	}
	fmt.Printf("Clicks: %d | Revenue: %.2f\n", stats.TotalClicks, stats.TrackedRevenue)
}
```
