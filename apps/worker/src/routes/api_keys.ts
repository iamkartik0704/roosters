import { Hono } from 'hono';
import { randomUUID } from '../ids';
import { randomToken, sha256Hex } from '../crypto';
import { requireAuth, type AppEnv } from './middleware';

export const apiKeysRoutes = new Hono<AppEnv>();

apiKeysRoutes.use('*', requireAuth);

apiKeysRoutes.get('/', async (c) => {
  const user = c.get('user');
  const { results } = await c.env.DB.prepare(
    'SELECT id, last_used, created_at FROM api_keys WHERE user_id = ?1 ORDER BY created_at DESC'
  ).bind(user.id).all();
  return c.json({ keys: results || [] });
});

apiKeysRoutes.post('/', async (c) => {
  const user = c.get('user');
  if (user.plan !== 'team') {
    return c.json({ error: 'API keys are only available on the Team plan.' }, 403);
  }

  const rawToken = 'cp_' + randomToken();
  const hash = await sha256Hex(rawToken);
  const id = randomUUID();
  const now = Date.now();

  await c.env.DB.prepare(
    'INSERT INTO api_keys (id, user_id, hash, created_at) VALUES (?1, ?2, ?3, ?4)'
  ).bind(id, user.id, hash, now).run();

  return c.json({ key: { id, token: rawToken, created_at: now, last_used: null } }, 201);
});

apiKeysRoutes.delete('/:id', async (c) => {
  const user = c.get('user');
  const res = await c.env.DB.prepare(
    'DELETE FROM api_keys WHERE id = ?1 AND user_id = ?2'
  ).bind(c.req.param('id'), user.id).run();
  
  if (!res.meta.changes) return c.json({ error: 'API key not found' }, 404);
  return c.json({ ok: true });
});
