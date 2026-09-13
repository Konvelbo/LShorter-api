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

### 3. Créer un lien avec ciblage intelligent (Plan PRO)

```typescript
const smartLink = await lsh.links.create({
  targetUrl: "https://mon-site.com/default",
  slug: "app-download",
  // Rediriger les utilisateurs selon leur appareil
  deviceTargeting: {
    ios: "https://apps.apple.com/app/id123456789",
    android: "https://play.google.com/store/apps/details?id=com.app",
  },
  // Rediriger selon le pays
  geoTargeting: {
    FR: "https://mon-site.com/fr",
    US: "https://mon-site.com/en",
  },
});
```

---

### 4. Suivre une conversion (E-commerce / Inscription)

Attribuez vos ventes et vos leads à vos liens raccourcis :

```typescript
await lsh.track.conversion({
  eventName: "purchase",
  amount: 49.99,
  currency: "EUR",
  linkId: link.id,
  customer: {
    id: "usr_123",
    email: "client@example.com",
    name: "Jean Dupont",
  },
});
```

---

### 5. Consulter les statistiques d'un lien

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

### 6. Consulter et mettre à jour son profil utilisateur

Récupérez les informations de votre compte (email, nom complet, plan, quotas de clics et liens) :

```typescript
const user = await lsh.users.me();

console.log("Email :", user.email);
console.log("Nom complet :", user.fullName || user.name);
console.log("Plan actuel :", user.plan);
console.log("Liens créés :", user.linksCount);
console.log("Clics ce mois-ci :", user.clicksThisMonth);

// Mettre à jour son nom ou sa langue
await lsh.users.update({
  name: "Samuel KONVELBO",
  language: "fr",
});
```

---

## 🛠️ Méthodes Disponibles dans le SDK

| Module | Méthode | Description |
| :--- | :--- | :--- |
| `lsh.users` | `.me()` | Obtenir le profil de l'utilisateur (email, nom, plan, quotas) |
| `lsh.users` | `.update(options)` | Mettre à jour son nom complet, avatar, langue ou fuseau horaire |
| `lsh.links` | `.create(options)` | Créer un nouveau lien court |
| `lsh.links` | `.list(options)` | Lister ses liens avec pagination |
| `lsh.links` | `.get(id)` | Récupérer les détails d'un lien |
| `lsh.links` | `.update(id, options)` | Modifier l'URL cible, tags ou règles |
| `lsh.links` | `.delete(id)` | Supprimer un lien et purger le cache Edge |
| `lsh.track` | `.conversion(event)` | Enregistrer une conversion liée à un lien |
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
