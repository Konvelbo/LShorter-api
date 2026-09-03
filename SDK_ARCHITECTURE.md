# 🚀 Le Cœur de QuickLink : Guide Complet du SDK & Architecture

Bienvenue dans la documentation ultime du SDK QuickLink. Ce document est conçu pour vous donner envie d'intégrer notre solution en vous montrant précisément ce qui se passe sous le capot, et surtout, les **résultats concrets** que vous obtiendrez.

---

## 🌟 Avant-goût : Ce que le SDK fait pour vous

Avant de plonger dans les étapes d'implémentation, voici ce que vous allez gagner en utilisant notre SDK au lieu de faire vos requêtes "à la main". 

Oubliez les `any` obscurs et les vérifications manuelles. Avec QuickLink, **ce que vous codez est garanti par l'API**.

**Exemple de retour typé après la création d'un lien :**
```json
{
  "success": true,
  "data": {
    "id": "link_8x92a0zb",
    "shortUrl": "https://qk.link/r/promo-ete",
    "slug": "promo-ete",
    "domain": "qk.link",
    "targetUrl": "https://example.com/product",
    "qrCode": "data:image/png;base64,iVBORw0KGgo...",
    "geoTargeting": { "FR": "https://example.fr/promo" },
    "deviceTargeting": { "ios": "https://apps.apple.com/..." },
    "clicks": 0,
    "created_at": "2026-08-27T12:00:00.000Z"
  }
}
```
L'éditeur de code connaît cette structure par cœur. Si vous tapez `link.`, il vous proposera automatiquement `shortUrl`, `geoTargeting`, etc.

---

## 🧠 L'Architecture : "Zéro Friction" & Typage Strict

1. **Aucune dépendance lourde** : Le SDK utilise le `fetch` natif (compatible Node.js, Navigateur, Deno, Cloudflare Workers).
2. **Domain-Driven Design** : Le SDK est organisé par domaine (liens, tracking, analytics, domaines).
3. **Sécurité Zero-Trust** : Même si vous envoyez un email utilisateur via le SDK alors que vous êtes sur le plan Freemium, l'API interceptera la requête, écrasera la donnée personnelle (PII) par `null`, puis validera la conversion de manière anonyme. Le SDK transporte, l'API sécurise.

---

## 🛠️ Guide d'Implémentation & Résultats (Étape par Étape)

Voici comment orchestrer votre logique métier avec le SDK. Chaque étape est détaillée avec le code à implémenter et le résultat exact que l'API vous renverra.

### Étape 1 : Initialisation du Client

Le point d'entrée unique. Il centralise votre clé API et gère l'injection des headers d'autorisation (`Bearer`) pour toutes les requêtes suivantes.

```typescript
import { QuickLink } from '@quicklink/sdk';

// Initialisation globale
const qk = new QuickLink({
  apiKey: "sk_live_votreclefsecrète1234567890", 
  // baseUrl: "https://api.qk.link" // Surcharge optionnelle
});
```

---

### Étape 2 : Créer un Lien Intelligent (Geo & Device Targeting)

**La logique :** Vous ne voulez pas qu'un utilisateur iPhone en France atterrisse sur la même page qu'un utilisateur Windows aux États-Unis. Le SDK permet de paramétrer des règles de routage dynamiques qui seront résolues à l'Edge (par Cloudflare) en moins de 1 milliseconde lors du clic.

**Le Code :**
```typescript
const smartLink = await qk.links.create({
  targetUrl: "https://maboutique.com/international", // Fallback par défaut
  slug: "black-friday-26",                           // L'URL que le client verra
  geoTargeting: {
    "FR": "https://maboutique.fr/promo",             // Visiteurs Français
    "US": "https://maboutique.com/us-promo"          // Visiteurs US
  },
  deviceTargeting: {
    "ios": "https://apps.apple.com/app/id123456789", // Redirection App Store
    "android": "https://play.google.com/store/apps"  // Redirection Play Store
  }
});
```

**Résultat reçu (`smartLink`) :**
Vous recevez l'objet complet du lien fraîchement créé, prêt à être affiché ou partagé.
```json
{
  "id": "link_4f8g9h",
  "slug": "black-friday-26",
  "shortUrl": "https://qk.link/r/black-friday-26",
  "targetUrl": "https://maboutique.com/international",
  "qrCode": "data:image/png;base64,iVBOR...",
  "geoTargeting": { "FR": "https://maboutique.fr/promo", "US": "https://maboutique.com/us-promo" },
  "deviceTargeting": { "ios": "https://apps.apple.com/app/id123456789", "android": "https://play.google.com/store/apps" },
  "clicks": 0,
  "created_at": "2026-08-27T18:30:00.000Z"
}
```

---

### Étape 3 : Tracker un Achat (Conversion & ROI)

**La logique (La "Porte d'Entrée Universelle") :** C'est ici que l'outil prend toute sa valeur. Lorsqu'un utilisateur clique sur le lien court (ex: `qk.link/boutique`), il est redirigé vers la page d'accueil de votre boutique. S'il réalise un achat, que ce soit pour le produit A ou le produit B, vous pouvez prévenir l'API pour qu'elle attribue ce chiffre d'affaires au lien d'origine. 

