import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import type { JobDTO, UserDTO } from '@cron/shared';
import { api } from '../api';
import { StatusChip } from '../components/StatusChip';
import { formatInterval, timeAgo } from '../util';

export default function Jobs({ user }: { user: UserDTO }) {
  const [jobs, setJobs] = useState<JobDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    api
      .jobs()
      .then((r) => setJobs(r.jobs))
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 30_000); // state changes land on the next tick
    return () => clearInterval(timer);
  }, [refresh]);

  const [jobToDelete, setJobToDelete] = useState<JobDTO | null>(null);

  const confirmDelete = async () => {
    if (!jobToDelete) return;
    const tid = toast.loading('Deleting...');
    try {
      await api.deleteJob(jobToDelete.id);
      setJobs((prev) => prev?.filter((j) => j.id !== jobToDelete.id) ?? null);
      toast.success(`Deleted ${jobToDelete.name}`, { id: tid });
    } catch (e) {
      toast.error((e as Error).message, { id: tid });
    } finally {
      setJobToDelete(null);
    }
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Your jobs</h1>
          <p className="muted">
            {user.plan === 'free' && 'Free plan: GET pings every 10 minutes, 3 jobs, email alerts.'}
          </p>
        </div>
        <Link className="btn btn-primary" to="/jobs/new">
          + New job
        </Link>
      </div>

      {error && <p className="error">{error}</p>}
      {!jobs && !error && <p className="muted">Loading…</p>}

      {jobs && jobs.length === 0 && (
        <div className="card empty-state">
          <h3>Nothing scheduled yet</h3>
          <p className="muted">
            The classic first job: keep a free-hosted app awake. Point a keep-alive ping at your
            health route and we'll wake it every 10 minutes.
          </p>
          <Link className="btn btn-primary" to="/jobs/new">
            Create your first job
          </Link>
        </div>
      )}

      {jobs && jobs.length > 0 && (
        <table className="jobs-table">
          <thead>
            <tr>
              <th>Status</th>
              <th>Name</th>
              <th>URL</th>
              <th>Schedule</th>
              <th>Last change</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
              <tr key={job.id}>
                <td>
                  <StatusChip job={job} />
                  {job.failStreak > 0 && job.status === 'active' && (
                    <span className="streak">×{job.failStreak}</span>
                  )}
                </td>
                <td>
                  <Link className="job-name" to={`/jobs/${job.id}`}>
                    {job.name}
                  </Link>
                </td>
                <td className="url-cell" title={job.url}>
                  {job.url.replace(/^https?:\/\//, '')}
                </td>
                <td>
                  {formatInterval(job.intervalMin)} · {job.method}
                  {job.mode === 'keepalive' ? ' · keep-alive' : ''}
                </td>
                <td>{timeAgo(job.lastStateChange)}</td>
                <td className="actions-cell">
                  <button className="btn btn-ghost btn-small" onClick={() => setJobToDelete(job)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {jobToDelete && (
        <div className="modal-backdrop">
          <div className="modal">
            <h3>Delete Job</h3>
            <p>Delete "{jobToDelete.name}"? Its history will be removed too.</p>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setJobToDelete(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={confirmDelete}>Confirm</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
