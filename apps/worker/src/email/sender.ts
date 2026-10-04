import type { Env } from '../env';

/**
 * Email sits behind this one function (plan section 8) so changing provider is
 * a one-file change. `log` writes to the console (local dev); `brevo` calls the
 * Brevo HTTP API on your own domain (launch) — Resend is the documented fallback.
 */
export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}

export function createEmailSender(env: Env): EmailSender {
  if (env.EMAIL_PROVIDER === 'brevo') {
    return new BrevoEmailSender(env);
  }
  return new LogEmailSender();
}

class LogEmailSender implements EmailSender {
  async send(message: EmailMessage): Promise<void> {
    console.log(`[email:log] to=${message.to} subject="${message.subject}"\n${message.text}`);
  }
}

class BrevoEmailSender implements EmailSender {
  constructor(private env: Env) {}

  async send(message: EmailMessage): Promise<void> {
    if (!this.env.BREVO_API_KEY) {
      throw new Error('BREVO_API_KEY is not set (required when EMAIL_PROVIDER=brevo)');
    }
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': this.env.BREVO_API_KEY,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        sender: { name: this.env.EMAIL_FROM_NAME, email: this.env.EMAIL_FROM },
        to: [{ email: message.to }],
        subject: message.subject,
        textContent: message.text,
        htmlContent: message.html,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Brevo send failed (${res.status}): ${detail.slice(0, 200)}`);
    }
  }
}
