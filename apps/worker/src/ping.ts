import { MAX_REDIRECTS, type PingOutcome, type SuccessCondition } from '@cron/shared';
import type { JobMode } from '@cron/shared';
import { decryptJson, decryptString } from './crypto';
import { pickPath, UrlBlockedError, assertUrlAllowed } from './urls';

export interface PingableJob {
  url: string;
  method: string;
  mode: JobMode;
  headersEnc: string | null;
  bodyEnc: string | null;
  timeoutMs: number;
  successCondition: SuccessCondition | null;
  /** Free-plan jobs enforce HTTPS on every redirect hop. */
  requireHttps: boolean;
}

export interface PingEnv {
  ENCRYPTION_KEY: string;
  USER_AGENT: string;
}

const outcome = (ok: boolean, httpStatus: number | null, error: string | null, started: number): PingOutcome => ({
  ok,
  httpStatus,
  error,
  durationMs: Date.now() - started,
});

/**
 * Ping due jobs, at most `batchSize` at a time (plan section 5: 6 simultaneous
 * outbound connections on the free plan; slow sleeping hosts make ticks long
 * but that is allowed).
 */
export async function pingJobs(
  jobs: PingableJob[],
  batchSize: number,
  env: PingEnv,
  fetchImpl: typeof fetch = fetch,
): Promise<PingOutcome[]> {
  const outcomes: PingOutcome[] = [];
  for (let i = 0; i < jobs.length; i += batchSize) {
    const batch = jobs.slice(i, i + batchSize);
    outcomes.push(...(await Promise.all(batch.map((job) => pingJob(job, env, fetchImpl)))));
  }
  return outcomes;
}

export async function pingJob(
  job: PingableJob,
  env: PingEnv,
  fetchImpl: typeof fetch = fetch,
): Promise<PingOutcome> {
  const started = Date.now();
  const maxRetries = job.successCondition?.retries ?? 0;
  let lastOutcome: PingOutcome | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let url = job.url;
    try {
      const storedHeaders = await decryptJson<Record<string, string>>(env.ENCRYPTION_KEY, job.headersEnc);
      const headers = new Headers(storedHeaders ?? {});
      headers.set('User-Agent', env.USER_AGENT);
      const body =
        job.method !== 'GET' && job.method !== 'HEAD' && job.bodyEnc
          ? await decryptString(env.ENCRYPTION_KEY, job.bodyEnc)
          : undefined;

      let hopOk = false;
      let hopStatus: number | null = null;
      let hopError: string | null = null;

      for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
        assertUrlAllowed(url, { requireHttps: job.requireHttps });

        const res = await fetchImpl(url, {
          method: job.method,
          headers,
          body,
          redirect: 'manual',
          signal: AbortSignal.timeout(job.timeoutMs),
        });

        if (res.status >= 300 && res.status < 400) {
          const location = res.headers.get('location');
          await discardBody(res);
          if (!location) {
            hopOk = false;
            hopStatus = res.status;
            hopError = `HTTP ${res.status} redirect without Location`;
            break;
          }
          url = new URL(location, url).toString();
          continue;
        }

        const ok = job.mode === 'keepalive' ? true : await isSuccessfulResponse(res, job.successCondition);
        await discardBody(res);
        hopOk = ok;
        hopStatus = res.status;
        hopError = ok ? null : failureReason(res.status, job.mode);
        break;
      }

      if (hopStatus === null && !hopError) {
        hopOk = false;
        hopError = `Too many redirects (> ${MAX_REDIRECTS})`;
      }

      lastOutcome = outcome(hopOk, hopStatus, hopError, started);
      if (hopOk) return lastOutcome;
    } catch (e) {
      lastOutcome = outcome(false, null, describeError(e, job.timeoutMs), started);
    }

    if (attempt < maxRetries) {
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1))); // 1s, 2s, 3s backoff
    }
  }

  return lastOutcome ?? outcome(false, null, 'Unknown error', started);
}

/**
 * Monitor mode: 2xx by default, or the configured success condition (Pro).
 * Keep-alive mode: any HTTP response — even a 404 — proves the host woke up.
 */
async function isSuccessfulResponse(res: Response, cond: SuccessCondition | null): Promise<boolean> {
  if (cond?.status?.length) {
    if (!cond.status.includes(res.status)) return false;
  } else if (res.status < 200 || res.status >= 300) {
    return false;
  }

  if (cond?.bodyContains || cond?.jsonPath) {
    let text = '';
    try {
      text = (await res.text()).slice(0, 65_536);
    } catch {
      return false;
    }
    if (cond.bodyContains && !text.includes(cond.bodyContains)) return false;
    if (cond.jsonPath) {
      try {
        const value = pickPath(text ? JSON.parse(text) : undefined, cond.jsonPath);
        const expected = cond.jsonEquals ?? '';
        if (value === undefined || String(value) !== expected) return false;
      } catch {
        return false;
      }
    }
  }
  return true;
}

function failureReason(status: number, mode: JobMode): string {
  return mode === 'keepalive' ? `HTTP ${status}` : `HTTP ${status}`;
}

async function discardBody(res: Response): Promise<void> {
  try {
    await res.body?.cancel();
  } catch {
    // body already consumed or unavailable — nothing to do
  }
}

function describeError(e: unknown, timeoutMs: number): string {
  const err = e as { name?: string; message?: string };
  if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
    return `Timed out after ${Math.round(timeoutMs / 1000)}s`;
  }
  if (e instanceof UrlBlockedError) return e.message;
  const message = err?.message ?? 'Request failed';
  return message.slice(0, 200);
}
