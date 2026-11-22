# LShorter — Official PHP SDK (`lshorter/lshorter-api`)

> **LShorter** est une plateforme moderne et ultra-rapide de raccourcissement de liens, de redirection intelligente à l'Edge (Cloudflare Workers) et de suivi avancé des conversions.

🌐 **Site officiel :** [https://lsho.cc](https://lsho.cc)  
📚 **Documentation :** [https://lsho.cc/docs](https://lsho.cc/docs)  
👤 **Créé par :** **KONVELBO Samuel**

---

## 📌 À quoi sert l'API LShorter ?

L'API et le SDK PHP 8.1+ **LShorter** (PSR-4, zéro dépendance tierce via `ext-curl`) permettent aux développeurs et aux entreprises d'intégrer facilement un moteur de liens courts performant directement dans leurs applications Laravel, Symfony, WordPress ou PHP natif :

- ⚡ **Redirections Edge ultra-rapides (< 15ms)** propulsées par le réseau mondial Cloudflare.
- 🎯 **Ciblage & Routage intelligent** : Redirigez vos utilisateurs selon leur pays (Géo-ciblage), continent, navigateur ou appareil (iOS, Android, Windows, Mac).
- 🔒 **Sécurité & Liens Protégés** : Protection de liens par mot de passe, expiration automatique, quota de clics et masquage d'URL (*cloaking*).
- 🛡️ **PathLock™ & Isolation de Navigation (Plan PRO)** : Verrouillez vos visiteurs sur une page unique (*strict*) ou un entonnoir de vente (*funnel*) avec écran de sécurité Edge anti-dispersion.
- 🎯 **Pixels de Retargeting (9 régies)** : Associez vos pixels Meta/Facebook, Instagram, Google GA4, YouTube Ads, TikTok, LinkedIn, Pinterest, Snapchat et X directement à vos liens courts.
- 📊 **Analytics & Tracking de conversions** : Mesurez les clics, pays, appareils, revenus générés et exportez vos conversions en CSV.
- 🏷️ **Domaines Personnalisés** : Connectez et vérifiez vos propres noms de domaine de marque facilement.

---

## 📦 Installation

Installez le SDK via Composer :

```bash
composer require lshorter/lshorter-api
```

---

## 🚀 Démarrage Rapide

### 1. Initialiser le client

Obtenez votre clé API sur votre tableau de bord sur [https://lsho.cc](https://lsho.cc).

```php
<?php

require __DIR__ . '/vendor/autoload.php';

use LShorter\LShorter;

$lsh = new LShorter(
    apiKey: getenv('LSHORTER_API_KEY'),
    // Optionnel : baseUrl par défaut sur https://lsho.cc
    baseUrl: 'https://lsho.cc',
);
```

---

### 2. Créer un lien court

```php
// Création d'un lien simple
$link = $lsh->links->create([
    'targetUrl' => 'https://mon-site.com/produit-promo',
    'slug' => 'promo-ete', // Optionnel : lsho.cc/promo-ete
    'tags' => ['marketing', 'ete-2026'],
]);

echo "Lien court : " . $link['shortUrl'] . PHP_EOL;
```

---

### 3. Créer un lien avec ciblage intelligent & Pixels de Retargeting (Plan PRO)

```php
$smartLink = $lsh->links->create([
    'targetUrl' => 'https://mon-site.com/default',
    'slug' => 'app-download',
    // Règles de routage dynamique multi-conditions (Pays, Continent, Navigateur, OS, Appareil)
    'routingRules' => [
        [
            'id' => 'rule_africa_chrome',
            'title' => 'Afrique sur Chrome',
            'destinationUrl' => 'https://mon-site.com/afrique-chrome',
            'conditions' => [
                ['id' => 'c1', 'type' => 'continent', 'operator' => 'est', 'value' => 'africa'],
                ['id' => 'c2', 'type' => 'navigateur', 'operator' => 'est', 'value' => 'chrome'],
            ],
        ],
    ],
    // Ciblage direct par pays ou par appareil :
    'geoTargeting' => [
        'FR' => 'https://mon-site.fr/promo',
        'US' => 'https://mon-site.com/us-promo',
    ],
    'deviceTargeting' => [
        'ios' => 'https://apps.apple.com/app/id123456789',
        'android' => 'https://play.google.com/store/apps/details?id=com.app',
    ],
    // Pixels configurés dans votre Dashboard LShorter :
    'pixels' => ['px_meta_main', 'px_tiktok_main'],
]);
```

---

### 4. Créer un lien avec PathLock™ (Navigation Restreinte / Plan PRO)

Verrouillez vos visiteurs sur une page de destination unique ou isolez un entonnoir de conversion multi-étapes sans risque de dispersion :

```php
$pathLocked = $lsh->links->create([
    'targetUrl' => 'https://maboutique.com/produit-luxe',
    'slug' => 'produit-valide',
    // Mode d'isolation : 'strict' (mono-page) | 'funnel' (entonnoir & sous-chemins)
    'pathLockMode' => 'strict',
    'pathLockPrefix' => 'produit-luxe',
    'pathLockPassword' => 'MonMotDePasseSecurite',
    'pathLockMessage' => 'La navigation est restreinte à cette page de présentation.',
]);

echo "Lien sécurisé PathLock : " . $pathLocked['shortUrl'] . PHP_EOL;
```

---

### 5. Suivre une conversion & Attribution Financière (E-commerce / Inscription / Vente)

Attribuez vos ventes, vos inscriptions et vos montants financiers à vos liens raccourcis avec l'identité complète du client (Avatar, Nom complet, Email) :

```php
$lsh->track->conversion([
    'eventName' => 'purchase',
    'amount' => 49.99, // Montant réel en euros perçu lors du paiement
    'currency' => 'EUR',
    'linkId' => $link['id'], // Ou slug du lien (ex: 'promo-ete')
    'clickId' => 'clk_9921ab01', // Optionnel : ID du clic capturé lors de la visite
    'customer' => [
        'id' => 'usr_123',
        'email' => 'client@example.com',
        'name' => 'Jean Dupont',
        'fullName' => 'Jean Dupont',
        'avatarUrl' => 'https://example.com/avatars/jean.jpg', // Photo de profil du client
    ],
]);
```

> 💡 **Remarque :** L'avatar fourni lors de la conversion est stocké dans la base de données Cloudflare D1 et s'affiche instantanément à l'extrême gauche de la liste des bénéficiaires sur la page d'analyse des revenus de LShorter.

---

### 6. Consulter les statistiques & exporter en CSV

```php
$stats = $lsh->analytics->dashboard(linkId: $link['id']);
$top = $lsh->analytics->top(linkId: $link['id']);

echo "Total de clics : " . $stats['totalClicks'] . PHP_EOL;
echo "Revenus suivis : " . $stats['trackedRevenue'] . " EUR" . PHP_EOL;

// Export CSV des conversions (Plan PRO)
$csv = $lsh->analytics->exportCsv(linkId: $link['id']);
```

---

### 7. Gestion des erreurs typées

```php
use LShorter\Exceptions\LShorterException;

try {
    $lsh->links->create(['targetUrl' => 'invalid-url']);
} catch (LShorterException $e) {
    echo "Erreur HTTP {$e->status} ({$e->errorCode}) : {$e->getMessage()}" . PHP_EOL;
}
```

---

## 🛠️ Méthodes Disponibles dans le SDK

| Module | Méthode | Description |
| :--- | :--- | :--- |
| `$lsh->links` | `->create($options)` | Créer un nouveau lien court (routage, PathLock™, mot de passe, pixels, etc.) |
| `$lsh->links` | `->list($page, $limit)` | Lister ses liens avec pagination |
| `$lsh->links` | `->get($id)` | Récupérer les détails d'un lien |
| `$lsh->links` | `->update($id, $options)` | Modifier l'URL cible, tags ou règles de routage d'un lien |
| `$lsh->links` | `->delete($id)` | Supprimer un lien et purger le cache Edge |
| `$lsh->track` | `->conversion($options)` | Enregistrer une conversion financière liée à un lien |
| `$lsh->track` | `->list($page, $limit, $linkId)` | Lister l'historique paginé des conversions |
| `$lsh->analytics` | `->dashboard($linkId, $from, $to)` | Consulter le tableau de bord complet des métriques |
| `$lsh->analytics` | `->top($linkId)` | Top pays et top appareils |
| `$lsh->analytics` | `->links($limit)` | Statistiques agrégées par lien |
| `$lsh->analytics` | `->exportCsv($linkId)` | Exporter les conversions en CSV *(Plan PRO)* |
| `$lsh->domains` | `->list()` / `->create($domain)` / `->verify($id)` / `->delete($id)` | Gérer et vérifier ses domaines personnalisés |
| `$lsh->webhooks` | `->list()` / `->get($id)` / `->update($id, $opts)` / `->delete($id)` | Piloter ses webhooks existants *(création via Dashboard)* |
| `$lsh->pixels` | `->list()` / `->get($id)` / `->update($id, $opts)` / `->delete($id)` | Piloter ses pixels de retargeting *(création via Dashboard)* |
| `$lsh->notifications` / `->targets` | `->list()` / `->get($id)` | Consulter ses alertes et objectifs *(lecture seule)* |

> 🔒 **Webhooks, Pixels & Notifications :** Par mesure de sécurité et pour garantir l'intégrité de votre compte, la création initiale de webhooks, de pixels de retargeting ou d'alertes s'effectue exclusivement depuis le tableau de bord web LShorter (*Paramètres*). Les méthodes de consultation et de gestion restent accessibles via le SDK, et les identifiants de pixels existants peuvent être directement associés à vos liens lors de leur création (`$lsh->links->create(['targetUrl' => '...', 'pixels' => ['px_xxx']])`).

---

## 👨‍💻 Auteur & Support

- **Développé par :** **KONVELBO Samuel**
- **Plateforme Officielle :** [https://lsho.cc](https://lsho.cc)
- **Code source :** [https://github.com/Konvelbo/LShorter-api](https://github.com/Konvelbo/LShorter-api)
- **Licence :** MIT
