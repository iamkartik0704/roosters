import { Hono } from 'hono';
import { type AppEnv } from './middleware';
import { notifyStateChanges } from '../email/notify';
import { type JobState } from '@cron/shared';

export const heartbeatRoutes = new Hono<AppEnv>();

heartbeatRoutes.all('/:token', async (c) => {
  const token = c.req.param('token');
  const now = Date.now();
  const db = c.env.DB;

  const row = await db.prepare(`
    SELECT j.id, j.user_id, j.name, j.state, j.status, j.last_state_change, j.plan_priority
    FROM heartbeats h
    JOIN jobs j ON j.id = h.job_id
    WHERE h.token = ?1
  `).bind(token).first<{ id: string; user_id: string; name: string; state: JobState; status: string; last_state_change: number | null; plan_priority: number }>();

  if (!row) {
    return c.json({ error: 'Invalid heartbeat token' }, 404);
  }

  // Always update last_seen
  await db.prepare('UPDATE heartbeats SET last_seen = ?1 WHERE token = ?2').bind(now, token).run();

  if (row.status === 'active' && row.state !== 'up') {
    // Transition to up immediately
    await db.batch([
      db.prepare(`UPDATE jobs SET state = 'up', fail_streak = 0, last_state_change = ?1, updated_at = ?2 WHERE id = ?3`).bind(now, now, row.id),
      db.prepare(`INSERT INTO job_events (job_id, at, kind, http_status, error, duration_ms) VALUES (?1, ?2, ?3, 200, NULL, 0)`).bind(row.id, now, row.state === 'down' ? 'recovered' : 'resumed')
    ]);

    if (row.state === 'down') {
      const emailOutcome = { ok: true, httpStatus: 200, error: null, durationMs: 0 };
      c.executionCtx.waitUntil(notifyStateChanges(c.env, [{
        jobId: row.id,
        at: now,
        kind: 'recovered',
        httpStatus: 200,
        error: null,
        durationMs: 0,
        userId: row.user_id,
        jobName: row.name,
        url: 'heartbeat',
      }], [emailOutcome]));
    }
  }

  return c.json({ ok: true, message: 'Heartbeat received' });
});
