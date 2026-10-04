import type { JobDTO } from '@cron/shared';

export function StatusChip({ job }: { job: JobDTO }) {
  if (job.status === 'paused') {
    return <span className="chip chip-paused">paused</span>;
  }
  if (job.state === 'up') {
    return <span className="chip chip-up">up</span>;
  }
  if (job.state === 'down') {
    return <span className="chip chip-down">down</span>;
  }
  return <span className="chip chip-unknown">checking…</span>;
}
