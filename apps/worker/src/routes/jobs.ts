import { Hono } from 'hono';
import {
  FREE_GLOBAL_JOB_CAP,
  PLANS,
  type JobDTO,
  type JobEventDTO,
  type PingOutcome,
} from '@cron/shared';
import { validateJobInput, type JobInput } from '@cron/shared';
import { encryptJson, encryptString, decryptJson, decryptString } from '../crypto';
import { randomUUID } from '../ids';
import { pingJob } from '../ping';
import { pickSlot } from '../slots';
import { assertUrlAllowed } from '../urls';
import { rateLimit, requireAuth, type AppEnv } from './middleware';
import type { Env } from '../env';
import { CronExpressionParser } from 'cron-parser';

export const jobsRoutes: Hono<AppEnv> = new Hono<AppEnv>();

jobsRoutes.use('*', requireAuth);

interface JobRow {
  id: string;
  user_id: string;
  name: string;
  url: string;
  method: string;
  headers_enc: string | null;
  body_enc: string | null;
  cron_expression: string | null;
  timezone: string | null;
  next_run_at: number | null;
  mode: string;
  interval_min: number;
  slot: number;
  timeout_ms: number;
  status: string;
  state: string;
  fail_streak: number;
  success_condition: string | null;
  last_state_change: number | null;
  last_status: number | null;
  last_error: string | null;
  plan_priority: number;
  created_at: number;
}

function toDTO(row: JobRow): JobDTO {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    url: row.url,
    method: row.method,
    cronExpression: row.cron_expression,
    timezone: row.timezone,
    mode: row.mode as JobDTO['mode'],
    intervalMin: row.interval_min,
    slot: row.slot,
    timeoutMs: row.timeout_ms,
    status: row.status as JobDTO['status'],
    state: row.state as JobDTO['state'],
    failStreak: row.fail_streak,
    lastStateChange: row.last_state_change,
    lastStatus: row.last_status,
    lastError: row.last_error,
    successCondition: parseSuccessCondition(row.success_condition),
    createdAt: row.created_at,
  };
}

function parseSuccessCondition(raw: string | null) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// ---- list -------------------------------------------------------------------

