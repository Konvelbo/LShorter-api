# QuickLink API

QuickLink is an Edge-native link management and tracking backend built on Cloudflare Workers, Hono, D1, and KV. It provides lightning-fast URL redirection, powerful targeting (Geo & Device), and deep analytics directly at the Edge.

## Features

- **Blazing Fast Redirection**: Uses Cloudflare KV for sub-millisecond edge lookups.
- **Advanced Targeting**: Redirect users based on their Country (Geo) or Device (iOS, Android, Windows, macOS).
- **Asynchronous Click Tracking**: Fire-and-forget click logging to D1 with zero impact on user redirection latency.
- **Custom Domains**: Built-in support for Cloudflare SSL for SaaS. Bring your own domains.
- **Analytics & Conversion Tracking**: Native tracking for conversions and click stats.
- **Type-Safe**: 100% written in TypeScript with Zod validation.

## Tech Stack

- **Framework**: [Hono.js](https://hono.dev)
- **Runtime**: [Cloudflare Workers](https://workers.cloudflare.com)
- **Database**: [Cloudflare D1](https://developers.cloudflare.com/d1/) (SQLite at the edge)
- **Cache**: [Cloudflare Workers KV](https://developers.cloudflare.com/kv/)
- **Validation**: [Zod](https://zod.dev)
- **Testing**: [Vitest](https://vitest.dev) + `@cloudflare/vitest-pool-workers`

## Getting Started

### Prerequisites

- Node.js 18+
- `pnpm` installed
- Cloudflare account with Workers, KV, and D1 enabled.

### Installation

1. Clone the repository and install dependencies:
   ```bash
   pnpm install
   ```

2. Create a KV namespace and D1 Database via wrangler:
   ```bash
   wrangler kv namespace create URL_KV
   wrangler d1 create quicklink-db
   ```
   *Note: Update the IDs in your `wrangler.jsonc` file.*

3. Run migrations locally:
   ```bash
   pnpm run db:migrate:local
   ```

4. Start the local development server:
   ```bash
   pnpm run dev
   ```

## Testing

The API uses `vitest` to run isolated tests within Miniflare (Cloudflare's local simulator).

```bash
pnpm run test
```

## Deployment

To deploy to your Cloudflare account:

1. Apply the production database migrations:
   ```bash
   pnpm run db:migrate
   ```
2. Deploy the worker:
   ```bash
   pnpm run deploy
   ```

## License

This project is licensed under the MIT License.
