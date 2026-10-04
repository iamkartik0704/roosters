import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PLANS, TIMEOUT_MAX_MS, TIMEOUT_MIN_MS, type JobMode, type JobInput, type PingOutcome, type SuccessCondition, type UserDTO } from '@cron/shared';
import { api, getToken } from '../api';
import { formatDuration } from '../util';

interface FormState {
  name: string;
  url: string;
  mode: JobMode;
  intervalMin: number;
  method: string;
  headersJson: string;
  body: string;
  timeoutMs: number;
  statusCodes: string;
  bodyContains: string;
  jsonPath: string;
  jsonEquals: string;
  retries: string;
  isCron: boolean;
  cronExpression: string;
  timezone: string;
}

const DEFAULTS: FormState = {
  name: '',
  url: '',
  mode: 'keepalive',
  intervalMin: 10,
  method: 'GET',
  headersJson: '',
  body: '',
  timeoutMs: 45_000,
  statusCodes: '',
  bodyContains: '',
  jsonPath: '',
  jsonEquals: '',
  retries: '0',
  isCron: false,
  cronExpression: '',
  timezone: 'UTC',
};

const KEEPALIVE_HINT =
  'Keep-alive: any HTTP response (even a 404) proves the host woke up. Monitor: the response must pass the status rule.';

