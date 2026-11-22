# LShorter — Official Python SDK (`lshorter-api`)

> **LShorter** est une plateforme moderne et ultra-rapide de raccourcissement de liens, de redirection intelligente à l'Edge (Cloudflare Workers) et de suivi avancé des conversions.

🌐 **Site officiel :** [https://lsho.cc](https://lsho.cc)  
📚 **Documentation :** [https://lsho.cc/docs](https://lsho.cc/docs)  
👤 **Créé par :** **KONVELBO Samuel**

---

## 📌 À quoi sert l'API LShorter ?

L'API et le SDK Python **LShorter** (zéro dépendance externe, compatible Python 3.9+) permettent aux développeurs et aux entreprises d'intégrer facilement un moteur de liens courts performant directement dans leurs applications :

- ⚡ **Redirections Edge ultra-rapides (< 15ms)** propulsées par le réseau mondial Cloudflare.
- 🎯 **Ciblage & Routage intelligent** : Redirigez vos utilisateurs selon leur pays (Géo-ciblage), continent, navigateur ou appareil (iOS, Android, Windows, Mac).
- 🔒 **Sécurité & Liens Protégés** : Protection de liens par mot de passe, expiration automatique, quota de clics et masquage d'URL (*cloaking*).
- 🛡️ **PathLock™ & Isolation de Navigation (Plan PRO)** : Verrouillez vos visiteurs sur une page unique (*strict*) ou un entonnoir de vente (*funnel*) avec écran de sécurité Edge anti-dispersion.
- 🎯 **Pixels de Retargeting (9 régies)** : Associez vos pixels Meta/Facebook, Instagram, Google GA4, YouTube Ads, TikTok, LinkedIn, Pinterest, Snapchat et X directement à vos liens courts.
- 📊 **Analytics & Tracking de conversions** : Mesurez les clics, pays, appareils, revenus générés et exportez vos conversions en CSV.
- 🏷️ **Domaines Personnalisés** : Connectez et vérifiez vos propres noms de domaine de marque facilement.

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

Obtenez votre clé API sur votre tableau de bord sur [https://lsho.cc](https://lsho.cc).

```python
import os
from lshorter import LShorter

lsh = LShorter(
    api_key=os.environ["LSHORTER_API_KEY"],
    # Optionnel : base_url par défaut sur https://lsho.cc
    base_url="https://lsho.cc",
    timeout=15.0,
)
```

---

### 2. Créer un lien court

```python
# Création d'un lien simple
link = lsh.links.create({
    "targetUrl": "https://mon-site.com/produit-promo",
    "slug": "promo-ete",  # Optionnel : slug personnalisé (lsho.cc/promo-ete)
    "tags": ["marketing", "ete-2026"],
})

print("Lien court :", link["shortUrl"])
```

---

### 3. Créer un lien avec ciblage intelligent & Pixels de Retargeting (Plan PRO)

```python
smart_link = lsh.links.create({
    "targetUrl": "https://mon-site.com/default",
    "slug": "app-download",
    # Règles de routage dynamique multi-conditions (Pays, Continent, Navigateur, OS, Appareil)
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
            "conditions": [
                {"id": "c3", "type": "pays", "operator": "est", "value": "FR"},
            ],
        },
    ],
    # Ciblage direct par pays ou par appareil :
    "geoTargeting": {
        "FR": "https://mon-site.fr/promo",
        "US": "https://mon-site.com/us-promo",
    },
    "deviceTargeting": {
        "ios": "https://apps.apple.com/app/id123456789",
        "android": "https://play.google.com/store/apps/details?id=com.app",
    },
    # Pixels configurés dans votre Dashboard LShorter :
    "pixels": ["px_meta_main", "px_tiktok_main"],
})
```

---

### 4. Créer un lien avec PathLock™ (Navigation Restreinte / Plan PRO)

Verrouillez vos visiteurs sur une page de destination unique ou isolez un entonnoir de conversion multi-étapes sans risque de dispersion :

```python
path_locked = lsh.links.create({
    "targetUrl": "https://maboutique.com/produit-luxe",
    "slug": "produit-valide",
    # Mode d'isolation : 'strict' (mono-page) | 'funnel' (entonnoir & sous-chemins)
    "pathLockMode": "strict",
    "pathLockPrefix": "produit-luxe",  # Optionnel : verrouille sur l'URL exacte si vide
    "pathLockPassword": "MonMotDePasseSecurite",  # Optionnel : déverrouillage équipe
    "pathLockMessage": "La navigation est restreinte à cette page de présentation.",
})

print("Lien sécurisé PathLock :", path_locked["shortUrl"])
```

---

### 5. Suivre une conversion & Attribution Financière (E-commerce / Inscription / Vente)

Attribuez vos ventes, vos inscriptions et vos montants financiers à vos liens raccourcis. L'API et le SDK acceptent les informations complètes du client (Avatar, Nom complet, Email) qui seront automatiquement affichées dans la sous-page d'analyse des revenus du dashboard :

```python
lsh.track.conversion(
    event_name="purchase",
    amount=49.99,  # Montant réel en euros perçu lors du paiement
    currency="EUR",
    link_id=link["id"],  # Ou slug du lien (ex: 'promo-ete')
    click_id="clk_9921ab01",  # Optionnel : ID du clic capturé lors de la visite
    customer={
        "id": "usr_123",
        "email": "client@example.com",
        "name": "Jean Dupont",
        "fullName": "Jean Dupont",
        "avatarUrl": "https://example.com/avatars/jean.jpg",  # Photo de profil du client
    },
)
```

> 💡 **Remarque :** L'avatar fourni lors de la conversion est stocké dans la base de données Cloudflare D1 et s'affiche instantanément à l'extrême gauche de la liste des bénéficiaires sur la page d'analyse des revenus de LShorter.

---

### 6. Consulter les statistiques & exporter en CSV

```python
stats = lsh.analytics.dashboard(link_id=link["id"])
top = lsh.analytics.top(link_id=link["id"])

print("Total de clics :", stats["totalClicks"])
print("Revenus suivis :", stats["trackedRevenue"])
print("Top Pays :", top["topCountries"])
print("Top Appareils :", top["topDevices"])

# Export CSV des conversions (Plan PRO)
csv_content = lsh.analytics.export_csv(link_id=link["id"])
```

---

### 7. Gestion des erreurs typées

```python
from lshorter import LShorter, LShorterError

try:
    lsh.links.create({"targetUrl": "invalid-url"})
except LShorterError as err:
    print(f"Erreur HTTP {err.status} ({err.code}) : {err.message}")
```

---

## 🛠️ Méthodes Disponibles dans le SDK

| Module | Méthode | Description |
| :--- | :--- | :--- |
| `lsh.links` | `.create(payload)` | Créer un nouveau lien court (routage, PathLock™, mot de passe, pixels, etc.) |
| `lsh.links` | `.list(page=, limit=)` | Lister ses liens avec pagination |
| `lsh.links` | `.get(link_id)` | Récupérer les détails d'un lien |
| `lsh.links` | `.update(link_id, payload)` | Modifier l'URL cible, tags ou règles de routage d'un lien |
| `lsh.links` | `.delete(link_id)` | Supprimer un lien et purger le cache Edge |
| `lsh.track` | `.conversion(...)` | Enregistrer une conversion financière liée à un lien |
| `lsh.track` | `.list(page=, limit=, link_id=)` | Lister l'historique paginé des conversions |
| `lsh.analytics` | `.dashboard(link_id=, from_date=, to_date=)` | Consulter le tableau de bord complet des métriques |
| `lsh.analytics` | `.top(link_id=)` | Top pays et top appareils |
| `lsh.analytics` | `.links(limit=)` | Statistiques agrégées par lien |
| `lsh.analytics` | `.export_csv(link_id=)` | Exporter les conversions en CSV *(Plan PRO)* |
| `lsh.domains` | `.list()` / `.create(domain)` / `.verify(id)` / `.delete(id)` | Gérer et vérifier ses domaines personnalisés |
| `lsh.webhooks` | `.list()` / `.get(id)` / `.update(id, ...)` / `.delete(id)` | Piloter ses webhooks existants *(création via Dashboard)* |
| `lsh.pixels` | `.list()` / `.get(id)` / `.update(id, ...)` / `.delete(id)` | Piloter ses pixels de retargeting *(création via Dashboard)* |
| `lsh.notifications` / `lsh.targets` | `.list()` / `.get(id)` | Consulter ses alertes et objectifs *(lecture seule)* |

> 🔒 **Webhooks, Pixels & Notifications :** Par mesure de sécurité et pour garantir l'intégrité de votre compte, la création initiale de webhooks, de pixels de retargeting ou d'alertes s'effectue exclusivement depuis le tableau de bord web LShorter (*Paramètres*). Les méthodes de consultation et de gestion restent accessibles via le SDK, et les identifiants de pixels existants peuvent être directement associés à vos liens lors de leur création (`lsh.links.create({"targetUrl": "...", "pixels": ["px_xxx"]})`).

---

## 👨‍💻 Auteur & Support

- **Développé par :** **KONVELBO Samuel**
- **Plateforme Officielle :** [https://lsho.cc](https://lsho.cc)
- **Code source :** [https://github.com/Konvelbo/LShorter-api](https://github.com/Konvelbo/LShorter-api)
- **Licence :** MIT
