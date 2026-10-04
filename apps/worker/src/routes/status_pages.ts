import { Hono } from 'hono';
import { requireAuth, type AppEnv } from './middleware';

export const publicStatusRoutes = new Hono<AppEnv>();

// Public route to fetch the status page
publicStatusRoutes.get('/:slug', async (c) => {
  const slug = c.req.param('slug');
  const page = await c.env.DB.prepare(
    'SELECT user_id, title, published FROM status_pages WHERE slug = ?1'
  ).bind(slug).first<{ user_id: string; title: string; published: number }>();

  if (!page || !page.published) {
    return c.json({ error: 'Status page not found' }, 404);
  }

  const { results: jobs } = await c.env.DB.prepare(
    'SELECT id, name, state, last_state_change FROM jobs WHERE user_id = ?1 AND status = ?2 ORDER BY name ASC'
  ).bind(page.user_id, 'active').all();

  return c.json({ title: page.title, jobs: jobs || [] });
});

export const statusSettingsRoutes = new Hono<AppEnv>();
statusSettingsRoutes.use('*', requireAuth);

statusSettingsRoutes.get('/', async (c) => {
  const user = c.get('user');
  const page = await c.env.DB.prepare(
    'SELECT slug, title, published FROM status_pages WHERE user_id = ?1'
  ).bind(user.id).first();

  if (!page) {
    return c.json({ page: null });
  }

  return c.json({ page: { ...page, published: page.published === 1 } });
});

statusSettingsRoutes.patch('/', async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: 'Invalid body' }, 400);

  const slug = typeof body.slug === 'string' ? body.slug.toLowerCase().replace(/[^a-z0-9-]/g, '') : null;
  const title = typeof body.title === 'string' ? body.title : 'System Status';
  const published = body.published === true ? 1 : 0;
  const now = Date.now();

  if (!slug) return c.json({ error: 'Valid slug required' }, 400);

  // Check uniqueness
  const existing = await c.env.DB.prepare('SELECT user_id FROM status_pages WHERE slug = ?1').bind(slug).first<{user_id: string}>();
  if (existing && existing.user_id !== user.id) {
    return c.json({ error: 'Slug is already taken' }, 409);
  }

  await c.env.DB.prepare(
    `INSERT INTO status_pages (user_id, slug, title, published, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?5)
     ON CONFLICT(user_id) DO UPDATE SET slug = excluded.slug, title = excluded.title, published = excluded.published, updated_at = excluded.updated_at`
  ).bind(user.id, slug, title, published, now).run();

  return c.json({ page: { slug, title, published: published === 1 } });
});
