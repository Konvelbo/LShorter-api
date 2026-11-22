# LShorter — Official Rust SDK (`lshorter-api`)

> **LShorter** est une plateforme moderne et ultra-rapide de raccourcissement de liens, de redirection intelligente à l'Edge (Cloudflare Workers) et de suivi avancé des conversions.

🌐 **Site officiel :** [https://lsho.cc](https://lsho.cc)  
📚 **Documentation :** [https://lsho.cc/docs](https://lsho.cc/docs)  
👤 **Créé par :** **KONVELBO Samuel**

---

## 📌 À quoi sert l'API LShorter ?

L'API et le SDK Rust asynchrone **LShorter** (`reqwest` + `rustls` + `serde`) permettent aux développeurs et aux entreprises d'intégrer facilement un moteur de liens courts performant directement dans leurs applications :

- ⚡ **Redirections Edge ultra-rapides (< 15ms)** propulsées par le réseau mondial Cloudflare.
- 🎯 **Ciblage, Routage intelligent & A/B Testing (Plan PRO)** : Redirigez vos visiteurs selon leur pays (Géo-ciblage), continent, navigateur, OS, appareil (iOS, Android, Windows, Mac) ou pondération A/B.
- 🔒 **Sécurité & Liens Protégés** : Protection de liens par mot de passe, expiration automatique, quota de clics (`max_clicks` + `fallback_url`), `hide_referrer` et masquage d'URL (*cloaking*).
- 🛡️ **PathLock™ & Isolation de Navigation (Plan PRO)** : Verrouillez vos visiteurs sur une page unique (*strict*) ou un entonnoir de vente (*funnel*) avec écran de sécurité Edge anti-dispersion.
- 🎯 **Pixels de Retargeting — 9 plateformes (Plan PRO+)** : Créez et injectez vos pixels **Meta/Facebook, Instagram, Google GA4, YouTube Ads, TikTok, LinkedIn, Pinterest, Snapchat et X** directement sur vos liens courts avec CSP stricte.
- 🔔 **Webhooks temps réel signés HMAC-SHA256 (Plan PRO+)** : Créez et gérez vos endpoints d'écoute sur 12 événements (`click.created`, `conversion.created`, `qr.scanned`, etc.).
- 📊 **Analytics & Tracking de conversions** : Mesurez les clics, pays, appareils, revenus générés (EPC) et exportez vos conversions en CSV.
- 🏷️ **Domaines Personnalisés** : Connectez, vérifiez via DNS et gérez vos propres noms de domaine de marque.

---

## 📦 Installation

Ajoutez la crate officielle à votre projet Rust :

```bash
cargo add lshorter-api
```

Ou dans votre `Cargo.toml` :

```toml
[dependencies]
lshorter-api = "1.0"
tokio = { version = "1", features = ["macros", "rt-multi-thread"] }
```

*(Le module Rust exposé se nomme `lshorter` : importez simplement `use lshorter::LShorter;`.)*

---

## 🚀 Démarrage Rapide

### 1. Initialiser le client

Obtenez votre clé API dans votre tableau de bord sur [https://lsho.cc](https://lsho.cc) (*Paramètres > API & Clés*).

```rust
use lshorter::LShorter;

let api_key = std::env::var("LSHORTER_API_KEY").expect("LSHORTER_API_KEY manquante");
let lsh = LShorter::new(api_key);
// Optionnel : URL personnalisée
// let lsh = LShorter::with_base_url(api_key, "https://lsho.cc");
```

---

### 2. Créer, lister, modifier et supprimer un lien court

```rust
use lshorter::{CreateLinkOptions, LShorter};
use serde_json::json;

#[tokio::main]
async fn main() -> lshorter::Result<()> {
    let lsh = LShorter::new(std::env::var("LSHORTER_API_KEY").unwrap());

    let link = lsh
        .links()
        .create(&CreateLinkOptions {
            target_url: "https://mon-site.com/produit-promo".into(),
            slug: Some("promo-ete".into()),
            tags: Some(vec!["marketing".into(), "ete-2026".into()]),
            password: Some("MotDePasseOptionnel".into()),
            max_clicks: Some(500),
            expires_at: Some("2026-12-31T23:59:59Z".into()),
            fallback_url: Some("https://mon-site.com/offre-terminee".into()),
            hide_referrer: Some(true),
            og_title: Some("Offre Été -40%".into()),
            banner_style: Some("large_banner".into()),
            ..Default::default()
        })
        .await?;

    println!("Lien court : {}", link.short_url);

    // Lister, consulter, mettre en pause ou supprimer
    let _page = lsh.links().list(Some(1), Some(20)).await?;
    let _details = lsh.links().get(&link.id).await?;
    lsh.links().update(&link.id, &json!({ "isActive": false })).await?;
    lsh.links().delete(&link.id).await?;
    Ok(())
}
```

---

### 3. Ciblage intelligent, Routage multi-conditions & A/B Testing (Plan PRO)

```rust
use lshorter::{AbVariation, CreateLinkOptions};
use serde_json::json;
use std::collections::HashMap;

let mut geo = HashMap::new();
geo.insert("FR".into(), "https://mon-site.fr/promo".into());
geo.insert("US".into(), "https://mon-site.com/us-promo".into());

let mut devices = HashMap::new();
devices.insert("ios".into(), "https://apps.apple.com/app/id123456789".into());
devices.insert("android".into(), "https://play.google.com/store/apps/details?id=com.app".into());

let smart_link = lsh
    .links()
    .create(&CreateLinkOptions {
        target_url: "https://mon-site.com/default".into(),
        slug: Some("app-download".into()),
        routing_rules: Some(vec![json!({
            "id": "rule_fr",
            "title": "Visiteurs France",
            "destinationUrl": "https://mon-site.com/fr",
            "conditions": [{ "id": "c1", "type": "pays", "operator": "est", "value": "FR" }]
        })]),
        geo_targeting: Some(geo),
        device_targeting: Some(devices),
        ab_variations: Some(vec![AbVariation {
            url: "https://mon-site.com/variante-b".into(),
            weight: 30.0,
        }]),
        main_weight: Some(70.0),
        redirect_type: Some("302".into()),
        pass_params: Some(true),
        ..Default::default()
    })
    .await?;
```

---

### 4. Créer un lien avec PathLock™ (Navigation Restreinte — Plan PRO)

```rust
let path_locked = lsh
    .links()
    .create(&CreateLinkOptions {
        target_url: "https://maboutique.com/produit-luxe".into(),
        slug: Some("produit-valide".into()),
        path_lock_mode: Some("strict".into()), // "off" | "strict" | "funnel"
        path_lock_prefix: Some("produit-luxe".into()),
        path_lock_password: Some("MonMotDePasseSecurite".into()),
        path_lock_message: Some("La navigation est restreinte à cette page de présentation.".into()),
        ..Default::default()
    })
    .await?;
```

---

### 5. Pixels de Retargeting — 9 plateformes (Plan PRO+)

Plateformes prises en charge : `meta` (`facebook`), `instagram`, `google` (`google_tag`), `youtube`, `tiktok`, `linkedin`, `pinterest`, `snapchat`, `x` (`twitter`).

```rust
use lshorter::{CreateLinkOptions, CreatePixelOptions};
use serde_json::json;

// 1. Enregistrer un pixel (ex. Pinterest Tag)
let pixel = lsh
    .pixels()
    .create(&CreatePixelOptions {
        platform: "pinterest".into(),
        pixel_id: "2612345678901".into(),
        name: "Pinterest Ads — Campagne Q4".into(),
        is_active: Some(true),
    })
    .await?;

// 2. Associer vos pixels lors de la création d'un lien court
let tracked_link = lsh
    .links()
    .create(&CreateLinkOptions {
        target_url: "https://maboutique.com/offre".into(),
        pixels: Some(vec![pixel.id.clone()]),
        ..Default::default()
    })
    .await?;

// 3. Lister, consulter, mettre en pause ou supprimer
let _all_pixels = lsh.pixels().list().await?;
let _one_pixel = lsh.pixels().get(&pixel.id).await?;
lsh.pixels().update(&pixel.id, &json!({ "isActive": false })).await?;
lsh.pixels().delete(&pixel.id).await?;
```

---

### 6. Webhooks temps réel signés HMAC-SHA256 (Plan PRO+)

Événements supportés : `click.created`, `click.unique`, `conversion.created`, `link.created`, `link.updated`, `link.deleted`, `link.expired`, `qr.scanned`, `target.reached`, `subscription.activated`, `subscription.cancelled`, `subscription.renewed`.

```rust
use lshorter::CreateWebhookOptions;
use serde_json::json;

let webhook = lsh
    .webhooks()
    .create(&CreateWebhookOptions {
        url: "https://mon-serveur.com/api/webhooks/lshorter".into(),
        events: Some(vec![
            "click.created".into(),
            "conversion.created".into(),
            "qr.scanned".into(),
        ]),
        ..Default::default()
    })
    .await?;

println!("Secret HMAC : {:?}", webhook.secret_key);

// Lister, consulter, modifier ou supprimer
let _all_wh = lsh.webhooks().list().await?;
let _one_wh = lsh.webhooks().get(&webhook.id).await?;
lsh.webhooks().update(&webhook.id, &json!({ "isActive": false })).await?;
lsh.webhooks().delete(&webhook.id).await?;
```

---

### 7. Suivre une conversion & Attribution Financière

```rust
use lshorter::{CustomerInput, TrackConversionOptions};

lsh.track()
    .conversion(&TrackConversionOptions {
        event_name: "purchase".into(),
        link_id: link.id.clone(),
        amount: 49.99,
        currency: Some("EUR".into()),
        click_id: Some("clk_9921ab01".into()),
        customer: Some(CustomerInput {
            id: Some("usr_123".into()),
            email: Some("client@example.com".into()),
            name: Some("Jean Dupont".into()),
            avatar_url: Some("https://example.com/avatars/jean.jpg".into()),
        }),
    })
    .await?;

let _conversions = lsh.track().list(Some(1), Some(20), Some(&link.id)).await?;
```

---

### 8. Analytics & export CSV

```rust
let stats = lsh.analytics().dashboard(Some(&link.id), None, None).await?;
let top = lsh.analytics().top(Some(&link.id)).await?;
let top_links = lsh.analytics().links(Some(10)).await?;
let csv = lsh.analytics().export_csv(Some(&link.id)).await?; // Plan PRO+

println!("Clics : {} | Revenus : {} EUR", stats.total_clicks, stats.tracked_revenue);
```

---

### 9. Domaines personnalisés

```rust
let domain = lsh.domains().create("go.ma-marque.com").await?;
let _domains = lsh.domains().list().await?;
let _status = lsh.domains().get(&domain.id).await?;
let _verified = lsh.domains().verify(&domain.id).await?;
lsh.domains().delete(&domain.id).await?;
```

---

### 10. Notifications / Objectifs & Gestion des erreurs typées

```rust
use lshorter::LShorterError;

// Consulter vos alertes & objectifs (création réservée au Dashboard)
let _alerts = lsh.notifications().list().await?; // alias : lsh.targets().list()

// Gestion des erreurs typées
match lsh.links().get("slug-inexistant").await {
    Ok(link) => println!("Trouvé : {}", link.short_url),
    Err(LShorterError::Api { status, code, message }) => {
        eprintln!("Erreur HTTP {status} ({code:?}) : {message}");
    }
    Err(err) => eprintln!("Erreur transport : {err}"),
}
```

---

## 🛠️ Référence des Méthodes du SDK

| Module | Méthode | Description |
| :--- | :--- | :--- |
| `lsh.links()` | `.create(&opts)` | Créer un lien court (routage, A/B, PathLock™, mot de passe, pixels, OG) |
| `lsh.links()` | `.list(page, limit)` | Lister ses liens avec pagination |
| `lsh.links()` | `.get(id)` | Récupérer les détails d'un lien (mots de passe masqués) |
| `lsh.links()` | `.update(id, &patch)` | Modifier la destination, le statut, les tags, les pixels ou le routage |
| `lsh.links()` | `.delete(id)` | Supprimer un lien et purger le cache Edge |
| `lsh.track()` | `.conversion(&opts)` | Enregistrer une conversion financière liée à un lien |
| `lsh.track()` | `.list(page, limit, link_id)` | Lister l'historique paginé des conversions |
| `lsh.analytics()` | `.dashboard(link_id, from, to)` | Tableau de bord complet des métriques |
| `lsh.analytics()` | `.top(link_id)` | Top pays, top appareils et top navigateurs |
| `lsh.analytics()` | `.links(limit)` | Classement des liens les plus performants |
| `lsh.analytics()` | `.export_csv(link_id)` | Exporter les conversions en CSV *(Plan PRO+)* |
| `lsh.domains()` | `.create(domain)` / `.list()` / `.get(id)` / `.verify(id)` / `.delete(id)` | Gérer et vérifier ses domaines personnalisés |
| `lsh.webhooks()` | `.create(&opts)` / `.list()` / `.get(id)` / `.update(id, &patch)` / `.delete(id)` | Créer et gérer ses webhooks *(Plan PRO+)* |
| `lsh.pixels()` | `.create(&opts)` / `.list()` / `.get(id)` / `.update(id, &patch)` / `.delete(id)` | Créer et gérer ses pixels de retargeting (9 plateformes — *Plan PRO+*) |
| `lsh.notifications()` / `.targets()` | `.list()` / `.get(id)` | Consulter ses alertes et objectifs *(création exclusive via Dashboard)* |

> 🔒 **Sécurité côté serveur :**
> - **Webhooks & Pixels** : disponibles via le SDK dès le forfait **PRO** avec isolation stricte par compte, validation anti-SSRF / anti-boucle / anti-XSS, rate limiting (`20 req/min`) et plafonds par compte (25 webhooks, 50 pixels).
> - **Protection PII & Alertes** : les routes de profil (`/api/v1/users/me`), la gestion des clés API et la création d'alertes/notifications (`lsh.notifications()`) restent strictement réservées au Dashboard Web [https://lsho.cc](https://lsho.cc) (`403 Forbidden`).

---

## 👨‍💻 Auteur & Support

- **Développé par :** **KONVELBO Samuel**
- **Plateforme Officielle :** [https://lsho.cc](https://lsho.cc)
- **Code source :** [https://github.com/Konvelbo/LShorter-api](https://github.com/Konvelbo/LShorter-api)
- **Licence :** MIT
