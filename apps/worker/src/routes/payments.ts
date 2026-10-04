import { Hono } from 'hono';
import { requireAuth, type AppEnv } from './middleware';

export const paymentsRoutes = new Hono<AppEnv>();

paymentsRoutes.post('/webhook', async (c) => {
  const secret = c.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) return c.json({ error: 'Webhook not configured' }, 500);

  const signature = c.req.header('x-razorpay-signature');
  const bodyText = await c.req.text();
  
  if (!signature) return c.json({ error: 'Missing signature' }, 400);

  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const expectedSigBuffer = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(bodyText));
  const expectedSigHex = Array.from(new Uint8Array(expectedSigBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
  
  if (signature !== expectedSigHex) {
    return c.json({ error: 'Invalid signature' }, 400);
  }

  const payload = JSON.parse(bodyText);
  const event = payload.event;
  const entity = payload.payload?.subscription?.entity;
  if (!entity) return c.json({ ok: true });

  const subId = entity.id;
  const status = entity.status;
  const currentEnd = entity.current_end; 
  const userId = entity.notes?.user_id;
  const planName = entity.notes?.plan || 'pro';

  const db = c.env.DB;

  if (userId) {
    if (event === 'subscription.authenticated' || event === 'subscription.activated' || event === 'subscription.charged') {
      await db.batch([
        db.prepare(`INSERT INTO subscriptions (user_id, razorpay_sub_id, plan, status, current_end, updated_at) 
                    VALUES (?1, ?2, ?3, ?4, ?5, ?6)
                    ON CONFLICT (user_id) DO UPDATE SET 
                    razorpay_sub_id=excluded.razorpay_sub_id, plan=excluded.plan, status=excluded.status, current_end=excluded.current_end, updated_at=excluded.updated_at`)
          .bind(userId, subId, planName, status, currentEnd ? currentEnd * 1000 : null, Date.now()),
        db.prepare(`UPDATE users SET plan = ?1 WHERE id = ?2`).bind(planName, userId)
      ]);
    } else if (event === 'subscription.cancelled' || event === 'subscription.halted') {
       await db.batch([
         db.prepare(`UPDATE subscriptions SET status = ?1, updated_at = ?2 WHERE razorpay_sub_id = ?3`).bind(status, Date.now(), subId),
         db.prepare(`UPDATE users SET plan = 'free' WHERE id = ?1`).bind(userId)
       ]);
    }
  }
  
  return c.json({ ok: true });
});

paymentsRoutes.post('/checkout', requireAuth, async (c) => {
  const user = c.get('user');
  const { plan } = await c.req.json<{ plan: 'pro' | 'team' }>().catch(() => ({ plan: 'pro' }));
  
  const planId = plan === 'team' ? c.env.RAZORPAY_PLAN_ID_TEAM : c.env.RAZORPAY_PLAN_ID_PRO;
  if (!c.env.RAZORPAY_KEY_ID || !c.env.RAZORPAY_KEY_SECRET || !planId) {
    return c.json({ error: 'Payments are not configured' }, 500);
  }

  const basicAuth = btoa(`${c.env.RAZORPAY_KEY_ID}:${c.env.RAZORPAY_KEY_SECRET}`);
  const res = await fetch('https://api.razorpay.com/v1/subscriptions', {
    method: 'POST',
    headers: { Authorization: `Basic ${basicAuth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      plan_id: planId,
      total_count: 120,
      customer_notify: 0,
      notes: { user_id: user.id, plan },
    })
  });
  
  if (!res.ok) {
    const err = await res.json() as any;
    return c.json({ error: err.error?.description || 'Failed to create subscription' }, 500);
  }
  
  const sub = await res.json() as { id: string };
  return c.json({ subscription_id: sub.id, key_id: c.env.RAZORPAY_KEY_ID });
});
