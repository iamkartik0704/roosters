import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api';
import { StatusChip } from '../components/StatusChip';
import { timeAgo } from '../util';

export default function StatusPage() {
  const { slug } = useParams();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    api.publicStatusPage(slug)
      .then((res) => {
        if (res.error) setError(res.error);
        else setData(res);
      })
      .catch((e) => setError(e.message));
  }, [slug]);

  if (error) {
    return <div className="narrow" style={{ textAlign: 'center', marginTop: '4rem' }}>
      <h1>404</h1>
      <p>{error}</p>
    </div>;
  }

  if (!data) return <div className="narrow">Loading...</div>;

  const allUp = data.jobs.every((j: any) => j.state === 'up');

  return (
    <div className="narrow" style={{ marginTop: '2rem' }}>
      <header style={{ marginBottom: '2rem', textAlign: 'center' }}>
        <h1 style={{ margin: '0 0 1rem 0' }}>{data.title}</h1>
        {data.jobs.length > 0 && (
          <div style={{
            padding: '1rem',
            background: allUp ? '#d4edda' : '#f8d7da',
            color: allUp ? '#155724' : '#721c24',
            borderRadius: '8px',
            fontWeight: 'bold',
            fontSize: '1.2rem'
          }}>
            {allUp ? 'All Systems Operational' : 'Some Systems Are Experiencing Issues'}
          </div>
        )}
      </header>

      <div className="card">
        {data.jobs.length === 0 ? (
          <p className="muted" style={{ textAlign: 'center' }}>No active monitors.</p>
        ) : (
          <ul className="events">
            {data.jobs.map((job: any) => (
              <li key={job.id} className="event" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong style={{ fontSize: '1.1rem' }}>{job.name}</strong>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  {job.last_state_change && <span className="muted small">{timeAgo(job.last_state_change)}</span>}
                  <StatusChip job={job} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <footer style={{ textAlign: 'center', marginTop: '3rem', fontSize: '0.9rem' }} className="muted">
        Powered by CronPulse
      </footer>
    </div>
  );
}
