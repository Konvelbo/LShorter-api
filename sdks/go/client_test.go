package lshorter_test

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	lshorter "github.com/Konvelbo/LShorter-api/sdks/go"
)

func TestGoSDKEndToEnd(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer lsh_live_test" {
			w.WriteHeader(http.StatusUnauthorized)
			_ = json.NewEncoder(w).Encode(map[string]any{
				"success": false, "error": "Unauthorized", "code": "UNAUTHORIZED",
			})
			return
		}

		switch {
		case r.Method == http.MethodPost && r.URL.Path == "/api/v1/links":
			w.WriteHeader(http.StatusCreated)
			_ = json.NewEncoder(w).Encode(map[string]any{
				"success": true,
				"data": map[string]any{
					"id":        "link_01",
					"slug":      "summer-2026",
					"shortUrl":  "https://lsho.cc/summer-2026",
					"targetUrl": "https://example.com",
					"isActive":  true,
				},
			})
		case r.Method == http.MethodPost && r.URL.Path == "/api/v1/track":
			w.WriteHeader(http.StatusCreated)
			_ = json.NewEncoder(w).Encode(map[string]any{
				"success": true,
				"data": map[string]any{
					"id":            "conv_01",
					"eventName":     "purchase",
					"amount":        49.99,
					"currency":      "EUR",
					"customerEmail": "alice@example.com",
					"linkId":        "link_01",
				},
			})
		case r.Method == http.MethodGet && r.URL.Path == "/api/v1/analytics/export":
			w.Header().Set("Content-Type", "text/csv")
			_, _ = w.Write([]byte("id,amount\nconv_01,49.99\n"))
		case r.Method == http.MethodGet && r.URL.Path == "/api/v1/analytics":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"success": true,
				"data":    map[string]any{"totalClicks": 120, "uniqueClicks": 95, "trackedRevenue": 499.0},
			})
		case r.Method == http.MethodGet && r.URL.Path == "/api/v1/pixels":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"success": true,
				"data": map[string]any{
					"pixels": []map[string]any{
						{"id": "px_1", "platform": "pinterest", "pixelId": "26123", "name": "Pin", "isActive": true},
					},
				},
			})
		default:
			w.WriteHeader(http.StatusNotFound)
			_ = json.NewEncoder(w).Encode(map[string]any{"success": false, "error": "Not found"})
		}
	}))
	defer srv.Close()

	ctx := context.Background()
	client := lshorter.New("lsh_live_test", lshorter.WithBaseURL(srv.URL))

	link, err := client.Links.Create(ctx, lshorter.CreateLinkOptions{
		TargetURL: "https://example.com",
		Slug:      "summer-2026",
	})
	if err != nil || link.ShortURL != "https://lsho.cc/summer-2026" {
		t.Fatalf("unexpected create link result: link=%+v err=%v", link, err)
	}

	conv, err := client.Track.Conversion(ctx, lshorter.TrackConversionOptions{
		EventName: "purchase",
		Amount:    49.99,
		Currency:  "EUR",
		LinkID:    link.ID,
		Customer:  &lshorter.CustomerInput{Email: "alice@example.com"},
	})
	if err != nil || conv.CustomerEmail != "alice@example.com" {
		t.Fatalf("unexpected conversion result: conv=%+v err=%v", conv, err)
	}

	stats, err := client.Analytics.Dashboard(ctx, link.ID, "", "")
	if err != nil || stats.TotalClicks != 120 {
		t.Fatalf("unexpected analytics result: stats=%+v err=%v", stats, err)
	}

	csvOut, err := client.Analytics.ExportCSV(ctx, link.ID)
	if err != nil || !strings.Contains(csvOut, "conv_01,49.99") {
		t.Fatalf("unexpected csv output: %q err=%v", csvOut, err)
	}

	pixels, err := client.Pixels.List(ctx)
	if err != nil || len(pixels) != 1 || pixels[0].Platform != "pinterest" {
		t.Fatalf("unexpected pixels: %+v err=%v", pixels, err)
	}

	if _, err := client.Webhooks.Create(ctx); err == nil {
		t.Fatalf("expected 403 error from webhooks.Create")
	} else {
		var apiErr *lshorter.Error
		if !errors.As(err, &apiErr) || apiErr.Status != 403 {
			t.Fatalf("expected 403 *lshorter.Error, got %v", err)
		}
	}
}
