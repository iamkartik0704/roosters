import { useEffect, useState } from 'react';
import type { UserDTO } from '@cron/shared';
import { PLANS } from '@cron/shared';
import { api } from '../api';
import { timeAgo } from '../util';

export default function Settings({ user }: { user: UserDTO }) {
  const [keys, setKeys] = useState<any[]>([]);
  const [channels, setChannels] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  // New channel state
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
          <div style={{ padding: '32px', textAlign: 'center', background: 'rgba(0,0,0,0.5)', border: '1px dashed var(--line)', borderRadius: '4px' }}>
            <p className="muted" style={{ marginBottom: '16px' }}>Public status pages are available on the Pro plan.</p>
            <a href="/billing" className="btn btn-primary">Upgrade to Pro</a>
          </div>
        ) : (
          <form className="form" onSubmit={saveStatusPage}>
            <label>
              Page Title
              <input required placeholder="System Status" value={spTitle} onChange={e => setSpTitle(e.target.value)} />
            </label>
            <label>
              URL Slug
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--black)', padding: '0 12px', border: '1px solid var(--dark-grey)', borderRadius: '2px', marginTop: '6px' }}>
                <span className="muted">{window.location.origin}/status/</span>
                <input required placeholder="my-company" value={spSlug} onChange={e => setSpSlug(e.target.value)} pattern="[a-z0-9-]+" style={{ border: 'none', paddingLeft: 0, boxShadow: 'none', background: 'transparent' }} />
              </div>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '16px 0', textTransform: 'none', color: 'var(--white)' }}>
              <input type="checkbox" checked={spPublished} onChange={e => setSpPublished(e.target.checked)} style={{ width: 'auto', marginTop: 0 }} />
              Published (visible to anyone with the link)
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
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
          <div style={{ padding: '32px', textAlign: 'center', background: 'rgba(0,0,0,0.5)', border: '1px dashed var(--line)', borderRadius: '4px' }}>
            <p className="muted" style={{ marginBottom: '16px' }}>Free plan alerts are automatically sent to <strong>{user.email}</strong>.<br/>Upgrade to Pro to unlock Slack, Discord, Telegram, and Webhooks.</p>
            <a href="/billing" className="btn btn-primary">Upgrade to Pro</a>
          </div>
        ) : (
          <>
            <form className="form" onSubmit={createChannel} style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', marginBottom: '24px' }}>
              <label style={{ flex: 1 }}>
                Type
                <select value={newChannelType} onChange={e => setNewChannelType(e.target.value)}>
                  {limits.alertChannels.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
              <label style={{ flex: 3 }}>
                Target (Email, webhook URL, etc.)
                <input required placeholder="https://..." value={newChannelTarget} onChange={e => setNewChannelTarget(e.target.value)} />
              </label>
              <button type="submit" className="btn btn-ghost" style={{ padding: '8px 16px', height: '39px', marginBottom: '1px' }}>Add</button>
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
          <div style={{ padding: '32px', textAlign: 'center', background: 'rgba(0,0,0,0.5)', border: '1px dashed var(--line)', borderRadius: '4px' }}>
            <p className="muted" style={{ marginBottom: '16px' }}>API Keys are exclusively available on the Team plan.</p>
            <a href="/billing" className="btn btn-ghost">Upgrade to Team</a>
          </div>
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
