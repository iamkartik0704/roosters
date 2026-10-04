import { describe, expect, it } from 'vitest';
import { assertUrlAllowed, UrlBlockedError, isIpLiteralHost, pickPath } from '../src/urls';

const allow = (url: string, requireHttps = true) => () => assertUrlAllowed(url, { requireHttps });

describe('assertUrlAllowed', () => {
  it('accepts a normal https URL', () => {
    expect(assertUrlAllowed('https://example.com/health?a=1', { requireHttps: true }).hostname).toBe('example.com');
  });

  it('blocks http when HTTPS is required, allows it otherwise', () => {
    expect(allow('http://example.com')).toThrow(UrlBlockedError);
    expect(() => assertUrlAllowed('http://example.com', { requireHttps: false })).not.toThrow();
  });

  it('blocks non-HTTP schemes', () => {
    expect(allow('ftp://example.com')).toThrow(UrlBlockedError);
    expect(allow('file:///etc/passwd')).toThrow(UrlBlockedError);
    expect(allow('gopher://example.com')).toThrow(UrlBlockedError);
  });

  it('blocks localhost and internal-looking hostnames', () => {
    expect(allow('https://localhost/')).toThrow(UrlBlockedError);
    expect(allow('https://sub.localhost/')).toThrow(UrlBlockedError);
    expect(allow('https://myapp.local/')).toThrow(UrlBlockedError);
    expect(allow('https://metadata.google.internal/')).toThrow(UrlBlockedError);
  });

  it('blocks IP literals in common notations', () => {
    expect(allow('https://127.0.0.1/')).toThrow(UrlBlockedError);
    expect(allow('https://10.0.0.1/')).toThrow(UrlBlockedError);
    expect(allow('https://169.254.169.254/latest/meta-data')).toThrow(UrlBlockedError);
    expect(allow('https://[::1]/')).toThrow(UrlBlockedError);
    expect(allow('https://2130706433/')).toThrow(UrlBlockedError);
    expect(allow('https://0x7f.0.0.1/')).toThrow(UrlBlockedError);
    expect(allow('https://0177.0.0.1/')).toThrow(UrlBlockedError);
  });

  it('blocks single-label hostnames and embedded credentials', () => {
    expect(allow('https://intranet/')).toThrow(UrlBlockedError);
    expect(allow('https://user:pass@example.com/')).toThrow(UrlBlockedError);
  });

  it('isIpLiteralHost edge cases', () => {
    expect(isIpLiteralHost('192.168.1.1')).toBe(true);
    expect(isIpLiteralHost('[fe80::1]')).toBe(true);
    expect(isIpLiteralHost('999')).toBe(true);
    expect(isIpLiteralHost('example.com')).toBe(false);
    expect(isIpLiteralHost('api.example.com')).toBe(false);
  });
});

describe('pickPath', () => {
  it('walks objects and arrays', () => {
    const value = { data: { items: [{ status: 'ok' }] } };
    expect(pickPath(value, 'data.items.0.status')).toBe('ok');
    expect(pickPath(value, 'data.missing')).toBeUndefined();
    expect(pickPath(null, 'a.b')).toBeUndefined();
  });
});
