import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { ScheduledController, ExecutionContext } from '@cloudflare/workers-types';
import type { Env } from './env';
import { runTick } from './cron';
import { authRoutes } from './routes/auth';
import { jobsRoutes } from './routes/jobs';
import { waitlistRoutes } from './routes/waitlist';
import { paymentsRoutes } from './routes/payments';
import { heartbeatRoutes } from './routes/heartbeat';
import { apiKeysRoutes } from './routes/api_keys';
import { channelsRoutes } from './routes/channels';
import { publicStatusRoutes, statusSettingsRoutes } from './routes/status_pages';
import { requireAuth, type AppEnv } from './routes/middleware';

const app = new Hono<AppEnv>();

// In dev the Vite dev server proxies /api to this Worker (same-origin), so
// CORS mainly matters if you later host the dashboard on a separate origin.
app.use(
  '/api/*',
  cors({
    origin: (origin, c) => {
      const allowed = [c.env.WORKER_URL, ...c.env.DASHBOARD_URL.split(',').map((s: string) => s.trim())];
      return allowed.includes(origin) ? origin : undefined;
    },
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  }),
);

app.get('/api/health', (c) => c.json({ ok: true, name: 'Roosters', time: Date.now() }));

app.route('/api/auth', authRoutes);
app.route('/api/waitlist', waitlistRoutes);
app.route('/api/payments', paymentsRoutes);
app.route('/api/heartbeat', heartbeatRoutes); // Public heartbeat receiver
app.route('/api/status', publicStatusRoutes); // Public status page

// Everything below requires a signed-in session (Bearer token).
app.use('/api/*', requireAuth);
app.get('/api/me', (c) => c.json(c.get('user')));
app.route('/api/jobs', jobsRoutes);
app.route('/api/keys', apiKeysRoutes);
app.route('/api/channels', channelsRoutes);
app.route('/api/settings/status-page', statusSettingsRoutes);

app.notFound((c) => c.json({ error: 'Not found' }, 404));

export default {
  fetch: app.fetch,
  scheduled: (controller: ScheduledController, env: Env, ctx: ExecutionContext) =>
    runTick(controller, env, ctx),
};
