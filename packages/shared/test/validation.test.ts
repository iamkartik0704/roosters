import { describe, expect, it } from 'vitest';
import { validateJobInput, waitlistSchema } from '../src/validation';

describe('validateJobInput (free plan)', () => {
  const base = { name: 'Ping my app', url: 'https://example.com/health' };

  it('accepts a valid GET job and defaults interval to 10', () => {
    const r = validateJobInput(base, 'free');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.method).toBe('GET');
      expect(r.value.intervalMin).toBe(10);
      expect(r.value.mode).toBe('monitor');
      expect(r.value.timeoutMs).toBe(30_000);
    }
  });

  it('defaults keepalive timeout to 45s', () => {
    const r = validateJobInput({ ...base, mode: 'keepalive' }, 'free');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.timeoutMs).toBe(45_000);
  });

  it('rejects non-GET methods on free', () => {
    const r = validateJobInput({ ...base, method: 'POST' }, 'free');
    expect(r.ok).toBe(false);
  });

  it('rejects intervals other than 10 on free', () => {
    const r = validateJobInput({ ...base, intervalMin: 1 }, 'free');
    expect(r.ok).toBe(false);
  });

  it('rejects headers, body and success conditions on free', () => {
    expect(validateJobInput({ ...base, headers: { A: 'b' } }, 'free').ok).toBe(false);
    expect(validateJobInput({ ...base, method: 'POST', body: '{}' }, 'free').ok).toBe(false);
    expect(
      validateJobInput({ ...base, successCondition: { bodyContains: 'ok' } }, 'free').ok,
    ).toBe(false);
  });

  it('rejects out-of-range timeouts', () => {
    expect(validateJobInput({ ...base, timeoutMs: 1000 }, 'free').ok).toBe(false);
    expect(validateJobInput({ ...base, timeoutMs: 120_000 }, 'free').ok).toBe(false);
  });
});

describe('validateJobInput (pro plan)', () => {
  const base = { name: 'Sync', url: 'https://api.example.com/sync' };

  it('allows POST with headers, body and per-minute interval', () => {
    const r = validateJobInput(
      { ...base, method: 'post', intervalMin: 1, headers: { Authorization: 'Bearer x' }, body: '{"a":1}' },
      'pro',
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.method).toBe('POST');
  });

  it('rejects GET with a body', () => {
    expect(validateJobInput({ ...base, body: 'x' }, 'pro').ok).toBe(false);
  });
});

describe('waitlistSchema', () => {
  it('accepts and lowercases emails', () => {
    const r = waitlistSchema.safeParse({ email: '  Person@Example.COM ' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.email).toBe('person@example.com');
  });

  it('rejects bad emails', () => {
    expect(waitlistSchema.safeParse({ email: 'nope' }).success).toBe(false);
  });
});