jobsRoutes.get('/', async (c) => {
  const user = c.get('user');
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM jobs WHERE user_id = ?1 ORDER BY created_at ASC`,
  )
    .bind(user.id)
    .all<JobRow>();
  return c.json({ jobs: (results ?? []).map(toDTO) });
});

// ---- create -----------------------------------------------------------------

jobsRoutes.post('/', async (c) => {
  const user = c.get('user');
  const body = await c.req.json<unknown>().catch(() => null);
  const validated = validateJobInput(body, user.plan);
  if (!validated.ok) return c.json({ error: validated.error }, 400);
  const input = validated.value;

  // Heartbeat jobs carry a placeholder URL and are never pinged; the real
  // signal is check-ins, so the URL rules do not apply.
  if (input.mode !== 'heartbeat') {
    try {
      assertUrlAllowed(input.url, { requireHttps: user.plan === 'free' });
    } catch (e) {
      return c.json({ error: (e as Error).message }, 400);
    }
  }

  const db = c.env.DB;

  if (input.mode !== 'heartbeat') {
    const host = new URL(input.url).hostname;
    const userJobs = await db.prepare('SELECT url FROM jobs WHERE user_id = ?1').bind(user.id).all<{url: string}>();
    const hostCount = (userJobs.results ?? []).filter(r => {
      try {
        return new URL(r.url).hostname === host;
      } catch {
        return false;
      }
    }).length;
    if (hostCount >= 5) {
      return c.json({ error: 'You can only have 5 jobs pointing to the same host.' }, 403);
    }
  }

  const userJobCount = await db
    .prepare('SELECT COUNT(*) AS n FROM jobs WHERE user_id = ?1')
    .bind(user.id)
    .first<{ n: number }>();
  if ((userJobCount?.n ?? 0) >= PLANS[user.plan].maxJobs) {
    return c.json({ error: `Job limit reached for the ${PLANS[user.plan].label} plan` }, 403);
  }
  if (user.plan === 'free') {
    const freeJobs = await db
      .prepare(
        `SELECT COUNT(*) AS n FROM jobs j JOIN users u ON u.id = j.user_id
         WHERE u.plan = 'free' AND j.status = 'active'`,
      )
      .first<{ n: number }>();
    if ((freeJobs?.n ?? 0) >= FREE_GLOBAL_JOB_CAP) {
      return c.json(
        { error: 'The free tier is full right now. Join the waitlist for early Pro access.' },
        503,
      );
    }
  }

  const slot = await pickLeastLoadedSlot(db, input.intervalMin);
  const now = Date.now();
  const id = randomUUID();
  let nextRunAt: number | null = null;
  if (input.cronExpression) {
    try {
      const interval = CronExpressionParser.parse(input.cronExpression, {
        tz: input.timezone || 'UTC',
        currentDate: new Date(now)
      });
      nextRunAt = interval.next().getTime();
    } catch (err) {
      return c.json({ error: 'Invalid cron expression or timezone' }, 400);
    }
  }

  await db
    .prepare(
      `INSERT INTO jobs (id, user_id, name, url, method, headers_enc, body_enc,
                         cron_expression, timezone, next_run_at, mode,
                         interval_min, slot, timeout_ms, status, state, fail_streak,
                         success_condition, plan_priority, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, 'active', 'unknown', 0,
               ?15, ?16, ?17, ?18)`,
    )
    .bind(
      id,
      user.id,
      input.name,
      input.url,
      input.method,
      Object.keys(input.headers).length ? await encryptJson(c.env.ENCRYPTION_KEY, input.headers) : null,
      input.body ? await encryptString(c.env.ENCRYPTION_KEY, input.body) : null,
      input.cronExpression || null,
      input.timezone || 'UTC',
      nextRunAt,
      input.mode,
      input.intervalMin,
      slot,
      input.timeoutMs,
      input.successCondition ? JSON.stringify(input.successCondition) : null,
      PLANS[user.plan].planPriority,
      now,
      now,
    )
    .run();

  if (input.mode === 'heartbeat') {
    const token = randomUUID(); // or generate a shorter random string
    await db.prepare(`
      INSERT INTO heartbeats (job_id, token, expected_every_min, grace_min)
      VALUES (?1, ?2, ?3, ?4)
    `).bind(id, token, input.intervalMin, 5).run();
  }

  const row = await db.prepare('SELECT * FROM jobs WHERE id = ?1').bind(id).first<JobRow>();
  return c.json({ job: row ? toDTO(row) : null }, 201);
});

async function pickLeastLoadedSlot(db: D1Database, intervalMin: number): Promise<number> {
  const { results } = await db
    .prepare(
      `SELECT slot, COUNT(*) AS n FROM jobs WHERE status = 'active' AND interval_min = ?1 GROUP BY slot`,
    )
    .bind(intervalMin)
    .all<{ slot: number; n: number }>();
  return pickSlot(new Map((results ?? []).map((r) => [r.slot, r.n])), intervalMin);
}

// ---- detail + events --------------------------------------------------------

jobsRoutes.get('/:id', async (c) => {
  const user = c.get('user');
  const row = await c.env.DB.prepare('SELECT * FROM jobs WHERE id = ?1 AND user_id = ?2')
    .bind(c.req.param('id'), user.id)
    .first<JobRow>();
  if (!row) return c.json({ error: 'Job not found' }, 404);

  const { results } = await c.env.DB.prepare(
    `SELECT id, job_id, at, kind, http_status, error, duration_ms
     FROM job_events WHERE job_id = ?1 ORDER BY at DESC, id DESC LIMIT ?2`,
  )
    .bind(row.id, PLANS[user.plan].eventHistoryLimit)
    .all<JobEventDTO>();
    
  let heartbeatToken: string | undefined;
  if (row.mode === 'heartbeat') {
    const hb = await c.env.DB.prepare('SELECT token FROM heartbeats WHERE job_id = ?1').bind(row.id).first<{token: string}>();
    if (hb) heartbeatToken = hb.token;
  }
  
  return c.json({ job: toDTO(row), events: results ?? [], heartbeatToken });
});

// ---- update -----------------------------------------------------------------

jobsRoutes.patch('/:id', async (c) => {
  const user = c.get('user');
  const existing = await c.env.DB.prepare('SELECT * FROM jobs WHERE id = ?1 AND user_id = ?2')
    .bind(c.req.param('id'), user.id)
    .first<JobRow>();
  if (!existing) return c.json({ error: 'Job not found' }, 404);

  const body = (await c.req.json<Record<string, unknown>>().catch(() => null)) ?? {};
  const validated = validateJobInput(body, user.plan);
  if (!validated.ok) return c.json({ error: validated.error }, 400);
  const input = validated.value;
  const status = body['status'] === 'paused' || body['status'] === 'active' ? body['status'] : existing.status;

  // Heartbeat jobs carry a placeholder URL and are never pinged; the real
  // signal is check-ins, so the URL rules do not apply.
  if (input.mode !== 'heartbeat') {
    try {
      assertUrlAllowed(input.url, { requireHttps: user.plan === 'free' });
    } catch (e) {
      return c.json({ error: (e as Error).message }, 400);
    }
  }

  const now = Date.now();
  const slot =
    input.intervalMin === existing.interval_min
      ? existing.slot
      : await pickLeastLoadedSlot(c.env.DB, input.intervalMin);

  // An untouched headers/body field means "keep what's stored" — secrets are
  // never sent back to the client, so the form cannot echo them.
  const headersProvided = body['headersProvided'] === true;
  const bodyProvided = body['bodyProvided'] === true;
  const headersEnc = headersProvided
    ? Object.keys(input.headers).length
      ? await encryptJson(c.env.ENCRYPTION_KEY, input.headers)
      : null
    : existing.headers_enc;
  const bodyEnc = bodyProvided
    ? input.body
      ? await encryptString(c.env.ENCRYPTION_KEY, input.body)
      : null
    : existing.body_enc;

  let nextRunAt: number | null = existing.next_run_at;
  if (input.cronExpression) {
    try {
      const interval = CronExpressionParser.parse(input.cronExpression, {
        tz: input.timezone || 'UTC',
        currentDate: new Date(now)
      });
      nextRunAt = interval.next().getTime();
    } catch (err) {
      return c.json({ error: 'Invalid cron expression or timezone' }, 400);
    }
  } else if (input.intervalMin !== existing.interval_min) {
     nextRunAt = null; // Removed cron expression, switch back to interval
  }

  await c.env.DB.prepare(
    `UPDATE jobs SET name = ?1, url = ?2, method = ?3, headers_enc = ?4, body_enc = ?5,
                      cron_expression = ?6, timezone = ?7, next_run_at = ?8,
                      mode = ?9, interval_min = ?10, slot = ?11, timeout_ms = ?12,
                      status = ?13, success_condition = ?14, updated_at = ?15
     WHERE id = ?16 AND user_id = ?17`,
  )
    .bind(
      input.name,
      input.url,
      input.method,
      headersEnc,
      bodyEnc,
      input.cronExpression || null,
      input.timezone || 'UTC',
      input.cronExpression ? nextRunAt : null,
      input.mode,
      input.intervalMin,
      slot,
      input.timeoutMs,
      status,
      input.successCondition ? JSON.stringify(input.successCondition) : null,
      now,
      existing.id,
      user.id,
    )
    .run();

  if (status !== existing.status) {
    await c.env.DB.prepare(
      `INSERT INTO job_events (job_id, at, kind, http_status, error, duration_ms)
       VALUES (?1, ?2, ?3, NULL, NULL, NULL)`,
    )
      .bind(existing.id, now, status === 'paused' ? 'paused' : 'resumed')
      .run();
  }

  const row = await c.env.DB.prepare('SELECT * FROM jobs WHERE id = ?1').bind(existing.id).first<JobRow>();
  return c.json({ job: row ? toDTO(row) : null });
});

// ---- delete -----------------------------------------------------------------

jobsRoutes.delete('/:id', async (c) => {
  const user = c.get('user');
  const res = await c.env.DB.prepare('DELETE FROM jobs WHERE id = ?1 AND user_id = ?2')
    .bind(c.req.param('id'), user.id)
    .run();
  if (!res.meta.changes) return c.json({ error: 'Job not found' }, 404);
  return c.json({ ok: true });
});

// ---- run now / test run (no writes; rate-limited) ---------------------------

jobsRoutes.post('/run-test', async (c) => {
  const user = c.get('user');
  if (!rateLimit(`run-test:${user.id}`, 6, 60_000)) {
    return c.json({ error: 'Slow down — at most 6 test runs per minute' }, 429);
  }
  const validated = validateJobInput(await c.req.json<unknown>().catch(() => null), user.plan);
  if (!validated.ok) return c.json({ error: validated.error }, 400);
  return executeOnce(c.env, c.env.ENCRYPTION_KEY, validated.value, PLANS[user.plan].planPriority);
});

jobsRoutes.post('/:id/run', async (c) => {
  const user = c.get('user');
  if (!rateLimit(`run:${user.id}`, 6, 60_000)) {
    return c.json({ error: 'Slow down — at most 6 runs per minute' }, 429);
  }
  const row = await c.env.DB.prepare('SELECT * FROM jobs WHERE id = ?1 AND user_id = ?2')
    .bind(c.req.param('id'), user.id)
    .first<JobRow>();
  if (!row) return c.json({ error: 'Job not found' }, 404);

  const input: JobInput = {
    name: row.name,
    url: row.url,
    method: row.method,
    mode: row.mode as JobInput['mode'],
    intervalMin: row.interval_min,
    headers: (await decryptJson<Record<string, string>>(c.env.ENCRYPTION_KEY, row.headers_enc)) ?? {},
    body: row.body_enc ? ((await decryptString(c.env.ENCRYPTION_KEY, row.body_enc)) ?? undefined) : undefined,
    timeoutMs: row.timeout_ms,
    successCondition: parseSuccessCondition(row.success_condition) ?? undefined,
  };
  return executeOnce(c.env, c.env.ENCRYPTION_KEY, input, row.plan_priority);
});

/** Runs the job once and returns the outcome. Never touches the database. */
async function executeOnce(
  env: Env,
  keyMaterial: string,
  input: JobInput,
  planPriority: number,
): Promise<Response> {
  const outcome: PingOutcome = await pingJob(
    {
      url: input.url,
      method: input.method,
      mode: input.mode,
      // Encrypt and decrypt through the same path a real tick uses, so the
      // test reflects exactly what will run on schedule.
      headersEnc: Object.keys(input.headers).length
        ? await encryptJson(keyMaterial, input.headers)
        : null,
      bodyEnc: input.body ? await encryptString(keyMaterial, input.body) : null,
      timeoutMs: input.timeoutMs,
      successCondition: input.successCondition ?? null,
      requireHttps: planPriority === 0,
    },
    env,
  );
  return Response.json({ outcome });
}
