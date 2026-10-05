import { TICK_BATCH_SIZE, TICK_PING_BUDGET, type PingOutcome } from '@cron/shared';
import type { JobMode, JobState, JobStatus } from '@cron/shared';
import type { ScheduledController, ExecutionContext } from '@cloudflare/workers-types';
import type { Env } from './env';
import { pingJobs, type PingableJob } from './ping';
import { evaluateOutcomes, type JobPatch, type JobRowLike, type TickEvaluation } from './state';
import { notifyStateChanges } from './email/notify';
import { parseExpression } from 'cron-parser';

const TICK_LIMIT = TICK_PING_BUDGET;

/** The tick SELECT returns snake_case columns; map them explicitly (a wrong
 * camelCase property would silently be undefined and corrupt the state machine). */
interface DueJobRow {
  id: string;
  user_id: string;
  name: string;
  url: string;
  method: string;
  headers_enc: string | null;
  body_enc: string | null;
  mode: string;
  timeout_ms: number;
  success_condition: string | null;
  fail_streak: number;
  state: string;
  status: string;
  last_state_change: number | null;
  plan_priority: number;
  cron_expression: string | null;
  timezone: string | null;
}

interface DueJob extends JobRowLike, PingableJob {
  cronExpression: string | null;
  timezone: string | null;
}

function mapDueJob(row: DueJobRow): DueJob {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    url: row.url,
    method: row.method,
    headersEnc: row.headers_enc,
    bodyEnc: row.body_enc,
    mode: row.mode as JobMode,
    timeoutMs: row.timeout_ms,
    successCondition: parseSuccessCondition(row.success_condition),
    requireHttps: row.plan_priority === 0, // free plan: HTTPS only (section 7)
    status: row.status as JobStatus,
    state: row.state as JobState,
    failStreak: row.fail_streak,
    lastStateChange: row.last_state_change,
    cronExpression: row.cron_expression,
    timezone: row.timezone,
  };
}

/**
 * The tick (plan section 5): Cloudflare fires this every minute. It reads due
 * jobs (slot match), pings up to 40 in batches of 6, writes only state changes
 * plus one tick_stats row, and sends alerts for state changes only.
 */
