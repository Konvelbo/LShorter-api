// =================================================================
// ENTRY POINT — Hono Application
// =================================================================

import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";

import { type CloudflareBindings } from "./lib/types";
import { err } from "./lib/utils";
import { rateLimit } from "./middleware/ratelimit";
import redirectRouter from "./routes/redirect";

import usersRouter from "./routes/users";
import linksRouter from "./routes/links";
import trackRouter from "./routes/track";
import analyticsRouter from "./routes/analytics";
import domainsRouter from "./routes/domains";

// ─── App ──────────────────────────────────────────────────────────────────────

const app = new Hono<{ Bindings: CloudflareBindings }>();

// ─── Global Middleware ────────────────────────────────────────────────────────

// Structured request logging
app.use("*", logger());

// Secure headers: removes X-Powered-By, sets HSTS, CSP, etc.
// NOTE: referrerPolicy is intentionally omitted here — redirect.ts
// sets it per-link when hideReferrer=true.
app.use(
  "*",
  secureHeaders({
    strictTransportSecurity: "max-age=31536000; includeSubDomains",
    xContentTypeOptions: "nosniff",
    xFrameOptions: "DENY",
    referrerPolicy: false, // managed per-link in redirect.ts
  }),
);

// CORS — strict configuration
app.use("*", async (c, next) => {
  const rawOrigins =
    c.env.ALLOWED_ORIGINS ||
    "http://localhost:3000,https://lsho.cc,https://lshorter-api.fiatechnologiecam.workers.dev";
  const allowedList = rawOrigins.split(",").map((o) => o.trim());

  return cors({
    origin: (origin) => {
      if (!origin) return allowedList[0] || "*";
      return allowedList.includes(origin) ? origin : "null";
    },
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "X-Frontend-Secret"],
    exposeHeaders: ["X-Request-Id", "Retry-After"],
    maxAge: 86400,
    credentials: true,
  })(c, next);
});

// Global IP-level rate limiter: 200 req / min across all routes
app.use("*", rateLimit({ limit: 200, windowSeconds: 60, keyType: "ip" }));

// ─── Health / Diagnostic ──────────────────────────────────────────────────────

const healthHandler = async (c: any) => {
  let d1Status = "ok";
  let kvStatus = "ok";

  try {
    await c.env.DB.prepare("SELECT 1").first();
  } catch (err) {
    d1Status = "error";
  }

  try {
    await c.env.URL_KV.get("__health_check__");
  } catch (err) {
    kvStatus = "error";
  }

  const isHealthy = d1Status === "ok" && kvStatus === "ok";

  return c.json(
    {
      status: isHealthy ? "ok" : "degraded",
      service: "lshorterAPI",
      version: "2.0.0",
      timestamp: new Date().toISOString(),
      d1: d1Status,
      kv: kvStatus,
    },
    isHealthy ? 200 : 503,
  );
};

app.get("/", (c) =>
  c.json({
    service: "lshorterAPI",
    version: "2.0.0",
    status: "operational",
    timestamp: new Date().toISOString(),
  }),
);

app.get("/health", healthHandler);
app.get("/api/v1/health", healthHandler);

// ─── Public Image Asset Server for Social Previews & Banners ─────────────────
app.get("/api/v1/images/:id", async (c) => {
  const id = c.req.param("id");

  // 1. Try KV first
  let data: ArrayBuffer | null = await c.env.URL_KV.get(`image:${id}`, "arrayBuffer").catch(() => null);
  let mimeType = id.endsWith(".png")
    ? "image/png"
    : id.endsWith(".jpg") || id.endsWith(".jpeg")
    ? "image/jpeg"
    : id.endsWith(".webp")
    ? "image/webp"
    : id.endsWith(".gif")
    ? "image/gif"
    : "image/png";

  // 2. Fallback to D1 database (unlimited storage)
  if (!data) {
    const row = await c.env.DB.prepare(
      `SELECT mime_type, data FROM uploaded_images WHERE id = ?`
    ).bind(id).first<{ mime_type: string; data: string }>().catch(() => null);

    if (row?.data) {
      mimeType = row.mime_type || mimeType;
      const base64Clean = row.data.replace(/^data:image\/[a-z]+;base64,/, "");
      const binaryStr = atob(base64Clean);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      data = bytes.buffer;
    }
  }

  if (!data) return c.text("Image not found", 404);

  return new Response(data, {
    status: 200,
    headers: {
      "Content-Type": mimeType,
      "Cache-Control": "public, max-age=31536000, immutable",
      "Access-Control-Allow-Origin": "*",
    },
  });
});

