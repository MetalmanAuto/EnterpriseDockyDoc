import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

export interface SendMailOptions {
  to: string[];
  subject: string;
  html: string;
  text?: string;
}

/**
 * Thin Resend wrapper. Degrades gracefully: when RESEND_API_KEY is absent the
 * service logs and returns null instead of throwing, so features that email
 * (reminders, invitations) keep working in-app.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly resend: Resend | null;
  private readonly from: string;
  readonly appUrl: string;

  constructor(config: ConfigService) {
    const apiKey = config.get<string>('RESEND_API_KEY');
    this.resend = apiKey ? new Resend(apiKey) : null;
    this.from = config.get<string>('EMAIL_FROM') ?? 'DockyDoc <onboarding@resend.dev>';
    this.appUrl = (config.get<string>('APP_URL') ?? 'http://localhost:8080').replace(/\/+$/, '');

    if (!this.resend) {
      this.logger.warn('RESEND_API_KEY not set — email delivery disabled');
    } else if (!config.get<string>('APP_URL')) {
      // Every link in an outgoing email is built from appUrl. Sending real mail
      // with the localhost default means invitation and reminder links that
      // nobody outside this machine can open, and nothing else reports it.
      this.logger.error(
        `APP_URL not set while email is enabled — links in outgoing email will point at ${this.appUrl} and will not work for recipients`,
      );
    }
  }

  get isEnabled(): boolean {
    return this.resend !== null;
  }

  /** Returns the provider message id, or null when delivery is disabled. */
  async send(opts: SendMailOptions): Promise<{ id: string } | null> {
    if (!this.resend) {
      this.logger.warn(`Email skipped (disabled): "${opts.subject}" → ${opts.to.join(', ')}`);
      return null;
    }

    const { data, error } = await this.resend.emails.send({
      from: this.from,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    });

    if (error) {
      throw new Error(`${error.name}: ${error.message}`);
    }
    return { id: data?.id ?? '' };
  }
}
