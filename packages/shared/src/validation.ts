import { z } from 'zod';
import {
  MAX_BODY_BYTES,
  MAX_URL_LENGTH,
  PLANS,
  TIMEOUT_MAX_MS,
  TIMEOUT_MIN_MS,
  type Plan,
} from './plans';
import { JOB_MODES, type JobMode, type SuccessCondition } from './types';

export { JOB_MODES };
export type { JobMode };

const modeSchema = z.enum(JOB_MODES);

const successConditionSchema = z.object({
  status: z.array(z.number().int().min(100).max(599)).min(1).max(20).optional(),
  bodyContains: z.string().max(1000).optional(),
  jsonPath: z.string().max(200).optional(),
  jsonEquals: z.string().max(1000).optional(),
  retries: z.number().int().min(0).max(3).optional(),
});

/**
 * Raw shape accepted by the API and the dashboard form. Plan gating
 * (methods, interval options, headers/body, success conditions) happens in
 * validateJobInput, which returns plain strings instead of zod internals.
 */
export const jobInputSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100, 'Name is too long'),
  url: z.string().trim().max(MAX_URL_LENGTH, 'URL is too long').optional(),
  mode: modeSchema.optional(),
  intervalMin: z.number().int().positive().max(1440).optional(),
  method: z.string().optional(),
  cronExpression: z.string().max(100).optional(),
  timezone: z.string().max(100).optional(),
  headers: z.record(z.string(), z.string()).optional(),
  body: z.string().max(MAX_BODY_BYTES, 'Body is too large').optional(),
  timeoutMs: z
    .number()
    .int()
    .min(TIMEOUT_MIN_MS, 'Timeout must be at least 5s')
    .max(TIMEOUT_MAX_MS, 'Timeout must be at most 60s')
    .optional(),
  successCondition: successConditionSchema.optional(),
});

export interface JobInput {
  name: string;
  url: string;
  mode: JobMode;
  intervalMin: number;
  cronExpression?: string;
  timezone?: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
  timeoutMs: number;
  successCondition?: SuccessCondition;
}

export type ValidationResult =
  | { ok: true; value: JobInput }
  | { ok: false; error: string };

export function validateJobInput(input: unknown, plan: Plan): ValidationResult {
  const parsed = jobInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }
  const v = parsed.data;
  const limits = PLANS[plan];

  const method = (v.method ?? 'GET').toUpperCase();
  if (!limits.methods.includes(method)) {
    return { ok: false, error: `${method} requests are not available on the ${limits.label} plan` };
  }
  if (method === 'GET' || method === 'HEAD') {
    if (v.body) {
      return { ok: false, error: `${method} requests cannot have a body` };
    }
  }

  const headers = v.headers ?? {};
  const headerNames = Object.keys(headers);
  if (headerNames.length > 0 && !limits.canSetHeadersBody) {
    return { ok: false, error: `Custom headers are not available on the ${limits.label} plan` };
  }
  if (headerNames.length > 10) {
    return { ok: false, error: 'At most 10 headers are allowed' };
  }
  for (const name of headerNames) {
    if (!name.trim() || name.length > 128 || headers[name].length > 4096) {
      return { ok: false, error: 'Header name or value is too long' };
    }
  }
  if (v.body && !limits.canSetHeadersBody) {
    return { ok: false, error: `Request bodies are not available on the ${limits.label} plan` };
  }

  if (v.successCondition && !limits.successConditions) {
    return { ok: false, error: `Success conditions are not available on the ${limits.label} plan` };
  }

  const mode: JobMode = v.mode ?? 'monitor';
  
  if (mode !== 'heartbeat' && (!v.url || v.url.length === 0)) {
    return { ok: false, error: 'URL is required for this mode' };
  }
  const url = mode === 'heartbeat' ? 'https://heartbeat.cronpulse.local' : (v.url ?? '');

  const intervalMin = v.intervalMin ?? limits.defaultInterval;
  if (!limits.intervalOptions.includes(intervalMin)) {
    const options = limits.intervalOptions
      .map((m) => (m === 1440 ? 'daily' : `${m}m`))
      .join(', ');
    return { ok: false, error: `Interval not available on ${limits.label} plan (options: ${options})` };
  }

  return {
    ok: true,
    value: {
      name: v.name,
      url,
      mode,
      intervalMin,
      cronExpression: v.cronExpression,
      timezone: v.timezone,
      method,
      headers,
      body: v.body,
      timeoutMs: v.timeoutMs ?? (mode === 'keepalive' ? 45_000 : 30_000),
      successCondition: v.successCondition,
    },
  };
}

export const waitlistSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email').max(200),
  token: z.string().optional(),
});

