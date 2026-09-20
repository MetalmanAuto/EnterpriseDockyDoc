import { Injectable, Logger } from '@nestjs/common';
import { createHmac } from 'crypto';
import { safeEqual } from './razorpay.service';

/**
 * Paddle Billing REST calls. Paddle is the merchant of record outside India:
 * it charges the card, adds the buyer's local tax and files it. Configured by
 * PADDLE_API_KEY, PADDLE_WEBHOOK_SECRET, PADDLE_ENV (sandbox | production)
 * and, on the web, NEXT_PUBLIC_PADDLE_CLIENT_TOKEN.
 */
export interface PaddleSubscription {
  id: string;
  status: 'active' | 'canceled' | 'past_due' | 'paused' | 'trialing';
  customer_id: string;
  custom_data?: Record<string, string> | null;
  current_billing_period?: { starts_at: string; ends_at: string } | null;
  scheduled_change?: { action: 'cancel' | 'pause' | 'resume'; effective_at: string } | null;
  items: { price: { id: string }; quantity: number }[];
}

export interface PaddleTransaction {
  id: string;
  status: 'draft' | 'ready' | 'billed' | 'paid' | 'completed' | 'canceled' | 'past_due';
  customer_id: string | null;
  subscription_id: string | null;
  custom_data?: Record<string, string> | null;
  currency_code: string;
  details?: { totals?: { total?: string; grand_total?: string } };
  items: { price: { id: string; custom_data?: Record<string, string> | null }; quantity: number }[];
  invoice_number?: string | null;
}

@Injectable()
export class PaddleService {
  private readonly logger = new Logger(PaddleService.name);
  private readonly apiKey = process.env.PADDLE_API_KEY ?? '';
  private readonly webhookSecret = process.env.PADDLE_WEBHOOK_SECRET ?? '';
  readonly env: 'sandbox' | 'production' = process.env.PADDLE_ENV === 'production' ? 'production' : 'sandbox';
  readonly clientToken = process.env.PADDLE_CLIENT_TOKEN ?? '';

  get enabled(): boolean {
    return !!(this.apiKey && this.clientToken);
  }

  private get base(): string {
    return this.env === 'production' ? 'https://api.paddle.com' : 'https://sandbox-api.paddle.com';
  }

  private async call<T>(method: 'GET' | 'POST' | 'PATCH', path: string, body?: unknown): Promise<T> {
    if (!this.apiKey) throw new Error('Paddle is not configured on this server.');
    const res = await fetch(`${this.base}${path}`, {
      method,
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) {
      this.logger.error(`Paddle ${method} ${path} failed ${res.status}: ${text.slice(0, 400)}`);
      let desc = `Paddle returned ${res.status}`;
      try { desc = (JSON.parse(text) as { error?: { detail?: string } }).error?.detail ?? desc; } catch { /* keep */ }
      throw new Error(desc);
    }
    return (JSON.parse(text) as { data: T }).data;
  }

  createProduct(name: string): Promise<{ id: string }> {
    return this.call('POST', '/products', { name, tax_category: 'saas', description: 'DockyDoc' });
  }

  /** amount in cents as a string, per Paddle. interval null = one-off. */
  createPrice(opts: { productId: string; name: string; amount: number; currency: string; interval: 'month' | 'year' | null; customData?: Record<string, string> }): Promise<{ id: string }> {
    return this.call('POST', '/prices', {
      product_id: opts.productId,
      description: opts.name,
      name: opts.name,
      unit_price: { amount: String(opts.amount), currency_code: opts.currency },
      billing_cycle: opts.interval ? { interval: opts.interval, frequency: 1 } : null,
      quantity: { minimum: 1, maximum: 1 },
      tax_mode: 'account_setting',
      custom_data: opts.customData ?? null,
    });
  }

  getSubscription(id: string): Promise<PaddleSubscription> {
    return this.call('GET', `/subscriptions/${id}`);
  }

  /** Swap the plan; Paddle prorates the difference on the spot. */
  updateSubscriptionPrice(id: string, priceId: string): Promise<PaddleSubscription> {
    return this.call('PATCH', `/subscriptions/${id}`, {
      items: [{ price_id: priceId, quantity: 1 }],
      proration_billing_mode: 'prorated_immediately',
    });
  }

  cancelSubscription(id: string, atPeriodEnd: boolean): Promise<PaddleSubscription> {
    return this.call('POST', `/subscriptions/${id}/cancel`, { effective_from: atPeriodEnd ? 'next_billing_period' : 'immediately' });
  }

  getTransaction(id: string): Promise<PaddleTransaction> {
    return this.call('GET', `/transactions/${id}`);
  }

  /** Paddle-Signature: "ts=...;h1=..." over `${ts}:${rawBody}`. */
  verifyWebhook(rawBody: Buffer | string, header: string | undefined): boolean {
    if (!this.webhookSecret || !header) return false;
    const parts = Object.fromEntries(header.split(';').map((p) => p.split('=') as [string, string]));
    const ts = parts.ts;
    const h1 = parts.h1;
    if (!ts || !h1) return false;
    if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
    const body = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
    const expected = createHmac('sha256', this.webhookSecret).update(`${ts}:${body}`).digest('hex');
    return safeEqual(expected, h1);
  }
}
