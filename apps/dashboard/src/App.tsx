import { useEffect, useState } from 'react';
import { BrowserRouter, Link, NavLink, Route, Routes } from 'react-router-dom';
import type { UserDTO } from '@cron/shared';
import { api, clearToken, getToken } from './api';
import { BRAND } from './util';
import Landing from './pages/Landing';
import AuthCallback from './pages/AuthCallback';
import Jobs from './pages/Jobs';
import JobForm from './pages/JobForm';
import JobDetail from './pages/JobDetail';
import Billing from './pages/Billing';
import Settings from './pages/Settings';
import StatusPage from './pages/StatusPage';
import { Toaster } from 'react-hot-toast';
import { Terms, Privacy, Refund, AUP } from './pages/Legal';

export default function App() {
  const [user, setUser] = useState<UserDTO | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!getToken()) {
      setLoaded(true);
      return;
    }
    api
      .me()
      .then(setUser)
      .catch(() => clearToken())
      .finally(() => setLoaded(true));
  }, []);

  const signOut = async () => {
    await api.logout();
    clearToken();
    setUser(null);
  };

  return (
    <BrowserRouter>
      <div className="shell">
        <header className="topbar">
          <Link to="/" className="brand">
            <span className="brand-dot" aria-hidden />
            {BRAND}
          </Link>
          <nav className="topnav">
            {user ? (
              <>
                <NavLink to="/jobs">Jobs</NavLink>
                <NavLink to="/billing">Billing</NavLink>
                <NavLink to="/settings">Settings</NavLink>
                <span className="nav-email" title={user.email}>
                  {user.email}
                </span>
                <button className="btn btn-ghost" onClick={signOut}>
                  Sign out
                </button>
              </>
            ) : (
              <>
                <a href="/#features">Features</a>
                <a href="/#pricing">Pricing</a>
                <a href="/#auth" className="btn btn-ghost" style={{ padding: '4px 12px', fontSize: '0.9rem' }} onClick={(e) => {
                  e.preventDefault();
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}>
                  Sign in
                </a>
              </>
            )}
          </nav>
        </header>
        <main className="content">
          <Toaster
            position="bottom-right"
            toastOptions={{
              className: '',
              style: {
                background: '#141414',
                color: '#fff',
                border: '1px solid #2a2a2a',
                borderRadius: '4px',
                fontFamily: 'Courier, monospace',
                fontSize: '14px',
              },
              success: {
                iconTheme: { primary: '#00ffcc', secondary: '#0a0a0a' },
              },
            }}
          />
          {loaded && (
            <Routes>
              <Route path="/" element={user ? <Jobs user={user} /> : <Landing />} />
              <Route path="/auth/callback" element={<AuthCallback onSignedIn={setUser} />} />
              <Route path="/jobs" element={user ? <Jobs user={user} /> : <Landing />} />
              <Route path="/jobs/new" element={user ? <JobForm /> : <Landing />} />
              <Route path="/jobs/:id" element={user ? <JobDetail /> : <Landing />} />
              <Route path="/jobs/:id/edit" element={user ? <JobForm /> : <Landing />} />
              <Route path="/billing" element={user ? <Billing user={user} /> : <Landing />} />
              <Route path="/settings" element={user ? <Settings user={user} /> : <Landing />} />
              <Route path="/status/:slug" element={<StatusPage />} />
              <Route path="/terms" element={<Terms />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/refund" element={<Refund />} />
              <Route path="/aup" element={<AUP />} />
              <Route path="*" element={<Landing />} />
            </Routes>
          )}
        </main>
        <footer className="footer" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
          <div>{BRAND} · scheduled pings + alerts · working name, in development</div>
          <div style={{ display: 'flex', gap: '1rem', fontSize: '0.9rem' }}>
            <Link to="/terms">Terms</Link>
            <Link to="/privacy">Privacy</Link>
            <Link to="/aup">AUP</Link>
            <Link to="/refund">Refunds</Link>
          </div>
        </footer>
      </div>
    </BrowserRouter>
  );
}
