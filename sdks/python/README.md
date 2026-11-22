# LShorter — Official Python SDK (`lshorter-api`)

> **LShorter** est une plateforme moderne et ultra-rapide de raccourcissement de liens, de redirection intelligente à l'Edge (Cloudflare Workers) et de suivi avancé des conversions.

🌐 **Site officiel :** [https://lsho.cc](https://lsho.cc)  
📚 **Documentation :** [https://lsho.cc/docs](https://lsho.cc/docs)  
👤 **Créé par :** **KONVELBO Samuel**

---

## 📌 À quoi sert l'API LShorter ?

L'API et le SDK Python **LShorter** (zéro dépendance externe, compatible Python 3.9+) permettent aux développeurs et aux entreprises d'intégrer facilement un moteur de liens courts performant directement dans leurs applications :

- ⚡ **Redirections Edge ultra-rapides (< 15ms)** propulsées par le réseau mondial Cloudflare.
- 🎯 **Ciblage, Routage intelligent & A/B Testing (Plan PRO)** : Redirigez vos visiteurs selon leur pays (Géo-ciblage), continent, navigateur, OS, appareil (iOS, Android, Windows, Mac) ou pondération A/B.
- 🔒 **Sécurité & Liens Protégés** : Protection de liens par mot de passe, expiration automatique, quota de clics (`maxClicks` + `fallbackUrl`), `hideReferrer` et masquage d'URL (*cloaking*).
- 🛡️ **PathLock™ & Isolation de Navigation (Plan PRO)** : Verrouillez vos visiteurs sur une page unique (*strict*) ou un entonnoir de vente (*funnel*) avec écran de sécurité Edge anti-dispersion.
- 🎯 **Pixels de Retargeting — 9 plateformes (Plan PRO+)** : Créez et injectez vos pixels **Meta/Facebook, Instagram, Google GA4, YouTube Ads, TikTok, LinkedIn, Pinterest, Snapchat et X** directement sur vos liens courts avec CSP stricte.
- 🔔 **Webhooks temps réel signés HMAC-SHA256 (Plan PRO+)** : Créez et gérez vos endpoints d'écoute sur 12 événements (`click.created`, `conversion.created`, `qr.scanned`, etc.).
- 📊 **Analytics & Tracking de conversions** : Mesurez les clics, pays, appareils, revenus générés (EPC) et exportez vos conversions en CSV.
- 🏷️ **Domaines Personnalisés** : Connectez, vérifiez via DNS et gérez vos propres noms de domaine de marque.

---

## 📦 Installation

Installez le SDK avec votre gestionnaire de paquets Python préféré :

```bash
# Avec pip (Recommandé)
pip install lshorter-api

# Avec uv
uv add lshorter-api

# Avec poetry
poetry add lshorter-api
```

---

## 🚀 Démarrage Rapide

### 1. Initialiser le client

Obtenez votre clé API dans votre tableau de bord sur [https://lsho.cc](https://lsho.cc) (*Paramètres > API & Clés*).

```python
import os
from lshorter import LShorter

lsh = LShorter(
    api_key=os.environ["LSHORTER_API_KEY"],
    # Optionnel : base_url par défaut sur https://lsho.cc
    base_url="https://lsho.cc",
    timeout=15.0,
)
# Compatible également avec le context manager :
# with LShorter(api_key=os.environ["LSHORTER_API_KEY"]) as lsh: ...
```

---

### 2. Créer, lister, modifier et supprimer un lien court

```python
link = lsh.links.create({
    "targetUrl": "https://mon-site.com/produit-promo",
    "slug": "promo-ete",  # Optionnel : slug personnalisé (lsho.cc/promo-ete)
    "tags": ["marketing", "ete-2026"],
    "password": "MotDePasseOptionnel",  # Haché côté serveur, jamais ré-exposé en clair
    "maxClicks": 500,
    "expiresAt": "2026-12-31T23:59:59Z",
    "fallbackUrl": "https://mon-site.com/offre-terminee",
    "hideReferrer": True,
    "ogTitle": "Offre Été -40%",
    "ogDescription": "Profitez de notre promotion exclusive.",
    "bannerStyle": "large_banner",
})

print("Lien court :", link["shortUrl"])

# Lister avec pagination, consulter, mettre à jour ou supprimer
page = lsh.links.list(page=1, limit=20)
details = lsh.links.get(link["id"])
lsh.links.update(link["id"], {"isActive": False})
lsh.links.delete(link["id"])
```

---

### 3. Ciblage intelligent, Routage multi-conditions & A/B Testing (Plan PRO)

```python
smart_link = lsh.links.create({
    "targetUrl": "https://mon-site.com/default",
    "slug": "app-download",
    "routingRules": [
        {
            "id": "rule_africa_chrome",
            "title": "Afrique sur Chrome",
            "destinationUrl": "https://mon-site.com/afrique-chrome",
            "conditions": [
                {"id": "c1", "type": "continent", "operator": "est", "value": "africa"},
                {"id": "c2", "type": "navigateur", "operator": "est", "value": "chrome"},
            ],
        },
        {
            "id": "rule_fr",
            "title": "Visiteurs France",
            "destinationUrl": "https://mon-site.com/fr",
            "conditions": [{"id": "c3", "type": "pays", "operator": "est", "value": "FR"}],
        },
    ],
    "geoTargeting": {
        "FR": "https://mon-site.fr/promo",
        "US": "https://mon-site.com/us-promo",
    },
    "deviceTargeting": {
        "ios": "https://apps.apple.com/app/id123456789",
        "android": "https://play.google.com/store/apps/details?id=com.app",
    },
    "abVariations": [{"url": "https://mon-site.com/variante-b", "weight": 30}],
    "mainWeight": 70,
    "redirectType": "302",
    "passParams": True,
})
```

---

### 4. Créer un lien avec PathLock™ (Navigation Restreinte — Plan PRO)

Verrouillez vos visiteurs sur une page unique (`strict`) ou un entonnoir de conversion (`funnel`) sans risque de dispersion :

```python
path_locked = lsh.links.create({
    "targetUrl": "https://maboutique.com/produit-luxe",
    "slug": "produit-valide",
    "pathLockMode": "strict",  # "off" | "strict" | "funnel"
    "pathLockPrefix": "produit-luxe",
    "pathLockPassword": "MonMotDePasseSecurite",
    "pathLockMessage": "La navigation est restreinte à cette page de présentation.",
})

print("Lien sécurisé PathLock :", path_locked["shortUrl"])
```

---

### 5. Pixels de Retargeting — 9 plateformes (Plan PRO+)

Plateformes prises en charge : `meta` (`facebook`), `instagram`, `google` (`google_tag`), `youtube`, `tiktok`, `linkedin`, `pinterest`, `snapchat`, `x` (`twitter`).

```python
# 1. Enregistrer un pixel (ex. Pinterest Tag)
pixel = lsh.pixels.create({
    "platform": "pinterest",
    "pixelId": "2612345678901",
    "name": "Pinterest Ads — Campagne Q4",
    "isActive": True,
})

# 2. Associer vos pixels lors de la création d'un lien court
tracked_link = lsh.links.create({
    "targetUrl": "https://maboutique.com/offre",
    "pixels": [pixel["id"]],
})

# 3. Lister, consulter, mettre en pause ou supprimer
all_pixels = lsh.pixels.list()
one_pixel = lsh.pixels.get(pixel["id"])
lsh.pixels.update(pixel["id"], {"isActive": False})
lsh.pixels.delete(pixel["id"])
```

---

### 6. Webhooks temps réel signés HMAC-SHA256 (Plan PRO+)

Événements supportés : `click.created`, `click.unique`, `conversion.created`, `link.created`, `link.updated`, `link.deleted`, `link.expired`, `qr.scanned`, `target.reached`, `subscription.activated`, `subscription.cancelled`, `subscription.renewed`.

```python
# Créer un abonnement webhook (clé secrète HMAC générée automatiquement si omise)
webhook = lsh.webhooks.create({
    "url": "https://mon-serveur.com/api/webhooks/lshorter",
    "events": ["click.created", "conversion.created", "qr.scanned"],
    "isActive": True,
})

print("Secret HMAC à vérifier :", webhook["secretKey"])

# Lister, consulter, modifier ou supprimer
webhooks = lsh.webhooks.list()
fetched = lsh.webhooks.get(webhook["id"])
lsh.webhooks.update(webhook["id"], {"isActive": False})
lsh.webhooks.delete(webhook["id"])
```

---

### 7. Suivre une conversion & Attribution Financière

```python
lsh.track.conversion(
    event_name="purchase",
    amount=49.99,
    currency="EUR",
    link_id=link["id"],
    click_id="clk_9921ab01",  # Optionnel
    customer={
        "id": "usr_123",
        "email": "client@example.com",
        "name": "Jean Dupont",
        "fullName": "Jean Dupont",
        "avatarUrl": "https://example.com/avatars/jean.jpg",
    },
)

# Lister l'historique paginé des conversions
conversions = lsh.track.list(page=1, limit=20, link_id=link["id"])
```

---

### 8. Analytics & export CSV

```python
stats = lsh.analytics.dashboard(link_id=link["id"])
top = lsh.analytics.top(link_id=link["id"])
top_links = lsh.analytics.links(limit=10)

print("Total de clics :", stats["totalClicks"])
print("Revenus suivis :", stats["trackedRevenue"])
print("Top Pays :", top["topCountries"])

# Export CSV des conversions (Plan PRO+)
csv_content = lsh.analytics.export_csv(link_id=link["id"])
```

---

### 9. Domaines personnalisés

```python
domain = lsh.domains.create("go.ma-marque.com")
print("Enregistrements DNS à ajouter :", domain["dnsRecords"])

domains = lsh.domains.list()
status = lsh.domains.get(domain["id"])
verified = lsh.domains.verify(domain["id"])
lsh.domains.delete(domain["id"])
```

---

### 10. Notifications / Objectifs & Gestion des erreurs typées

```python
from lshorter import LShorter, LShorterError

# Consulter vos alertes & objectifs (création réservée au Dashboard)
alerts = lsh.notifications.list()  # alias : lsh.targets.list()

# Gestion des erreurs typées
try:
    lsh.links.create({"targetUrl": "javascript:alert(1)"})
except LShorterError as err:
    print(f"Erreur HTTP {err.status} ({err.code}) : {err.message}")
```

---

## 🛠️ Référence des Méthodes du SDK

| Module | Méthode | Description |
| :--- | :--- | :--- |
| `lsh.links` | `.create(payload)` | Créer un lien court (routage, A/B, PathLock™, mot de passe, pixels, OG) |
| `lsh.links` | `.list(page=, limit=)` | Lister ses liens avec pagination |
| `lsh.links` | `.get(link_id)` | Récupérer les détails d'un lien (mots de passe masqués) |
| `lsh.links` | `.update(link_id, payload)` | Modifier la destination, le statut, les tags, les pixels ou le routage |
| `lsh.links` | `.delete(link_id)` | Supprimer un lien et purger le cache Edge |
| `lsh.track` | `.conversion(...)` | Enregistrer une conversion financière liée à un lien |
| `lsh.track` | `.list(page=, limit=, link_id=)` | Lister l'historique paginé des conversions |
| `lsh.analytics` | `.dashboard(link_id=, from_date=, to_date=)` | Tableau de bord complet des métriques |
| `lsh.analytics` | `.top(link_id=)` | Top pays, top appareils et top navigateurs |
| `lsh.analytics` | `.links(limit=)` | Classement des liens les plus performants |
| `lsh.analytics` | `.export_csv(link_id=)` | Exporter les conversions en CSV *(Plan PRO+)* |
| `lsh.domains` | `.create(domain)` / `.list()` / `.get(id)` / `.verify(id)` / `.delete(id)` | Gérer et vérifier ses domaines personnalisés |
| `lsh.webhooks` | `.create(payload)` / `.list()` / `.get(id)` / `.update(id, ...)` / `.delete(id)` | Créer et gérer ses webhooks *(Plan PRO+)* |
| `lsh.pixels` | `.create(payload)` / `.list()` / `.get(id)` / `.update(id, ...)` / `.delete(id)` | Créer et gérer ses pixels de retargeting (9 plateformes — *Plan PRO+*) |
| `lsh.notifications` / `lsh.targets` | `.list()` / `.get(id)` | Consulter ses alertes et objectifs *(création exclusive via Dashboard)* |

> 🔒 **Sécurité côté serveur :**
> - **Webhooks & Pixels** : disponibles via le SDK dès le forfait **PRO** avec isolation stricte par compte, validation anti-SSRF / anti-boucle / anti-XSS, rate limiting (`20 req/min`) et plafonds par compte (25 webhooks, 50 pixels).
> - **Protection PII & Alertes** : les routes de profil (`/api/v1/users/me`), la gestion des clés API et la création d'alertes/notifications (`lsh.notifications`) restent strictement réservées au Dashboard Web [https://lsho.cc](https://lsho.cc) (`403 Forbidden`).

---

## 👨‍💻 Auteur & Support

- **Développé par :** **KONVELBO Samuel**
- **Plateforme Officielle :** [https://lsho.cc](https://lsho.cc)
- **Code source :** [https://github.com/Konvelbo/LShorter-api](https://github.com/Konvelbo/LShorter-api)
- **Licence :** MIT
