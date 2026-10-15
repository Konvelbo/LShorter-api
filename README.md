# LShorter — Official TypeScript / JavaScript SDK

> **LShorter** est une plateforme moderne et ultra-rapide de raccourcissement de liens, de redirection intelligente à l'Edge (Cloudflare Workers) et de suivi avancé des conversions.

🌐 **Site officiel :** [https://lsho.cc](https://lsho.cc)  
👤 **Créé par :** **KONVELBO Samuel**

---

## 📌 À quoi sert l'API LShorter ?

L'API et le SDK **LShorter** permettent aux développeurs et aux entreprises d'intégrer facilement un moteur de liens courts performant directement dans leurs applications :

- ⚡ **Redirections Edge ultra-rapides (< 15ms)** propulsées par le réseau mondial Cloudflare.
- 🎯 **Ciblage & Routage intelligent** : Redirigez vos utilisateurs selon leur pays (Géo-ciblage) ou leur appareil (iOS, Android, Windows, Mac).
- 🔒 **Sécurité & Liens Protégés** : Protection de liens par mot de passe, expiration automatique et masquage d'URL (*cloaking*).
- 🛡️ **PathLock™ & Isolation de Navigation (Plan PRO)** : Verrouillez vos visiteurs sur une page unique (*strict*) ou un entonnoir de vente (*funnel*) avec écran de sécurité Edge anti-dispersion.
- 📊 **Analytics & Tracking de conversions** : Mesurez le nombre de clics, les pays, les navigateurs et suivez le chiffre d'affaires / conversions générés par chaque lien.
- 🏷️ **Domaines Personnalisés** : Connectez vos propres noms de domaine de marque facilement.

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

Obtenez votre clé API sur votre tableau de bord sur [https://lsho.cc](https://lsho.cc).

```typescript
import { LShorter } from "lshorter-api";

const lsh = new LShorter({
  apiKey: "lsh_live_xxxxxxxxxxxxxxxxxxxxxxxxxx",
  // Optionnel : baseUrl par défaut sur https://lsho.cc
  baseUrl: "https://lsho.cc",
});
```

---

### 2. Créer un lien court

```typescript
// Création d'un lien simple
const link = await lsh.links.create({
  targetUrl: "https://mon-site.com/produit-promo",
  slug: "promo-ete", // Optionnel : slug personnalisé (lsho.cc/promo-ete)
});

console.log("Lien court :", link.shortUrl);
console.log("QR Code :", link.qrCode);
```

---

### 3. Créer un lien avec ciblage intelligent (Pays, Continent, Navigateur & Appareil — Plan PRO)

```typescript
const smartLink = await lsh.links.create({
  targetUrl: "https://mon-site.com/default",
  slug: "app-download",
  // Règles de routage dynamique multi-conditions (Pays, Continent, Navigateur, OS, Appareil)
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
      conditions: [
        { id: "c3", type: "pays", operator: "est", value: "FR" },
      ],
    },
  ],
  // Ou ciblage direct par appareil :
  deviceTargeting: {
    ios: "https://apps.apple.com/app/id123456789",
    android: "https://play.google.com/store/apps/details?id=com.app",
  },
});
```

---

### 4. Créer un lien avec PathLock™ (Navigation Restreinte / Plan PRO)

Verrouillez vos visiteurs sur une page de destination unique ou isolez un entonnoir de conversion multi-étapes sans risque de dispersion :

```typescript
const pathLockedLink = await lsh.links.create({
  targetUrl: "https://maboutique.com/produit-luxe",
  slug: "produit-valide",
  // Mode d'isolation : 'strict' (mono-page) | 'funnel' (entonnoir & sous-chemins)
  pathLockMode: "strict",
  pathLockPrefix: "produit-luxe", // Optionnel : si vide en mode 'strict', verrouille sur l'URL exacte
  pathLockPassword: "MonMotDePasseSecurite", // Optionnel : permet à l'équipe de débloquer la navigation et le bouton source
  pathLockMessage: "La navigation est restreinte à cette page de présentation.",
});

console.log("Lien sécurisé PathLock :", pathLockedLink.shortUrl);
```

---

### 5. Suivre une conversion & Attribution Financière (E-commerce / Inscription / Vente)

Attribuez vos ventes, vos inscriptions et vos montants financiers à vos liens raccourcis. L'API et le SDK acceptent les informations complètes du client (Avatar, Nom complet, Email) qui seront automatiquement affichées dans la sous-page d'analyse des revenus du dashboard :

```typescript
await lsh.track.conversion({
  eventName: "purchase",
  amount: 49.99, // Montant réel en euros perçu lors du paiement
  currency: "EUR",
  linkId: link.id, // Ou slug du lien (ex: 'promo-ete')
  clickId: "clk_9921ab01", // Optionnel : ID du clic capturé lors de la visite
  customer: {
    id: "usr_123",
    email: "client@example.com",
    name: "Jean Dupont",
    fullName: "Jean Dupont",
    avatarUrl: "https://example.com/avatars/jean.jpg", // Photo de profil du client
  },
});
```

> 💡 **Remarque :** L'avatar fourni lors de la conversion est stocké dans la base de données Cloudflare D1 et s'affiche instantanément à l'extrême gauche de la liste des bénéficiaires sur la page d'analyse des revenus de LShorter.

---

### 6. Consulter les statistiques d'un lien

```typescript
const stats = await lsh.analytics.get({
  linkId: link.id,
  period: "30d", // "1d" | "7d" | "30d" | "90d" | "365d"
});

console.log(`Total de clics : ${stats.totalClicks}`);
console.log("Top Pays :", stats.topCountries);
console.log("Top Appareils :", stats.topDevices);
```

---

### 7. Consulter ses quotas et limites d'utilisation (Lecture seule)

Vérifiez l'état de votre abonnement et vos quotas mensuels (`plan`, `linksCount`, `linksLimit`, `clicksThisMonth`, `clicksLimit`) depuis votre serveur.

> 🔒 **Sécurité & Protection des données (PII) :** Pour protéger votre compte en cas d'exposition d'une clé API, les données personnelles (`nom`, `avatar`, `email` complet) sont masquées (`s***o@domaine.com`) et **aucune modification du profil ou du plan n'est autorisée via clé API** (`403 Forbidden`). Toute modification du profil s'effectue exclusivement depuis le Dashboard Web [https://lsho.cc](https://lsho.cc).

```typescript
const quotas = await lsh.users.quotas(); // ou await lsh.users.me()

console.log("Plan actuel :", quotas.plan);
console.log(`Liens utilisés : ${quotas.linksCount} / ${quotas.linksLimit}`);
console.log(`Clics ce mois-ci : ${quotas.clicksThisMonth} / ${quotas.clicksLimit}`);
console.log(`Domaines actifs : ${quotas.domainsCount} / ${quotas.domainsLimit}`);
```

---

## 🛠️ Méthodes Disponibles dans le SDK

| Module | Méthode | Description |
| :--- | :--- | :--- |
| `lsh.users` | `.quotas()` / `.me()` | Consulter en lecture seule le plan actif et les quotas (PII masquées, aucune écriture possible) |
| `lsh.links` | `.create(options)` | Créer un nouveau lien court (avec routage, PathLock™, mot de passe, etc.) |
| `lsh.links` | `.list(options)` | Lister ses liens avec pagination |
| `lsh.links` | `.get(id)` | Récupérer les détails d'un lien |
| `lsh.links` | `.update(id, options)` | Modifier l'URL cible, tags ou règles de routage d'un lien |
| `lsh.links` | `.delete(id)` | Supprimer un lien et purger le cache Edge |
| `lsh.track` | `.conversion(event)` | Enregistrer une conversion financière liée à un lien |
| `lsh.analytics` | `.dashboard(options)` | Consulter le tableau de bord des métriques |
| `lsh.analytics` | `.top(options)` | Top pays et top appareils |
| `lsh.domains` | `.list()` | Lister ses domaines personnalisés |
| `lsh.domains` | `.create(options)` | Ajouter un domaine personnalisé |
| `lsh.domains` | `.verify(id)` | Vérifier la configuration DNS d'un domaine |

---

## 👨‍💻 Auteur & Support

- **Développé par :** **KONVELBO Samuel**
- **Plateforme Officielle :** [https://lsho.cc](https://lsho.cc)
- **Licence :** MIT
