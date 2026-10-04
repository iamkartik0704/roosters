import { useEffect, useState } from 'react';
import type { UserDTO } from '@cron/shared';
import { PLANS } from '@cron/shared';
import { api } from '../api';
import { timeAgo } from '../util';

// Lock Icon SVG
const LockIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter" style={{ marginBottom: '12px', opacity: 0.5 }}>
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
    <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
  </svg>
);

export default function Settings({ user }: { user: UserDTO }) {
  const [keys, setKeys] = useState<any[]>([]);
  const [channels, setChannels] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  const [newChannelType, setNewChannelType] = useState('email');
  const [newChannelTarget, setNewChannelTarget] = useState('');
  
  const [newKeyToken, setNewKeyToken] = useState<string | null>(null);

  const [statusPage, setStatusPage] = useState<any>(null);
  const [spSlug, setSpSlug] = useState('');
  const [spTitle, setSpTitle] = useState('');
  const [spPublished, setSpPublished] = useState(false);
  const [spMsg, setSpMsg] = useState('');

  const refresh = () => {
    api.keys().then((r) => setKeys(r.keys)).catch(console.error);
    api.channels().then((r) => setChannels(r.channels)).catch(console.error);
    api.statusPageSettings().then((r) => {
      if (r.page) {
        setStatusPage(r.page);
        setSpSlug(r.page.slug);
        setSpTitle(r.page.title);
        setSpPublished(r.page.published);
      }
    }).catch(console.error);
  };

  useEffect(() => {
    refresh();
  }, []);

  const createKey = async () => {
    try {
      const res = await api.createKey();
      setNewKeyToken(res.key.token);
      refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const deleteKey = async (id: string) => {
    if (!window.confirm('Revoke this key immediately?')) return;
    await api.deleteKey(id);
    refresh();
  };

  const createChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api.createChannel(newChannelType, newChannelTarget);
      setNewChannelTarget('');
      refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const deleteChannel = async (id: string) => {
    if (!window.confirm('Delete this alert channel?')) return;
    await api.deleteChannel(id);
    refresh();
  };

  const limits = PLANS[user.plan];

  const saveStatusPage = async (e: React.FormEvent) => {
    e.preventDefault();
    setSpMsg('');
    try {
      const res = await api.updateStatusPage(spSlug, spTitle, spPublished);
      setStatusPage(res.page);
      setSpMsg('Status page updated.');
    } catch (err) {
      setSpMsg((err as Error).message);
    }
  };

  const LockedOverlay = ({ title, cta, plan }: { title: string, cta: string, plan: 'pro' | 'team' }) => (
    <div style={{
      padding: '48px 32px',
      textAlign: 'center',
      background: 'repeating-linear-gradient(45deg, #0a0a0a, #0a0a0a 10px, #0f0f0f 10px, #0f0f0f 20px)',
      border: '1px solid var(--dark-grey)',
      borderRadius: '4px',
      boxShadow: 'inset 0 0 20px rgba(0,0,0,0.8)'
    }}>
      <LockIcon />
      <p className="muted" style={{ marginBottom: '24px', fontSize: '15px' }}>{title}</p>
      <a href="/billing" className={plan === 'pro' ? 'btn btn-primary' : 'btn btn-ghost'}>{cta}</a>
    </div>
  );

  return (
    <div className="narrow">
      <header style={{ marginBottom: '32px' }}>
        <h1 style={{ marginBottom: '8px' }}>Settings</h1>
        <p className="muted">Configure your workspace, status pages, and integrations.</p>
      </header>

      {error && <p className="error" style={{ marginBottom: '24px' }}>{error}</p>}

      <section className="card" style={{ marginBottom: '32px', position: 'relative' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
          <div>
            <h2>Public Status Page</h2>
            <p className="muted small">Publish a read-only dashboard of your active monitors.</p>
          </div>
          {user.plan === 'free' && <span className="chip chip-unknown">Pro Feature</span>}
        </div>
        
        {user.plan === 'free' ? (
          <LockedOverlay title="Public status pages are available on the Pro plan." cta="Upgrade to Pro" plan="pro" />
        ) : (
          <form className="form" onSubmit={saveStatusPage}>
            <label>
              Page Title
              <input required placeholder="System Status" value={spTitle} onChange={e => setSpTitle(e.target.value)} />
            </label>
            <label>
              URL Slug
              <div style={{ display: 'flex', alignItems: 'stretch', background: 'var(--black)', border: '1px solid var(--line)', borderRadius: '2px', marginTop: '6px', overflow: 'hidden' }}>
                <span className="muted" style={{ padding: '0 12px', background: '#111', borderRight: '1px solid var(--line)', display: 'flex', alignItems: 'center' }}>
                  {window.location.origin}/status/
                </span>
                <input required placeholder="my-company" value={spSlug} onChange={e => setSpSlug(e.target.value)} pattern="[a-z0-9-]+" style={{ border: 'none', borderRadius: 0, flex: 1, margin: 0, boxShadow: 'none' }} />
              </div>
            </label>
            
            <label style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '24px 0', cursor: 'pointer', textTransform: 'none', color: 'var(--white)' }}>
              <div style={{
                width: '40px', height: '22px', borderRadius: '11px',
                background: spPublished ? 'var(--accent)' : 'var(--line)',
                position: 'relative', transition: 'background 0.2s'
              }}>
                <div style={{
                  width: '16px', height: '16px', borderRadius: '50%', background: '#000',
                  position: 'absolute', top: '3px', left: spPublished ? '21px' : '3px',
                  transition: 'left 0.2s', boxShadow: '0 2px 4px rgba(0,0,0,0.5)'
                }} />
              </div>
              <input type="checkbox" checked={spPublished} onChange={e => setSpPublished(e.target.checked)} style={{ display: 'none' }} />
              <span style={{ fontSize: '14px', color: spPublished ? 'var(--white)' : 'var(--muted)' }}>
                Published (visible to anyone with the link)
              </span>
            </label>

            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginTop: '8px' }}>
              <button type="submit" className="btn btn-primary">Save Status Page</button>
              {spMsg && <span style={{ color: spMsg.includes('updated') ? 'var(--up)' : 'var(--down)', fontSize: '14px' }}>{spMsg}</span>}
              {statusPage?.published && (
                <a href={`/status/${statusPage.slug}`} target="_blank" rel="noreferrer" className="muted small" style={{ marginLeft: 'auto' }}>View Live Page &rarr;</a>
              )}
            </div>
          </form>
        )}
      </section>

      <section className="card" style={{ marginBottom: '32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
          <div>
            <h2>Alert Channels</h2>
            <p className="muted small">Configure where alerts are sent when jobs fail.</p>
          </div>
          {user.plan === 'free' && <span className="chip chip-unknown">Pro Feature</span>}
        </div>
        
        {user.plan === 'free' ? (
          <LockedOverlay title={`Free plan alerts are automatically sent to ${user.email}. Upgrade to Pro to unlock Slack, Discord, Telegram, and Webhooks.`} cta="Upgrade to Pro" plan="pro" />
        ) : (
          <>
            <form className="form" onSubmit={createChannel} style={{ display: 'grid', gridTemplateColumns: '1fr 3fr auto', gap: '12px', alignItems: 'end', marginBottom: '32px' }}>
              <label style={{ margin: 0 }}>
                Type
                <select value={newChannelType} onChange={e => setNewChannelType(e.target.value)} style={{ marginTop: '6px' }}>
                  {limits.alertChannels.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
              <label style={{ margin: 0 }}>
                Target (Email, webhook URL, etc.)
                <input required placeholder="https://..." value={newChannelTarget} onChange={e => setNewChannelTarget(e.target.value)} style={{ marginTop: '6px' }} />
              </label>
              <button type="submit" className="btn btn-ghost" style={{ padding: '0 24px', height: '42px', marginBottom: '2px' }}>Add</button>
            </form>

            <ul className="events">
              {channels.length === 0 && <p className="muted" style={{ padding: '16px', textAlign: 'center' }}>No custom channels added. Emails default to {user.email}.</p>}
              {channels.map((ch) => (
                <li key={ch.id} className="event" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px' }}>
                  <div>
                    <strong style={{ textTransform: 'uppercase', fontSize: '12px', color: 'var(--accent)' }}>{ch.type}</strong>
                    <span className="muted" style={{ marginLeft: '12px' }}>{ch.target}</span>
                  </div>
                  <button className="btn btn-danger btn-small" onClick={() => deleteChannel(ch.id)}>Delete</button>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="card" style={{ marginBottom: '32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
          <div>
            <h2>API Keys</h2>
            <p className="muted small">Generate API keys to interact with the API programmatically.</p>
          </div>
          {user.plan !== 'team' && <span className="chip chip-unknown">Team Feature</span>}
        </div>
        
        {user.plan !== 'team' ? (
          <LockedOverlay title="API Keys are exclusively available on the Team plan." cta="Upgrade to Team" plan="team" />
        ) : (
          <>
            <button className="btn btn-primary" onClick={createKey} style={{ marginBottom: '16px' }}>
              Generate New Key
            </button>

            {newKeyToken && (
              <div style={{ marginBottom: '24px', padding: '16px', background: 'rgba(0, 255, 204, 0.1)', border: '1px solid var(--accent)', borderRadius: '4px' }}>
                <strong style={{ color: 'var(--white)', display: 'block', marginBottom: '8px' }}>Copy this key now, it won't be shown again:</strong>
                <code style={{ fontSize: '16px', color: 'var(--accent)' }}>{newKeyToken}</code>
              </div>
            )}

            <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--line)' }}>
                  <th style={{ padding: '12px 0', color: 'var(--muted)', fontWeight: 'normal', fontSize: '12px', textTransform: 'uppercase' }}>Prefix</th>
                  <th style={{ padding: '12px 0', color: 'var(--muted)', fontWeight: 'normal', fontSize: '12px', textTransform: 'uppercase' }}>Created</th>
                  <th style={{ padding: '12px 0', color: 'var(--muted)', fontWeight: 'normal', fontSize: '12px', textTransform: 'uppercase' }}>Last Used</th>
                  <th style={{ padding: '12px 0', color: 'var(--muted)', fontWeight: 'normal', fontSize: '12px', textTransform: 'uppercase', textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {keys.length === 0 && (
                  <tr><td colSpan={4} className="muted" style={{ padding: '24px 0', textAlign: 'center' }}>No active API keys.</td></tr>
                )}
                {keys.map((k) => (
                  <tr key={k.id} style={{ borderBottom: '1px solid var(--line)' }}>
                    <td style={{ padding: '12px 0' }}><code>cp_***</code></td>
                    <td style={{ padding: '12px 0', color: 'var(--muted)' }}>{timeAgo(k.created_at)}</td>
                    <td style={{ padding: '12px 0', color: 'var(--muted)' }}>{k.last_used ? timeAgo(k.last_used) : 'Never'}</td>
                    <td style={{ padding: '12px 0', textAlign: 'right' }}>
                      <button className="btn btn-danger btn-small" onClick={() => deleteKey(k.id)}>Revoke</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </section>
    </div>
  );
}
