import { MAX_URL_LENGTH } from '@cron/shared';

/**
 * URL rules from plan section 7: HTTPS on Free, block localhost / private and
 * reserved ranges / IP literals / non-HTTP schemes. Every hop of a redirect
 * chain is re-validated in ping.ts.
 *
 * Residual risk: a domain can still resolve to a private IP (DNS rebinding).
 * The plan accepts this for launch; per-host caps and rate limits contain it.
 */
export class UrlBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UrlBlockedError';
  }
}

const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

export function isIpLiteralHost(host: string): boolean {
  if (host.startsWith('[') && host.endsWith(']')) return true; // IPv6
  if (IPV4_RE.test(host)) return true;
  if (/^\d+$/.test(host)) return true; // bare-integer IPv4
  if (/^0x[0-9a-f]+$/i.test(host)) return true; // hex IPv4
  // Dotted forms with hex or octal components (0x7f.1, 0177.0.0.1) — classic SSRF bypasses.
  return host.split('.').some((part) => /^0[xX][0-9a-f]+$/.test(part) || /^0\d+$/.test(part));
}

const BLOCKED_HOST_SUFFIXES = ['localhost', '.local', '.internal', '.home.arpa', '.lan'];

export function assertUrlAllowed(raw: string, opts: { requireHttps: boolean }): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new UrlBlockedError('Invalid URL');
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') {
    throw new UrlBlockedError('Only HTTP(S) URLs are allowed');
  }
  if (opts.requireHttps && u.protocol !== 'https:') {
    throw new UrlBlockedError('Free plan jobs must use HTTPS');
  }
  if (raw.length > MAX_URL_LENGTH) throw new UrlBlockedError('URL is too long');
  if (u.username || u.password) {
    throw new UrlBlockedError('Credentials in the URL are not allowed');
  }

  const host = u.hostname.toLowerCase();
  if (isIpLiteralHost(host)) {
    throw new UrlBlockedError('IP addresses are not allowed; use a domain name');
  }
  if (BLOCKED_HOST_SUFFIXES.some((s) => host === s.slice(1) || host.endsWith(s))) {
    throw new UrlBlockedError('This host is not allowed');
  }
  if (!host.includes('.')) {
    throw new UrlBlockedError('Hostname must be a public domain name');
  }
  return u;
}

/** Validate the dashboard URL the OAuth callback may redirect to (origin allowlist). */
export function assertRedirectAllowed(raw: string, allowedOrigins: string[]): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new UrlBlockedError('Invalid redirect');
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') {
    throw new UrlBlockedError('Invalid redirect');
  }
  if (!allowedOrigins.includes(u.origin)) {
    throw new UrlBlockedError('Redirect origin is not allowed');
  }
  return u;
}

/** Simple dot-path getter for success conditions: "data.ok", "items.0.status". */
export function pickPath(value: unknown, path: string): unknown {
  let cur: unknown = value;
  for (const key of path.split('.')) {
    if (cur === null || cur === undefined) return undefined;
    if (Array.isArray(cur)) {
      const idx = Number(key);
      if (!Number.isInteger(idx)) return undefined;
      cur = cur[idx];
    } else if (typeof cur === 'object') {
      cur = (cur as Record<string, unknown>)[key];
    } else {
      return undefined;
    }
  }
  return cur;
}
