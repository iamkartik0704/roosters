import { AUTO_PAUSE_AFTER_DOWN_MS, FAIL_THRESHOLD } from '@cron/shared';
import type { JobEventKind, JobState, JobStatus, PingOutcome } from '@cron/shared';

/**
 * The job state machine (plan section 5), kept pure so it is unit-testable:
 *  - successful pings write nothing while a job is healthy
 *  - FAIL_THRESHOLD consecutive failures mark a job down (event + alert)
 *  - continued failures while down write nothing
 *  - the first success after a streak recovers the job (event + alert)
 *  - a job down for 7 days is auto-paused on its next failed ping
 */
export interface JobRowLike {
  id: string;
  userId: string;
  name: string;
  url: string;
  status: JobStatus;
  state: JobState;
  failStreak: number;
  lastStateChange: number | null;
}

export interface JobPatch {
  id: string;
  failStreak?: number;
  state?: JobState;
  status?: JobStatus;
  lastStateChange?: number;
  lastStatus?: number | null;
  lastError?: string | null;
  nextRunAt?: number | null;
}

export interface StateChangeEvent {
  jobId: string;
  at: number;
  kind: JobEventKind;
  httpStatus: number | null;
  error: string | null;
  durationMs: number | null;
}

export interface StateChange extends StateChangeEvent {
  userId: string;
  jobName: string;
  url: string;
}

export interface TickEvaluation {
  patches: JobPatch[];
  events: StateChangeEvent[];
  changes: StateChange[];
}

export function evaluateOutcomes(
  jobs: JobRowLike[],
  outcomes: PingOutcome[],
  now: number,
): TickEvaluation {
  const patches: JobPatch[] = [];
  const events: StateChangeEvent[] = [];
  const changes: StateChange[] = [];

  jobs.forEach((job, i) => {
    const outcome = outcomes[i];
    if (!outcome || job.status !== 'active') return;

    if (outcome.ok) {
      // Healthy jobs write nothing — except the first-ever success, which
      // flips the freshly created job from 'unknown' to 'up' exactly once.
      if (job.failStreak === 0 && job.state === 'up') return;
      const wasDown = job.state === 'down';
      patches.push({ id: job.id, failStreak: 0, state: 'up', lastStateChange: now });
      if (wasDown) {
        const event: StateChangeEvent = {
          jobId: job.id,
          at: now,
          kind: 'recovered',
          httpStatus: outcome.httpStatus,
          error: null,
          durationMs: outcome.durationMs,
        };
        events.push(event);
        changes.push({ ...event, userId: job.userId, jobName: job.name, url: job.url });
      }
      return;
    }

    // Failing ping.
    if (job.state === 'down') {
      // Already down: no writes on continued failures. Auto-pause (plan
      // section 5) triggers on the next failure after 7 days down.
      if (job.lastStateChange !== null && now - job.lastStateChange >= AUTO_PAUSE_AFTER_DOWN_MS) {
        const event: StateChangeEvent = {
          jobId: job.id,
          at: now,
          kind: 'paused',
          httpStatus: outcome.httpStatus,
          error: outcome.error,
          durationMs: outcome.durationMs,
        };
        patches.push({ id: job.id, status: 'paused', lastStatus: outcome.httpStatus, lastError: outcome.error });
        events.push(event);
        changes.push({ ...event, userId: job.userId, jobName: job.name, url: job.url });
      }
      return;
    }

    const streak = job.failStreak + 1;
    const isDown = streak >= FAIL_THRESHOLD;
    patches.push({
      id: job.id,
      failStreak: streak,
      lastStatus: outcome.httpStatus,
      lastError: outcome.error,
      ...(isDown ? { state: 'down' as const, lastStateChange: now } : {}),
    });
    if (isDown) {
      const event: StateChangeEvent = {
        jobId: job.id,
        at: now,
        kind: 'down',
        httpStatus: outcome.httpStatus,
        error: outcome.error,
        durationMs: outcome.durationMs,
      };
      events.push(event);
      changes.push({ ...event, userId: job.userId, jobName: job.name, url: job.url });
    }
  });

  return { patches, events, changes };
}
