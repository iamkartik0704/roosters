# Roosters — Cron-as-a-Service

> Working name. Hosted service that calls a user's URL on a schedule, alerts when
> it fails, and keeps the history. Built on the plan in `cron job final.pdf`
> (Cloudflare Workers + Cron Trigger + D1, Hono API, React + Vite dashboard).

**Status: Phase 1 (free-tier core) implemented** — tick engine, slot scheduling,
ping/state machine, OAuth sign-in, jobs API, minimal dashboard, waitlist page.
Alert emails work behind a provider interface (log + Brevo). Razorpay/Pro (plan
sections 3, 9, 10) is the next phase; its tables already exist in the schema.

## Architecture (plan section 5)

- A Cloudflare Cron Trigger fires the Worker every minute.
- The Worker computes the current epoch minute and selects active jobs where
  `(minute mod interval_min) = slot`, up to 40 per tick, ordered by plan priority.
- It pings in batches of 6 with a per-job timeout (5–60s). Redirects are followed
  manually and every hop is re-validated against the URL rules.
- State machine: 3 consecutive failures → down (event + alert); first success
  after failures → up/recovered (event + alert); continued failures while down
  write nothing; down for 7 days → auto-pause on next failure.
- **Successful pings write nothing** — the write-free design keeps D1 far under
  the free plan's 100k writes/day. One `tick_stats` row per tick that had jobs due.
- Alerts are grouped: one email per user per tick, sent through one provider
  function (`src/email/sender.ts`).

Verified end-to-end against local D1 (`wrangler dev --test-scheduled` + curl):
slot match → ping → state writes → tick_stats → down after 3 failures with alert
email → recovered on first success with alert email. Two behaviors worth knowing:

- **First check-in writes once.** A brand-new job is `unknown`; its first
  successful ping flips it to `up` (a single write), after which successes are
  write-free as planned.
- **Keep-alive caveat.** Any HTTP response counts as awake, including edge
  error pages: on Cloudflare's production network, a DNS-dead domain can return
  a synthetic 5xx from the edge, which keep-alive mode treats as "responded".
  Use monitor mode when you want dead domains to count as failures.

Deviations from the plan (deliberate, both documented in the plan review):

1. **Dashboard is served by the Worker as static assets** (Workers `assets`
   binding) instead of Cloudflare Pages. Same platform, one deploy, and the
   OAuth flow works same-origin without CORS/cookie complexity. Pages remains a
   fine alternative if you prefer two deploy targets.
2. **Sessions are Bearer tokens in localStorage** (hashed in D1, 30-day TTL)
   rather than cookies. Works identically in dev and prod across origins; swap
   to HttpOnly cookies later if you want.

## Why Cloudflare Workers & D1? (Scalability)

Roosters is built on a 100% serverless edge architecture. If you're wondering why we didn't use Docker or traditional containers for scalability:
- **Infinite Scale-to-Zero and Scale-Out**: V8 isolates spin up globally in milliseconds exactly when a cron tick fires, and instantly spin down. You pay only for exact CPU time used.
- **Distributed Global Execution**: The pinging engine naturally executes from edge nodes closer to your users' servers, heavily reducing network latency and preventing timeout bottlenecks.
- **Zero Maintenance Overhead**: There are no load balancers to configure, no container health checks to monitor, and no node scaling limits to worry about.
- **Database Concurrency**: Cloudflare D1 is a distributed edge-native SQLite database. Because we built the execution engine to be "write-free" on successes, the database operates smoothly without row-locking overhead.

## Repo layout

```
apps/
  worker/        Cloudflare Worker: Hono API + scheduled tick (src/cron.ts)
  dashboard/     React + Vite SPA (served by the Worker in production)
packages/
  shared/        Plan limits, zod validation, DTO types (used by both apps)
```

## Local development

Prereqs: Node 20+, npm, a Cloudflare account (free).

```bash
npm install

# 1. Create the local D1 database and apply the schema
cd apps/worker
npx wrangler d1 migrations apply Roosters --local

# 2. Configure secrets locally
cp .dev.vars.example .dev.vars
#    → set ENCRYPTION_KEY (openssl rand -hex 32)
#    → optionally GitHub/Google OAuth app credentials

# 3. Run the API + scheduled tick (the --test-scheduled flag exposes /__scheduled)
npx wrangler dev --test-scheduled

# 4. In a second terminal, run the dashboard (proxies /api to the Worker)
cd ../../apps/dashboard && npm run dev
```

Open http://localhost:5173. Without OAuth credentials, use the dev login:

```bash
curl -X POST http://127.0.0.1:8787/api/auth/dev-login
# → {"token": "..."} → paste as Authorization: Bearer <token> (or use the UI once wired)
```

Trigger a tick manually (runs every minute in production):

```bash
curl "http://127.0.0.1:8787/__scheduled?cron=*+*+*+*+*"
```

## OAuth setup

- **GitHub**: create an OAuth App (Settings → Developer settings) with callback
  `http://127.0.0.1:8787/api/auth/github/callback` (dev) and
  `https://<your-worker-domain>/api/auth/github/callback` (prod).
- **Google**: create OAuth credentials (Web application) with redirect
  `http://127.0.0.1:8787/api/auth/google/callback` — Google allows http only for
  `127.0.0.1`/`localhost`.
- Put the client id/secret in `.dev.vars` (dev) or `wrangler secret put` (prod).

## Deploy

```bash
# One-time
npx wrangler d1 create Roosters          # paste the id into wrangler.jsonc
npx wrangler d1 migrations apply Roosters --remote

# Secrets (production)
npx wrangler secret put ENCRYPTION_KEY    # openssl rand -hex 32
npx wrangler secret put GITHUB_CLIENT_ID
npx wrangler secret put GITHUB_CLIENT_SECRET
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
# when EMAIL_PROVIDER=brevo:
npx wrangler secret put BREVO_API_KEY

# Update wrangler.jsonc vars: WORKER_URL and DASHBOARD_URL to your domains.

# Build + deploy (dashboard is bundled as Worker assets)
npm run deploy
```

`wrangler.jsonc` vars to review before launch: `WORKER_URL`, `DASHBOARD_URL`,
`EMAIL_PROVIDER` (`log` → `brevo`), `EMAIL_FROM`, `EMAIL_FROM_NAME`, `USER_AGENT`.

GitHub Actions (`.github/workflows/ci.yml`) runs typecheck + tests + build on
every push, and deploys on `main` when `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID` repository secrets are set.

## Security & abuse prevention implemented (plan section 7)

- HTTPS-only + IP-literal/localhost/private-hostname blocking on Free; every
  redirect hop re-validated (downgrades to http rejected when HTTPS required).
- Job headers and bodies encrypted at rest (AES-256-GCM, key = `ENCRYPTION_KEY`).
- Secrets never returned by the API; edit form keeps stored values unless replaced.
- Every jobs query filtered by `user_id`; bearer sessions hashed with SHA-256.
- Zod validation on every input; plan gating (methods, intervals, quotas) shared
  between API and dashboard from `packages/shared`.
- Rate limits: run-now/test (6/min/user), waitlist (5/min/IP) — in-memory,
  best-effort.
- Waitlist guarded by Cloudflare Turnstile.
- Circuit breaker for D1 overload protection.
- Per-host connection limits (max 5 jobs to the same hostname).

## Not yet built

- Analytics dashboard charts.
- Admin dashboard for the platform owner.
