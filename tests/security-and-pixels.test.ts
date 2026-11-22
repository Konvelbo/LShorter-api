import { describe, it, expect, beforeEach } from "vitest";
import app from "../src/index";
import { sha256 } from "../src/lib/utils";
import {
  normalizeSafeHttpUrl,
  CreatePixelSchema,
  CreateLinkSchema,
  CreateWebhookSchema,
} from "../src/lib/schemas";
import {
  resolveRedirectActivePixels,
  renderRedirectPixelInterstitialHtml,
  REDIRECT_PIXEL_CSP,
} from "../src/lib/pixels";

const FRONTEND_SECRET = "super_real_frontend_secret_2026";
const PRO_API_KEY = "lsh_live_pro_attacker_key_000001";
const FREE_API_KEY = "lsh_live_free_user_key_000002";

const VALID_1X1_PNG_DATA_URI =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";

interface MockStore {
  users: Map<string, any>;
  apiKeys: Map<string, any>;
  links: Map<string, any>;
  pixels: Map<string, any>;
  webhooks: Map<string, any>;
  targets: Map<string, any>;
  clickEvents: any[];
  uploadedImages: Map<string, { id: string; mime_type: string; data: string }>;
  kv: Map<string, any>;
}

function createMockEnv(store: MockStore) {
  const DB = {
    prepare(sql: string) {
      let binds: any[] = [];
      const stmt = {
        bind(...args: any[]) {
          binds = args;
          return stmt;
        },
        async first<T = any>(): Promise<T | null> {
          const s = sql.replace(/\s+/g, " ").trim();

          if (s === "SELECT 1") return { "1": 1 } as any;

          if (s.includes("FROM api_keys k")) {
            const hash = binds[0];
            for (const k of store.apiKeys.values()) {
              if (k.key_hash === hash) {
                const u = store.users.get(k.user_id);
                return { keyId: k.id, userId: k.user_id, plan: u?.plan || "PRO" } as any;
              }
            }
            return null;
          }

          if (s.includes("FROM users WHERE id = ?")) {
            return (store.users.get(binds[0]) || null) as any;
          }

          if (s.includes("SELECT COUNT(*) as n FROM links WHERE user_id = ?")) {
            const uid = binds[0];
            let n = 0;
            for (const l of store.links.values()) if (l.user_id === uid) n++;
            return { n } as any;
          }

          if (s.includes("SELECT COUNT(*) as n FROM webhooks WHERE user_id = ?")) {
            const uid = binds[0];
            let n = 0;
            for (const w of store.webhooks.values()) if (w.user_id === uid) n++;
            return { n } as any;
          }

          if (s.includes("SELECT COUNT(*) as n FROM retargeting_pixels WHERE user_id = ?")) {
            const uid = binds[0];
            let n = 0;
            for (const p of store.pixels.values()) if (p.user_id === uid) n++;
            return { n } as any;
          }

          if (s.includes("FROM links WHERE id = ?") && !s.includes("OR slug")) {
            return (store.links.get(binds[0]) || null) as any;
          }

          if (s.includes("FROM links WHERE (id = ? OR slug = ?") && s.includes("AND user_id = ?")) {
            const [idOrSlug, , , uid] = binds;
            for (const l of store.links.values()) {
              if (
                l.user_id === uid &&
                (l.id === idOrSlug || l.slug === idOrSlug || l.slug.toLowerCase() === String(idOrSlug).toLowerCase())
              ) {
                return l as any;
              }
            }
            return null;
          }

          if (s.includes("FROM links WHERE id = ? OR slug = ?")) {
            const idOrSlug = binds[0];
            for (const l of store.links.values()) {
              if (l.id === idOrSlug || l.slug === idOrSlug || l.slug.toLowerCase() === String(idOrSlug).toLowerCase()) {
                return l as any;
              }
            }
            return null;
          }

          if (s.includes("FROM links WHERE (slug = ?")) {
            const slug = String(binds[0]).toLowerCase();
            for (const l of store.links.values()) {
              if (l.slug.toLowerCase() === slug) return l as any;
            }
            return null;
          }

          if (s.includes("FROM retargeting_pixels WHERE id = ?")) {
            return (store.pixels.get(binds[0]) || null) as any;
          }

          if (s.includes("FROM webhooks WHERE id = ?")) {
            return (store.webhooks.get(binds[0]) || null) as any;
          }

          if (s.includes("FROM target_alerts WHERE id = ?")) {
            return (store.targets.get(binds[0]) || null) as any;
          }

          if (s.includes("FROM uploaded_images WHERE id = ?")) {
            return (store.uploadedImages.get(binds[0]) || null) as any;
          }

          return null;
        },
        async all<T = any>(): Promise<{ results: T[] }> {
          const s = sql.replace(/\s+/g, " ").trim();

          if (s.includes("FROM retargeting_pixels") && s.includes("WHERE user_id = ?")) {
            const uid = binds[0];
            const results = [...store.pixels.values()].filter((p) => p.user_id === uid);
            return { results: results as any };
          }

          if (s.includes("FROM webhooks") && s.includes("WHERE user_id = ?")) {
            const uid = binds[0];
            const results = [...store.webhooks.values()].filter((w) => w.user_id === uid);
            return { results: results as any };
          }

          if (s.includes("FROM target_alerts") && s.includes("WHERE ta.user_id = ?")) {
            const uid = binds[0];
            const results = [...store.targets.values()].filter((t) => t.user_id === uid);
            return { results: results as any };
          }

          if (s.includes("FROM links WHERE id IN (")) {
            const hasUserScope = s.includes("AND user_id = ?");
            const ids = hasUserScope ? binds.slice(0, -1) : binds;
            const uid = hasUserScope ? binds[binds.length - 1] : null;
            const results = [...store.links.values()].filter(
              (l) => ids.includes(l.id) && (!hasUserScope || l.user_id === uid),
            );
            return { results: results as any };
          }

          if (s.includes("FROM links WHERE user_id = ?")) {
            const uid = binds[0];
            const results = [...store.links.values()].filter((l) => l.user_id === uid);
            return { results: results as any };
          }

          if (s.includes("FROM links WHERE id = ? AND user_id = ?")) {
            const [lid, uid] = binds;
            const l = store.links.get(lid);
            return { results: l && l.user_id === uid ? [l] : ([] as any) };
          }

          if (s.includes("FROM click_events")) {
            const hasLink = s.includes("link_id = ?");
            const hasUser = s.includes("user_id = ?");
            const results = store.clickEvents.filter((ev) => {
              if (hasUser && hasLink) {
                return ev.user_id === binds[0] && ev.link_id === binds[1];
              }
              if (hasUser) return ev.user_id === binds[0];
              if (hasLink) return ev.link_id === binds[0];
              return true;
            });
            return { results: results as any };
          }

          return { results: [] };
        },
        async run() {
          const s = sql.replace(/\s+/g, " ").trim();

          if (s.startsWith("INSERT INTO links")) {
            const row = {
              id: binds[0],
              user_id: binds[1],
              domain_id: binds[2],
              domain_name: binds[3],
              slug: binds[4],
              short_url: binds[5],
              target_url: binds[6],
              routing_rules: binds[7],
              geo_targeting: binds[8],
              device_targeting: binds[9],
              is_active: binds[10],
              expires_at: binds[11],
              password_hash: binds[12],
              is_password_protected: binds[13],
              tags: binds[14],
              is_cloaked: binds[15],
              hide_referrer: binds[16],
              meta_title: binds[17],
              og_title: binds[18],
              og_description: binds[19],
              og_image: binds[20],
              twitter_card: binds[21],
              banner_style: binds[22],
              ab_variations: binds[23],
              main_weight: binds[24],
              redirect_type: binds[25],
              pass_params: binds[26],
              max_clicks: binds[27],
              fallback_url: binds[28],
              password_plain: binds[29],
              path_lock_mode: binds[30],
              path_lock_prefix: binds[31],
              path_lock_message: binds[32],
              path_lock_password: binds[33],
              pixels: binds[34],
              clicks_count: 0,
              unique_clicks: 0,
              created_at: binds[35],
              updated_at: binds[36],
            };
            store.links.set(row.id, row);
            return { meta: { changes: 1 } };
          }

          if (s.startsWith("DELETE FROM links WHERE id = ?")) {
            const deleted = store.links.delete(binds[0]) ? 1 : 0;
            return { meta: { changes: deleted } };
          }

          if (s.startsWith("DELETE FROM links WHERE id IN (")) {
            let changes = 0;
            for (const id of binds) if (store.links.delete(id)) changes++;
            return { meta: { changes } };
          }

          if (s.startsWith("INSERT INTO retargeting_pixels")) {
            const row = {
              id: binds[0],
              user_id: binds[1],
              platform: binds[2],
              pixel_id: binds[3],
              name: binds[4],
              is_active: binds[5],
              events_tracked_count: 0,
              created_at: binds[6],
            };
            store.pixels.set(row.id, row);
            return { meta: { changes: 1 } };
          }

          if (s.startsWith("UPDATE retargeting_pixels SET events_tracked_count")) {
            for (const id of binds) {
              const p = store.pixels.get(id);
              if (p) p.events_tracked_count = Number(p.events_tracked_count || 0) + 1;
            }
            return { meta: { changes: binds.length } };
          }

          if (s.startsWith("INSERT INTO webhooks")) {
            const row = {
              id: binds[0],
              user_id: binds[1],
              url: binds[2],
              events: binds[3],
              secret_key: binds[4],
              is_active: binds[5],
              last_triggered_at: null,
              last_status: 200,
              created_at: binds[6],
            };
            store.webhooks.set(row.id, row);
            return { meta: { changes: 1 } };
          }

          if (s.startsWith("UPDATE webhooks SET")) {
            const id = binds[binds.length - 1];
            const row = store.webhooks.get(id);
            if (row) {
              if (s.includes("is_active = ?")) row.is_active = binds[0];
              if (s.includes("last_status = ?")) row.last_status = 999;
            }
            return { meta: { changes: row ? 1 : 0 } };
          }

          if (s.startsWith("DELETE FROM webhooks WHERE id = ?")) {
            return { meta: { changes: store.webhooks.delete(binds[0]) ? 1 : 0 } };
          }

          if (s.startsWith("DELETE FROM retargeting_pixels WHERE id = ?")) {
            return { meta: { changes: store.pixels.delete(binds[0]) ? 1 : 0 } };
          }

          if (s.startsWith("INSERT INTO target_alerts")) {
            const row = {
              id: binds[0],
              user_id: binds[1],
              link_id: binds[2],
              title: binds[3],
              metric_type: binds[4],
              target_value: binds[6],
              status: "active",
            };
            store.targets.set(row.id, row);
            return { meta: { changes: 1 } };
          }

          if (s.startsWith("INSERT OR REPLACE INTO uploaded_images")) {
            store.uploadedImages.set(binds[0], {
              id: binds[0],
              mime_type: binds[1],
              data: binds[2],
            });
            return { meta: { changes: 1 } };
          }

          return { meta: { changes: 1 } };
        },
      };
      return stmt;
    },
  };

  const URL_KV = {
    async get(key: string, type?: string) {
      const val = store.kv.get(key);
      if (val === undefined) return null;
      if (type === "json") return typeof val === "string" ? JSON.parse(val) : val;
      if (type === "arrayBuffer") return val instanceof Uint8Array ? val.buffer : val;
      return typeof val === "string" ? val : JSON.stringify(val);
    },
    async put(key: string, value: any) {
      store.kv.set(key, value);
    },
    async delete(key: string) {
      store.kv.delete(key);
    },
  };

  return {
    DB: DB as any,
    URL_KV: URL_KV as any,
    DEFAULT_DOMAIN: "lsho.cc",
    CF_ACCOUNT_ID: "",
    CF_API_TOKEN: "",
    FRONTEND_API_SECRET: FRONTEND_SECRET,
    HASH_SALT: "test_salt",
  };
}

