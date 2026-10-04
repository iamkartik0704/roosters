import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { UserDTO } from '@cron/shared';
import { api, setToken } from '../api';

/** OAuth lands here: the Worker redirected to /auth/callback#token=…&expires=… */
export default function AuthCallback({ onSignedIn }: { onSignedIn: (user: UserDTO) => void }) {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(location.hash.replace(/^#/, ''));
    const authError = params.get('error');
    const token = params.get('token');
    history.replaceState(null, '', location.pathname); // strip the hash
    if (!token) {
      setError(authError ?? 'Sign-in failed');
      return;
    }
    setToken(token);
    api
      .me()
      .then((user) => {
        onSignedIn(user);
        navigate('/jobs', { replace: true });
      })
      .catch((e: Error) => setError(e.message));
  }, [navigate, onSignedIn]);

  return <p className="muted">{error ?? 'Signing you in…'}</p>;
}
