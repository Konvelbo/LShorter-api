// =================================================================
// ENTRY POINT — Hono Application
// =================================================================

import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";

import { type CloudflareBindings, type AuthContext } from "./lib/types";
import { err } from "./lib/utils";
import { authMiddleware } from "./middleware/auth";
import { rateLimit } from "./middleware/ratelimit";
import redirectRouter from "./routes/redirect";

import usersRouter from "./routes/users";
import linksRouter from "./routes/links";
import trackRouter from "./routes/track";
import analyticsRouter from "./routes/analytics";
import domainsRouter from "./routes/domains";
import pixelsRouter from "./routes/pixels";
import webhooksRouter from "./routes/webhooks";
import targetsRouter from "./routes/targets";

// ─── App ──────────────────────────────────────────────────────────────────────

const app = new Hono<{
  Bindings: CloudflareBindings;
  Variables: { auth: AuthContext };
}>();

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
    crossOriginResourcePolicy: "cross-origin",
  }),
);

// CORS — strict configuration for API, open for public image assets
app.use("*", async (c, next) => {
  if (c.req.path.startsWith("/api/v1/images/")) {
    c.header("Access-Control-Allow-Origin", "*");
    c.header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
    c.header("Cross-Origin-Resource-Policy", "cross-origin");
    c.header("Cross-Origin-Opener-Policy", "unsafe-none");
    if (c.req.method === "OPTIONS") {
      return c.body(null, 204);
    }
    return next();
  }

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

// Global IP-level safety rate limiter (accommodates Enterprise up to 1,400 req/min): 2,000 req / min across all routes
app.use("*", rateLimit({ limit: 2000, windowSeconds: 60, keyType: "ip" }));

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
      version: "2.2.0",
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
    version: "2.2.0",
    status: "operational",
    timestamp: new Date().toISOString(),
  }),
);

app.get("/health", healthHandler);
app.get("/api/v1/health", healthHandler);

const MAX_IMAGE_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB

const ALLOWED_UPLOAD_MIMES: Record<string, { ext: string; mime: string }> = {
  "image/png":  { ext: "png",  mime: "image/png" },
  "image/jpeg": { ext: "jpg",  mime: "image/jpeg" },
  "image/jpg":  { ext: "jpg",  mime: "image/jpeg" },
  "image/webp": { ext: "webp", mime: "image/webp" },
  "image/gif":  { ext: "gif",  mime: "image/gif" },
};

