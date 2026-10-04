# Deployment Guide

This project is designed to be deployed entirely on **Cloudflare** using Cloudflare Workers (for the API and frontend hosting) and Cloudflare D1 (for the SQL database).

Follow these exact steps to get your app live on the internet!

## 1. Create the Production Database
First, you need to create the production D1 database. Run this command in the `apps/worker` directory:
```bash
npx wrangler d1 create cronpulse
```
It will output a block of JSON that looks like this:
```json
{
  "binding": "DB",
  "database_name": "cronpulse",
  "database_id": "xxxxx-xxxx-xxxx-xxxx-xxxxx"
}
```
Open your `wrangler.jsonc` file and replace `"REPLACE_ME_after_wrangler_d1_create"` with the real `database_id` you just got.

## 2. Apply Database Migrations
Now that the database exists, you need to create the tables. Apply your migrations to the production remote database:
```bash
npx wrangler d1 migrations apply DB --remote
```

## 3. Configure Production Secrets
Cloudflare Workers use `wrangler secret put` to securely store environment variables. For each command below, it will prompt you to paste the value. Run these in the `apps/worker` directory:

```bash
# GitHub OAuth (You should ideally create a new OAuth app for production, with the callback URL set to your final domain: https://your-worker.workers.dev/auth/callback)
npx wrangler secret put GITHUB_CLIENT_ID
npx wrangler secret put GITHUB_CLIENT_SECRET

# Google OAuth (If using Google Sign-In, add these too)
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET

# The 32-byte (64 char hex) secret used to encrypt cookies and database fields
# You can generate one by running `openssl rand -hex 32` or similar.
npx wrangler secret put ENCRYPTION_KEY

# Razorpay Keys (If you want real payments, use your Live keys. For testing on the real site, use Test keys)
npx wrangler secret put RAZORPAY_KEY_ID
npx wrangler secret put RAZORPAY_KEY_SECRET

# Razorpay Plan IDs (These must match the keys you used above)
npx wrangler secret put RAZORPAY_PLAN_ID_PRO
npx wrangler secret put RAZORPAY_PLAN_ID_TEAM
```

## 4. Update wrangler.jsonc Environment Variables
Before you deploy, update the `"vars"` block in your `wrangler.jsonc` file to match your production environment:
- Change `"WORKER_URL"` and `"DASHBOARD_URL"` to point to your final `.workers.dev` domain (or custom domain). 
*(e.g., `https://cronpulse.your-username.workers.dev`)*

## 5. Build and Deploy!
Finally, you are ready to ship. First, compile the React frontend, and then deploy the worker:

```bash
# 1. Build the React frontend
cd apps/dashboard
npm run build

# 2. Deploy the Worker and Frontend to Cloudflare
cd ../worker
npx wrangler deploy
```

Once the deployment finishes, Wrangler will give you a live URL. Your app is now running globally on Cloudflare's edge network!
