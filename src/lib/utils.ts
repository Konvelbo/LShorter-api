// =================================================================
// UTILITY HELPERS
// =================================================================

/**
 * Generate a random URL-safe ID with a given prefix.
 * e.g.  uid('usr') → 'usr_a3f9z2k1'
 */
export function uid(prefix: string, length = 8): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  for (const byte of array) {
    result += chars[byte % chars.length];
  }
  return `${prefix}_${result}`;
}

/**
 * Hash a string with SHA-256, returns lowercase hex.
 */
export async function sha256(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Generate a cryptographically secure API key.
 * Format:  lsh_live_<40 random hex chars>
 */
export function generateApiKey(prefix: 'lsh_live' | 'lsk_live' | 'sk_live' | 'sk_test' = 'lsh_live'): string {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `${prefix}_${hex}`;
}

/**
 * Validate that a URL is safe (only http / https) — prevents Open Redirect.
 */
export function isSafeUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Generate a short random slug (6 chars by default).
 */
export function randomSlug(length = 6): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => chars[b % chars.length])
    .join('');
}

/**
 * Return current ISO timestamp string.
 */
export function now(): string {
  return new Date().toISOString();
}

/**
 * Build a success JSON response.
 */
export function ok<T>(data: T): Response {
  return new Response(JSON.stringify({ success: true, data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Build an error JSON response.
 */
export function err(message: string, status = 400, code?: string): Response {
  return new Response(
    JSON.stringify({ success: false, error: message, ...(code ? { code } : {}) }),
    { status, headers: { 'Content-Type': 'application/json' } }
  );
}

/**
 * Get current month bucket string for KV rate-limit keys.
 * e.g. "2025-07"
 */
export function monthBucket(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
