import { Hono } from 'hono';
import { randomUUID } from '../ids';
import { hmacSignHex, sha256Hex, timingSafeEqualHex } from '../crypto';
import { assertRedirectAllowed } from '../urls';
import { createSession, rateLimit } from './middleware';
import type { Env } from '../env';

type AuthApp = Hono<{ Bindings: Env }>;

const PROVIDERS = ['github', 'google'] as const;
type Provider = (typeof PROVIDERS)[number];

const STATE_TTL_MS = 10 * 60 * 1000;

interface OAuthProfile {
  providerId: string;
  email: string;
}

export const authRoutes: AuthApp = new Hono<{ Bindings: Env }>();

// ---- start: redirect the browser to the provider ---------------------------

authRoutes.get('/:provider/start', async (c) => {
  const provider = c.req.param('provider') as Provider;
  if (!PROVIDERS.includes(provider)) return c.text('Unknown provider', 404);

  const redirect = c.req.query('redirect') ?? `${c.env.DASHBOARD_URL}/auth/callback`;
  try {
    assertRedirectAllowed(redirect, c.env.DASHBOARD_URL.split(',').map((s) => s.trim()));
  } catch {
    return c.text('Redirect origin not allowed', 400);
  }

  const redirectUri = `${c.env.WORKER_URL}/api/auth/${provider}/callback`;
  const state = await signState(c.env.ENCRYPTION_KEY, { p: provider, r: redirect, t: Date.now() });

  const params = new URLSearchParams({ state, redirect_uri: redirectUri });
  if (provider === 'github') {
    if (!c.env.GITHUB_CLIENT_ID) return c.text('GitHub sign-in is not configured', 503);
    params.set('client_id', c.env.GITHUB_CLIENT_ID);
    params.set('scope', 'read:user user:email');
    return c.redirect(`https://github.com/login/oauth/authorize?${params}`);
  }
  if (!c.env.GOOGLE_CLIENT_ID) return c.text('Google sign-in is not configured', 503);
  params.set('client_id', c.env.GOOGLE_CLIENT_ID);
  params.set('response_type', 'code');
  params.set('scope', 'openid email profile');
  params.set('prompt', 'select_account');
  return c.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

// ---- callback: exchange code, upsert user, issue session -------------------

authRoutes.get('/:provider/callback', async (c) => {
  const provider = c.req.param('provider') as Provider;
  if (!PROVIDERS.includes(provider)) return c.text('Unknown provider', 404);

  const code = c.req.query('code');
  const state = c.req.query('state');
  const fail = (reason: string) => c.redirect(`${loginRedirect(c)}#error=${encodeURIComponent(reason)}`, 302);

  if (!code || !state) return fail('missing_code_or_state');
  let decoded: { p: string; r: string; t: number };
  try {
    decoded = await verifyState(c.env.ENCRYPTION_KEY, state);
  } catch {
    return fail('invalid_state');
  }
  if (decoded.p !== provider || Date.now() - decoded.t > STATE_TTL_MS) return fail('expired_state');
  if (!rateLimit(`oauth-callback:${provider}`, 30, 60_000)) return fail('rate_limited');

  let profile: OAuthProfile;
  try {
    profile = provider === 'github'
      ? await fetchGithubProfile(c.env, code, `${c.env.WORKER_URL}/api/auth/github/callback`)
      : await fetchGoogleProfile(c.env, code, `${c.env.WORKER_URL}/api/auth/google/callback`);
  } catch (e) {
    console.error('[auth] profile fetch failed:', e);
    return fail('provider_error');
  }

  const db = c.env.DB;
  const now = Date.now();
  const existing = await db
    .prepare('SELECT id, email FROM users WHERE auth_provider = ?1 AND provider_id = ?2')
    .bind(provider, profile.providerId)
    .first<{ id: string; email: string }>();

  let userId: string;
  if (existing) {
    userId = existing.id;
    if (existing.email !== profile.email) {
      await db.prepare('UPDATE users SET email = ?1 WHERE id = ?2').bind(profile.email, userId).run();
    }
  } else {
    userId = randomUUID();
    await db
      .prepare(
        `INSERT INTO users (id, email, auth_provider, provider_id, plan, created_at)
         VALUES (?1, ?2, ?3, ?4, 'free', ?5)`,
      )
      .bind(userId, profile.email, provider, profile.providerId, now)
      .run();
  }

  const { token, expiresAt } = await createSession(db, userId);
  return c.redirect(`${decoded.r}#token=${encodeURIComponent(token)}&expires=${expiresAt}`, 302);
});

function loginRedirect(c: { env: Env }): string {
  return `${c.env.DASHBOARD_URL}/auth/callback`;
}

// ---- logout: delete the presented session ----------------------------------

authRoutes.post('/logout', async (c) => {
  const header = c.req.header('Authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : null;
  if (token) {
    await c.env.DB.prepare('DELETE FROM sessions WHERE id_hash = ?1')
      .bind(await sha256Hex(token))
      .run();
  }
  return c.json({ ok: true });
});

// ---- local dev login (never enable in production) --------------------------

authRoutes.post('/dev-login', async (c) => {
  if (c.env.ALLOW_DEV_LOGIN !== 'true') return c.text('Not found', 404);
  const db = c.env.DB;
  const now = Date.now();
  const existing = await db
    .prepare("SELECT id FROM users WHERE auth_provider = 'dev' AND provider_id = 'local'")
    .first<{ id: string }>();
  let userId: string;
  if (existing) {
    userId = existing.id;
  } else {
    userId = randomUUID();
    await db
      .prepare(
        `INSERT INTO users (id, email, auth_provider, provider_id, plan, created_at)
         VALUES (?1, 'dev@localhost', 'dev', 'local', 'free', ?2)`,
      )
      .bind(userId, now)
      .run();
  }
  const { token, expiresAt } = await createSession(db, userId);
  return c.json({ token, expiresAt });
});

// ---- provider profile fetches ----------------------------------------------

async function fetchGithubProfile(env: Env, code: string, redirectUri: string): Promise<OAuthProfile> {
  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) throw new Error('GitHub OAuth not configured');
  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri,
    }),
  });
  const tokenJson = (await tokenRes.json()) as { access_token?: string; error_description?: string };
  if (!tokenJson.access_token) throw new Error(tokenJson.error_description ?? 'token exchange failed');

  const headers = {
    authorization: `Bearer ${tokenJson.access_token}`,
    accept: 'application/vnd.github+json',
    'user-agent': env.USER_AGENT,
  };
  const userRes = await fetch('https://api.github.com/user', { headers });
  const user = (await userRes.json()) as {
    id: number;
    login: string;
    email: string | null;
  };
  let email = user.email;
  if (!email) {
    const emailsRes = await fetch('https://api.github.com/user/emails', { headers });
    if (emailsRes.ok) {
      const emails = (await emailsRes.json()) as { email: string; primary: boolean; verified: boolean }[];
      email = emails.find((e) => e.primary && e.verified)?.email ?? emails[0]?.email ?? null;
    }
  }
  if (!email) throw new Error('GitHub account has no email');
  return { providerId: String(user.id), email: email.toLowerCase() };
}

