import type { StateChange } from '../state';
import type { Env } from '../env';
import { createEmailSender, type EmailMessage } from './sender';
import { decryptString } from '../crypto';

const BRAND = 'Roosters'; // working name — change here and in the dashboard

/**
 * One email per user per tick listing all their affected jobs (plan section 8:
 * never one email per failed ping). Send failures are logged, never thrown —
 * an email outage must not break the tick.
 */
export async function notifyStateChanges(
  env: Env,
  changes: StateChange[],
  outcomes: { ok: boolean }[],
): Promise<void> {
  void outcomes;
  try {
    const byUser = new Map<string, StateChange[]>();
    for (const change of changes) {
      const list = byUser.get(change.userId) ?? [];
      list.push(change);
      byUser.set(change.userId, list);
    }
    if (byUser.size === 0) return;

    const users = await env.DB.prepare(
      `SELECT id, email FROM users WHERE id IN (${[...byUser.keys()].map(() => '?').join(',')})`,
    )
      .bind(...byUser.keys())
      .all<{ id: string; email: string }>();

    const channelsRes = await env.DB.prepare(
      `SELECT user_id, type, target_enc FROM alert_channels WHERE verified = 1 AND user_id IN (${[...byUser.keys()].map(() => '?').join(',')})`
    ).bind(...byUser.keys()).all<{ user_id: string; type: string; target_enc: string }>();

    const sender = createEmailSender(env);
    const sends: Promise<void>[] = [];
    for (const user of users.results ?? []) {
      const userChanges = byUser.get(user.id);
      if (!userChanges) continue;
      
      const msg = buildMessage(user.email, userChanges);
      // Primary email
      sends.push(
        sender.send(msg).catch((e) => {
          console.error(`[email] failed to notify ${user.email}:`, e);
        }),
      );

      // Custom Channels
      const userChannels = channelsRes.results?.filter((c) => c.user_id === user.id) || [];
      for (const ch of userChannels) {
        sends.push((async () => {
          try {
            const target = await decryptString(env.ENCRYPTION_KEY, ch.target_enc);
            if (!target) return;
            if (ch.type === 'email') {
              await sender.send({ ...msg, to: target });
            } else if (ch.type === 'slack' || ch.type === 'webhook' || ch.type === 'telegram') {
              await fetch(target, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: msg.text }) });
            } else if (ch.type === 'discord') {
              await fetch(target, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: msg.text }) });
            }
          } catch (e) {
            console.error(`[channel] failed to notify ${ch.type}:`, e);
          }
        })());
      }
    }
    await Promise.all(sends);
  } catch (e) {
    console.error('[email] notifyStateChanges failed:', e);
  }
}

function buildMessage(email: string, changes: StateChange[]): EmailMessage {
  const down = changes.filter((c) => c.kind === 'down');
  const recovered = changes.filter((c) => c.kind === 'recovered');
  const paused = changes.filter((c) => c.kind === 'paused');

  const parts: string[] = [];
  if (down.length) parts.push(`${down.length} down`);
  if (recovered.length) parts.push(`${recovered.length} recovered`);
  if (paused.length) parts.push(`${paused.length} auto-paused`);

  const lines = changes.map((c) => {
    const emoji = c.kind === 'down' ? '🔴' : c.kind === 'recovered' ? '🟢' : '⏸️';
    const label = c.kind === 'down' ? 'DOWN' : c.kind === 'recovered' ? 'RECOVERED' : 'PAUSED (down 7 days)';
    const detail = [c.httpStatus ? `HTTP ${c.httpStatus}` : null, c.error].filter(Boolean).join(' — ');
    return `${emoji} ${label} — ${c.jobName}\n   ${c.url}${detail ? `\n   ${detail}` : ''}`;
  });

  const text = [
    `Your scheduled jobs: ${parts.join(', ')}.`,
    '',
    ...lines,
    '',
    `— ${BRAND}`,
  ].join('\n');

  const html = [
    `<p>Your scheduled jobs: <strong>${parts.join(', ')}</strong>.</p>`,
    ...changes.map((c) => {
      const label = c.kind === 'down' ? 'DOWN' : c.kind === 'recovered' ? 'RECOVERED' : 'PAUSED (down 7 days)';
      const detail = [c.httpStatus ? `HTTP ${c.httpStatus}` : null, escapeHtml(c.error ?? '')]
        .filter(Boolean)
        .join(' — ');
      return `<p>${label} — <strong>${escapeHtml(c.jobName)}</strong><br>` +
        `<small>${escapeHtml(c.url)}${detail ? `<br>${detail}` : ''}</small></p>`;
    }),
    `<p style="color:#888">— ${BRAND}</p>`,
  ].join('\n');

  return { to: email, subject: `${BRAND}: ${parts.join(', ')}`, text, html };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
