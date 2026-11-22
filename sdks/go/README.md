# LShorter — Official Go SDK

> **LShorter** est une plateforme moderne et ultra-rapide de raccourcissement de liens, de redirection intelligente à l'Edge (Cloudflare Workers) et de suivi avancé des conversions.

🌐 **Site officiel :** [https://lsho.cc](https://lsho.cc)  
📚 **Documentation :** [https://lsho.cc/docs](https://lsho.cc/docs)  
👤 **Créé par :** **KONVELBO Samuel**

---

## 📌 À quoi sert l'API LShorter ?

L'API et le SDK Go **LShorter** (**zéro dépendance externe**, uniquement la bibliothèque standard Go 1.21+) permettent aux développeurs et aux entreprises d'intégrer facilement un moteur de liens courts performant directement dans leurs applications :

- ⚡ **Redirections Edge ultra-rapides (< 15ms)** propulsées par le réseau mondial Cloudflare.
- 🎯 **Ciblage & Routage intelligent** : Redirigez vos utilisateurs selon leur pays (Géo-ciblage), continent, navigateur ou appareil (iOS, Android, Windows, Mac).
- 🔒 **Sécurité & Liens Protégés** : Protection de liens par mot de passe, expiration automatique, quota de clics et masquage d'URL (*cloaking*).
- 🛡️ **PathLock™ & Isolation de Navigation (Plan PRO)** : Verrouillez vos visiteurs sur une page unique (*strict*) ou un entonnoir de vente (*funnel*) avec écran de sécurité Edge anti-dispersion.
- 🎯 **Pixels de Retargeting (9 régies)** : Associez vos pixels Meta/Facebook, Instagram, Google GA4, YouTube Ads, TikTok, LinkedIn, Pinterest, Snapchat et X directement à vos liens courts.
- 📊 **Analytics & Tracking de conversions** : Mesurez les clics, pays, appareils, revenus générés et exportez vos conversions en CSV.
- 🏷️ **Domaines Personnalisés** : Connectez et vérifiez vos propres noms de domaine de marque facilement.

---

## 📦 Installation

```bash
go get github.com/Konvelbo/LShorter-api/sdks/go
```

---

## 🚀 Démarrage Rapide

### 1. Initialiser le client

Obtenez votre clé API sur votre tableau de bord sur [https://lsho.cc](https://lsho.cc).

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

### 2. Créer un lien court

```go
ctx := context.Background()

link, err := client.Links.Create(ctx, lshorter.CreateLinkOptions{
	TargetURL: "https://mon-site.com/produit-promo",
	Slug:      "promo-ete", // Optionnel : lsho.cc/promo-ete
	Tags:      []string{"marketing", "ete-2026"},
})
if err != nil {
	log.Fatal(err)
}

fmt.Println("Lien court :", link.ShortURL)
```

---

### 3. Créer un lien avec ciblage intelligent & Pixels de Retargeting (Plan PRO)

```go
smartLink, err := client.Links.Create(ctx, lshorter.CreateLinkOptions{
	TargetURL: "https://mon-site.com/default",
	Slug:      "app-download",
	GeoTargeting: map[string]string{
		"FR": "https://mon-site.fr/promo",
		"US": "https://mon-site.com/us-promo",
	},
	DeviceTargeting: map[string]string{
		"ios":     "https://apps.apple.com/app/id123456789",
		"android": "https://play.google.com/store/apps/details?id=com.app",
	},
	// Pixels configurés dans votre Dashboard LShorter :
	Pixels: []string{"px_meta_main", "px_tiktok_main"},
})
```

---

### 4. Créer un lien avec PathLock™ (Navigation Restreinte / Plan PRO)

Verrouillez vos visiteurs sur une page de destination unique ou isolez un entonnoir de conversion multi-étapes sans risque de dispersion :

```go
pathLocked, err := client.Links.Create(ctx, lshorter.CreateLinkOptions{
	TargetURL:        "https://maboutique.com/produit-luxe",
	Slug:             "produit-valide",
	// Mode d'isolation : "strict" (mono-page) | "funnel" (entonnoir & sous-chemins)
	PathLockMode:     "strict",
	PathLockPrefix:   "produit-luxe",
	PathLockPassword: "MonMotDePasseSecurite",
	PathLockMessage:  "La navigation est restreinte à cette page de présentation.",
})
```

---

### 5. Suivre une conversion & Attribution Financière (E-commerce / Inscription / Vente)

Attribuez vos ventes, vos inscriptions et vos montants financiers à vos liens raccourcis avec l'identité complète du client (Avatar, Nom complet, Email) :

```go
_, err = client.Track.Conversion(ctx, lshorter.TrackConversionOptions{
	EventName: "purchase",
	Amount:    49.99,
	Currency:  "EUR",
	LinkID:    link.ID, // Ou slug du lien (ex: "promo-ete")
	ClickID:   "clk_9921ab01",
	Customer: &lshorter.CustomerInput{
		ID:        "usr_123",
		Email:     "client@example.com",
		Name:      "Jean Dupont",
		FullName:  "Jean Dupont",
		AvatarURL: "https://example.com/avatars/jean.jpg",
	},
})
```

> 💡 **Remarque :** L'avatar fourni lors de la conversion est stocké dans la base de données Cloudflare D1 et s'affiche instantanément à l'extrême gauche de la liste des bénéficiaires sur la page d'analyse des revenus de LShorter.

---

### 6. Consulter les statistiques & exporter en CSV

```go
stats, err := client.Analytics.Dashboard(ctx, link.ID, "", "")
if err != nil {
	log.Fatal(err)
}

fmt.Printf("Total de clics : %d | Revenus : %.2f EUR\n", stats.TotalClicks, stats.TrackedRevenue)

// Top pays & appareils
top, _ := client.Analytics.Top(ctx, link.ID)
fmt.Println("Top Audience :", top)

// Export CSV des conversions (Plan PRO)
csvContent, _ := client.Analytics.ExportCSV(ctx, link.ID)
```

---

### 7. Gestion des erreurs typées

```go
var apiErr *lshorter.Error
if errors.As(err, &apiErr) {
	log.Printf("Erreur HTTP %d (%s) : %s", apiErr.Status, apiErr.Code, apiErr.Message)
}
```

---

## 🛠️ Méthodes Disponibles dans le SDK

| Module | Méthode | Description |
| :--- | :--- | :--- |
| `client.Links` | `.Create(ctx, opts)` | Créer un nouveau lien court (routage, PathLock™, mot de passe, pixels, etc.) |
| `client.Links` | `.List(ctx, page, limit)` | Lister ses liens avec pagination |
| `client.Links` | `.Get(ctx, id)` | Récupérer les détails d'un lien |
| `client.Links` | `.Update(ctx, id, opts)` | Modifier l'URL cible, tags ou règles de routage d'un lien |
| `client.Links` | `.Delete(ctx, id)` | Supprimer un lien et purger le cache Edge |
| `client.Track` | `.Conversion(ctx, opts)` | Enregistrer une conversion financière liée à un lien |
| `client.Track` | `.List(ctx, page, limit, linkID)` | Lister l'historique paginé des conversions |
| `client.Analytics` | `.Dashboard(ctx, linkID, from, to)` | Consulter le tableau de bord complet des métriques |
| `client.Analytics` | `.Top(ctx, linkID)` | Top pays et top appareils |
| `client.Analytics` | `.Links(ctx, limit)` | Statistiques agrégées par lien |
| `client.Analytics` | `.ExportCSV(ctx, linkID)` | Exporter les conversions en CSV *(Plan PRO)* |
| `client.Domains` | `.List` / `.Create` / `.Verify` / `.Delete` | Gérer et vérifier ses domaines personnalisés |
| `client.Webhooks` | `.Create` / `.List` / `.Get` / `.Update` / `.Delete` | Créer et gérer ses webhooks *(Plan PRO+)* |
| `client.Pixels` | `.Create` / `.List` / `.Get` / `.Update` / `.Delete` | Créer et gérer ses pixels de retargeting (9 plateformes — *Plan PRO+*) |
| `client.Notifications` / `.Targets` | `.List(ctx)` / `.Get(ctx, id)` | Consulter ses alertes et objectifs *(création exclusive via Dashboard)* |

> 🔒 **Sécurité Webhooks, Pixels & Notifications :** La création et la gestion complète des webhooks (`client.Webhooks.Create(ctx, opts)`) et des pixels de retargeting (`client.Pixels.Create(ctx, opts)`) via le SDK nécessitent un forfait **PRO, BUSINESS ou ENTERPRISE** et sont sécurisées côté serveur (isolation multi-tenant, anti-SSRF/XSS, rate limiting et quotas). Seule la création d'alertes/notifications reste réservée au Dashboard Web LShorter.

---

## 👨‍💻 Auteur & Support

- **Développé par :** **KONVELBO Samuel**
- **Plateforme Officielle :** [https://lsho.cc](https://lsho.cc)
- **Code source :** [https://github.com/Konvelbo/LShorter-api](https://github.com/Konvelbo/LShorter-api)
- **Licence :** MIT
