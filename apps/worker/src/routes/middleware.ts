import type { Context, Next } from 'hono';
import { SESSION_TTL_MS, type Plan, type UserDTO } from '@cron/shared';
import type { Env } from '../env';
import { randomToken, sha256Hex } from '../crypto';

export type AppUser = UserDTO;
/** Shared Hono environment: D1/vars bindings plus the authenticated user. */
export type AppEnv = { Bindings: Env; Variables: { user: AppUser } };

export async function requireAuth(c: Context<AppEnv>, next: Next) {
  const header = c.req.header('Authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : null;
  if (!token) {
    return c.json({ error: 'Not signed in' }, 401);
  }
  const tokenHash = await sha256Hex(token);
  let userRow: { id: string; email: string; plan: string; created_at: number } | null = null;
  let isApiKey = false;

  if (token.startsWith('cp_')) {
    userRow = await c.env.DB.prepare(
      `SELECT u.id, u.email, u.plan, u.created_at
       FROM api_keys k JOIN users u ON u.id = k.user_id
       WHERE k.hash = ?1`
    ).bind(tokenHash).first();
    isApiKey = true;
  } else {
    userRow = await c.env.DB.prepare(
      `SELECT u.id, u.email, u.plan, u.created_at
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.id_hash = ?1 AND s.expires_at > ?2`
    ).bind(tokenHash, Date.now()).first();
  }

  if (!userRow) {
    return c.json({ error: 'Unauthorized — invalid or expired token' }, 401);
  }

  if (isApiKey) {
    // Update last_used in the background
    c.executionCtx.waitUntil(
      c.env.DB.prepare('UPDATE api_keys SET last_used = ?1 WHERE hash = ?2')
        .bind(Date.now(), tokenHash)
        .run()
    );
  }

  c.set('user', { id: userRow.id, email: userRow.email, plan: userRow.plan as Plan, createdAt: userRow.created_at });
  await next();
}

/**
 * Best-effort in-memory rate limiter (per isolate). Good enough for run-now
 * abuse control at launch; tighten with Cloudflare WAF rules later if needed.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (bucket.count >= limit) return false;
  bucket.count += 1;
  return true;
}

export async function createSession(
  db: D1Database,
  userId: string,
): Promise<{ token: string; expiresAt: number }> {
  const token = randomToken();
  const expiresAt = Date.now() + SESSION_TTL_MS;
  await db
    .prepare('INSERT INTO sessions (id_hash, user_id, expires_at, created_at) VALUES (?1, ?2, ?3, ?4)')
    .bind(await sha256Hex(token), userId, expiresAt, Date.now())
    .run();
  return { token, expiresAt };
}