export async function runTick(
  controller: ScheduledController,
  env: Env,
  ctx: ExecutionContext,
): Promise<void> {
  const minute = Math.floor(controller.scheduledTime / 60_000);
  const started = Date.now();

  const due = await env.DB.prepare(
    `SELECT id, user_id, name, url, method, headers_enc, body_enc, mode,
            timeout_ms, success_condition, fail_streak, state, status,
            last_state_change, plan_priority, cron_expression, timezone
     FROM jobs
     WHERE status = 'active' AND mode != 'heartbeat' AND (
        (cron_expression IS NULL AND (?1 % interval_min) = slot)
        OR
        (cron_expression IS NOT NULL AND next_run_at <= ?2)
     )
     ORDER BY plan_priority DESC, created_at ASC
     LIMIT ${TICK_LIMIT}`,
  )
    .bind(minute, Date.now())
    .all<DueJobRow>();
  // Heartbeat jobs are excluded above: their placeholder URL is never pinged —
  // health comes from check-ins (see the overdue evaluation below), and the
  // URL guard would fail every ping and falsely mark them down.
  const dueJobs = (due.results ?? []).map(mapDueJob);

  const outcomes: PingOutcome[] = [];
  const statements: D1PreparedStatement[] = [];
  let pingEvaluation: TickEvaluation = { patches: [], events: [], changes: [] };

  if (dueJobs.length > 0) {
    let overflow = 0;
    if (dueJobs.length === TICK_LIMIT) {
      const count = await env.DB.prepare(
        `SELECT COUNT(*) AS n FROM jobs WHERE status = 'active' AND mode != 'heartbeat' AND (?1 % interval_min) = slot`,
      )
        .bind(minute)
        .first<{ n: number }>();
      overflow = Math.max(0, (count?.n ?? TICK_LIMIT) - TICK_LIMIT);
      console.warn(`[tick ${minute}] overflow: ${overflow} jobs beyond the ${TICK_LIMIT} budget`);
    }

    outcomes.push(...(await pingJobs(dueJobs, TICK_BATCH_SIZE, env)));
    const evaluation = evaluateOutcomes(dueJobs, outcomes, Date.now());

    for (const job of dueJobs) {
      if (job.cronExpression) {
        try {
          const interval = parseExpression(job.cronExpression, {
            tz: job.timezone || 'UTC',
            currentDate: new Date(Date.now())
          });
          const nextAt = interval.next().getTime();
          const patch = evaluation.patches.find(p => p.id === job.id);
          if (patch) {
            patch.nextRunAt = nextAt;
          } else {
            evaluation.patches.push({ id: job.id, nextRunAt: nextAt });
          }
        } catch (e) {
          console.error('Failed to parse cron in tick', e);
        }
      }
    }

    statements.push(
      ...evaluation.patches.map((p) => jobPatchStatement(env, p)),
      ...evaluation.events.map((e) =>
        env.DB.prepare(
          `INSERT INTO job_events (job_id, at, kind, http_status, error, duration_ms)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
        ).bind(e.jobId, e.at, e.kind, e.httpStatus, e.error, e.durationMs),
      ),
      env.DB.prepare(
        `INSERT INTO tick_stats (minute, jobs_run, ok, failed, overflow, duration_ms, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
         ON CONFLICT (minute) DO UPDATE SET
           jobs_run = excluded.jobs_run, ok = excluded.ok, failed = excluded.failed,
           overflow = excluded.overflow, duration_ms = excluded.duration_ms`,
      ).bind(
        minute,
        dueJobs.length,
        outcomes.filter((o) => o.ok).length,
        outcomes.filter((o) => !o.ok).length,
        overflow,
        Date.now() - started,
        Date.now(),
      ),
    );
    pingEvaluation = evaluation;
  }

  // Evaluate heartbeats — must run even when no pingable jobs were due.
  let hbEvaluation: TickEvaluation = { patches: [], events: [], changes: [] };
  const hbOutcomes: PingOutcome[] = [];
  const missedHeartbeats = await env.DB.prepare(`
    SELECT j.id, j.user_id, j.name, j.url, j.method, j.headers_enc, j.body_enc, j.mode,
           j.timeout_ms, j.success_condition, j.fail_streak, j.state, j.status,
           j.last_state_change, j.plan_priority, j.cron_expression, j.timezone
    FROM jobs j
    JOIN heartbeats h ON j.id = h.job_id
    WHERE j.mode = 'heartbeat' AND j.status = 'active' AND j.state != 'down'
      AND (
         (h.last_seen IS NULL AND (?1 - j.created_at) > (h.expected_every_min + h.grace_min) * 60000)
         OR
         (h.last_seen IS NOT NULL AND (?1 - h.last_seen) > (h.expected_every_min + h.grace_min) * 60000)
      )
  `).bind(Date.now()).all<DueJobRow>();

  if (missedHeartbeats.results && missedHeartbeats.results.length > 0) {
    const hbJobs = missedHeartbeats.results.map(mapDueJob);
    for (let i = 0; i < hbJobs.length; i++) {
      hbOutcomes.push({ ok: false, httpStatus: null, error: 'Heartbeat missed', durationMs: 0 });
    }
    hbEvaluation = evaluateOutcomes(hbJobs, hbOutcomes, Date.now());

    statements.push(
      ...hbEvaluation.patches.map((p) => jobPatchStatement(env, p)),
      ...hbEvaluation.events.map((e) =>
        env.DB.prepare(
          `INSERT INTO job_events (job_id, at, kind, http_status, error, duration_ms)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
        ).bind(e.jobId, e.at, e.kind, e.httpStatus, e.error, e.durationMs),
      ),
    );
  }

  if (statements.length > 0) {
    await env.DB.batch(statements);
  }

  const allChanges = [...pingEvaluation.changes, ...hbEvaluation.changes];
  if (allChanges.length > 0) {
    ctx.waitUntil(notifyStateChanges(env, allChanges, [...outcomes, ...hbOutcomes]));
  }

  // Prune old events once per hour
  if (minute % 60 === 0) {
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    ctx.waitUntil(
      env.DB.prepare('DELETE FROM job_events WHERE at < ?1').bind(thirtyDaysAgo).run().catch((err) => console.error('Pruning failed', err))
    );
  }
}

function parseSuccessCondition(raw: string | null): PingableJob['successCondition'] {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PingableJob['successCondition'];
  } catch {
    return null;
  }
}

/** Patch columns come from our own state machine, never user input. */
function jobPatchStatement(env: Env, p: JobPatch): D1PreparedStatement {
  const sets: string[] = ['updated_at = ?'];
  const vals: (string | number | null)[] = [Date.now()];
  if (p.failStreak !== undefined) {
    sets.push('fail_streak = ?');
    vals.push(p.failStreak);
  }
  if (p.state !== undefined) {
    sets.push('state = ?');
    vals.push(p.state);
  }
  if (p.status !== undefined) {
    sets.push('status = ?');
    vals.push(p.status);
  }
  if (p.lastStateChange !== undefined) {
    sets.push('last_state_change = ?');
    vals.push(p.lastStateChange);
  }
  if (p.lastStatus !== undefined) {
    sets.push('last_status = ?');
    vals.push(p.lastStatus);
  }
  if (p.lastError !== undefined) {
    sets.push('last_error = ?');
    vals.push(p.lastError);
  }
  if (p.nextRunAt !== undefined) {
    sets.push('next_run_at = ?');
    vals.push(p.nextRunAt);
  }
  vals.push(p.id);
  return env.DB.prepare(`UPDATE jobs SET ${sets.join(', ')} WHERE id = ?`).bind(...vals);
}

export type { PingOutcome };
