import { describe, expect, it } from 'vitest';
import type { PingOutcome } from '@cron/shared';
import { evaluateOutcomes, type JobRowLike } from '../src/state';

const ok = (ms = 100): PingOutcome => ({ ok: true, httpStatus: 200, error: null, durationMs: ms });
const fail = (status: number | null = 500, error = 'HTTP 500', ms = 100): PingOutcome => ({
  ok: false,
  httpStatus: status,
  error,
  durationMs: ms,
});

const job = (overrides: Partial<JobRowLike> = {}): JobRowLike => ({
  id: 'job-1',
  userId: 'user-1',
  name: 'Ping my app',
  url: 'https://example.com/health',
  status: 'active',
  state: 'unknown',
  failStreak: 0,
  lastStateChange: null,
  ...overrides,
});

describe('evaluateOutcomes', () => {
  it('writes nothing when an already-up job succeeds', () => {
    const r = evaluateOutcomes([job({ state: 'up' })], [ok()], 1000);
    expect(r.patches).toHaveLength(0);
    expect(r.events).toHaveLength(0);
    expect(r.changes).toHaveLength(0);
  });

  it("records the first-ever success once (unknown → up), then stays quiet", () => {
    const first = evaluateOutcomes([job()], [ok()], 1000);
    expect(first.patches).toEqual([{ id: 'job-1', failStreak: 0, state: 'up', lastStateChange: 1000 }]);
    expect(first.events).toHaveLength(0);
    expect(first.changes).toHaveLength(0);
    const again = evaluateOutcomes([job({ state: 'up' })], [ok()], 2000);
    expect(again.patches).toHaveLength(0);
  });

  it('records failures in the streak without marking down before the threshold', () => {
    const r = evaluateOutcomes([job()], [fail()], 1000);
    expect(r.patches).toEqual([{ id: 'job-1', failStreak: 1, lastStatus: 500, lastError: 'HTTP 500' }]);
    expect(r.events).toHaveLength(0);
    expect(r.changes).toHaveLength(0);
  });

  it('marks down after 3 consecutive failures with an event and a change', () => {
    const r = evaluateOutcomes([job({ failStreak: 2 })], [fail()], 1000);
    expect(r.patches[0]).toMatchObject({ id: 'job-1', failStreak: 3, state: 'down', lastStateChange: 1000 });
    expect(r.events).toHaveLength(1);
    expect(r.events[0].kind).toBe('down');
    expect(r.changes[0]).toMatchObject({ userId: 'user-1', jobName: 'Ping my app', kind: 'down' });
  });

  it('writes nothing while a down job keeps failing', () => {
    const r = evaluateOutcomes(
      [job({ state: 'down', failStreak: 3, lastStateChange: 1000 })],
      [fail()],
      2000,
    );
    expect(r.patches).toHaveLength(0);
    expect(r.events).toHaveLength(0);
    expect(r.changes).toHaveLength(0);
  });

  it('auto-pauses a job down for 7 days on its next failure', () => {
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    const r = evaluateOutcomes(
      [job({ state: 'down', failStreak: 3, lastStateChange: 1000 })],
      [fail()],
      1000 + sevenDays,
    );
    expect(r.patches[0]).toMatchObject({ id: 'job-1', status: 'paused' });
    expect(r.events[0].kind).toBe('paused');
    expect(r.changes[0].kind).toBe('paused');
  });

  it('recovers on the first success after failures', () => {
    const r = evaluateOutcomes([job({ state: 'down', failStreak: 3, lastStateChange: 1000 })], [ok()], 2000);
    expect(r.patches).toEqual([{ id: 'job-1', failStreak: 0, state: 'up', lastStateChange: 2000 }]);
    expect(r.events[0]).toMatchObject({ kind: 'recovered', httpStatus: 200 });
    expect(r.changes[0]).toMatchObject({ kind: 'recovered', userId: 'user-1' });
  });

  it('clears a failure streak silently (no event) before going down', () => {
    const r = evaluateOutcomes([job({ failStreak: 2, state: 'unknown' })], [ok()], 2000);
    expect(r.patches).toEqual([{ id: 'job-1', failStreak: 0, state: 'up', lastStateChange: 2000 }]);
    expect(r.events).toHaveLength(0);
  });

  it('ignores paused jobs', () => {
    const r = evaluateOutcomes([job({ status: 'paused' })], [fail()], 1000);
    expect(r.patches).toHaveLength(0);
  });

  it('evaluates multiple jobs independently', () => {
    const r = evaluateOutcomes(
      [job({ id: 'a', state: 'up' }), job({ id: 'b', failStreak: 2 })],
      [ok(), fail()],
      1000,
    );
    // already-up job a: no write; job b: 3rd failure → down
    expect(r.patches).toHaveLength(1);
    expect(r.patches[0].id).toBe('b');
    expect(r.events).toHaveLength(1);
    expect(r.events[0].jobId).toBe('b');
  });
});
