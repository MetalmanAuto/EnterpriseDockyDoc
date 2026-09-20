import { Injectable, Logger } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Razorpay REST calls. Uses fetch with basic auth, no SDK. Configured by
 * RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET and RAZORPAY_WEBHOOK_SECRET; absent
 * keys make `enabled` false and every call throw a plain message.
 */
export interface RazorpaySubscription {
  id: string;
  plan_id: string;
  status: 'created' | 'authenticated' | 'active' | 'pending' | 'halted' | 'cancelled' | 'completed' | 'expired' | 'paused';
  current_start: number | null;
  current_end: number | null;
  charge_at: number | null;
  ended_at: number | null;
  short_url?: string;
  notes?: Record<string, string>;
}

export interface RazorpayPayment {
  id: string;
  amount: number;
  currency: string;
  status: 'created' | 'authorized' | 'captured' | 'refunded' | 'failed';
  order_id: string | null;
  invoice_id?: string | null;
  notes?: Record<string, string>;
  email?: string;
}

@Injectable()
export class RazorpayService {
  private readonly logger = new Logger(RazorpayService.name);
  readonly keyId = process.env.RAZORPAY_KEY_ID ?? '';
  private readonly keySecret = process.env.RAZORPAY_KEY_SECRET ?? '';
  private readonly webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET ?? '';

  get enabled(): boolean {
    return !!(this.keyId && this.keySecret);
  }

  private async call<T>(method: 'GET' | 'POST' | 'PATCH', path: string, body?: unknown): Promise<T> {
    if (!this.enabled) throw new Error('Razorpay is not configured on this server.');
    const res = await fetch(`https://api.razorpay.com/v1${path}`, {
      method,
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) {
      this.logger.error(`Razorpay ${method} ${path} failed ${res.status}: ${text.slice(0, 400)}`);
      let desc = `Razorpay returned ${res.status}`;
      try { desc = (JSON.parse(text) as { error?: { description?: string } }).error?.description ?? desc; } catch { /* keep */ }
      throw new Error(desc);
    }
    return JSON.parse(text) as T;
  }

  /** A recurring plan at Razorpay. amount in paise. */
  createPlan(opts: { name: string; amount: number; currency: string; period: 'monthly' | 'yearly' }): Promise<{ id: string }> {
    return this.call('POST', '/plans', {
      period: opts.period,
      interval: 1,
      item: { name: opts.name, amount: opts.amount, currency: opts.currency, description: 'DockyDoc subscription' },
    });
  }

  createSubscription(opts: { planId: string; totalCount: number; notes: Record<string, string>; email: string }): Promise<RazorpaySubscription> {
    return this.call('POST', '/subscriptions', {
      plan_id: opts.planId,
      total_count: opts.totalCount,
      quantity: 1,
      customer_notify: 1,
      notes: opts.notes,
    });
  }

  getSubscription(id: string): Promise<RazorpaySubscription> {
    return this.call('GET', `/subscriptions/${id}`);
  }

  /** Change the plan on a running subscription. Upgrades apply now; downgrades at the cycle end. */
  updateSubscription(id: string, planId: string, when: 'now' | 'cycle_end'): Promise<RazorpaySubscription> {
    return this.call('PATCH', `/subscriptions/${id}`, { plan_id: planId, schedule_change_at: when, customer_notify: 1 });
  }

  cancelSubscription(id: string, atCycleEnd: boolean): Promise<RazorpaySubscription> {
    return this.call('POST', `/subscriptions/${id}/cancel`, { cancel_at_cycle_end: atCycleEnd ? 1 : 0 });
  }

  /** A one-off order (top-up). amount in paise. */
  createOrder(opts: { amount: number; currency: string; receipt: string; notes: Record<string, string> }): Promise<{ id: string; amount: number; currency: string }> {
    return this.call('POST', '/orders', { amount: opts.amount, currency: opts.currency, receipt: opts.receipt, notes: opts.notes });
  }

  getPayment(id: string): Promise<RazorpayPayment> {
    return this.call('GET', `/payments/${id}`);
  }

  /** Checkout success handler signature: HMAC-SHA256(orderOrSubscriptionId|paymentId, key secret). */
  verifyCheckoutSignature(parts: { paymentId: string; orderId?: string; subscriptionId?: string; signature: string }): boolean {
    if (!this.keySecret) return false;
    // Orders sign order|payment; subscriptions sign payment|subscription.
    const payload = parts.orderId ? `${parts.orderId}|${parts.paymentId}` : `${parts.paymentId}|${parts.subscriptionId ?? ''}`;
    const expected = createHmac('sha256', this.keySecret).update(payload).digest('hex');
    return safeEqual(expected, parts.signature);
  }

  /** Webhook signature: HMAC-SHA256 of the raw body with the webhook secret. */
  verifyWebhook(rawBody: Buffer | string, signature: string | undefined): boolean {
    if (!this.webhookSecret || !signature) return false;
    const expected = createHmac('sha256', this.webhookSecret).update(rawBody).digest('hex');
    return safeEqual(expected, signature);
  }
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