Le lien court agit comme un entonnoir de conversion global : un seul lien partagé permet de mesurer le ROI complet d'une campagne publicitaire, car le `clickId` est conservé tout au long de la session d'achat de l'utilisateur !

**Le Code :**
```typescript
const conversion = await qk.track.conversion({
  eventName: "purchase",
  amount: 149.99,
  currency: "EUR",
  linkId: "link_4f8g9h",        // L'ID du lien qui a généré la visite (la porte d'entrée)
  // clickId: "clk_abc123",     // Optionnel mais recommandé : L'ID précis du clic conservé dans le cookie
  customer: {
    id: "usr_interne_44",       // Identifiant de votre client dans votre propre base
    email: "client@email.com",  // Anonymisé si Plan Freemium
    name: "Alice Dupont"        // Anonymisé si Plan Freemium
  }
});
```

**Résultat reçu (`conversion`) :**
L'API confirme l'enregistrement. Si vous êtes sur un plan Freemium, observez comment l'API a intelligemment purgé les données PII (`email` et `name` n'apparaissent pas).
```json
{
  "id": "evt_9b12c4x",
  "eventName": "purchase",
  "amount": 149.99,
  "currency": "EUR",
  "customerId": "usr_interne_44",
  "linkId": "link_4f8g9h",
  "clickId": null,
  "plan": "FREEMIUM",
  "created_at": "2026-08-27T18:45:00.000Z"
}
```

---

### Étape 4 : Extraire la data (Analytics)

**La logique :** Vous avez des clics et des achats. Il est temps de voir quels sont les pays les plus rentables et quel est votre taux de conversion.

**Le Code :**
```typescript
// Récupération des revenus générés par un lien spécifique
const dashboard = await qk.analytics.dashboard({ linkId: "link_4f8g9h" });

// Récupération des métadonnées de l'audience (Appareils et Pays)
const audienceStats = await qk.analytics.top({ linkId: "link_4f8g9h" });
```

**Résultats reçus :**
L'agrégation est faite côté serveur (base de données D1). Le SDK vous livre une data pure et exploitable instantanément pour afficher des graphiques.

*Retour du `dashboard` :*
```json
{
  "clicks": {
    "total": 12500,
    "thisMonth": 4320
  },
  "conversions": [
    {
      "conversions": 34,
      "revenue": 5099.66,
      "currency": "EUR"
    }
  ]
}
```

*Retour de `audienceStats` :*
```json
{
  "topCountries": [
    { "label": "FR", "count": 8500 },
    { "label": "BE", "count": 2100 },
    { "label": "US", "count": 1900 }
  ],
  "topDevices": [
    { "label": "mobile", "count": 9200 },
    { "label": "desktop", "count": 3300 }
  ]
}
```

---

### Étape 5 : Personnaliser la marque (Custom Domains)

**La logique :** Pour renforcer la confiance, vous souhaitez utiliser `link.votre-marque.com` au lieu de `qk.link`. Le SDK gère la création et la vérification des enregistrements DNS via Cloudflare SSL for SaaS.

**Le Code :**
```typescript
// 1. Déclarer le domaine
const domain = await qk.domains.create({ domain: "link.mon-super-site.com" });

// 2. Afficher les instructions DNS à l'utilisateur
console.log("Veuillez configurer :", domain.dnsRecords);

// 3. (Plus tard) Vérifier si la propagation DNS est terminée
const verification = await qk.domains.verify(domain.id);
```

**Résultat reçu à la création (`domain`) :**
Le SDK vous fournit exactement ce que votre client doit configurer chez son registrar (OVH, GoDaddy, etc.).
```json
{
  "id": "dom_789xyz",
  "domain": "link.mon-super-site.com",
  "status": "pending",
  "dnsRecords": [
    {
      "type": "CNAME",
      "name": "link.mon-super-site.com",
      "value": "qk.link",
      "ttl": 3600
    },
    {
      "type": "TXT",
      "name": "_quicklink-verify.link.mon-super-site.com",
      "value": "quicklink-verify=dom_789xyz",
      "ttl": 3600
    }
  ]
}
```

---

## 🎯 Conclusion & Gestion des erreurs

La sécurité est intégrée à chaque niveau. Si une requête échoue (ex: Quota de clics dépassé, ou domaine invalide), le SDK lance une erreur typée `QuickLinkError` contenant le code HTTP exact et le message clair renvoyé par l'API.

```typescript
try {
  await qk.links.create({ targetUrl: "not-a-url" });
} catch (e) {
  if (e instanceof QuickLinkError) {
    console.error(`Erreur ${e.status}: ${e.code}`); // Erreur 422: VALIDATION_ERROR
    console.error(e.message);                       // "targetUrl must be a valid URL"
  }
}
```

C'est ça l'expérience QuickLink. Un pont solide entre vos idées et l'infrastructure Edge de Cloudflare ! 🚀