async function fetchGoogleProfile(env: Env, code: string, redirectUri: string): Promise<OAuthProfile> {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) throw new Error('Google OAuth not configured');
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  const tokenJson = (await tokenRes.json()) as { access_token?: string; error_description?: string };
  if (!tokenJson.access_token) throw new Error(tokenJson.error_description ?? 'token exchange failed');

  const infoRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { authorization: `Bearer ${tokenJson.access_token}` },
  });
  const info = (await infoRes.json()) as { sub: string; email: string; email_verified?: boolean };
  if (!info.email) throw new Error('Google account has no email');
  return { providerId: info.sub, email: info.email.toLowerCase() };
}

// ---- signed state (stateless, HMAC) ----------------------------------------

async function signState(key: string, payload: { p: string; r: string; t: number }): Promise<string> {
  const body = btoa(JSON.stringify(payload)).replace(/=+$/, '');
  return `${body}.${await hmacSignHex(key, body)}`;
}

async function verifyState(
  key: string,
  state: string,
): Promise<{ p: string; r: string; t: number }> {
  const dot = state.lastIndexOf('.');
  if (dot <= 0) throw new Error('malformed state');
  const body = state.slice(0, dot);
  const sig = state.slice(dot + 1);
  const expected = await hmacSignHex(key, body);
  if (!timingSafeEqualHex(sig, expected)) throw new Error('bad signature');
  return JSON.parse(atob(body));
}
