# LShorter — Official Rust SDK (`lshorter-api`)

> **LShorter** est une plateforme moderne et ultra-rapide de raccourcissement de liens, de redirection intelligente à l'Edge (Cloudflare Workers) et de suivi avancé des conversions.

🌐 **Site officiel :** [https://lsho.cc](https://lsho.cc)  
📚 **Documentation :** [https://lsho.cc/docs](https://lsho.cc/docs)  
👤 **Créé par :** **KONVELBO Samuel**

---

## 📌 À quoi sert l'API LShorter ?

L'API et le SDK Rust asynchrone **LShorter** (`reqwest` + `rustls` + `serde`) permettent aux développeurs et aux entreprises d'intégrer facilement un moteur de liens courts performant directement dans leurs applications :

- ⚡ **Redirections Edge ultra-rapides (< 15ms)** propulsées par le réseau mondial Cloudflare.
- 🎯 **Ciblage & Routage intelligent** : Redirigez vos utilisateurs selon leur pays (Géo-ciblage), continent, navigateur ou appareil (iOS, Android, Windows, Mac).
- 🔒 **Sécurité & Liens Protégés** : Protection de liens par mot de passe, expiration automatique, quota de clics et masquage d'URL (*cloaking*).
- 🛡️ **PathLock™ & Isolation de Navigation (Plan PRO)** : Verrouillez vos visiteurs sur une page unique (*strict*) ou un entonnoir de vente (*funnel*) avec écran de sécurité Edge anti-dispersion.
- 🎯 **Pixels de Retargeting (9 régies)** : Associez vos pixels Meta/Facebook, Instagram, Google GA4, YouTube Ads, TikTok, LinkedIn, Pinterest, Snapchat et X directement à vos liens courts.
- 📊 **Analytics & Tracking de conversions** : Mesurez les clics, pays, appareils, revenus générés et exportez vos conversions en CSV.
- 🏷️ **Domaines Personnalisés** : Connectez et vérifiez vos propres noms de domaine de marque facilement.

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

Obtenez votre clé API sur votre tableau de bord sur [https://lsho.cc](https://lsho.cc).

```rust
use lshorter::LShorter;

let api_key = std::env::var("LSHORTER_API_KEY").expect("LSHORTER_API_KEY manquante");
let lsh = LShorter::new(api_key);
// Optionnel : URL personnalisée
// let lsh = LShorter::with_base_url(api_key, "https://lsho.cc");
```

---

### 2. Créer un lien court

```rust
use lshorter::{CreateLinkOptions, LShorter};

#[tokio::main]
async fn main() -> lshorter::Result<()> {
    let lsh = LShorter::new(std::env::var("LSHORTER_API_KEY").unwrap());

    let link = lsh
        .links()
        .create(&CreateLinkOptions {
            target_url: "https://mon-site.com/produit-promo".into(),
            slug: Some("promo-ete".into()), // Optionnel : lsho.cc/promo-ete
            tags: Some(vec!["marketing".into(), "ete-2026".into()]),
            ..Default::default()
        })
        .await?;

    println!("Lien court : {}", link.short_url);
    Ok(())
}
```

---

### 3. Créer un lien avec ciblage intelligent & Pixels de Retargeting (Plan PRO)

```rust
use lshorter::CreateLinkOptions;
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
        geo_targeting: Some(geo),
        device_targeting: Some(devices),
        pixels: Some(vec!["px_meta_main".into(), "px_tiktok_main".into()]),
        ..Default::default()
    })
    .await?;
```

---

### 4. Créer un lien avec PathLock™ (Navigation Restreinte / Plan PRO)

Verrouillez vos visiteurs sur une page de destination unique ou isolez un entonnoir de conversion multi-étapes sans risque de dispersion :

```rust
let path_locked = lsh
    .links()
    .create(&CreateLinkOptions {
        target_url: "https://maboutique.com/produit-luxe".into(),
        slug: Some("produit-valide".into()),
        // Mode d'isolation : "strict" (mono-page) | "funnel" (entonnoir & sous-chemins)
        path_lock_mode: Some("strict".into()),
        path_lock_prefix: Some("produit-luxe".into()),
        path_lock_password: Some("MonMotDePasseSecurite".into()),
        path_lock_message: Some("La navigation est restreinte à cette page de présentation.".into()),
        ..Default::default()
    })
    .await?;

println!("Lien sécurisé PathLock : {}", path_locked.short_url);
```

---

### 5. Suivre une conversion & Attribution Financière (E-commerce / Inscription / Vente)

Attribuez vos ventes, vos inscriptions et vos montants financiers à vos liens raccourcis avec l'identité complète du client (Avatar, Nom complet, Email) :

```rust
use lshorter::{CustomerInput, TrackConversionOptions};

lsh.track()
    .conversion(&TrackConversionOptions {
        event_name: "purchase".into(),
        link_id: link.id.clone(), // Ou slug du lien (ex: "promo-ete")
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
```

> 💡 **Remarque :** L'avatar fourni lors de la conversion est stocké dans la base de données Cloudflare D1 et s'affiche instantanément à l'extrême gauche de la liste des bénéficiaires sur la page d'analyse des revenus de LShorter.

---

### 6. Consulter les statistiques & exporter en CSV

```rust
let stats = lsh.analytics().dashboard(Some(&link.id), None, None).await?;
let top = lsh.analytics().top(Some(&link.id)).await?;

println!("Total de clics : {}", stats.total_clicks);
println!("Revenus suivis : {} EUR", stats.tracked_revenue);
println!("Top Audience : {top}");

// Export CSV des conversions (Plan PRO)
let csv = lsh.analytics().export_csv(Some(&link.id)).await?;
```

---

### 7. Gestion des erreurs typées

```rust
use lshorter::LShorterError;

match lsh.links().get("slug-inexistant").await {
    Ok(link) => println!("Trouvé : {}", link.short_url),
    Err(LShorterError::Api { status, code, message }) => {
        eprintln!("Erreur HTTP {status} ({code:?}) : {message}");
    }
    Err(err) => eprintln!("Erreur transport : {err}"),
}
```

---

## 🛠️ Méthodes Disponibles dans le SDK

| Module | Méthode | Description |
| :--- | :--- | :--- |
| `lsh.links()` | `.create(&opts)` | Créer un nouveau lien court (routage, PathLock™, mot de passe, pixels, etc.) |
| `lsh.links()` | `.list(page, limit)` | Lister ses liens avec pagination |
| `lsh.links()` | `.get(id)` | Récupérer les détails d'un lien |
| `lsh.links()` | `.update(id, &patch)` | Modifier l'URL cible, tags ou règles de routage d'un lien |
| `lsh.links()` | `.delete(id)` | Supprimer un lien et purger le cache Edge |
| `lsh.track()` | `.conversion(&opts)` | Enregistrer une conversion financière liée à un lien |
| `lsh.track()` | `.list(page, limit, link_id)` | Lister l'historique paginé des conversions |
| `lsh.analytics()` | `.dashboard(link_id, from, to)` | Consulter le tableau de bord complet des métriques |
| `lsh.analytics()` | `.top(link_id)` | Top pays et top appareils |
| `lsh.analytics()` | `.links(limit)` | Statistiques agrégées par lien |
| `lsh.analytics()` | `.export_csv(link_id)` | Exporter les conversions en CSV *(Plan PRO)* |
| `lsh.domains()` | `.list()` / `.create(domain)` / `.verify(id)` / `.delete(id)` | Gérer et vérifier ses domaines personnalisés |
| `lsh.webhooks()` | `.create(&opts)` / `.list()` / `.get(id)` / `.update(id, &patch)` / `.delete(id)` | Créer et gérer ses webhooks *(Plan PRO+)* |
| `lsh.pixels()` | `.create(&opts)` / `.list()` / `.get(id)` / `.update(id, &patch)` / `.delete(id)` | Créer et gérer ses pixels de retargeting (9 plateformes — *Plan PRO+*) |
| `lsh.notifications()` / `.targets()` | `.list()` / `.get(id)` | Consulter ses alertes et objectifs *(création exclusive via Dashboard)* |

> 🔒 **Sécurité Webhooks, Pixels & Notifications :** La création et la gestion complète des webhooks (`lsh.webhooks().create(&opts)`) et des pixels de retargeting (`lsh.pixels().create(&opts)`) via le SDK nécessitent un forfait **PRO, BUSINESS ou ENTERPRISE** et sont sécurisées côté serveur (isolation multi-tenant, anti-SSRF/XSS, rate limiting et quotas). Seule la création d'alertes/notifications reste réservée au Dashboard Web LShorter.

---

## 👨‍💻 Auteur & Support

- **Développé par :** **KONVELBO Samuel**
- **Plateforme Officielle :** [https://lsho.cc](https://lsho.cc)
- **Code source :** [https://github.com/Konvelbo/LShorter-api](https://github.com/Konvelbo/LShorter-api)
- **Licence :** MIT
