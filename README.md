# LShorter — Official TypeScript / JavaScript SDK (`lshorter-api`)

> **LShorter** est une plateforme moderne et ultra-rapide de raccourcissement de liens, de redirection intelligente à l'Edge (Cloudflare Workers) et de suivi avancé des conversions.

🌐 **Site officiel :** [https://lsho.cc](https://lsho.cc)  
📚 **Documentation :** [https://lsho.cc/docs](https://lsho.cc/docs)  
👤 **Créé par :** **KONVELBO Samuel**

---

## 📌 À quoi sert l'API LShorter ?

L'API et le SDK TypeScript / JavaScript **LShorter** (ESM + CJS + types `.d.ts`, zéro dépendance externe) permettent aux développeurs et aux entreprises d'intégrer un moteur de liens courts performant directement dans leurs applications :

- ⚡ **Redirections Edge ultra-rapides (< 15ms)** propulsées par le réseau mondial Cloudflare.
- 🎯 **Ciblage, Routage intelligent & A/B Testing (Plan PRO)** : Redirigez vos visiteurs selon leur pays (Géo-ciblage), continent, navigateur, OS, appareil (iOS, Android, Windows, Mac) ou pondération A/B.
- 🔒 **Sécurité & Liens Protégés** : Protection par mot de passe, date d'expiration, quota maximal de clics (`maxClicks` + `fallbackUrl`), `hideReferrer` et masquage d'URL (*cloaking*).
- 🛡️ **PathLock™ & Isolation de Navigation (Plan PRO)** : Verrouillez vos visiteurs sur une page unique (*strict*) ou un tunnel de navigation (*funnel*) en liste blanche ou liste noire (`block:`), avec au choix un **écran PathLock** proposant les routes autorisées cliquables (`block`) ou une **redirection automatique** (`fallback`) vers une page dédiée (`pathLockFallbackPath`) protégée contre les boucles.
- 🎯 **Pixels de Retargeting — 9 plateformes (Plan PRO+)** : Créez et injectez vos pixels **Meta/Facebook, Instagram, Google GA4, YouTube Ads, TikTok, LinkedIn, Pinterest, Snapchat et X** directement sur vos liens courts avec CSP stricte.
- 🔔 **Webhooks temps réel signés HMAC-SHA256 (Plan PRO+)** : Créez et gérez vos endpoints d'écoute sur 12 événements (`click.created`, `conversion.created`, `qr.scanned`, etc.).
- 📊 **Analytics & Tracking de conversions** : Mesurez les clics, pays, appareils, revenus générés (EPC) et exportez vos conversions en CSV.
- 🏷️ **Domaines Personnalisés** : Connectez, vérifiez via DNS et gérez vos propres noms de domaine de marque.

---

## 📦 Installation

Installez le SDK avec votre gestionnaire de paquets préféré :

```bash
# Avec pnpm (Recommandé)
pnpm add lshorter-api

# Avec npm
npm install lshorter-api

# Avec yarn
yarn add lshorter-api

# Avec bun
bun add lshorter-api
```

---

## 🚀 Démarrage Rapide

### 1. Initialiser le client

Obtenez votre clé API dans votre tableau de bord sur [https://lsho.cc](https://lsho.cc) (*Paramètres > API & Clés*).

```typescript
import { LShorter } from "lshorter-api";

const lsh = new LShorter({
  apiKey: process.env.LSHORTER_API_KEY!,
  // Optionnel : baseUrl par défaut sur https://lsho.cc
  baseUrl: "https://lsho.cc",
});
```

---

### 2. Créer, lister, modifier et supprimer un lien court

```typescript
// Création d'un lien avec options de protection et OpenGraph
const link = await lsh.links.create({
  targetUrl: "https://mon-site.com/produit-promo",
  slug: "promo-ete", // Optionnel : slug personnalisé (lsho.cc/promo-ete)
  tags: ["marketing", "ete-2026"],
  password: "MotDePasseOptionnel", // Haché côté serveur, jamais ré-exposé en clair
  maxClicks: 500,
  expiresAt: "2026-12-31T23:59:59Z",
  fallbackUrl: "https://mon-site.com/offre-terminee",
  hideReferrer: true,
  ogTitle: "Offre Été -40%",
  ogDescription: "Profitez de notre promotion exclusive.",
  bannerStyle: "large_banner",
});

console.log("Lien court :", link.shortUrl);

// Lister avec pagination, consulter, mettre à jour ou supprimer
const page = await lsh.links.list({ page: 1, limit: 20 });
const details = await lsh.links.get(link.id);
await lsh.links.update(link.id, { isActive: false });
await lsh.links.delete(link.id);
```

---

### 3. Ciblage intelligent, Routage multi-conditions & A/B Testing (Plan PRO)

```typescript
const smartLink = await lsh.links.create({
  targetUrl: "https://mon-site.com/default",
  slug: "app-download",
  routingRules: [
    {
      id: "rule_africa_chrome",
      title: "Afrique sur Chrome",
      destinationUrl: "https://mon-site.com/afrique-chrome",
      conditions: [
        { id: "c1", type: "continent", operator: "est", value: "africa" },
        { id: "c2", type: "navigateur", operator: "est", value: "chrome" },
      ],
    },
    {
      id: "rule_fr",
      title: "Visiteurs France",
      destinationUrl: "https://mon-site.com/fr",
      conditions: [{ id: "c3", type: "pays", operator: "est", value: "FR" }],
    },
  ],
  geoTargeting: {
    FR: "https://mon-site.fr/promo",
    US: "https://mon-site.com/us-promo",
  },
  deviceTargeting: {
    ios: "https://apps.apple.com/app/id123456789",
    android: "https://play.google.com/store/apps/details?id=com.app",
  },
  abVariations: [{ url: "https://mon-site.com/variante-b", weight: 30 }],
  mainWeight: 70,
  redirectType: "302",
  passParams: true,
});
```

---

### 4. Créer un lien avec PathLock™ (Navigation Restreinte — Plan PRO)

Verrouillez vos visiteurs sur une page unique (`strict`) ou sur un tunnel de sous-chemins (`funnel`), en liste blanche ou en liste noire (`block:`). En mode `funnel`, choisissez le comportement en cas de clic hors périmètre :

- **`pathLockAction: "block"`** *(défaut)* : affiche l'écran PathLock avec les routes autorisées cliquables pour revenir directement dans le tunnel.
- **`pathLockAction: "fallback"`** : redirige automatiquement le visiteur vers une **page unique** du tunnel (`pathLockFallbackPath`, ou la page principale du lien si omis) avec un bandeau discret et une protection anti-boucle intégrée.

```typescript
// Exemple A — Mode Page unique (Strict)
const strictLink = await lsh.links.create({
  targetUrl: "https://maboutique.com/produit-luxe",
  slug: "produit-valide",
  pathLockMode: "strict", // "off" | "strict" | "funnel"
  pathLockPassword: "MonMotDePasseSecurite", // Jamais ré-exposé en clair via API publique
  pathLockMessage: "La navigation est restreinte à cette page de présentation.",
});

// Exemple B — Mode Tunnel (Funnel) avec redirection automatique (Fallback)
const funnelLink = await lsh.links.create({
  targetUrl: "https://maboutique.com/",
  slug: "tunnel-vente",
  pathLockMode: "funnel",
  // Liste blanche : routes autorisées séparées par des virgules
  // (ou préfixez par "block:" pour une liste noire, ex. "block:/pricing, /admin")
  pathLockPrefix: "/offre, /checkout",
  pathLockAction: "fallback", // "block" (écran PathLock) | "fallback" (redirection auto)
  pathLockFallbackPath: "/offre", // Page relative unique (omis => page principale du lien)
  pathLockMessage: "Accès hors périmètre — redirection vers la page autorisée.",
});

console.log("Lien sécurisé PathLock :", funnelLink.shortUrl);
```

| Paramètre | Type | Description |
| :--- | :--- | :--- |
| `pathLockMode` | `"off" \| "strict" \| "funnel"` | Mode de restriction de navigation (`off` par défaut). |
| `pathLockPrefix` | `string` | En mode `funnel`, préfixes autorisés (`/offre, /checkout`) ou bloqués (`block:/pricing, /admin`). |
| `pathLockAction` | `"block" \| "fallback"` | *(Mode `funnel` uniquement)* `block` affiche l'écran PathLock ; `fallback` redirige automatiquement vers une page autorisée. Réinitialisé à `block` hors mode `funnel`. |
| `pathLockFallbackPath` | `string` | *(Mode `funnel` + `fallback`)* Chemin relatif unique commençant par `/` (ex. `"/offre"`). Omis ou `null` = page principale du lien (`targetUrl`). Les URL absolues ou schémas externes (`//...`, `http://...`) sont rejetés (`422`). |
| `pathLockMessage` | `string` | Message personnalisé affiché sur l'écran PathLock ou dans le bandeau discret de redirection. |
| `pathLockPassword` | `string` | Code optionnel permettant de déverrouiller et quitter le périmètre restreint. |

---

### 5. Pixels de Retargeting — 9 plateformes (Plan PRO+)

Plateformes prises en charge : `meta` (`facebook`), `instagram`, `google` (`google_tag`), `youtube`, `tiktok`, `linkedin`, `pinterest`, `snapchat`, `x` (`twitter`).

```typescript
// 1. Enregistrer un pixel (ex. Pinterest Tag)
const pixel = await lsh.pixels.create({
  platform: "pinterest",
  pixelId: "2612345678901",
  name: "Pinterest Ads — Campagne Q4",
  isActive: true,
});

// 2. Associer vos pixels lors de la création d'un lien court
const trackedLink = await lsh.links.create({
  targetUrl: "https://maboutique.com/offre",
  pixels: [pixel.id],
});

// 3. Lister, consulter, mettre en pause ou supprimer
const allPixels = await lsh.pixels.list();
const onePixel = await lsh.pixels.get(pixel.id);
await lsh.pixels.update(pixel.id, { isActive: false });
await lsh.pixels.delete(pixel.id);
```

---

### 6. Webhooks temps réel signés HMAC-SHA256 (Plan PRO+)

Événements supportés : `click.created`, `click.unique`, `conversion.created`, `link.created`, `link.updated`, `link.deleted`, `link.expired`, `qr.scanned`, `target.reached`, `subscription.activated`, `subscription.cancelled`, `subscription.renewed`.

```typescript
// Créer un abonnement webhook (clé secrète HMAC générée automatiquement et immuable après création)
const webhook = await lsh.webhooks.create({
  name: "Backend Production",
  url: "https://mon-serveur.com/api/webhooks/lshorter",
  events: ["click.created", "conversion.created", "qr.scanned"],
  isActive: true,
});

console.log("Secret HMAC à vérifier :", webhook.secretKey);

// Lister, consulter, modifier (name, url, events, isActive) ou supprimer
const webhooks = await lsh.webhooks.list();
const fetched = await lsh.webhooks.get(webhook.id);
await lsh.webhooks.update(webhook.id, { name: "Backend Staging", isActive: false });
await lsh.webhooks.delete(webhook.id);
```

---

### 7. Suivre une conversion & Attribution Financière

Attribuez vos ventes, inscriptions et montants financiers à vos liens raccourcis avec l'identité complète du client (Avatar, Nom complet, Email) :

```typescript
await lsh.track.conversion({
  eventName: "purchase",
  amount: 49.99,
  currency: "EUR",
  linkId: link.id,
  clickId: "clk_9921ab01", // Optionnel
  customer: {
    id: "usr_123",
    email: "client@example.com",
    name: "Jean Dupont",
    fullName: "Jean Dupont",
    avatarUrl: "https://example.com/avatars/jean.jpg",
  },
});

// Lister l'historique paginé des conversions
const conversions = await lsh.track.list({ page: 1, limit: 20, linkId: link.id });
```

---

### 8. Analytics & export CSV

```typescript
const stats = await lsh.analytics.dashboard({ linkId: link.id });
const top = await lsh.analytics.top({ linkId: link.id });
const topLinks = await lsh.analytics.links({ limit: 10 });

console.log(`Total de clics : ${stats.totalClicks} | Revenus : ${stats.trackedRevenue} EUR`);
console.log("Top Pays :", top.topCountries);
console.log("Top Appareils :", top.topDevices);

// Export CSV des conversions (Plan PRO+)
const csv = await lsh.analytics.exportCsv({ linkId: link.id });
```

---

### 9. Domaines personnalisés

```typescript
const domain = await lsh.domains.create({ domain: "go.ma-marque.com" });
console.log("Enregistrements DNS à ajouter :", domain.dnsRecords);

const domains = await lsh.domains.list();
const status = await lsh.domains.get(domain.id);
const verified = await lsh.domains.verify(domain.id);
await lsh.domains.delete(domain.id);
```

---

### 10. Notifications / Objectifs & Gestion des erreurs typées

```typescript
import { LShorter, LShorterError } from "lshorter-api";

// Consulter vos alertes & objectifs (création réservée au Dashboard)
const alerts = await lsh.notifications.list(); // alias : lsh.targets.list()

// Gestion des erreurs typées
try {
  await lsh.links.create({ targetUrl: "javascript:alert(1)" });
} catch (err) {
  if (err instanceof LShorterError) {
    console.error(`Erreur HTTP ${err.status} (${err.code}) : ${err.message}`);
  }
}
```

---

## 🛠️ Référence des Méthodes du SDK

| Module | Méthode | Description |
| :--- | :--- | :--- |
| `lsh.links` | `.create(options)` | Créer un lien court (routage, A/B, PathLock™ strict/funnel/fallback, mot de passe, pixels, OG) |
| `lsh.links` | `.list(options)` | Lister ses liens avec pagination (`page`, `limit`) |
| `lsh.links` | `.get(id)` | Récupérer les détails d'un lien (mots de passe masqués) |
| `lsh.links` | `.update(id, options)` | Modifier la destination, le statut, les tags, les pixels ou le routage |
| `lsh.links` | `.delete(id)` | Supprimer un lien et purger le cache Edge |
| `lsh.track` | `.conversion(options)` | Enregistrer une conversion financière liée à un lien |
| `lsh.track` | `.list(options)` | Lister l'historique paginé des conversions (`page`, `limit`, `linkId`) |
| `lsh.analytics` | `.dashboard(options)` | Tableau de bord complet des clics, revenus, EPC et répartitions |
| `lsh.analytics` | `.top(options)` | Top pays, top appareils et top navigateurs |
| `lsh.analytics` | `.links(options)` | Classement des liens les plus performants |
| `lsh.analytics` | `.exportCsv(options)` | Exporter les événements au format CSV *(Plan PRO+)* |
| `lsh.domains` | `.create(options)` / `.list()` / `.get(id)` / `.verify(id)` / `.delete(id)` | Gérer et vérifier ses domaines personnalisés |
| `lsh.webhooks` | `.create(options)` / `.list()` / `.get(id)` / `.update(id, options)` / `.delete(id)` | Créer et gérer ses abonnements webhooks *(Plan PRO+)* |
| `lsh.pixels` | `.create(options)` / `.list()` / `.get(id)` / `.update(id, options)` / `.delete(id)` | Créer et gérer ses pixels de retargeting (9 plateformes — *Plan PRO+*) |
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
