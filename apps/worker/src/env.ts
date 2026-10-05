/**
 * Secrets (set with `wrangler secret put` or .dev.vars locally):
 *   ENCRYPTION_KEY       32 bytes as hex (64 chars) or base64. Encrypts headers/body/alert targets.
 *   GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET
 *   GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET
 *   BREVO_API_KEY        only when EMAIL_PROVIDER=brevo
 * Non-secret vars live in wrangler.jsonc.
 */
export interface Env {
  DB: D1Database;

  /** External base URL of this Worker (OAuth callback + redirect allowlist). */
  WORKER_URL: string;
  /** Allowed dashboard origin(s) for the OAuth post-login redirect; comma-separated. */
  DASHBOARD_URL: string;

  EMAIL_PROVIDER: 'log' | 'brevo';
  EMAIL_FROM: string;
  EMAIL_FROM_NAME: string;
  USER_AGENT: string;

  ENCRYPTION_KEY: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  BREVO_API_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;

  RAZORPAY_KEY_ID?: string;
  RAZORPAY_KEY_SECRET?: string;
  RAZORPAY_WEBHOOK_SECRET?: string;
  RAZORPAY_OFFER_ID_EARLY37?: string;
  RAZORPAY_PLAN_ID_PRO?: string;
  RAZORPAY_PLAN_ID_TEAM?: string;

  /** Local dev only: enables POST /api/auth/dev-login. Never set in production. */
  ALLOW_DEV_LOGIN?: string;
}
