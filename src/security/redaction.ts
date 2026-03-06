const REDACTION = '[REDACTED]';

const KEY_PATTERN = /(token|secret|password|passwd|api[_-]?key|authorization|auth[_-]?token|bearer|cookie)/i;
const TELEGRAM_TOKEN_PATTERN = /\b\d{6,12}:[A-Za-z0-9_-]{20,}\b/g;
const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9._-]{10,}\b/gi;
const ASSIGNMENT_PATTERN = /(token|secret|password|api[_-]?key)\s*[:=]\s*([^\s,;"']{4,})/gi;

/**
 * Redact token-like and credential-like substrings from plain text.
 */
export function redactString(input: string): string {
  return String(input || '')
    .replace(TELEGRAM_TOKEN_PATTERN, REDACTION)
    .replace(BEARER_PATTERN, `Bearer ${REDACTION}`)
    .replace(ASSIGNMENT_PATTERN, (_whole, key) => `${key}=${REDACTION}`);
}

/**
 * Recursively redact sensitive fields from arbitrary structured payloads.
 */
export function redactUnknown(value: unknown, depth = 0): unknown {
  if (depth > 4) {
    return '[TRUNCATED]';
  }

  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'string') {
    return redactString(value);
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => redactUnknown(entry, depth + 1));
  }

  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (KEY_PATTERN.test(key)) {
        out[key] = REDACTION;
      } else {
        out[key] = redactUnknown(entry, depth + 1);
      }
    }
    return out;
  }

  return String(value);
}

/**
 * Detect placeholder token values used in docs/examples.
 */
export function looksLikePlaceholderToken(token: string): boolean {
  const normalized = String(token || '').trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  return (
    normalized.includes('replace-with-real-token') ||
    normalized.includes('your-token') ||
    normalized.includes('example') ||
    normalized.includes('changeme') ||
    normalized === '123456:abc'
  );
}
