import type { JobDTO, JobEventDTO, PingOutcome, UserDTO } from '@cron/shared';

const API = import.meta.env.VITE_API_URL ?? '';
const TOKEN_KEY = 'cronpulse_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

/** Entry point for the OAuth redirect; the provider calls us back with #token=… */
export function authStartUrl(provider: 'github' | 'google'): string {
  const redirect = encodeURIComponent(`${location.origin}/auth/callback`);
  return `${API}/api/auth/${provider}/start?redirect=${redirect}`;
}

export const api = {
  me: () => request<UserDTO>('/api/me'),
  logout: () => request<{ ok: true }>('/api/auth/logout', { method: 'POST' }).catch(() => undefined),

  jobs: () => request<{ jobs: JobDTO[] }>('/api/jobs'),
  job: (id: string) => request<{ job: JobDTO; events: JobEventDTO[]; heartbeatToken?: string }>(`/api/jobs/${id}`),
  createJob: (input: unknown) => request<{ job: JobDTO }>('/api/jobs', { method: 'POST', body: JSON.stringify(input) }),
  updateJob: (id: string, input: unknown) =>
    request<{ job: JobDTO }>(`/api/jobs/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  deleteJob: (id: string) => request<{ ok: true }>(`/api/jobs/${id}`, { method: 'DELETE' }),
  runSaved: (id: string) => request<{ outcome: PingOutcome }>(`/api/jobs/${id}/run`, { method: 'POST' }),
  runTest: (input: unknown) =>
    request<{ outcome: PingOutcome }>('/api/jobs/run-test', { method: 'POST', body: JSON.stringify(input) }),

  keys: () => request<{ keys: any[] }>('/api/keys'),
  createKey: () => request<{ key: any }>('/api/keys', { method: 'POST' }),
  deleteKey: (id: string) => request<{ ok: true }>(`/api/keys/${id}`, { method: 'DELETE' }),

  channels: () => request<{ channels: any[] }>('/api/channels'),
  createChannel: (type: string, target: string) => request<{ channel: any }>('/api/channels', { method: 'POST', body: JSON.stringify({ type, target }) }),
  deleteChannel: (id: string) => request<{ ok: true }>(`/api/channels/${id}`, { method: 'DELETE' }),

  statusPageSettings: () => request<{ page: any }>('/api/settings/status-page'),
  updateStatusPage: (slug: string, title: string, published: boolean) => 
    request<{ page: any }>('/api/settings/status-page', { method: 'PATCH', body: JSON.stringify({ slug, title, published }) }),
  publicStatusPage: (slug: string) => fetch(`${API}/api/status/${slug}`).then(r => r.json()),

  joinWaitlist: (email: string, token?: string) =>
    fetch(`${API}/api/waitlist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, token }),
    }).then(async (res) => {
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }
      return true;
    }),

  checkout: (plan: 'pro' | 'team') =>
    request<{ subscription_id: string; key_id: string; mock?: boolean; plan?: string }>('/api/payments/checkout', {
      method: 'POST',
      body: JSON.stringify({ plan }),
    }),
  mockWebhook: (plan: string, subId: string) =>
    request<{ ok: true }>('/api/payments/mock-webhook', {
      method: 'POST',
      body: JSON.stringify({ plan, subId }),
    }),
};