function hasValidImageMagicBytes(bytes: Uint8Array, mime: string): boolean {
  if (mime === "image/png") {
    return bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  }
  if (mime === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (mime === "image/gif") {
    return bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38;
  }
  if (mime === "image/webp") {
    return (
      bytes.length >= 12 &&
      bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
    );
  }
  return false;
}

// ─── Public Image Asset Server for Social Previews & Banners ─────────────────
app.on(["GET", "HEAD"], "/api/v1/images/:id", async (c) => {
  const id = c.req.param("id");
  if (!/^[a-zA-Z0-9._-]{1,120}$/.test(id)) {
    return c.text("Invalid image ID", 400);
  }

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

  // 2. Fallback to D1 database and warm KV
  if (!data) {
    const row = await c.env.DB.prepare(
      `SELECT mime_type, data FROM uploaded_images WHERE id = ?`
    ).bind(id).first<{ mime_type: string; data: string }>().catch(() => null);

    if (row?.data) {
      const safeMeta = ALLOWED_UPLOAD_MIMES[(row.mime_type || "").toLowerCase()];
      mimeType = safeMeta?.mime || mimeType;
      const base64Clean = row.data.replace(/^data:image\/[a-z0-9.+-]+;base64,/i, "");
      const binaryStr = atob(base64Clean);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      data = bytes.buffer;

      // Warm KV cache permanently so D1 is never touched again for this image
      try {
        c.executionCtx.waitUntil(c.env.URL_KV.put(`image:${id}`, data));
      } catch {
        c.env.URL_KV.put(`image:${id}`, data).catch(() => {});
      }
    }
  }

  if (!data) return c.text("Image not found", 404);

  const headers: Record<string, string> = {
    "Content-Type": mimeType,
    "Content-Length": String(data.byteLength),
    "Cache-Control": "public, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Cross-Origin-Resource-Policy": "cross-origin",
    "Cross-Origin-Opener-Policy": "unsafe-none",
    "Cross-Origin-Embedder-Policy": "unsafe-none",
  };

  if (c.req.method === "HEAD") {
    return new Response(null, { status: 200, headers });
  }

  return new Response(data, { status: 200, headers });
});

// ─── Image Upload Endpoint for Banners & Logos (Authenticated + Strict MIME) ─
app.post(
  "/api/v1/upload-image",
  authMiddleware,
  rateLimit({ limit: 30, windowSeconds: 60, keyType: "apiKey" }),
  async (c) => {
    try {
      let bytes: Uint8Array | null = null;
      let rawMime = "";

      const contentType = c.req.header("content-type") || "";

      if (contentType.includes("application/json")) {
        const json = await c.req.json().catch(() => null);
        const rawData = typeof json?.data === "string" ? json.data.trim() : "";
        if (!rawData) {
          return c.json({ success: false, error: "No image file or data provided" }, 400);
        }

        const dataUriMatch = rawData.match(/^data:([^;,]+);base64,([A-Za-z0-9+/=\s]+)$/i);
        if (!dataUriMatch) {
          return c.json(
            { success: false, error: "Invalid image format. Expected base64 Data URI with an allowed image MIME type." },
            400,
          );
        }

        rawMime = dataUriMatch[1].toLowerCase().trim();
        const b64Clean = dataUriMatch[2].replace(/\s+/g, "");
        if (b64Clean.length > Math.ceil(MAX_IMAGE_UPLOAD_BYTES * 1.4)) {
          return c.json({ success: false, error: "Image exceeds 5MB size limit" }, 413);
        }

        let binaryStr: string;
        try {
          binaryStr = atob(b64Clean);
        } catch {
          return c.json({ success: false, error: "Malformed base64 image payload" }, 400);
        }
        if (binaryStr.length > MAX_IMAGE_UPLOAD_BYTES) {
          return c.json({ success: false, error: "Image exceeds 5MB size limit" }, 413);
        }
        bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }
      } else {
        const body = await c.req.parseBody().catch(() => null);
        const file = body?.file;
        if (file && typeof file === "object" && "arrayBuffer" in file) {
          const fileSize = Number((file as any).size || 0);
          if (fileSize > MAX_IMAGE_UPLOAD_BYTES) {
            return c.json({ success: false, error: "Image exceeds 5MB size limit" }, 413);
          }
          const arrayBuf = await (file as any).arrayBuffer();
          if (arrayBuf.byteLength > MAX_IMAGE_UPLOAD_BYTES) {
            return c.json({ success: false, error: "Image exceeds 5MB size limit" }, 413);
          }
          bytes = new Uint8Array(arrayBuf);
          rawMime = String((file as any).type || "").toLowerCase().trim();
        }
      }

      if (!bytes || bytes.byteLength === 0) {
        return c.json({ success: false, error: "No image file or data provided" }, 400);
      }

      const allowed = ALLOWED_UPLOAD_MIMES[rawMime];
      if (!allowed) {
        return c.json(
          {
            success: false,
            error: "Unsupported file type. Only PNG, JPEG, WEBP, and GIF images are allowed.",
          },
          400,
        );
      }

      if (!hasValidImageMagicBytes(bytes, allowed.mime)) {
        return c.json(
          {
            success: false,
            error: "Image file signature does not match declared MIME type.",
          },
          400,
        );
      }

      let binary = "";
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64String = `data:${allowed.mime};base64,${btoa(binary)}`;
      const imageId = `banner_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${allowed.ext}`;

      // Ensure table exists in Cloudflare D1
      await c.env.DB.prepare(
        `CREATE TABLE IF NOT EXISTS uploaded_images (
           id TEXT PRIMARY KEY,
           mime_type TEXT,
           data TEXT,
           created_at DATETIME DEFAULT CURRENT_TIMESTAMP
         )`
      ).run().catch(() => {});

      // Save permanently in Cloudflare D1
      await c.env.DB.prepare(
        `INSERT OR REPLACE INTO uploaded_images (id, mime_type, data) VALUES (?, ?, ?)`
      ).bind(imageId, allowed.mime, base64String).run();

      // Also cache in Cloudflare KV if available
      try {
        if (c.env.URL_KV) {
          await c.env.URL_KV.put(`image:${imageId}`, bytes);
        }
      } catch {}

      const publicUrl = `https://lshorter-api.fiatechnologiecam.workers.dev/api/v1/images/${imageId}`;
      return c.json({ success: true, url: publicUrl, imageId });
    } catch (uploadErr: any) {
      console.error("Upload error:", uploadErr);
      return c.json({ success: false, error: uploadErr?.message || "Upload failed" }, 500);
    }
  },
);

// ─── API v1 Routes ────────────────────────────────────────────────────────────

app.route("/api/v1/users", usersRouter);
app.route("/api/v1/links", linksRouter);
app.route("/api/v1/track", trackRouter);
app.route("/api/v1/analytics", analyticsRouter);
app.route("/api/v1/domains", domainsRouter);
app.route("/api/v1/pixels", pixelsRouter);
app.route("/api/v1/webhooks", webhooksRouter);
app.route("/api/v1/targets", targetsRouter);

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
  return err(
    "Internal server error. Please try again later.",
    500,
    "INTERNAL_ERROR",
  );
});

// ─── Export ───────────────────────────────────────────────────────────────────

export default app;
