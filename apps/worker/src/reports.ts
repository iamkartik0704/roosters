import type { ExecutionContext } from '@cloudflare/workers-types';
import type { Env } from './env';
import { createEmailSender } from './email/sender';

const BRAND = 'Roosters';

export async function runWeeklyReports(env: Env, ctx: ExecutionContext): Promise<void> {
  ctx.waitUntil(generateAndSendReports(env));
}

async function generateAndSendReports(env: Env): Promise<void> {
  try {
    const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

    // 1. Get all pro/team users
    const users = await env.DB.prepare(
      `SELECT id, email, plan FROM users WHERE plan IN ('pro', 'team')`
    ).all<{ id: string; email: string; plan: string }>();

    if (!users.results || users.results.length === 0) return;

    const sender = createEmailSender(env);

    for (const user of users.results) {
      // 2. Fetch jobs for the user
      const jobs = await env.DB.prepare(
        `SELECT id, name, url, state, status FROM jobs WHERE user_id = ?1`
      ).bind(user.id).all<{ id: string; name: string; url: string; state: string; status: string }>();

      if (!jobs.results || jobs.results.length === 0) continue;

      // 3. Fetch events in the last week for these jobs
      const events = await env.DB.prepare(
        `SELECT job_id, kind, at FROM job_events 
         WHERE job_id IN (SELECT id FROM jobs WHERE user_id = ?1) 
         AND at >= ?2 
         ORDER BY at ASC`
      ).bind(user.id, oneWeekAgo).all<{ job_id: string; kind: string; at: number }>();

      const eventsByJob = new Map<string, any[]>();
      for (const ev of events.results || []) {
        const list = eventsByJob.get(ev.job_id) || [];
        list.push(ev);
        eventsByJob.set(ev.job_id, list);
      }

      // Generate report data
      let html = `<h2>Weekly Performance Report</h2><p>Here is your weekly summary for <strong>${jobs.results.length}</strong> monitored jobs.</p>`;
      let text = `Weekly Performance Report\nHere is your weekly summary for ${jobs.results.length} monitored jobs.\n\n`;

      html += `<table style="width: 100%; border-collapse: collapse; text-align: left;">`;
      html += `<thead><tr style="border-bottom: 1px solid #ccc;"><th>Job Name</th><th>Current State</th><th>Incidents (7d)</th></tr></thead>`;
      html += `<tbody>`;

      for (const job of jobs.results) {
        const jobEvents = eventsByJob.get(job.id) || [];
        const downEvents = jobEvents.filter(e => e.kind === 'down').length;

        const stateColor = job.state === 'up' ? 'green' : job.state === 'down' ? 'red' : 'gray';
        const stateEmoji = job.state === 'up' ? '🟢' : job.state === 'down' ? '🔴' : '⚪';

        html += `<tr style="border-bottom: 1px solid #eee;">
          <td style="padding: 8px 0;"><strong>${escapeHtml(job.name)}</strong><br><small style="color: #666;">${escapeHtml(job.url)}</small></td>
          <td style="padding: 8px 0; color: ${stateColor};">${stateEmoji} ${job.state.toUpperCase()}</td>
          <td style="padding: 8px 0;">${downEvents > 0 ? `<strong>${downEvents}</strong>` : '0'}</td>
        </tr>`;

        text += `${job.name} (${job.url})\nState: ${job.state.toUpperCase()} | Incidents: ${downEvents}\n\n`;
      }

      html += `</tbody></table><br><p style="color: #888; font-size: 12px;">Thank you for using ${BRAND} Pro.</p>`;

      // 4. Send email
      await sender.send({
        to: user.email,
        subject: `${BRAND}: Your Weekly Uptime Report`,
        text,
        html
      }).catch(e => console.error(`Failed to send report to ${user.email}:`, e));
    }
  } catch (err) {
    console.error('Failed to run weekly reports:', err);
  }
}

function escapeHtml(s: string): string {
  if (!s) return '';
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
