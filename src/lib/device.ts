// =================================================================
// DEVICE, OS & BROWSER DETECTION  (User-Agent parser — zero deps)
// =================================================================

export interface DeviceInfo {
  /** High-level device category */
  type: 'mobile' | 'tablet' | 'desktop';
  /** Fine-grained key used in device_targeting JSON */
  key: DeviceKey;
  /** OS name — exact values expected by the clicks table CHECK constraint */
  os: 'iOS' | 'Android' | 'Windows' | 'macOS' | 'Linux' | 'unknown';
  /** Browser name — exact values expected by the clicks table CHECK constraint */
  browser: 'Safari' | 'Chrome' | 'Firefox' | 'Edge' | 'unknown';
}

export type DeviceKey =
  | 'ios'
  | 'android'
  | 'tablet'
  | 'mobile'
  | 'windows'
  | 'mac'
  | 'linux'
  | 'desktop';

/**
 * Parse a User-Agent string → { type, key, os, browser }.
 *
 * Detection priority:
 *  Browser : Edge → Chrome → Firefox → Safari (order matters — Edge includes "chrome")
 *  Device  : iPad / Android tablet → iPhone/Android → generic mobile → desktop OS
 */
export function parseDevice(userAgent: string): DeviceInfo {
  const ua = userAgent.toLowerCase();

  // ── Browser detection (must run BEFORE device so all paths get a browser) ─
  let browser: DeviceInfo['browser'] = 'unknown';
  if (ua.includes('edg/') || ua.includes('edge/')) {
    browser = 'Edge';
  } else if (ua.includes('chrome') || ua.includes('chromium') || ua.includes('crios')) {
    browser = 'Chrome';
  } else if (ua.includes('firefox') || ua.includes('fxios')) {
    browser = 'Firefox';
  } else if (ua.includes('safari')) {
    // Safari UA always includes "safari"; Chrome/Edge UAs also include it,
    // so only assign Safari when Chrome/Edge were not matched above.
    browser = 'Safari';
  }

  // ── Tablet ────────────────────────────────────────────────────────────────
  if (ua.includes('ipad')) {
    return { type: 'tablet', key: 'tablet', os: 'iOS', browser };
  }
  if (ua.includes('android') && !ua.includes('mobile')) {
    // Android tablet omits the "Mobile" token
    return { type: 'tablet', key: 'tablet', os: 'Android', browser };
  }

  // ── Mobile ────────────────────────────────────────────────────────────────
  if (ua.includes('iphone') || ua.includes('ipod')) {
    return { type: 'mobile', key: 'ios', os: 'iOS', browser };
  }
  if (ua.includes('android') && ua.includes('mobile')) {
    return { type: 'mobile', key: 'android', os: 'Android', browser };
  }
  if (ua.includes('mobile') || ua.includes('blackberry') || ua.includes('windows phone')) {
    return { type: 'mobile', key: 'mobile', os: 'unknown', browser };
  }

  // ── Desktop ───────────────────────────────────────────────────────────────
  if (ua.includes('windows')) {
    return { type: 'desktop', key: 'windows', os: 'Windows', browser };
  }
  if (ua.includes('macintosh') || ua.includes('mac os x')) {
    return { type: 'desktop', key: 'mac', os: 'macOS', browser };
  }
  if (ua.includes('linux') || ua.includes('x11')) {
    return { type: 'desktop', key: 'linux', os: 'Linux', browser };
  }

  // ── Fallback ──────────────────────────────────────────────────────────────
  return { type: 'desktop', key: 'desktop', os: 'unknown', browser };
}

/**
 * Given device targeting rules and device info, return the override URL or null.
 *
 * @param targeting  JSON string like {"ios": "https://apps.apple.com/..."}
 * @param device     Parsed DeviceInfo
 */
export function resolveDeviceTarget(
  targeting: string | null,
  device: DeviceInfo
): string | null {
  if (!targeting) return null;
  try {
    const rules = JSON.parse(targeting) as Record<string, string>;
    return rules[device.key] ?? rules[device.type] ?? null;
  } catch {
    return null;
  }
}

/**
 * Given geo targeting rules and a country code, return the override URL or null.
 *
 * @param targeting  JSON string like {"FR": "https://...", "US": "https://..."}
 * @param country    ISO 3166-1 alpha-2 code (upper-case) e.g. 'FR'
 */
export function resolveGeoTarget(
  targeting: string | null,
  country: string
): string | null {
  if (!targeting) return null;
  try {
    const rules = JSON.parse(targeting) as Record<string, string>;
    return rules[country.toUpperCase()] ?? null;
  } catch {
    return null;
  }
}
