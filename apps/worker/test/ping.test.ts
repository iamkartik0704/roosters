import { describe, expect, it } from 'vitest';
import { pingJob, type PingableJob } from '../src/ping';
import type { PingEnv } from '../src/ping';

const env: PingEnv = { ENCRYPTION_KEY: 'x'.repeat(32), USER_AGENT: 'CronPulse/1.0 (test)' };

const job = (overrides: Partial<PingableJob> = {}): PingableJob => ({
  url: 'https://example.com/health',
  method: 'GET',
  mode: 'monitor',
  headersEnc: null,
  bodyEnc: null,
  timeoutMs: 5000,
  successCondition: null,
  requireHttps: true,
  ...overrides,
});

const res = (status: number, headers: Record<string, string> = {}, body: string | null = null) =>
  new Response(body, { status, headers });

describe('pingJob', () => {
  it('treats 2xx as up in monitor mode', async () => {
    const o = await pingJob(job(), env, async () => res(200));
    expect(o.ok).toBe(true);
    expect(o.httpStatus).toBe(200);
    expect(o.error).toBeNull();
  });

  it('treats 4xx as down in monitor mode', async () => {
    const o = await pingJob(job(), env, async () => res(404));
    expect(o.ok).toBe(false);
    expect(o.error).toBe('HTTP 404');
  });

  it('treats any response as up in keepalive mode (even a 404)', async () => {
    const o = await pingJob(job({ mode: 'keepalive' }), env, async () => res(404));
    expect(o.ok).toBe(true);
  });

  it('reports a timeout as a failure', async () => {
    const o = await pingJob(job(), env, async () => {
      const e = new Error('aborted');
      e.name = 'TimeoutError';
      throw e;
    });
    expect(o.ok).toBe(false);
    expect(o.error).toBe('Timed out after 5s');
  });

  it('follows redirects and re-validates each hop', async () => {
    const urls: string[] = [];
    const fetchImpl = (async (url: string | URL) => {
      urls.push(String(url));
      return urls.length === 1 ? res(302, { location: 'https://redirected.example.com/ping' }) : res(200);
    }) as unknown as typeof fetch;
    const o = await pingJob(job(), env, fetchImpl);
    expect(o.ok).toBe(true);
    expect(urls[1]).toBe('https://redirected.example.com/ping');
  });

  it('fails when a redirect points at a blocked host', async () => {
    const fetchImpl = (async () => res(302, { location: 'https://localhost/steal' })) as unknown as typeof fetch;
    const o = await pingJob(job(), env, fetchImpl);
    expect(o.ok).toBe(false);
    expect(o.error).toContain('not allowed');
  });

  it('fails when HTTPS is required and a redirect downgrades to http', async () => {
    const fetchImpl = (async () => res(302, { location: 'http://example.com/ping' })) as unknown as typeof fetch;
    const o = await pingJob(job({ requireHttps: true }), env, fetchImpl);
    expect(o.ok).toBe(false);
    expect(o.error).toContain('HTTPS');
  });

  it('sends the configured method, headers and body', async () => {
    let seenInit: RequestInit | undefined;
    const fetchImpl = (async (_url: string | URL, init?: RequestInit) => {
      seenInit = init;
      return res(200);
    }) as unknown as typeof fetch;
    await pingJob(job({ method: 'POST', requireHttps: false }), env, fetchImpl);
    expect(seenInit?.method).toBe('POST');
    expect((seenInit?.headers as Headers).get('User-Agent')).toBe('CronPulse/1.0 (test)');
  });

  it('enforces success conditions: bodyContains', async () => {
    const pass = await pingJob(job({ successCondition: { bodyContains: '"ok":true' } }), env, async () =>
      res(200, {}, '{"ok":true}'),
    );
    const failCase = await pingJob(job({ successCondition: { bodyContains: '"ok":true' } }), env, async () =>
      res(200, {}, '{"ok":false}'),
    );
    expect(pass.ok).toBe(true);
    expect(failCase.ok).toBe(false);
  });

  it('enforces success conditions: jsonPath equals', async () => {
    const pass = await pingJob(
      job({ successCondition: { status: [200], jsonPath: 'data.status', jsonEquals: 'healthy' } }),
      env,
      async () => res(200, {}, '{"data":{"status":"healthy"}}'),
    );
    const failCase = await pingJob(
      job({ successCondition: { jsonPath: 'data.status', jsonEquals: 'healthy' } }),
      env,
      async () => res(200, {}, '{"data":{"status":"sick"}}'),
    );
    expect(pass.ok).toBe(true);
    expect(failCase.ok).toBe(false);
  });

  it('enforces success conditions: allowed status codes', async () => {
    const pass = await pingJob(job({ successCondition: { status: [201] } }), env, async () => res(201));
    const failCase = await pingJob(job({ successCondition: { status: [201] } }), env, async () => res(200));
    expect(pass.ok).toBe(true);
    expect(failCase.ok).toBe(false);
  });
});