// ─── Image Upload Endpoint for Banners & Logos (D1 Backed) ───────────────────
app.post("/api/v1/upload-image", async (c) => {
  try {
    let base64String = "";
    let ext = "png";
    let mimeType = "image/png";

    const contentType = c.req.header("content-type") || "";

    if (contentType.includes("application/json")) {
      const json = await c.req.json().catch(() => null);
      if (json?.data) {
        base64String = json.data;
        if (json.data.includes("image/jpeg") || json.data.includes("image/jpg")) { ext = "jpg"; mimeType = "image/jpeg"; }
        if (json.data.includes("image/webp")) { ext = "webp"; mimeType = "image/webp"; }
        if (json.data.includes("image/gif")) { ext = "gif"; mimeType = "image/gif"; }
      }
    } else {
      const body = await c.req.parseBody().catch(() => null);
      const file = body?.file;
      if (file && typeof file === "object" && "arrayBuffer" in file) {
        const arrayBuf = await (file as any).arrayBuffer();
        const bytes = new Uint8Array(arrayBuf);
        let binary = "";
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        base64String = `data:${(file as any).type || "image/png"};base64,${btoa(binary)}`;
        const fileName = (file as any).name || "";
        if (fileName.endsWith(".jpg") || fileName.endsWith(".jpeg")) { ext = "jpg"; mimeType = "image/jpeg"; }
        if (fileName.endsWith(".webp")) { ext = "webp"; mimeType = "image/webp"; }
        if (fileName.endsWith(".gif")) { ext = "gif"; mimeType = "image/gif"; }
      }
    }

    if (!base64String) {
      return c.json({ success: false, error: "No image file or data provided" }, 400);
    }

    const imageId = `banner_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${ext}`;

    // Save permanently in D1
    await c.env.DB.prepare(
      `INSERT OR REPLACE INTO uploaded_images (id, mime_type, data) VALUES (?, ?, ?)`
    ).bind(imageId, mimeType, base64String).run();

    const publicUrl = `https://lshorter-api.fiatechnologiecam.workers.dev/api/v1/images/${imageId}`;
    return c.json({ success: true, url: publicUrl, imageId });
  } catch (err: any) {
    console.error("Upload error:", err);
    return c.json({ success: false, error: err?.message || "Upload failed" }, 500);
  }
});

// ─── API v1 Routes ────────────────────────────────────────────────────────────

app.route("/api/v1/users", usersRouter);
app.route("/api/v1/links", linksRouter);
app.route("/api/v1/track", trackRouter);
app.route("/api/v1/analytics", analyticsRouter);
app.route("/api/v1/domains", domainsRouter);

// ─── Short-link redirect (Mounted after API routes) ───────────────────────────
// Catches `/r/:slug` for the default domain and `/:slug` for custom domains.
app.route("/", redirectRouter);

// ─── 404 Catch-all ────────────────────────────────────────────────────────────

app.notFound((c) =>
  err(`Route ${c.req.method} ${c.req.path} not found`, 404, "NOT_FOUND"),
);

// ─── Global Error Handler ─────────────────────────────────────────────────────

app.onError((error, c) => {
  console.error("[QuickLink] Unhandled error:", error);
  const msg = error instanceof Error ? error.message : String(error);
  return err(
    msg || "Internal server error. Please try again later.",
    500,
    "INTERNAL_ERROR",
  );
});

// ─── Export ───────────────────────────────────────────────────────────────────

export default app;
