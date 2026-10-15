// =================================================================
// DEVICE, OS & BROWSER DETECTION  (User-Agent parser — zero deps)
// =================================================================

export interface DeviceInfo {
  /** High-level device category */
  type: 'mobile' | 'tablet' | 'desktop';
  /** Fine-grained key used in device_targeting JSON */
  key: DeviceKey;
  /** OS name */
  os: 'iOS' | 'Android' | 'Windows' | 'macOS' | 'Linux' | 'ChromeOS' | 'unknown' | string;
  /** Browser name */
  browser: 'Safari' | 'Chrome' | 'Firefox' | 'Edge' | 'Opera' | 'Brave' | 'Samsung' | 'Arc' | 'Vivaldi' | 'DuckDuckGo' | 'unknown' | string;
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
 * Priority: Specific chromium-based browsers first, then Chrome, Firefox, Safari.
 */
export function parseDevice(userAgent: string): DeviceInfo {
  const ua = (userAgent || '').toLowerCase();

  // ── Browser detection ───────────────────────────────────────────────────────
  let browser: DeviceInfo['browser'] = 'unknown';
  if (ua.includes('edg/') || ua.includes('edge/')) {
    browser = 'Edge';
  } else if (ua.includes('opr/') || ua.includes('opera')) {
    browser = 'Opera';
  } else if (ua.includes('samsungbrowser')) {
    browser = 'Samsung';
  } else if (ua.includes('brave')) {
    browser = 'Brave';
  } else if (ua.includes('vivaldi')) {
    browser = 'Vivaldi';
  } else if (ua.includes('arc/')) {
    browser = 'Arc';
  } else if (ua.includes('duckduckgo') || ua.includes('ddg/')) {
    browser = 'DuckDuckGo';
  } else if (ua.includes('yabrowser')) {
    browser = 'Yandex';
  } else if (ua.includes('ucbrowser') || ua.includes('ubrowser')) {
    browser = 'UC Browser';
  } else if (ua.includes('firefox') || ua.includes('fxios')) {
    browser = 'Firefox';
  } else if (ua.includes('chrome') || ua.includes('chromium') || ua.includes('crios')) {
    browser = 'Chrome';
  } else if (ua.includes('safari')) {
    browser = 'Safari';
  } else if (ua.includes('curl/')) {
    browser = 'Curl';
  } else if (ua.includes('postman')) {
    browser = 'Postman';
  }

  // ── Tablet ────────────────────────────────────────────────────────────────
  if (ua.includes('ipad')) {
    return { type: 'tablet', key: 'tablet', os: 'iOS', browser };
  }
  if (ua.includes('android') && !ua.includes('mobile')) {
    // Android tablet omits the "Mobile" token
    return { type: 'tablet', key: 'tablet', os: 'Android', browser };
  }
  if (ua.includes('tablet') || ua.includes('playbook') || ua.includes('silk')) {
    return { type: 'tablet', key: 'tablet', os: ua.includes('android') ? 'Android' : 'unknown', browser };
  }

  // ── Mobile ────────────────────────────────────────────────────────────────
  if (ua.includes('iphone') || ua.includes('ipod')) {
    return { type: 'mobile', key: 'ios', os: 'iOS', browser };
  }
  if (ua.includes('android') && ua.includes('mobile')) {
    return { type: 'mobile', key: 'android', os: 'Android', browser };
  }
  if (ua.includes('mobile') || ua.includes('blackberry') || ua.includes('windows phone')) {
    let osName = 'unknown';
    if (ua.includes('windows phone')) osName = 'Windows';
    else if (ua.includes('android')) osName = 'Android';
    else if (ua.includes('iphone') || ua.includes('ios')) osName = 'iOS';
    return { type: 'mobile', key: 'mobile', os: osName, browser };
  }

  // ── Desktop ───────────────────────────────────────────────────────────────
  if (
    ua.includes('windows nt') ||
    ua.includes('windows') ||
    ua.includes('win64') ||
    ua.includes('wow64')
  ) {
    return { type: 'desktop', key: 'windows', os: 'Windows', browser };
  }
  if (ua.includes('cros')) {
    return { type: 'desktop', key: 'linux', os: 'ChromeOS', browser };
  }
  if (ua.includes('macintosh') || ua.includes('mac os x') || ua.includes('macos')) {
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

export const REGION_COUNTRIES: Record<string, string[]> = {
  europe: [
    "FR", "DE", "GB", "ES", "IT", "BE", "CH", "PT", "NL", "SE",
    "NO", "DK", "FI", "IE", "AT", "PL", "GR", "RO", "CZ", "HU", "LU",
    "MC", "IS", "HR", "RS", "BG", "SK", "SI", "LT", "LV", "EE", "CY", "MT", "UA", "RU", "TR", "GE", "AM", "AZ"
  ],
  west_africa: [
    "SN", "CI", "BF", "ML", "GN", "TG", "BJ", "NE", "NG", "GH",
    "CV", "GM", "GW", "LR", "SL", "MR"
  ],
  central_africa: [
    "CM", "GA", "CG", "CD", "TD", "CF", "GQ", "ST", "BI", "RW"
  ],
  north_africa: [
    "MA", "DZ", "TN", "EG", "LY", "SD", "MR"
  ],
  east_africa: [
    "KE", "UG", "TZ", "RW", "BI", "ET", "SO", "DJ", "ER", "SS", "MG", "MU", "SC", "KM"
  ],
  southern_africa: [
    "ZA", "AO", "MZ", "ZM", "ZW", "BW", "NA", "LS", "SZ", "MW"
  ],
  africa: [
    "BF", "CI", "SN", "CM", "ML", "NE", "TG", "BJ", "GH", "NG", "GN", "GA", "CD", "CG", "TD", "CF", "RW", "BI", "KE", "TZ", "UG", "ET", "MG", "ZA", "MA", "DZ", "TN", "EG", "AO", "MZ", "ZM", "ZW", "MR", "GW", "SL", "LR", "CV", "ST", "GQ", "SO", "DJ", "ER", "SS", "SD", "LY", "MW", "BW", "NA", "LS", "SZ", "KM", "SC", "MU"
  ],
  north_america: [
    "US", "CA", "MX", "HT", "DO", "CU", "PA", "CR", "JM"
  ],
  south_america: [
    "BR", "AR", "CO", "CL", "PE", "VE", "EC", "BO", "PY", "UY"
  ],
  asia: [
    "CN", "JP", "KR", "IN", "SG", "TH", "VN", "ID", "MY", "PH",
    "PK", "BD", "AE", "SA", "QA", "KW", "OM", "BH", "JO", "LB", "IQ", "IL", "LK", "KZ", "UZ", "TM", "KG", "TJ", "AF", "YE"
  ],
  middle_east: [
    "AE", "SA", "QA", "KW", "OM", "BH", "IL", "JO", "LB", "IQ", "YE", "TR", "IR", "SY"
  ],
  oceania: [
    "AU", "NZ", "FJ", "PG", "NC", "PF"
  ],
};

/**
 * Evaluates structured routing rules with multi-condition AND logic.
 */
export function evaluateStructuredRoutingRules(
  rules: any,
  context: {
    country: string;
    device: DeviceInfo;
    city?: string | null;
  }
): string | null {
  if (!rules) return null;
  let parsedRules = rules;
  if (typeof parsedRules === 'string') {
    try {
      parsedRules = JSON.parse(parsedRules);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(parsedRules) || parsedRules.length === 0) return null;

  const { country, device, city } = context;
  const upperCountry = (country || '').toUpperCase();
  const lowerOs = (device?.os || '').toLowerCase();
  const lowerKey = (device?.key || '').toLowerCase();
  const lowerDeviceType = (device?.type || '').toLowerCase();
  const lowerCity = (city || '').toLowerCase();

  for (const rule of parsedRules) {
    if (!rule) continue;
    const dest = (rule.destinationUrl || rule.url || rule.destination_url || '').trim();
    if (!dest) continue;

    const conditions = Array.isArray(rule.conditions) ? rule.conditions : [];

    // Legacy single rule fallback (e.g. { type: 'country', value: 'FR', url: '...' })
    if (conditions.length === 0 && (rule.type || rule.value)) {
      const type = String(rule.type || '').toLowerCase();
      const val = String(rule.value || '').toLowerCase();
      let match = false;
      if (type === 'country' || type === 'pays') {
        match = upperCountry.toLowerCase() === val;
      } else if (type === 'continent' || type === 'region') {
        const regionList = REGION_COUNTRIES[val] || [];
        match = regionList.includes(upperCountry);
      } else if (type === 'city') {
        match = lowerCity === val;
      } else if (type === 'device' || type === 'appareil') {
        match = lowerDeviceType === val || lowerKey === val;
      } else if (type === 'os' || type === 'plateforme') {
        match = lowerOs === val || (val === 'mac' && lowerOs === 'macos') || (val === 'macos' && lowerOs === 'mac');
      }
      if (match) return dest;
      continue;
    }

    if (conditions.length === 0) continue;

    // Evaluate all conditions with AND logic
    let allConditionsMet = true;
    for (const cond of conditions) {
      if (!cond || !cond.type || !cond.value) continue;
      const condType = String(cond.type).toLowerCase();
      const condVal = String(cond.value).trim().toLowerCase();
      const op = cond.operator || 'est';
      let isMatch = false;

      if (condType === 'pays') {
        isMatch = upperCountry.toLowerCase() === condVal;
      } else if (condType === 'continent' || condType === 'region') {
        const regionList = REGION_COUNTRIES[condVal] || [];
        isMatch = regionList.includes(upperCountry);
      } else if (condType === 'appareil') {
        if (condVal === 'mobile') {
          isMatch = lowerDeviceType === 'mobile' || lowerDeviceType === 'tablet' || lowerKey === 'mobile' || lowerKey === 'ios' || lowerKey === 'android';
        } else if (condVal === 'tablet') {
          isMatch = lowerDeviceType === 'tablet' || lowerKey === 'tablet';
        } else if (condVal === 'desktop') {
          isMatch = lowerDeviceType === 'desktop' || lowerKey === 'desktop' || lowerKey === 'windows' || lowerKey === 'mac' || lowerKey === 'linux';
        } else {
          isMatch = lowerDeviceType === condVal || lowerKey === condVal;
        }
      } else if (condType === 'plateforme') {
        if (condVal === 'ios') {
          isMatch = lowerOs === 'ios' || lowerKey === 'ios';
        } else if (condVal === 'android') {
          isMatch = lowerOs === 'android' || lowerKey === 'android';
        } else if (condVal === 'windows') {
          isMatch = lowerOs === 'windows' || lowerKey === 'windows';
        } else if (condVal === 'macos' || condVal === 'mac') {
          isMatch = lowerOs === 'macos' || lowerOs === 'mac' || lowerKey === 'mac';
        } else if (condVal === 'linux') {
          isMatch = lowerOs === 'linux' || lowerKey === 'linux';
        } else {
          isMatch = lowerOs === condVal;
        }
      } else if (condType === 'navigateur' || condType === 'browser') {
        const lowerBrowser = (device?.browser || '').toLowerCase();
        if (condVal === 'chrome') {
          isMatch = lowerBrowser === 'chrome';
        } else if (condVal === 'safari') {
          isMatch = lowerBrowser === 'safari';
        } else if (condVal === 'firefox') {
          isMatch = lowerBrowser === 'firefox';
        } else if (condVal === 'edge') {
          isMatch = lowerBrowser === 'edge';
        } else if (condVal === 'opera') {
          isMatch = lowerBrowser === 'opera';
        } else if (condVal === 'brave') {
          isMatch = lowerBrowser === 'brave';
        } else if (condVal === 'samsung') {
          isMatch = lowerBrowser === 'samsung';
        } else {
          isMatch = lowerBrowser === condVal;
        }
      } else {
        isMatch = true;
      }

      const conditionResult = op === 'est' ? isMatch : !isMatch;
      if (!conditionResult) {
        allConditionsMet = false;
        break;
      }
    }

    if (allConditionsMet) {
      return dest;
    }
  }

  return null;
}
