import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import type { JobDTO, JobEventDTO } from '@cron/shared';
import { api } from '../api';
import { StatusChip } from '../components/StatusChip';
import { formatDuration, formatInterval, timeAgo } from '../util';

const KIND_LABEL: Record<JobEventDTO['kind'], string> = {
  down: 'Went down',
  recovered: 'Recovered',
  paused: 'Auto-paused (down 7 days)',
  resumed: 'Resumed',
};

export default function JobDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [job, setJob] = useState<JobDTO | null>(null);
  const [events, setEvents] = useState<JobEventDTO[]>([]);
  const [heartbeatToken, setHeartbeatToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const refresh = useCallback(() => {
    if (!id) return;
    api
      .job(id)
      .then((r) => {
        setJob(r.job);
        setEvents(r.events);
        if (r.heartbeatToken) setHeartbeatToken(r.heartbeatToken);
      })
      .catch((e: Error) => setError(e.message));
  }, [id]);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 30_000);
    return () => clearInterval(timer);
  }, [refresh]);

  if (error) return <p className="error">{error}</p>;
  if (!job) return <p className="muted">Loading…</p>;

  const togglePause = async () => {
    setBusy(true);
    try {
      await api.updateJob(job.id, { ...currentInput(job), status: job.status === 'active' ? 'paused' : 'active', headersProvided: false, bodyProvided: false });
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const runNow = async () => {
    setBusy(true);
    setError(null);
    try {
      const { outcome } = await api.runSaved(job.id);
      if (outcome.ok) {
        setError(null);
        toast.success(`Ping successful in ${formatDuration(outcome.durationMs)}!`);
      } else {
        setError(`Run failed: ${outcome.httpStatus ? `HTTP ${outcome.httpStatus}` : outcome.error} (${formatDuration(outcome.durationMs)})`);
        toast.error('Ping failed (see details)');
      }
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const confirmRemove = async () => {
    const tid = toast.loading('Deleting...');
    try {
      await api.deleteJob(job.id);
      toast.success(`Deleted ${job.name}`, { id: tid });
      navigate('/jobs');
    } catch (e) {
      toast.error((e as Error).message, { id: tid });
    } finally {
      setShowDeleteModal(false);
    }
  };

  return (
    <div className="narrow">
      <p className="breadcrumbs">
        <Link to="/jobs">← All jobs</Link>
      </p>
      <div className="page-head">
        <div>
          <h1>
            {job.name} <StatusChip job={job} />
          </h1>
          <p className="muted url-cell">{job.url}</p>
        </div>
        <div className="btn-row">
          <button className="btn btn-ghost" onClick={runNow} disabled={busy}>
            Run now
          </button>
          <button className="btn btn-ghost" onClick={togglePause} disabled={busy}>
            {job.status === 'active' ? 'Pause' : 'Resume'}
          </button>
          <Link className="btn btn-ghost" to={`/jobs/${job.id}/edit`}>
            Edit
          </Link>
          <button className="btn btn-danger" onClick={() => setShowDeleteModal(true)}>
            Delete
          </button>
        </div>
      </div>

      <div className="detail-grid">
        <div className="card">
          <h4>Schedule</h4>
          <p>
            {job.cronExpression ? `Cron: ${job.cronExpression} (${job.timezone})` : formatInterval(job.intervalMin)} · {job.method} ·{' '}
            {job.mode === 'heartbeat' ? 'heartbeat' : job.mode === 'keepalive' ? 'keep-alive' : 'monitor'}{' '}
            {job.mode !== 'heartbeat' && `· ${job.timeoutMs / 1000}s timeout`}
          </p>
          <p className="hint">
            {job.mode === 'heartbeat'
              ? `Expected to receive a ping ${job.cronExpression ? 'based on cron' : `every ${job.intervalMin}m`} (plus a 5m grace period).`
              : job.cronExpression ? 'Runs according to the cron schedule above.' : `Runs in minute slot ${job.slot} of every ${job.intervalMin}.`}
          </p>
          
          {job.mode === 'heartbeat' && heartbeatToken && (
            <div style={{ marginTop: '1rem', padding: '0.5rem', background: '#222', borderRadius: '4px', fontSize: '0.85rem' }}>
              <strong>Heartbeat URL:</strong><br/>
              <code>{import.meta.env.VITE_API_URL ?? ''}/api/heartbeat/{heartbeatToken}</code>
            </div>
          )}
        </div>
        <div className="card">
          <h4>Current state</h4>
          <p>
            {job.state === 'down' ? 'Down' : job.state === 'up' ? 'Up' : 'Not checked yet'}
            {job.failStreak > 0 && ` · ${job.failStreak} consecutive failure${job.failStreak === 1 ? '' : 's'}`}
          </p>
          {job.lastStatus !== null && <p className="hint">Last response: HTTP {job.lastStatus}</p>}
          {job.lastError && <p className="hint">Last error: {job.lastError}</p>}
          <p className="hint">Last state change: {timeAgo(job.lastStateChange)}</p>
        </div>
      </div>

      <h2>Recent activity</h2>
      <p className="muted small">
        Free plan records state changes (down/recovered) and pauses — not every successful ping.
      </p>
      {events.length === 0 ? (
        <p className="muted">No events yet. Successes are quiet by design.</p>
      ) : (
        <ul className="events">
          {events.map((e) => (
            <li key={e.id} className={`event event-${e.kind}`}>
              <span className={`dot dot-${e.kind}`} aria-hidden />
              <div>
                <strong>{KIND_LABEL[e.kind]}</strong>
                <span className="muted"> · {timeAgo(e.at)}</span>
                {(e.httpStatus !== null || e.error) && (
                  <div className="hint">
                    {e.httpStatus !== null && `HTTP ${e.httpStatus}`}
                    {e.error && ` — ${e.error}`}
                    {e.durationMs !== null && ` · ${formatDuration(e.durationMs)}`}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {showDeleteModal && (
        <div className="modal-backdrop">
          <div className="modal">
            <h3>Delete Job</h3>
            <p>Delete "{job.name}"? Its history will be removed too.</p>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setShowDeleteModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={confirmRemove}>Confirm</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function currentInput(job: JobDTO) {
  return {
    name: job.name,
    url: job.url,
    mode: job.mode,
    intervalMin: job.intervalMin,
    method: job.method,
    headers: {},
    timeoutMs: job.timeoutMs,
    successCondition: job.successCondition ?? undefined,
  };
}