describe("LShorter API Security Hardening & 9-Platform Pixels", () => {
  let store: MockStore;
  let env: ReturnType<typeof createMockEnv>;
  const execCtx = { waitUntil: (p: Promise<any>) => { void p; }, passThroughOnException: () => {} } as any;

  beforeEach(async () => {
    store = {
      users: new Map([
        ["usr_attacker", { id: "usr_attacker", email: "attacker@example.com", name: "Attacker", plan: "PRO" }],
        ["usr_free", { id: "usr_free", email: "free@example.com", name: "Free", plan: "FREEMIUM" }],
        ["usr_victim", { id: "usr_victim", email: "victim@example.com", name: "Victim", plan: "PRO" }],
      ]),
      apiKeys: new Map([
        ["key_pro", { id: "key_pro", user_id: "usr_attacker", key_hash: await sha256(PRO_API_KEY) }],
        ["key_free", { id: "key_free", user_id: "usr_free", key_hash: await sha256(FREE_API_KEY) }],
      ]),
      links: new Map([
        [
          "link_victim_1",
          {
            id: "link_victim_1",
            user_id: "usr_victim",
            domain_name: "lsho.cc",
            slug: "victim-secret",
            target_url: "https://victim-private.example.com/vault",
            is_active: 1,
            password_hash: await sha256("VictimPass123"),
            password_plain: "VictimPass123",
            path_lock_password: "VictimPin999",
            clicks_count: 42,
            pixels: null,
            created_at: new Date().toISOString(),
          },
        ],
      ]),
      pixels: new Map([
        [
          "px_victim_1",
          {
            id: "px_victim_1",
            user_id: "usr_victim",
            platform: "pinterest",
            pixel_id: "2612345678901",
            name: "Victim Pin",
            is_active: 1,
            events_tracked_count: 5,
            created_at: new Date().toISOString(),
          },
        ],
      ]),
      webhooks: new Map([
        [
          "wh_victim_1",
          {
            id: "wh_victim_1",
            user_id: "usr_victim",
            url: "https://hooks.victim.example.com/events",
            events: JSON.stringify(["click.created"]),
            secret_key: "whsec_victim_secret",
            is_active: 1,
            created_at: new Date().toISOString(),
          },
        ],
      ]),
      targets: new Map(),
      clickEvents: [
        {
          id: "clk_victim_1",
          link_id: "link_victim_1",
          user_id: "usr_victim",
          slug: "victim-secret",
          country_code: "FR",
          city: "Paris",
          device: "Desktop",
          browser: "Chrome",
          os: "macOS",
          referrer: "Direct",
          resolved_url: "https://victim-private.example.com/vault",
          is_unique: 1,
          timestamp: new Date().toISOString(),
        },
      ],
      uploadedImages: new Map(),
      kv: new Map(),
    };
    env = createMockEnv(store);
  });

  // ── 1. Auth bypass regression ──────────────────────────────────────────────
  it("blocks spoofed lsh_ prefix, test_secret, and test_frontend_secret on all routes", async () => {
    const routes = [
      "/api/v1/pixels?userId=usr_victim",
      "/api/v1/webhooks?userId=usr_victim",
      "/api/v1/targets?userId=usr_victim",
      "/api/v1/analytics?userId=usr_victim",
      "/api/v1/users/usr_victim/keys",
    ];
    const forgedSecrets = ["lsh_anything_spoofed", "test_secret", "test_frontend_secret"];

    for (const secret of forgedSecrets) {
      for (const path of routes) {
        const res = await app.fetch(
          new Request(`https://api.test${path}`, {
            headers: {
              "X-Frontend-Secret": secret,
              Authorization: `Bearer ${secret}`,
              "X-User-Id": "usr_victim",
            },
          }),
          env,
          execCtx,
        );
        expect([401, 403], `${path} with ${secret}`).toContain(res.status);
      }
    }
  });

  // ── 2. Server-side SDK security controls on webhooks, pixels, and targets ──
  it("enforces PRO plan gating, ownership binding, loop/XSS/quota limits on SDK webhooks & pixels, while keeping targets Dashboard-only", async () => {
    // 2a. Targets / notifications creation remains strictly Dashboard-only (403 FORBIDDEN_SDK_CREATE)
    const tgtRes = await app.fetch(
      new Request("https://api.test/api/v1/targets?userId=usr_frontend_master", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${PRO_API_KEY}`,
          "X-Frontend-Secret": "lsh_spoofed_header",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ metricType: "clicks", targetValue: 100 }),
      }),
      env,
      execCtx,
    );
    expect(tgtRes.status).toBe(403);
    expect(((await tgtRes.json()) as any).code).toBe("FORBIDDEN_SDK_CREATE");

    // 2b. Free-tier API keys are strictly blocked (403 PLAN_UPGRADE_REQUIRED) on webhooks, pixels, and link pixel attachment
    for (const [path, body] of [
      ["/api/v1/webhooks", { url: "https://example.com/hook", events: ["click.created"] }],
      ["/api/v1/pixels", { platform: "pinterest", pixelId: "2612345678901", name: "Free Pin" }],
      ["/api/v1/links", { targetUrl: "https://example.com", pixels: ["px_any"] }],
    ] as const) {
      const res = await app.fetch(
        new Request(`https://api.test${path}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${FREE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        }),
        env,
        execCtx,
      );
      expect(res.status, `free tier ${path}`).toBe(403);
      expect(((await res.json()) as any).code).toBe("PLAN_UPGRADE_REQUIRED");
    }

    // 2c. PRO API key CAN create its own webhook, and spoofed userId is strictly ignored (always bound to auth.userId)
    const whCreate = await app.fetch(
      new Request("https://api.test/api/v1/webhooks?userId=usr_victim", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${PRO_API_KEY}`,
          "X-User-Id": "usr_victim",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: "usr_victim",
          url: "https://hooks.example.com/events",
          events: ["click.created", "qr.scanned"],
        }),
      }),
      env,
      execCtx,
    );
    expect(whCreate.status).toBe(200);
    const whJson: any = await whCreate.json();
    expect(whJson.data.webhook.userId).toBe("usr_attacker");
    expect(whJson.data.webhook.secretKey).toMatch(/^whsec_[0-9a-f]{32}$/);

    // 2d. Public API key cannot spoof lastStatus on PATCH webhook
    const whPatch = await app.fetch(
      new Request(`https://api.test/api/v1/webhooks/${whJson.data.webhook.id}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${PRO_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ isActive: false, lastStatus: 999 }),
      }),
      env,
      execCtx,
    );
    expect(whPatch.status).toBe(200);
    expect(store.webhooks.get(whJson.data.webhook.id).last_status).toBe(200);

    // 2e. Self-referencing webhook loop, invalid event name, and HTML pixel name rejected (422)
    const selfLoop = await app.fetch(
      new Request("https://api.test/api/v1/webhooks", {
        method: "POST",
        headers: { Authorization: `Bearer ${PRO_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ url: "https://lsho.cc/api/v1/links", events: ["click.created"] }),
      }),
      env,
      execCtx,
    );
    expect(selfLoop.status).toBe(422);

    const badEvent = await app.fetch(
      new Request("https://api.test/api/v1/webhooks", {
        method: "POST",
        headers: { Authorization: `Bearer ${PRO_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ url: "https://hooks.example.com/a", events: ["not.a.real.event"] }),
      }),
      env,
      execCtx,
    );
    expect(badEvent.status).toBe(422);

    const xssPixelName = await app.fetch(
      new Request("https://api.test/api/v1/pixels", {
        method: "POST",
        headers: { Authorization: `Bearer ${PRO_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ platform: "pinterest", pixelId: "2612345678901", name: "<script>alert(1)</script>" }),
      }),
      env,
      execCtx,
    );
    expect(xssPixelName.status).toBe(422);

    // 2f. Cross-tenant pixel attachment blocked on POST /api/v1/links (403 FORBIDDEN_PIXEL)
    const foreignPxLink = await app.fetch(
      new Request("https://api.test/api/v1/links", {
        method: "POST",
        headers: { Authorization: `Bearer ${PRO_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ targetUrl: "https://example.com/steal-px", pixels: ["px_victim_1"] }),
      }),
      env,
      execCtx,
    );
    expect(foreignPxLink.status).toBe(403);
    expect(((await foreignPxLink.json()) as any).code).toBe("FORBIDDEN_PIXEL");

    // 2g. Per-user webhook quota cap enforced (max 25 -> 403 WEBHOOK_LIMIT_REACHED)
    for (let i = 0; i < 24; i++) {
      store.webhooks.set(`wh_fill_${i}`, {
        id: `wh_fill_${i}`,
        user_id: "usr_attacker",
        url: `https://hooks.example.com/fill/${i}`,
        events: JSON.stringify(["click.created"]),
        secret_key: "whsec_fill",
        is_active: 1,
        created_at: new Date().toISOString(),
      });
    }
    const overQuota = await app.fetch(
      new Request("https://api.test/api/v1/webhooks", {
        method: "POST",
        headers: { Authorization: `Bearer ${PRO_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ url: "https://hooks.example.com/over-quota", events: ["click.created"] }),
      }),
      env,
      execCtx,
    );
    expect(overQuota.status).toBe(403);
    expect(((await overQuota.json()) as any).code).toBe("WEBHOOK_LIMIT_REACHED");
  });

  // ── 3. IDOR protection across links, pixels, webhooks, and analytics ───────
  it("blocks cross-user IDOR on links GET/PATCH/DELETE/bulk-delete, pixels, webhooks, and analytics", async () => {
    const headers = {
      Authorization: `Bearer ${PRO_API_KEY}`,
      "X-User-Id": "usr_frontend_master",
      "Content-Type": "application/json",
    };

    const getLink = await app.fetch(
      new Request("https://api.test/api/v1/links/link_victim_1?userId=usr_frontend_master", { headers }),
      env,
      execCtx,
    );
    expect(getLink.status).toBe(403);

    const patchLink = await app.fetch(
      new Request("https://api.test/api/v1/links/link_victim_1", {
        method: "PATCH",
        headers,
        body: JSON.stringify({ targetUrl: "https://evil.example.com" }),
      }),
      env,
      execCtx,
    );
    expect(patchLink.status).toBe(403);

    const deleteLink = await app.fetch(
      new Request("https://api.test/api/v1/links/link_victim_1?userId=usr_frontend_master", {
        method: "DELETE",
        headers,
      }),
      env,
      execCtx,
    );
    expect(deleteLink.status).toBe(403);

    const bulkDel = await app.fetch(
      new Request("https://api.test/api/v1/links/bulk-delete?userId=usr_frontend_master", {
        method: "POST",
        headers,
        body: JSON.stringify({ ids: ["link_victim_1"] }),
      }),
      env,
      execCtx,
    );
    expect(bulkDel.status).toBe(200);
    const bulkJson: any = await bulkDel.json();
    expect(bulkJson.data.deletedCount).toBe(0);
    expect(store.links.has("link_victim_1")).toBe(true);

    const getPixel = await app.fetch(
      new Request("https://api.test/api/v1/pixels/px_victim_1", { headers }),
      env,
      execCtx,
    );
    expect(getPixel.status).toBe(403);

    const getWebhook = await app.fetch(
      new Request("https://api.test/api/v1/webhooks/wh_victim_1", { headers }),
      env,
      execCtx,
    );
    expect(getWebhook.status).toBe(403);

    const getAnalytics = await app.fetch(
      new Request("https://api.test/api/v1/analytics?linkId=link_victim_1", { headers }),
      env,
      execCtx,
    );
    expect(getAnalytics.status).toBe(200);
    const analyticsJson: any = await getAnalytics.json();
    expect(analyticsJson.data.totalClicks).toBe(0);
    expect(analyticsJson.data.liveClickEvents).toEqual([]);
  });

  // ── 4. Plan escalation via forged headers/body blocked ─────────────────────
  it("blocks free-tier API keys from escalating to ENTERPRISE via X-User-Plan / X-User-Email", async () => {
    const res = await app.fetch(
      new Request("https://api.test/api/v1/links", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${FREE_API_KEY}`,
          "X-User-Plan": "ENTERPRISE",
          "X-User-Email": "fiatechnologiecam@gmail.com",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          targetUrl: "https://example.com",
          userPlan: "ENTERPRISE",
          geoTargeting: { FR: "https://example.fr" },
        }),
      }),
      env,
      execCtx,
    );
    expect(res.status).toBe(403);
    const json: any = await res.json();
    expect(json.code).toBe("PLAN_UPGRADE_REQUIRED");
  });

  // ── 5. Plaintext password redaction for public API keys ────────────────────
  it("never exposes plaintext password or pathLockPassword to public API keys", async () => {
    const createRes = await app.fetch(
      new Request("https://api.test/api/v1/links", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${PRO_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          targetUrl: "https://example.com/protected",
          password: "SuperSecretPassword123!",
          pathLockMode: "strict",
          pathLockPassword: "PathLockSecret456!",
        }),
      }),
      env,
      execCtx,
    );
    expect(createRes.status).toBe(201);
    const created: any = await createRes.json();
    expect(created.data.hasPassword).toBe(true);
    expect(created.data.hasPathLockPassword).toBe(true);
    expect(created.data.password).toBeUndefined();
    expect(created.data.password_plain).toBeUndefined();
    expect(created.data.password_hash).toBeUndefined();
    expect(created.data.pathLockPassword).toBeUndefined();
    expect(created.data.path_lock_password).toBeUndefined();

    const getRes = await app.fetch(
      new Request(`https://api.test/api/v1/links/${created.data.id}`, {
        headers: { Authorization: `Bearer ${PRO_API_KEY}` },
      }),
      env,
      execCtx,
    );
    expect(getRes.status).toBe(200);
    const fetched: any = await getRes.json();
    expect(fetched.data.hasPassword).toBe(true);
    expect(fetched.data.hasPathLockPassword).toBe(true);
    expect(fetched.data.password).toBeUndefined();
    expect(fetched.data.password_plain).toBeUndefined();
    expect(fetched.data.password_hash).toBeUndefined();
    expect(fetched.data.pathLockPassword).toBeUndefined();
    expect(fetched.data.path_lock_password).toBeUndefined();

    // List endpoint also redacts passwords for public API keys
    const listRes = await app.fetch(
      new Request("https://api.test/api/v1/links", {
        headers: { Authorization: `Bearer ${PRO_API_KEY}` },
      }),
      env,
      execCtx,
    );
    expect(listRes.status).toBe(200);
    const listed: any = await listRes.json();
    const rawListJson = JSON.stringify(listed);
    expect(rawListJson).not.toContain("SuperSecretPassword123!");
    expect(rawListJson).not.toContain("PathLockSecret456!");

    // Dashboard master still gets edit-drawer fields (never password_hash)
    const dashRes = await app.fetch(
      new Request(`https://api.test/api/v1/links/${created.data.id}?userId=usr_attacker`, {
        headers: { "X-Frontend-Secret": FRONTEND_SECRET },
      }),
      env,
      execCtx,
    );
    expect(dashRes.status).toBe(200);
    const dashJson: any = await dashRes.json();
    expect(dashJson.data.password).toBe("SuperSecretPassword123!");
    expect(dashJson.data.pathLockPassword).toBe("PathLockSecret456!");
    expect(dashJson.data.password_hash).toBeUndefined();
  });

  // ── 6. XSS protocol, SSRF, and negative maxClicks validation ───────────────
  it("rejects dangerous protocols, SSRF internal hosts, and invalid maxClicks", () => {
    const unsafeUrls = [
      "javascript:alert(1)",
      "JAVASCRIPT:alert(document.cookie)",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox(1)",
      "file:///etc/passwd",
      "ftp://example.com/file",
      "http://169.254.169.254/latest/meta-data/",
      "http://127.0.0.1:8787/admin",
      "http://localhost:3000/api/secret",
      "http://10.0.0.1/internal",
      "http://172.16.0.5/internal",
      "http://192.168.1.1/router",
      "http://[::1]/admin",
      "http://[::ffff:127.0.0.1]/admin",
      "http://metadata.google.internal/computeMetadata/v1/",
      "http://0x7f000001/",
    ];

    for (const u of unsafeUrls) {
      expect(normalizeSafeHttpUrl(u), `should block ${u}`).toBeNull();
    }

    expect(normalizeSafeHttpUrl("https://example.com/ok?a=1")).toBe("https://example.com/ok?a=1");
    expect(normalizeSafeHttpUrl("example.com/path")).toBe("https://example.com/path");

    // Link schema rejects javascript: in geoTargeting, fallbackUrl, abVariations, routingRules, and negative maxClicks
    expect(
      CreateLinkSchema.safeParse({
        targetUrl: "https://example.com",
        geoTargeting: { FR: "javascript:alert(1)" },
      }).success,
    ).toBe(false);

    expect(
      CreateLinkSchema.safeParse({
        targetUrl: "https://example.com",
        fallbackUrl: "javascript:alert(1)",
      }).success,
    ).toBe(false);

    expect(
      CreateLinkSchema.safeParse({
        targetUrl: "https://example.com",
        abVariations: [{ url: "http://169.254.169.254/latest/meta-data/", weight: 50 }],
      }).success,
    ).toBe(false);

    expect(
      CreateLinkSchema.safeParse({
        targetUrl: "https://example.com",
        maxClicks: -99999,
      }).success,
    ).toBe(false);

    expect(
      CreateWebhookSchema.safeParse({
        url: "http://169.254.169.254/latest/meta-data/",
      }).success,
    ).toBe(false);
  });

  // ── 7. Authenticated & MIME-validated image upload ─────────────────────────
  it("protects /api/v1/upload-image with auth, MIME whitelist, and magic bytes", async () => {
    // Unauthenticated -> 401
    const unauth = await app.fetch(
      new Request("https://api.test/api/v1/upload-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: VALID_1X1_PNG_DATA_URI }),
      }),
      env,
      execCtx,
    );
    expect(unauth.status).toBe(401);

    // Authenticated HTML / SVG -> 400
    const badMime = await app.fetch(
      new Request("https://api.test/api/v1/upload-image", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${PRO_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          data: `data:image/svg+xml;base64,${btoa("<svg onload=alert(1)></svg>")}`,
        }),
      }),
      env,
      execCtx,
    );
    expect(badMime.status).toBe(400);

    // Spoofed PNG header with HTML body -> 400 (magic-byte check!)
    const spoofedPng = await app.fetch(
      new Request("https://api.test/api/v1/upload-image", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${PRO_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          data: `data:image/png;base64,${btoa("<script>alert(1)</script>")}`,
        }),
      }),
      env,
      execCtx,
    );
    expect(spoofedPng.status).toBe(400);

    // Valid PNG -> 200
    const validUpload = await app.fetch(
      new Request("https://api.test/api/v1/upload-image", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${PRO_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ data: VALID_1X1_PNG_DATA_URI }),
      }),
      env,
      execCtx,
    );
    expect(validUpload.status).toBe(200);
    const upJson: any = await validUpload.json();
    expect(upJson.success).toBe(true);
    expect(upJson.imageId).toMatch(/^banner_.*\.png$/);

    // Serving the image includes strict sandbox CSP & nosniff
    const imgRes = await app.fetch(
      new Request(`https://api.test/api/v1/images/${upJson.imageId}`),
      env,
      execCtx,
    );
    expect(imgRes.status).toBe(200);
    expect(imgRes.headers.get("content-type")).toBe("image/png");
    expect(imgRes.headers.get("content-security-policy")).toContain("sandbox");
  });

  // ── 8. Full 9-platform retargeting pixel targeting (Pinterest, Snapchat, IG, YT, X...) ──
  it("supports creating and firing all 9 retargeting pixel platforms on edge redirect", async () => {
    const allPlatforms = [
      { platform: "meta", pixelId: "123456789012345", name: "Meta Main", marker: "fbq('init',\"123456789012345\")" },
      { platform: "instagram", pixelId: "987654321098765", name: "IG Stories", marker: "fbq('init',\"987654321098765\")" },
      { platform: "google", pixelId: "G-ABC1234567", name: "GA4", marker: "gtag('config',\"G-ABC1234567\")" },
      { platform: "youtube", pixelId: "AW-987654321", name: "YouTube Ads", marker: "gtag('config',\"AW-987654321\")" },
      { platform: "tiktok", pixelId: "C1234567890ABCDEF", name: "TikTok", marker: "ttq.load(\"C1234567890ABCDEF\")" },
      { platform: "linkedin", pixelId: "5432109", name: "LinkedIn", marker: "_linkedin_data_partner_ids.push(\"5432109\")" },
      { platform: "pinterest", pixelId: "2612345678902", name: "Pinterest Tag", marker: "pintrk('load',\"2612345678902\")" },
      { platform: "snapchat", pixelId: "a1b2c3d4-e5f6-47a8", name: "Snap Pixel", marker: "snaptr('init',\"a1b2c3d4-e5f6-47a8\")" },
      { platform: "x", pixelId: "o12ab", name: "X Ads", marker: "twq('config',\"o12ab\")" },
    ];

    // Reject XSS pixel ID
    expect(
      CreatePixelSchema.safeParse({
        platform: "pinterest",
        pixelId: "\"><script>alert(1)</script>",
        name: "XSS",
      }).success,
    ).toBe(false);

    const createdPixelIds: string[] = [];
    for (const p of allPlatforms) {
      // Create all 9 pixel platforms directly via PRO public API key (SDK flow)
      const res = await app.fetch(
        new Request("https://api.test/api/v1/pixels", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${PRO_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(p),
        }),
        env,
        execCtx,
      );
      expect(res.status, `create ${p.platform}`).toBe(200);
      const json: any = await res.json();
      expect(json.data.pixel.platform).toBe(p.platform);
      expect(json.data.pixel.userId).toBe("usr_attacker");
      createdPixelIds.push(json.data.pixel.id);
    }

    // Create link attaching all 9 pixels
    const linkRes = await app.fetch(
      new Request("https://api.test/api/v1/links", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${PRO_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          targetUrl: "https://shop.example.com/promo",
          slug: "promo-9-pixels",
          pixels: createdPixelIds,
        }),
      }),
      env,
      execCtx,
    );
    expect(linkRes.status).toBe(201);

    // Human browser visits /r/promo-9-pixels -> gets pixel interstitial with all 9 snippets + strict CSP
    const redirRes = await app.fetch(
      new Request("https://lsho.cc/r/promo-9-pixels", {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0" },
      }),
      env,
      execCtx,
    );
    expect(redirRes.status).toBe(200);
    expect(redirRes.headers.get("content-type")).toContain("text/html");
    expect(redirRes.headers.get("content-security-policy")).toBe(REDIRECT_PIXEL_CSP);
    expect(redirRes.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    const html = await redirRes.text();
    for (const p of allPlatforms) {
      expect(html, `missing snippet for ${p.platform}`).toContain(p.marker);
    }

    // Wait a microtask and verify D1 events_tracked_count incremented for all 9 pixels
    await Promise.resolve();
    for (const pid of createdPixelIds) {
      expect(store.pixels.get(pid)?.events_tracked_count).toBe(1);
    }

    // Pausing Pinterest pixel immediately stops it from firing on the very next redirect
    const pinId = createdPixelIds[6];
    store.pixels.get(pinId).is_active = 0;
    const redirAfterPause = await app.fetch(
      new Request("https://lsho.cc/r/promo-9-pixels", {
        headers: { "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Pinterest/12.1" },
      }),
      env,
      execCtx,
    );
    expect(redirAfterPause.status).toBe(200);
    const pausedHtml = await redirAfterPause.text();
    expect(pausedHtml).not.toContain("pintrk('load',\"2612345678902\")");
    expect(pausedHtml).toContain("snaptr('init',\"a1b2c3d4-e5f6-47a8\")");

    // Unregistered inline pixel object is IGNORED when D1 store is authoritative
    const active = await resolveRedirectActivePixels(env.DB, {
      user_id: "usr_attacker",
      pixels: [{ platform: "pinterest", pixelId: "9999999999999" }],
    });
    expect(active).toEqual([]);

    // Sanity check renderRedirectPixelInterstitialHtml rejects javascript: destination
    const safeInterstitial = renderRedirectPixelInterstitialHtml("javascript:alert(1)", [
      { platform: "pinterest", pixelId: "2612345678902" },
    ]);
    expect(safeInterstitial).not.toContain("javascript:alert(1)");
    expect(safeInterstitial).toContain("https://lsho.cc");
  });
});
