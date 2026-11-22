# LShorter — Official Go SDK

> **LShorter** est une plateforme moderne et ultra-rapide de raccourcissement de liens, de redirection intelligente à l'Edge (Cloudflare Workers) et de suivi avancé des conversions.

🌐 **Site officiel :** [https://lsho.cc](https://lsho.cc)  
📚 **Documentation :** [https://lsho.cc/docs](https://lsho.cc/docs)  
👤 **Créé par :** **KONVELBO Samuel**

---

## 📌 À quoi sert l'API LShorter ?

L'API et le SDK Go **LShorter** (**zéro dépendance externe**, uniquement la bibliothèque standard Go 1.21+) permettent aux développeurs et aux entreprises d'intégrer facilement un moteur de liens courts performant directement dans leurs applications :

- ⚡ **Redirections Edge ultra-rapides (< 15ms)** propulsées par le réseau mondial Cloudflare.
- 🎯 **Ciblage, Routage intelligent & A/B Testing (Plan PRO)** : Redirigez vos visiteurs selon leur pays (Géo-ciblage), continent, navigateur, OS, appareil (iOS, Android, Windows, Mac) ou pondération A/B.
- 🔒 **Sécurité & Liens Protégés** : Protection de liens par mot de passe, expiration automatique, quota de clics (`MaxClicks` + `FallbackURL`), `HideReferrer` et masquage d'URL (*cloaking*).
- 🛡️ **PathLock™ & Isolation de Navigation (Plan PRO)** : Verrouillez vos visiteurs sur une page unique (*strict*) ou un entonnoir de vente (*funnel*) avec écran de sécurité Edge anti-dispersion.
- 🎯 **Pixels de Retargeting — 9 plateformes (Plan PRO+)** : Créez et injectez vos pixels **Meta/Facebook, Instagram, Google GA4, YouTube Ads, TikTok, LinkedIn, Pinterest, Snapchat et X** directement sur vos liens courts avec CSP stricte.
- 🔔 **Webhooks temps réel signés HMAC-SHA256 (Plan PRO+)** : Créez et gérez vos endpoints d'écoute sur 12 événements (`click.created`, `conversion.created`, `qr.scanned`, etc.).
- 📊 **Analytics & Tracking de conversions** : Mesurez les clics, pays, appareils, revenus générés (EPC) et exportez vos conversions en CSV.
- 🏷️ **Domaines Personnalisés** : Connectez, vérifiez via DNS et gérez vos propres noms de domaine de marque.

---

## 📦 Installation

```bash
go get github.com/Konvelbo/LShorter-api/sdks/go
```

---

## 🚀 Démarrage Rapide

### 1. Initialiser le client

Obtenez votre clé API dans votre tableau de bord sur [https://lsho.cc](https://lsho.cc) (*Paramètres > API & Clés*).

```go
package main

import (
	"os"

	lshorter "github.com/Konvelbo/LShorter-api/sdks/go"
)

client := lshorter.New(
	os.Getenv("LSHORTER_API_KEY"),
	// Optionnel : surcharge d'URL ou client HTTP personnalisé
	lshorter.WithBaseURL("https://lsho.cc"),
)
```

---

### 2. Créer, lister, modifier et supprimer un lien court

```go
ctx := context.Background()
maxClicks := 500
hideRef := true

link, err := client.Links.Create(ctx, lshorter.CreateLinkOptions{
	TargetURL:     "https://mon-site.com/produit-promo",
	Slug:          "promo-ete", // Optionnel : lsho.cc/promo-ete
	Tags:          []string{"marketing", "ete-2026"},
	Password:      "MotDePasseOptionnel",
	MaxClicks:     &maxClicks,
	ExpiresAt:     "2026-12-31T23:59:59Z",
	FallbackURL:   "https://mon-site.com/offre-terminee",
	HideReferrer:  &hideRef,
	OgTitle:       "Offre Été -40%",
	OgDescription: "Profitez de notre promotion exclusive.",
	BannerStyle:   "large_banner",
})
if err != nil {
	log.Fatal(err)
}

fmt.Println("Lien court :", link.ShortURL)

// Lister, consulter, mettre en pause ou supprimer
page, _ := client.Links.List(ctx, 1, 20)
_, _ = client.Links.Get(ctx, link.ID)
inactive := false
_, _ = client.Links.Update(ctx, link.ID, lshorter.CreateLinkOptions{IsActive: &inactive})
_, _ = client.Links.Delete(ctx, link.ID)
_ = page
```

---

### 3. Ciblage intelligent, Routage multi-conditions & A/B Testing (Plan PRO)

```go
mainWeight := 70.0
passParams := true

smartLink, err := client.Links.Create(ctx, lshorter.CreateLinkOptions{
	TargetURL: "https://mon-site.com/default",
	Slug:      "app-download",
	RoutingRules: []map[string]any{
		{
			"id":             "rule_fr",
			"title":          "Visiteurs France",
			"destinationUrl": "https://mon-site.com/fr",
			"conditions": []map[string]any{
				{"id": "c1", "type": "pays", "operator": "est", "value": "FR"},
			},
		},
	},
	GeoTargeting: map[string]string{
		"FR": "https://mon-site.fr/promo",
		"US": "https://mon-site.com/us-promo",
	},
	DeviceTargeting: map[string]string{
		"ios":     "https://apps.apple.com/app/id123456789",
		"android": "https://play.google.com/store/apps/details?id=com.app",
	},
	AbVariations: []lshorter.AbVariation{
		{URL: "https://mon-site.com/variante-b", Weight: 30},
	},
	MainWeight:   &mainWeight,
	RedirectType: "302",
	PassParams:   &passParams,
})
```

---

### 4. Créer un lien avec PathLock™ (Navigation Restreinte — Plan PRO)

```go
pathLocked, err := client.Links.Create(ctx, lshorter.CreateLinkOptions{
	TargetURL:        "https://maboutique.com/produit-luxe",
	Slug:             "produit-valide",
	PathLockMode:     "strict", // "off" | "strict" | "funnel"
	PathLockPrefix:   "produit-luxe",
	PathLockPassword: "MonMotDePasseSecurite",
	PathLockMessage:  "La navigation est restreinte à cette page de présentation.",
})
```

---

### 5. Pixels de Retargeting — 9 plateformes (Plan PRO+)

Plateformes prises en charge : `meta` (`facebook`), `instagram`, `google` (`google_tag`), `youtube`, `tiktok`, `linkedin`, `pinterest`, `snapchat`, `x` (`twitter`).

```go
// 1. Enregistrer un pixel (ex. Pinterest Tag)
pixel, err := client.Pixels.Create(ctx, lshorter.CreatePixelOptions{
	Platform: "pinterest",
	PixelID:  "2612345678901",
	Name:     "Pinterest Ads — Campagne Q4",
})

// 2. Associer vos pixels lors de la création d'un lien court
trackedLink, _ := client.Links.Create(ctx, lshorter.CreateLinkOptions{
	TargetURL: "https://maboutique.com/offre",
	Pixels:    []string{pixel.ID},
})

// 3. Lister, consulter, mettre en pause ou supprimer
allPixels, _ := client.Pixels.List(ctx)
onePixel, _ := client.Pixels.Get(ctx, pixel.ID)
_, _ = client.Pixels.Update(ctx, pixel.ID, map[string]any{"isActive": false})
_, _ = client.Pixels.Delete(ctx, pixel.ID)
```

---

### 6. Webhooks temps réel signés HMAC-SHA256 (Plan PRO+)

Événements supportés : `click.created`, `click.unique`, `conversion.created`, `link.created`, `link.updated`, `link.deleted`, `link.expired`, `qr.scanned`, `target.reached`, `subscription.activated`, `subscription.cancelled`, `subscription.renewed`.

```go
// Créer un abonnement webhook (clé secrète HMAC générée automatiquement si omise)
webhook, err := client.Webhooks.Create(ctx, lshorter.CreateWebhookOptions{
	URL:    "https://mon-serveur.com/api/webhooks/lshorter",
	Events: []string{"click.created", "conversion.created", "qr.scanned"},
})
fmt.Println("Secret HMAC :", webhook.SecretKey)

// Lister, consulter, modifier ou supprimer
webhooks, _ := client.Webhooks.List(ctx)
fetched, _ := client.Webhooks.Get(ctx, webhook.ID)
_, _ = client.Webhooks.Update(ctx, webhook.ID, map[string]any{"isActive": false})
_, _ = client.Webhooks.Delete(ctx, webhook.ID)
```

---

### 7. Suivre une conversion & Attribution Financière

```go
_, err = client.Track.Conversion(ctx, lshorter.TrackConversionOptions{
	EventName: "purchase",
	Amount:    49.99,
	Currency:  "EUR",
	LinkID:    link.ID,
	ClickID:   "clk_9921ab01",
	Customer: &lshorter.CustomerInput{
		ID:        "usr_123",
		Email:     "client@example.com",
		Name:      "Jean Dupont",
		FullName:  "Jean Dupont",
		AvatarURL: "https://example.com/avatars/jean.jpg",
	},
})

conversions, _ := client.Track.List(ctx, 1, 20, link.ID)
```

---

### 8. Analytics & export CSV

```go
stats, err := client.Analytics.Dashboard(ctx, link.ID, "", "")
if err != nil {
	log.Fatal(err)
}
fmt.Printf("Total de clics : %d | Revenus : %.2f EUR\n", stats.TotalClicks, stats.TrackedRevenue)

top, _ := client.Analytics.Top(ctx, link.ID)
topLinks, _ := client.Analytics.Links(ctx, 10)
csvContent, _ := client.Analytics.ExportCSV(ctx, link.ID) // Plan PRO+
```

---

### 9. Domaines personnalisés

```go
domain, err := client.Domains.Create(ctx, "go.ma-marque.com")
domains, _ := client.Domains.List(ctx)
status, _ := client.Domains.Get(ctx, domain.ID)
verified, _ := client.Domains.Verify(ctx, domain.ID)
_, _ = client.Domains.Delete(ctx, domain.ID)
```

---

### 10. Notifications / Objectifs & Gestion des erreurs typées

```go
// Consulter vos alertes & objectifs (création réservée au Dashboard)
alerts, _ := client.Notifications.List(ctx) // alias : client.Targets.List(ctx)

// Gestion des erreurs typées
var apiErr *lshorter.Error
if errors.As(err, &apiErr) {
	log.Printf("Erreur HTTP %d (%s) : %s", apiErr.Status, apiErr.Code, apiErr.Message)
}
```

---

## 🛠️ Référence des Méthodes du SDK

| Module | Méthode | Description |
| :--- | :--- | :--- |
| `client.Links` | `.Create(ctx, opts)` | Créer un lien court (routage, A/B, PathLock™, mot de passe, pixels, OG) |
| `client.Links` | `.List(ctx, page, limit)` | Lister ses liens avec pagination |
| `client.Links` | `.Get(ctx, id)` | Récupérer les détails d'un lien (mots de passe masqués) |
| `client.Links` | `.Update(ctx, id, opts)` | Modifier la destination, le statut, les tags, les pixels ou le routage |
| `client.Links` | `.Delete(ctx, id)` | Supprimer un lien et purger le cache Edge |
| `client.Track` | `.Conversion(ctx, opts)` | Enregistrer une conversion financière liée à un lien |
| `client.Track` | `.List(ctx, page, limit, linkID)` | Lister l'historique paginé des conversions |
| `client.Analytics` | `.Dashboard(ctx, linkID, from, to)` | Tableau de bord complet des métriques |
| `client.Analytics` | `.Top(ctx, linkID)` | Top pays, top appareils et top navigateurs |
| `client.Analytics` | `.Links(ctx, limit)` | Classement des liens les plus performants |
| `client.Analytics` | `.ExportCSV(ctx, linkID)` | Exporter les conversions en CSV *(Plan PRO+)* |
| `client.Domains` | `.Create` / `.List` / `.Get` / `.Verify` / `.Delete` | Gérer et vérifier ses domaines personnalisés |
| `client.Webhooks` | `.Create` / `.List` / `.Get` / `.Update` / `.Delete` | Créer et gérer ses webhooks *(Plan PRO+)* |
| `client.Pixels` | `.Create` / `.List` / `.Get` / `.Update` / `.Delete` | Créer et gérer ses pixels de retargeting (9 plateformes — *Plan PRO+*) |
| `client.Notifications` / `.Targets` | `.List(ctx)` / `.Get(ctx, id)` | Consulter ses alertes et objectifs *(création exclusive via Dashboard)* |

> 🔒 **Sécurité côté serveur :**
> - **Webhooks & Pixels** : disponibles via le SDK dès le forfait **PRO** avec isolation stricte par compte, validation anti-SSRF / anti-boucle / anti-XSS, rate limiting (`20 req/min`) et plafonds par compte (25 webhooks, 50 pixels).
> - **Protection PII & Alertes** : les routes de profil (`/api/v1/users/me`), la gestion des clés API et la création d'alertes/notifications (`client.Notifications`) restent strictement réservées au Dashboard Web [https://lsho.cc](https://lsho.cc) (`403 Forbidden`).

---

## 👨‍💻 Auteur & Support

- **Développé par :** **KONVELBO Samuel**
- **Plateforme Officielle :** [https://lsho.cc](https://lsho.cc)
- **Code source :** [https://github.com/Konvelbo/LShorter-api](https://github.com/Konvelbo/LShorter-api)
- **Licence :** MIT
