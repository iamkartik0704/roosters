import { Hono } from 'hono';
import { waitlistSchema } from '@cron/shared';
import { randomUUID } from '../ids';
import { rateLimit } from './middleware';
import type { Env } from '../env';

/** Public phase-0 endpoint backing the landing-page waitlist form. */
export const waitlistRoutes = new Hono<{ Bindings: Env }>();

waitlistRoutes.post('/', async (c) => {
  const ip = c.req.header('cf-connecting-ip') ?? 'unknown';
  if (!rateLimit(`waitlist:${ip}`, 5, 60_000)) {
    return c.json({ error: 'Too many requests — try again in a minute' }, 429);
  }
  const parsed = waitlistSchema.safeParse(await c.req.json<unknown>().catch(() => null));
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? 'Invalid email' }, 400);

  if (c.env.TURNSTILE_SECRET_KEY && parsed.data.token) {
    const tsRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: new URLSearchParams({
        secret: c.env.TURNSTILE_SECRET_KEY,
        response: parsed.data.token,
        remoteip: ip,
      }),
    });
    const tsJson = await tsRes.json() as { success: boolean };
    if (!tsJson.success) {
      return c.json({ error: 'CAPTCHA verification failed' }, 400);
    }
  }

  await c.env.DB.prepare(
    `INSERT INTO waitlist (id, email, source, created_at) VALUES (?1, ?2, ?3, ?4)
     ON CONFLICT (email) DO NOTHING`,
  )
    .bind(randomUUID(), parsed.data.email, c.req.query('source') ?? 'landing', Date.now())
    .run();
  return c.json({ ok: true });
});
