import { Hono } from 'hono';
import { randomUUID } from '../ids';
import { encryptString, decryptString } from '../crypto';
import { requireAuth, type AppEnv } from './middleware';
import { PLANS } from '@cron/shared';

export const channelsRoutes = new Hono<AppEnv>();

channelsRoutes.use('*', requireAuth);

channelsRoutes.get('/', async (c) => {
  const user = c.get('user');
  const { results } = await c.env.DB.prepare(
    'SELECT id, type, target_enc, verified, created_at FROM alert_channels WHERE user_id = ?1 ORDER BY created_at ASC'
  ).bind(user.id).all();

  const channels = await Promise.all((results || []).map(async (row: any) => ({
    id: row.id,
    type: row.type,
    target: await decryptString(c.env.ENCRYPTION_KEY, row.target_enc),
    verified: row.verified === 1,
    createdAt: row.created_at,
  })));

  return c.json({ channels });
});

channelsRoutes.post('/', async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => null);
  
  if (!body || typeof body.type !== 'string' || typeof body.target !== 'string') {
    return c.json({ error: 'Missing type or target' }, 400);
  }
  
  const allowedTypes = PLANS[user.plan].alertChannels;
  if (!allowedTypes.includes(body.type as any)) {
    return c.json({ error: `The ${body.type} channel is not available on the ${PLANS[user.plan].label} plan.` }, 403);
  }

  const id = randomUUID();
  const targetEnc = await encryptString(c.env.ENCRYPTION_KEY, body.target);
  const now = Date.now();
  // By default, webhooks/discord/slack/telegram can just be "verified" instantly for MVP,
  // whereas email might need verification. We'll mark them verified for now.
  const verified = 1;

  await c.env.DB.prepare(
    'INSERT INTO alert_channels (id, user_id, type, target_enc, verified, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)'
  ).bind(id, user.id, body.type, targetEnc, verified, now).run();

  return c.json({ channel: { id, type: body.type, target: body.target, verified: true, createdAt: now } }, 201);
});

channelsRoutes.delete('/:id', async (c) => {
  const user = c.get('user');
  const res = await c.env.DB.prepare(
    'DELETE FROM alert_channels WHERE id = ?1 AND user_id = ?2'
  ).bind(c.req.param('id'), user.id).run();
  
  if (!res.meta.changes) return c.json({ error: 'Channel not found' }, 404);
  return c.json({ ok: true });
});