export default function JobForm() {
  const { id } = useParams();
  const editing = Boolean(id);
  const navigate = useNavigate();
  const [user, setUser] = useState<UserDTO | null>(null);
  const [form, setForm] = useState<FormState>(DEFAULTS);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testOutcome, setTestOutcome] = useState<PingOutcome | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (getToken()) api.me().then(setUser).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!editing || !id) return;
    api
      .job(id)
      .then(({ job }) => {
        setForm({
          name: job.name,
          url: job.url,
          mode: job.mode,
          intervalMin: job.intervalMin,
          method: job.method,
          headersJson: '',
          body: '',
          timeoutMs: job.timeoutMs,
          statusCodes: job.successCondition?.status?.join(', ') ?? '',
          bodyContains: job.successCondition?.bodyContains ?? '',
          jsonPath: job.successCondition?.jsonPath ?? '',
          jsonEquals: job.successCondition?.jsonEquals ?? '',
          retries: job.successCondition?.retries?.toString() ?? '0',
          isCron: !!job.cronExpression,
          cronExpression: job.cronExpression ?? '',
          timezone: job.timezone ?? 'UTC',
        });
      })
      .catch((e: Error) => setError(e.message));
  }, [editing, id]);

  const limits = useMemo(() => PLANS[user?.plan ?? 'free'], [user]);
  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));
  // When editing, an untouched headers/body field means "keep what's stored" —
  // the API returns decrypted secrets only as write-presence flags, not values.
  const [headersTouched, setHeadersTouched] = useState(false);
  const [bodyTouched, setBodyTouched] = useState(false);

  const parseHeaders = (): { ok: true; headers: Record<string, string> } | { ok: false; error: string } => {
    if (!form.headersJson.trim()) return { ok: true, headers: {} };
    try {
      const parsed = JSON.parse(form.headersJson) as unknown;
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        return { ok: false, error: 'Headers must be a JSON object like {"Authorization": "Bearer x"}' };
      }
      return {
        ok: true,
        headers: Object.fromEntries(Object.entries(parsed).map(([k, v]) => [k, String(v)])),
      };
    } catch {
      return { ok: false, error: 'Headers are not valid JSON' };
    }
  };

  const buildInput = (): { ok: false; error: string } | { ok: true; input: JobInput } => {
    const parsed = parseHeaders();
    if (!parsed.ok) return { ok: false, error: parsed.error };
    const successCondition: SuccessCondition | undefined =
      form.statusCodes.trim() || form.bodyContains.trim() || form.jsonPath.trim()
        ? {
            status: form.statusCodes.trim()
              ? form.statusCodes.split(',').map((s) => Number(s.trim())).filter((n) => Number.isInteger(n))
              : undefined,
            bodyContains: form.bodyContains.trim() || undefined,
            jsonPath: form.jsonPath.trim() || undefined,
            jsonEquals: form.jsonEquals.trim() || undefined,
            retries: parseInt(form.retries) > 0 ? parseInt(form.retries) : undefined,
          }
        : parseInt(form.retries) > 0 ? { retries: parseInt(form.retries) } : undefined;
    return {
      ok: true,
      input: {
        name: form.name,
        url: form.url,
        mode: form.mode,
        intervalMin: form.intervalMin,
        cronExpression: form.isCron ? form.cronExpression : undefined,
        timezone: form.isCron ? form.timezone : undefined,
        method: form.method,
        headers: parsed.headers,
        body: form.body || undefined,
        timeoutMs: form.timeoutMs,
        successCondition,
      },
    };
  };

  const runTest = async () => {
    setError(null);
    setTestOutcome(null);
    const built = buildInput();
    if (!built.ok) {
      setError(built.error);
      return;
    }
    setTesting(true);
    try {
      const { outcome } = await api.runTest(built.input);
      setTestOutcome(outcome);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setTesting(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const built = buildInput();
    if (!built.ok) {
      setError(built.error);
      return;
    }
    setSaving(true);
    try {
      if (editing && id) {
        await api.updateJob(id, {
          ...built.input,
          headersProvided: headersTouched,
          bodyProvided: bodyTouched,
        });
        navigate(`/jobs/${id}`);
      } else {
        const { job } = await api.createJob(built.input);
        navigate(job ? `/jobs/${job.id}` : '/jobs');
      }
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  };

  const canHeadersBody = limits.canSetHeadersBody;

  return (
    <div className="narrow">
      <h1>{editing ? 'Edit job' : 'New job'}</h1>
      <form className="form" onSubmit={submit}>
        <label>
          Name
          <input
            required
            maxLength={100}
            placeholder="Keep my app awake"
            value={form.name}
            onChange={(e) => set({ name: e.target.value })}
          />
        </label>

        {form.mode !== 'heartbeat' && (
          <label>
            URL {limits.methods.length === 1 && <span className="hint">(HTTPS required on Free)</span>}
            <input
              required
              type="url"
              placeholder="https://myapp.example.com/health"
              value={form.url}
              onChange={(e) => set({ url: e.target.value })}
            />
          </label>
        )}

        <fieldset>
          <legend>Mode</legend>
          <label className="radio">
            <input
              type="radio"
              checked={form.mode === 'keepalive'}
              onChange={() => set({ mode: 'keepalive', timeoutMs: 45_000 })}
            />
            Keep-alive — any response counts
          </label>
          <label className="radio">
            <input
              type="radio"
              checked={form.mode === 'monitor'}
              onChange={() => set({ mode: 'monitor', timeoutMs: 30_000 })}
            />
            Monitor — require a successful response
          </label>
          <label className="radio">
            <input
              type="radio"
              checked={form.mode === 'heartbeat'}
              onChange={() => set({ mode: 'heartbeat' })}
              disabled={!limits.successConditions} // Reusing Pro check implicitly, or let everyone have it? We can let Pro have it.
            />
            Heartbeat — you ping us {!limits.successConditions && <span className="hint">— Pro</span>}
          </label>
          <p className="hint">{KEEPALIVE_HINT}</p>
        </fieldset>

        <div className="field-row">
          <label>
            Schedule Type
            <select value={form.isCron ? 'cron' : 'interval'} onChange={e => set({ isCron: e.target.value === 'cron' })}>
               <option value="interval">Simple Interval</option>
               <option value="cron">Cron Expression (Pro)</option>
            </select>
          </label>
          
          {!form.isCron ? (
            <label>
              Interval
              <select
                value={form.intervalMin}
                onChange={(e) => set({ intervalMin: Number(e.target.value) })}
              >
                {limits.intervalOptions.map((m) => (
                  <option key={m} value={m}>
                    {m === 1440 ? 'Daily' : `Every ${m} min`}
                  </option>
                ))}
              </select>
              {limits.intervalOptions.length === 1 && (
                <span className="hint">Fixed on Free — Pro unlocks 1–60 minutes.</span>
              )}
            </label>
          ) : (
             <>
               <label>
                 Cron Expression
                 <input placeholder="0 12 * * *" value={form.cronExpression} onChange={e => set({ cronExpression: e.target.value })} required={form.isCron} />
               </label>
               <label>
                 Timezone
                 <input placeholder="UTC, America/New_York..." value={form.timezone} onChange={e => set({ timezone: e.target.value })} required={form.isCron} />
               </label>
             </>
          )}

          <label>
            Method
            <select
              value={form.method}
              onChange={(e) => set({ method: e.target.value })}
              disabled={limits.methods.length === 1}
            >
              {limits.methods.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            {limits.methods.length === 1 && <span className="hint">GET only on Free.</span>}
          </label>

          <label>
            Timeout
            <select
              value={form.timeoutMs}
              onChange={(e) => set({ timeoutMs: Number(e.target.value) })}
            >
              {[10_000, 15_000, 30_000, 45_000, 60_000]
                .filter((t) => t >= TIMEOUT_MIN_MS && t <= TIMEOUT_MAX_MS)
                .map((t) => (
                  <option key={t} value={t}>
                    {t / 1000}s
                  </option>
                ))}
            </select>
          </label>
        </div>

        {form.mode !== 'heartbeat' && (
          <>
            <label>
              Headers (JSON) {canHeadersBody ? '' : <span className="hint">— Pro</span>}
          <textarea
            rows={3}
            disabled={!canHeadersBody}
            placeholder={editing ? '(unchanged)' : '{"Authorization": "Bearer …"}'}
            value={form.headersJson}
            onChange={(e) => {
              set({ headersJson: e.target.value });
              setHeadersTouched(true);
            }}
          />
          {editing && !headersTouched && (
            <span className="hint">Leave empty to keep the stored headers.</span>
          )}
        </label>

        {(form.method === 'POST' || form.method === 'PUT' || form.method === 'PATCH') && (
          <label>
            Request body {canHeadersBody ? '' : <span className="hint">— Pro</span>}
            <textarea
              rows={3}
              disabled={!canHeadersBody}
              placeholder={editing ? '(unchanged)' : '{"key": "value"}'}
              value={form.body}
              onChange={(e) => {
                set({ body: e.target.value });
                setBodyTouched(true);
              }}
            />
            {editing && !bodyTouched && (
              <span className="hint">Leave empty to keep the stored body.</span>
            )}
          </label>
        )}

        <fieldset disabled={!limits.successConditions}>
          <legend>Success conditions {limits.successConditions ? '' : '— Pro'}</legend>
          <p className="hint">Count this job as failed unless the response matches.</p>
          <div className="field-row">
            <label>
              Allowed status codes
              <input
                placeholder="200, 204"
                value={form.statusCodes}
                onChange={(e) => set({ statusCodes: e.target.value })}
              />
            </label>
            <label>
              Body contains
              <input
                placeholder='"ok":true'
                value={form.bodyContains}
                onChange={(e) => set({ bodyContains: e.target.value })}
              />
            </label>
          </div>
          <div className="field-row">
            <label>
              JSON path
              <input
                placeholder="data.status"
                value={form.jsonPath}
                onChange={(e) => set({ jsonPath: e.target.value })}
              />
            </label>
            <label>
              JSON value equals
              <input
                placeholder="healthy"
                value={form.jsonEquals}
                onChange={(e) => set({ jsonEquals: e.target.value })}
              />
            </label>
            <label>
              Retries on failure
              <select value={form.retries} onChange={(e) => set({ retries: e.target.value })}>
                <option value="0">None</option>
                <option value="1">1 Retry</option>
                <option value="2">2 Retries</option>
                <option value="3">3 Retries</option>
              </select>
            </label>
          </div>
        </fieldset>
        </>)}

        {error && <p className="error">{error}</p>}
        {testOutcome && (
          <p className={testOutcome.ok ? 'success' : 'error'}>
            Test run: {testOutcome.ok ? 'passed' : 'failed'} —{' '}
            {testOutcome.httpStatus ? `HTTP ${testOutcome.httpStatus}` : testOutcome.error} in{' '}
            {formatDuration(testOutcome.durationMs)}
          </p>
        )}

        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : editing ? 'Save changes' : 'Create job'}
          </button>
          <button type="button" className="btn btn-ghost" onClick={runTest} disabled={testing}>
            {testing ? 'Pinging…' : 'Send test ping'}
          </button>
        </div>
      </form>
    </div>
  );
}
