# LShorter — Official PHP SDK (`lshorter/lshorter-api`)

> **LShorter** est une plateforme moderne et ultra-rapide de raccourcissement de liens, de redirection intelligente à l'Edge (Cloudflare Workers) et de suivi avancé des conversions.

🌐 **Site officiel :** [https://lsho.cc](https://lsho.cc)  
📚 **Documentation :** [https://lsho.cc/docs](https://lsho.cc/docs)  
👤 **Créé par :** **KONVELBO Samuel**

---

## 📌 À quoi sert l'API LShorter ?

L'API et le SDK PHP 8.1+ **LShorter** (PSR-4, zéro dépendance tierce via `ext-curl`) permettent aux développeurs et aux entreprises d'intégrer facilement un moteur de liens courts performant directement dans leurs applications Laravel, Symfony, WordPress ou PHP natif :

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

Installez le SDK via Composer :

```bash
composer require lshorter/lshorter-api
```

---

## 🚀 Démarrage Rapide

### 1. Initialiser le client

Obtenez votre clé API dans votre tableau de bord sur [https://lsho.cc](https://lsho.cc) (*Paramètres > API & Clés*).

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

### 2. Créer, lister, modifier et supprimer un lien court

```php
$link = $lsh->links->create([
    'targetUrl' => 'https://mon-site.com/produit-promo',
    'slug' => 'promo-ete', // Optionnel : lsho.cc/promo-ete
    'tags' => ['marketing', 'ete-2026'],
    'password' => 'MotDePasseOptionnel', // Haché côté serveur, jamais ré-exposé en clair
    'maxClicks' => 500,
    'expiresAt' => '2026-12-31T23:59:59Z',
    'fallbackUrl' => 'https://mon-site.com/offre-terminee',
    'hideReferrer' => true,
    'ogTitle' => 'Offre Été -40%',
    'ogDescription' => 'Profitez de notre promotion exclusive.',
    'bannerStyle' => 'large_banner',
]);

echo "Lien court : " . $link['shortUrl'] . PHP_EOL;

// Lister, consulter, mettre en pause ou supprimer
$page = $lsh->links->list(page: 1, limit: 20);
$details = $lsh->links->get($link['id']);
$lsh->links->update($link['id'], ['isActive' => false]);
$lsh->links->delete($link['id']);
```

---

### 3. Ciblage intelligent, Routage multi-conditions & A/B Testing (Plan PRO)

```php
$smartLink = $lsh->links->create([
    'targetUrl' => 'https://mon-site.com/default',
    'slug' => 'app-download',
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
    'geoTargeting' => [
        'FR' => 'https://mon-site.fr/promo',
        'US' => 'https://mon-site.com/us-promo',
    ],
    'deviceTargeting' => [
        'ios' => 'https://apps.apple.com/app/id123456789',
        'android' => 'https://play.google.com/store/apps/details?id=com.app',
    ],
    'abVariations' => [
        ['url' => 'https://mon-site.com/variante-b', 'weight' => 30],
    ],
    'mainWeight' => 70,
    'redirectType' => '302',
    'passParams' => true,
]);
```

---

### 4. Créer un lien avec PathLock™ (Navigation Restreinte — Plan PRO)

```php
$pathLocked = $lsh->links->create([
    'targetUrl' => 'https://maboutique.com/produit-luxe',
    'slug' => 'produit-valide',
    'pathLockMode' => 'strict', // 'off' | 'strict' | 'funnel'
    'pathLockPrefix' => 'produit-luxe',
    'pathLockPassword' => 'MonMotDePasseSecurite',
    'pathLockMessage' => 'La navigation est restreinte à cette page de présentation.',
]);
```

---

### 5. Pixels de Retargeting — 9 plateformes (Plan PRO+)

Plateformes prises en charge : `meta` (`facebook`), `instagram`, `google` (`google_tag`), `youtube`, `tiktok`, `linkedin`, `pinterest`, `snapchat`, `x` (`twitter`).

```php
// 1. Enregistrer un pixel (ex. Pinterest Tag)
$pixel = $lsh->pixels->create([
    'platform' => 'pinterest',
    'pixelId' => '2612345678901',
    'name' => 'Pinterest Ads — Campagne Q4',
    'isActive' => true,
]);

// 2. Associer vos pixels lors de la création d'un lien court
$trackedLink = $lsh->links->create([
    'targetUrl' => 'https://maboutique.com/offre',
    'pixels' => [$pixel['id']],
]);

// 3. Lister, consulter, mettre en pause ou supprimer
$allPixels = $lsh->pixels->list();
$onePixel = $lsh->pixels->get($pixel['id']);
$lsh->pixels->update($pixel['id'], ['isActive' => false]);
$lsh->pixels->delete($pixel['id']);
```

---

### 6. Webhooks temps réel signés HMAC-SHA256 (Plan PRO+)

Événements supportés : `click.created`, `click.unique`, `conversion.created`, `link.created`, `link.updated`, `link.deleted`, `link.expired`, `qr.scanned`, `target.reached`, `subscription.activated`, `subscription.cancelled`, `subscription.renewed`.

```php
// Créer un abonnement webhook (clé secrète HMAC générée automatiquement si omise)
$webhook = $lsh->webhooks->create([
    'url' => 'https://mon-serveur.com/api/webhooks/lshorter',
    'events' => ['click.created', 'conversion.created', 'qr.scanned'],
    'isActive' => true,
]);

echo "Secret HMAC : " . $webhook['secretKey'] . PHP_EOL;

// Lister, consulter, modifier ou supprimer
$webhooks = $lsh->webhooks->list();
$fetched = $lsh->webhooks->get($webhook['id']);
$lsh->webhooks->update($webhook['id'], ['isActive' => false]);
$lsh->webhooks->delete($webhook['id']);
```

---

### 7. Suivre une conversion & Attribution Financière

```php
$lsh->track->conversion([
    'eventName' => 'purchase',
    'amount' => 49.99,
    'currency' => 'EUR',
    'linkId' => $link['id'],
    'clickId' => 'clk_9921ab01', // Optionnel
    'customer' => [
        'id' => 'usr_123',
        'email' => 'client@example.com',
        'name' => 'Jean Dupont',
        'fullName' => 'Jean Dupont',
        'avatarUrl' => 'https://example.com/avatars/jean.jpg',
    ],
]);

$conversions = $lsh->track->list(page: 1, limit: 20, linkId: $link['id']);
```

---

### 8. Analytics & export CSV

```php
$stats = $lsh->analytics->dashboard(linkId: $link['id']);
$top = $lsh->analytics->top(linkId: $link['id']);
$topLinks = $lsh->analytics->links(limit: 10);
$csv = $lsh->analytics->exportCsv(linkId: $link['id']); // Plan PRO+

echo "Total de clics : " . $stats['totalClicks'] . " | Revenus : " . $stats['trackedRevenue'] . " EUR" . PHP_EOL;
```

---

### 9. Domaines personnalisés

```php
$domain = $lsh->domains->create('go.ma-marque.com');
$domains = $lsh->domains->list();
$status = $lsh->domains->get($domain['id']);
$verified = $lsh->domains->verify($domain['id']);
$lsh->domains->delete($domain['id']);
```

---

### 10. Notifications / Objectifs & Gestion des erreurs typées

```php
use LShorter\Exceptions\LShorterException;

// Consulter vos alertes & objectifs (création réservée au Dashboard)
$alerts = $lsh->notifications->list(); // alias : $lsh->targets->list()

// Gestion des erreurs typées
try {
    $lsh->links->create(['targetUrl' => 'javascript:alert(1)']);
} catch (LShorterException $e) {
    echo "Erreur HTTP {$e->status} ({$e->errorCode}) : {$e->getMessage()}" . PHP_EOL;
}
```

---

## 🛠️ Référence des Méthodes du SDK

| Module | Méthode | Description |
| :--- | :--- | :--- |
| `$lsh->links` | `->create($options)` | Créer un lien court (routage, A/B, PathLock™, mot de passe, pixels, OG) |
| `$lsh->links` | `->list($page, $limit)` | Lister ses liens avec pagination |
| `$lsh->links` | `->get($id)` | Récupérer les détails d'un lien (mots de passe masqués) |
| `$lsh->links` | `->update($id, $options)` | Modifier la destination, le statut, les tags, les pixels ou le routage |
| `$lsh->links` | `->delete($id)` | Supprimer un lien et purger le cache Edge |
| `$lsh->track` | `->conversion($options)` | Enregistrer une conversion financière liée à un lien |
| `$lsh->track` | `->list($page, $limit, $linkId)` | Lister l'historique paginé des conversions |
| `$lsh->analytics` | `->dashboard($linkId, $from, $to)` | Tableau de bord complet des métriques |
| `$lsh->analytics` | `->top($linkId)` | Top pays, top appareils et top navigateurs |
| `$lsh->analytics` | `->links($limit)` | Classement des liens les plus performants |
| `$lsh->analytics` | `->exportCsv($linkId)` | Exporter les conversions en CSV *(Plan PRO+)* |
| `$lsh->domains` | `->create($domain)` / `->list()` / `->get($id)` / `->verify($id)` / `->delete($id)` | Gérer et vérifier ses domaines personnalisés |
| `$lsh->webhooks` | `->create($opts)` / `->list()` / `->get($id)` / `->update($id, $opts)` / `->delete($id)` | Créer et gérer ses webhooks *(Plan PRO+)* |
| `$lsh->pixels` | `->create($opts)` / `->list()` / `->get($id)` / `->update($id, $opts)` / `->delete($id)` | Créer et gérer ses pixels de retargeting (9 plateformes — *Plan PRO+*) |
| `$lsh->notifications` / `->targets` | `->list()` / `->get($id)` | Consulter ses alertes et objectifs *(création exclusive via Dashboard)* |

> 🔒 **Sécurité côté serveur :**
> - **Webhooks & Pixels** : disponibles via le SDK dès le forfait **PRO** avec isolation stricte par compte, validation anti-SSRF / anti-boucle / anti-XSS, rate limiting (`20 req/min`) et plafonds par compte (25 webhooks, 50 pixels).
> - **Protection PII & Alertes** : les routes de profil (`/api/v1/users/me`), la gestion des clés API et la création d'alertes/notifications (`$lsh->notifications`) restent strictement réservées au Dashboard Web [https://lsho.cc](https://lsho.cc) (`403 Forbidden`).

---

## 👨‍💻 Auteur & Support

- **Développé par :** **KONVELBO Samuel**
- **Plateforme Officielle :** [https://lsho.cc](https://lsho.cc)
- **Code source :** [https://github.com/Konvelbo/LShorter-api](https://github.com/Konvelbo/LShorter-api)
- **Licence :** MIT
