import { Injectable, Logger } from '@nestjs/common';
import { MailService } from '../mail/mail.service';
import { platformAdminEmails } from '../../common/helpers/platform-admin';

/**
 * Emails the platform admins when something needs a person: a run of
 * server errors, AI spend past the daily guard, a retention job failing.
 * Each kind of alert is sent at most once per quiet period, so a burst of
 * errors is one email, not a thousand.
 */
@Injectable()
export class AlertsService {
  /** The exception filter is constructed outside Nest's injector, so it reaches the service here. */
  static current: AlertsService | null = null;

  private readonly logger = new Logger(AlertsService.name);
  private readonly lastSent = new Map<string, number>();
  private readonly counts = new Map<string, number>();
  private readonly quietMs: number;

  constructor(private readonly mail: MailService) {
    this.quietMs = Number(process.env.ALERT_QUIET_MINUTES ?? 15) * 60_000;
    AlertsService.current = this;
  }

  /**
   * Record an event of a kind; send an email when the threshold for that
   * kind is reached and the quiet period has passed.
   */
  notify(kind: string, subject: string, detail: string, threshold = 1): void {
    const n = (this.counts.get(kind) ?? 0) + 1;
    this.counts.set(kind, n);
    if (n < threshold) return;
    const now = Date.now();
    const last = this.lastSent.get(kind) ?? 0;
    if (now - last < this.quietMs) return;
    this.lastSent.set(kind, now);
    this.counts.set(kind, 0);
    void this.send(kind, subject, `${detail}\n\n(${n} occurrence${n === 1 ? '' : 's'} since the last alert of this kind. Alerts of one kind are sent at most every ${this.quietMs / 60_000} minutes.)`);
  }

  private async send(kind: string, subject: string, body: string): Promise<void> {
    const to = [...platformAdminEmails()];
    if (to.length === 0) {
      this.logger.warn(`Alert "${kind}" not sent: PLATFORM_ADMIN_EMAILS is empty. ${subject}`);
      return;
    }
    try {
      await this.mail.send({
        to,
        subject: `[DockyDoc alert] ${subject}`,
        text: body,
        html: `<pre style="font:14px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;white-space:pre-wrap">${escapeHtml(body)}</pre>`,
      });
      this.logger.log(`Alert "${kind}" sent to ${to.length} admin(s): ${subject}`);
    } catch (err) {
      this.logger.error(`Alert "${kind}" failed to send: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
