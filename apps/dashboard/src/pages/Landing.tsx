import { useState } from 'react';
import { PLANS, type UserDTO } from '@cron/shared';
import { api, setToken } from '../api';
import { BRAND } from '../util';
import { Turnstile } from '@marsidev/react-turnstile';

export default function Landing({ onSignedIn }: { onSignedIn?: (user: UserDTO) => void }) {
  return (
    <>
      <section className="hero">
        <h1>
          Your free host sleeps your app.
          <br />
          <span className="accent">We knock every 10 minutes — and tell you when nobody answers.</span>
        </h1>
        <p className="sub">
          {BRAND} calls your URL on a schedule, alerts you when it fails, and keeps the history.
          The self-ping trick can't alert you when your app is already dead. An outside observer can.
        </p>
        <div className="hero-actions">
          <SigninButtons />
          <div style={{ marginTop: '16px' }}>
            <a className="btn btn-ghost" href="#pricing">
              See pricing
            </a>
          </div>
        </div>
        <p className="muted small" style={{ maxWidth: '400px', margin: '0 auto 16px' }}>
          Free tier: 3 jobs · GET pings every 10 minutes · email alerts on down &amp; recovered · last 50
          events.
        </p>
        <DevLogin onSignedIn={onSignedIn} />
      </section>

      <section id="features" className="features-section">
        <h2 className="section-title">Built for Reliability</h2>
        <div className="features">
          <article className="card">
          <h3>Keep-alive pings</h3>
          <p>
            Any HTTP response — even a 404 — proves your host woke up. Choose the gentler monitor
            mode when you want a 2xx required.
          </p>
        </article>
        <article className="card">
          <h3>Alerts that reach you</h3>
          <p>
            One email when a job goes down (after 3 consecutive failures), one when it recovers.
            Never a flood per failed ping.
          </p>
        </article>
        <article className="card">
          <h3>Built for India</h3>
          <p>
            ₹ pricing, UPI AutoPay and cards via Razorpay, GST-friendly invoices. No dollar-only
            subscriptions.
          </p>
        </article>
        <article className="card">
          <h3>Pro: dependable scheduling</h3>
          <p>
            Per-minute runs, POST/PUT/DELETE with headers and body, retries, success conditions,
            heartbeat monitoring, 30-day history.
          </p>
        </article>
        </div>
      </section>

      <section id="pricing" className="pricing-section">
        <h2 className="section-title">Transparent Pricing</h2>
        <div className="pricing">
          <PlanCard plan="free" cta={<SigninButtons compact />} />
        <PlanCard
          plan="pro"
          featured
          cta={<p className="muted small">Pro launches with the founding-member offer — join the waitlist.</p>}
        />
        <PlanCard
          plan="team"
          cta={<p className="muted small">Teams, API keys and audit logs ship after Pro.</p>}
        />
        </div>
      </section>

      <Waitlist />
    </>
  );
}

function PlanCard({
  plan,
  featured = false,
  cta,
}: {
  plan: 'free' | 'pro' | 'team';
  featured?: boolean;
  cta: React.ReactNode;
}) {
  const limits = PLANS[plan];
  return (
    <article className={`card plan ${featured ? 'plan-featured' : ''}`}>
      <h3>{limits.label}</h3>
      <p className="price">{limits.priceInr}</p>
      <ul className="plan-list">
        <li>
          {plan === 'free' ? 'Fixed 10-minute GET pings' : 'Down to 1-minute runs'}
        </li>
        <li>
          {limits.maxJobs} active job{limits.maxJobs === 1 ? '' : 's'}
        </li>
        <li>
          {limits.methods.slice(0, 2).join(', ')}
          {limits.methods.length > 2 ? ` +${limits.methods.length - 2} more` : ''}
          {limits.canSetHeadersBody ? ', headers & body' : ' only'}
        </li>
        <li>{limits.successConditions ? 'Retries + success conditions' : 'Email alerts'}</li>
        <li>
          {plan === 'free' ? 'Last 50 events' : `${plan === 'pro' ? 30 : 90}-day history`}
        </li>
      </ul>
      {cta}
    </article>
  );
}

function SigninButtons({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`auth-block ${compact ? 'compact' : ''}`}>
      {!compact && <div className="auth-heading">Continue With</div>}
      <div className="signin-buttons">
        <a className="btn btn-ghost auth-btn" href={authHref('github')}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
            <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
          </svg>
          GitHub
        </a>
        <a className="btn btn-ghost auth-btn" href={authHref('google')}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
            <path d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.733s3.773-8.733 8.6-8.733c2.547 0 4.547 1.013 5.96 2.347l2.347-2.347C19.36 1.76 16.36 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"/>
          </svg>
          Google
        </a>
      </div>
    </div>
  );
}

function authHref(provider: 'github' | 'google'): string {
  const redirect = encodeURIComponent(`${location.origin}/auth/callback`);
  return `/api/auth/${provider}/start?redirect=${redirect}`;
}

/** Local-only quick login; the endpoint 404s unless ALLOW_DEV_LOGIN is set. */
function DevLogin({ onSignedIn }: { onSignedIn?: (user: UserDTO) => void }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const devLogin = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/dev-login', { method: 'POST' });
      if (!res.ok) throw new Error();
      const { token } = (await res.json()) as { token: string };
      setToken(token);
      onSignedIn?.(await api.me());
    } catch {
      setError('Dev login unavailable — set ALLOW_DEV_LOGIN=true in .dev.vars');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="devlogin">
      <button className="btn btn-ghost btn-small" onClick={devLogin} disabled={busy}>
        {busy ? 'Signing in…' : 'Dev login (local only)'}
      </button>
      {error && <p className="error small">{error}</p>}
    </div>
  );
}

function Waitlist() {
  const [email, setEmail] = useState('');
  const [token, setCaptchaToken] = useState<string>();
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState('busy');
    setError(null);
    try {
      await api.joinWaitlist(email, token);
      setState('done');
    } catch (err) {
      setState('idle');
      setError((err as Error).message);
    }
  };

  return (
    <section className="waitlist">
      <h2>Want in early?</h2>
      <p className="muted">
        Founding members lock in a lower price and shape the roadmap. Free tier is open; Pro has a
        short waitlist.
      </p>
      {state === 'done' ? (
        <p className="success">You're on the list — watch your inbox.</p>
      ) : (
        <form className="waitlist-form" onSubmit={submit}>
          <input
            type="email"
            required
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-label="Email address"
          />
          <button className="btn btn-primary" disabled={state === 'busy'}>
            {state === 'busy' ? 'Joining…' : 'Join the waitlist'}
          </button>
        </form>
      )}
      {error && <p className="error">{error}</p>}
    </section>
  );
}
