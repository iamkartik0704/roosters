import { useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '../api';
import { type UserDTO, PLANS } from '@cron/shared';

export default function Billing({ user }: { user: UserDTO }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upgrade = async (plan: 'pro' | 'team') => {
    setBusy(true);
    setError(null);
    try {
      const { subscription_id, key_id, mock, plan: returnedPlan } = await api.checkout(plan) as any;
      
      if (mock) {
        toast.promise(
          api.mockWebhook(returnedPlan, subscription_id),
          {
            loading: 'Simulating Razorpay checkout...',
            success: `Payment successful! Upgraded to ${returnedPlan.toUpperCase()}`,
            error: 'Mock payment failed'
          }
        ).then(() => {
          setTimeout(() => window.location.reload(), 2000);
        }).catch(() => {
          setBusy(false);
        });
        return;
      }

      const loadScript = () => new Promise((resolve) => {
        if ((window as any).Razorpay) return resolve(true);
        const script = document.createElement('script');
        script.src = 'https://checkout.razorpay.com/v1/checkout.js';
        script.onload = () => resolve(true);
        document.body.appendChild(script);
      });

      await loadScript();

      const options = {
        key: key_id,
        subscription_id,
        name: 'CronPulse',
        description: `Upgrade to ${plan.toUpperCase()}`,
        handler: function () {
          window.location.reload();
        },
        prefill: {
          email: user.email,
        },
        theme: {
          color: '#3399cc'
        }
      };
      
      const rzp = new (window as any).Razorpay(options);
      rzp.on('payment.failed', function (response: any) {
        setError(response.error.description);
      });
      rzp.open();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      if (!(window as any).Razorpay) setBusy(false); // If Razorpay widget opened, leave busy to prevent double click
    }
  };

  return (
    <div className="billing-page" style={{ maxWidth: '900px', margin: '0 auto', padding: '0 24px' }}>
      <header style={{ marginBottom: '32px' }}>
        <h1 style={{ marginBottom: '8px' }}>Billing & Subscription</h1>
        <p className="muted">Manage your plan, limits, and payment methods.</p>
      </header>
      
      <div className="card" style={{ marginBottom: '48px', borderLeft: '4px solid var(--accent)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <span className="muted small" style={{ letterSpacing: '2px', textTransform: 'uppercase' }}>Current Plan</span>
            <h2 style={{ fontSize: '32px', margin: '8px 0', color: 'var(--white)', textShadow: '0 2px 10px rgba(0,0,0,0.5)' }}>
              {PLANS[user.plan].label}
            </h2>
            <p className="muted" style={{ margin: 0 }}>
              {user.plan === 'free' 
                ? 'Your free resources are active. Upgrade to unlock per-minute precision.'
                : 'Your subscription is active and in good standing.'}
            </p>
          </div>
          <span className="chip chip-up">Active</span>
        </div>
      </div>

      {user.plan === 'free' && (
        <section>
          <h3 style={{ marginBottom: '24px', letterSpacing: '1px' }}>Available Upgrades</h3>
          <div className="pricing">
            <article className="card plan plan-featured">
              <h3>Pro</h3>
              <p className="price">₹249<span className="muted" style={{ fontSize: '14px' }}>/mo</span></p>
              <ul className="plan-list">
                <li>Down to 1-minute runs</li>
                <li>15 active jobs</li>
                <li>POST/PUT/DELETE, headers & body</li>
                <li>Retries + success conditions</li>
                <li>30-day history</li>
              </ul>
              <button className="btn btn-primary" disabled={busy} onClick={() => upgrade('pro')} style={{ width: '100%', marginTop: 'auto' }}>
                {busy ? 'Processing...' : 'Upgrade to Pro'}
              </button>
            </article>

            <article className="card plan">
              <h3>Team</h3>
              <p className="price">₹599<span className="muted" style={{ fontSize: '14px' }}>/mo</span></p>
              <ul className="plan-list">
                <li>Down to 1-minute runs</li>
                <li>50 active jobs</li>
                <li>All HTTP methods & payload</li>
                <li>API Keys & Audit logs (Soon)</li>
                <li>90-day history</li>
              </ul>
              <button className="btn btn-ghost" disabled={busy} onClick={() => upgrade('team')} style={{ width: '100%', marginTop: 'auto' }}>
                {busy ? 'Processing...' : 'Upgrade to Team'}
              </button>
            </article>
          </div>
        </section>
      )}
      {error && <p className="error" style={{ marginTop: '1rem', padding: '16px', border: '1px solid var(--down)' }}>{error}</p>}
    </div>
  );
}
