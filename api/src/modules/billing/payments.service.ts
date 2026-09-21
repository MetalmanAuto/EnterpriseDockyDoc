import { BadRequestException, HttpException, HttpStatus, Injectable, Logger, NotFoundException, type OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { BillingProvider, SubscriptionStatus, WorkspacePlan, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { AlertsService } from '../alerts/alerts.service';
import { BillingService } from './billing.service';
import { PLANS, PLAN_RANK, STORAGE_PACKS, TOP_UPS } from './plans';
import { RazorpayService, type RazorpayPayment, type RazorpaySubscription } from './razorpay.service';
import { PaddleService, type PaddleSubscription, type PaddleTransaction } from './paddle.service';
import { PAID_PLANS, type Currency, type Interval, type PaidPlan, type RazorpayConfirmDto } from './dto/payments.dto';

const DAY = 86_400_000;

export type CheckoutSession =
  | { mode: 'updated'; plan: WorkspacePlan; effective: 'now' | 'cycle_end' }
  | { mode: 'razorpay'; keyId: string; subscriptionId?: string; orderId?: string; amount: number; currency: string; email: string; name: string; description: string }
  | { mode: 'paddle'; clientToken: string; env: 'sandbox' | 'production'; priceId: string; email: string; customData: Record<string, string> };

interface Buyer {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}

/**
 * Everything that touches money. Razorpay takes rupees (India), Paddle
 * takes dollars (everywhere else) as merchant of record. Both report back
 * through webhooks, which are the source of truth; the Razorpay checkout
 * confirmation is a fast path so the person sees their plan flip at once.
 */
@Injectable()
export class PaymentsService implements OnModuleInit {
  private readonly logger = new Logger(PaymentsService.name);

  /** Make sure the plans exist at the providers as soon as the keys are in. Never blocks boot. */
  onModuleInit() {
    if (!this.razorpay.enabled && !this.paddle.enabled) return;
    void this.syncPrices()
      .then((prices) => this.logger.log(`Provider prices ready: ${prices.length} (${prices.filter((p) => p.created).length} created)`))
      .catch((err: Error) => this.logger.warn(`Provider price sync failed: ${err.message}`));
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
    private readonly razorpay: RazorpayService,
    private readonly paddle: PaddleService,
    private readonly mail: MailService,
    private readonly alerts: AlertsService,
  ) {}

  /** What the web needs to open a checkout. Public. */
  config() {
    return {
      razorpay: { enabled: this.razorpay.enabled, keyId: this.razorpay.enabled ? this.razorpay.keyId : null },
      paddle: { enabled: this.paddle.enabled, clientToken: this.paddle.enabled ? this.paddle.clientToken : null, env: this.paddle.env },
    };
  }

  // ---- checkout ------------------------------------------------------ //

  async startSubscription(buyer: Buyer, plan: PaidPlan, interval: Interval, currency: Currency): Promise<CheckoutSession> {
    const provider = providerFor(currency);
    this.assertProvider(provider);

    const current = await this.activeSubscription(buyer.id);
    if (current && current.provider !== provider) {
      throw new BadRequestException(
        `Your current subscription is billed in ${current.currency}. Cancel it from the Billing page first, then subscribe again in ${currency} once it ends.`,
      );
    }

    const price = await this.ensurePlanPrice(provider, plan, interval, currency);

    if (current) {
      // Same provider: change the plan in place. Upgrades now, downgrades at the cycle end.
      const upgrade = PLAN_RANK[plan] > PLAN_RANK[current.plan];
      if (provider === 'RAZORPAY') {
        await this.provider(() => this.razorpay.updateSubscription(current.providerSubscriptionId, price.providerPriceId, upgrade ? 'now' : 'cycle_end'));
      } else {
        await this.provider(() => this.paddle.updateSubscriptionPrice(current.providerSubscriptionId, price.providerPriceId));
      }
      const effective: 'now' | 'cycle_end' = provider === 'RAZORPAY' && !upgrade ? 'cycle_end' : 'now';
      if (effective === 'now') {
        await this.prisma.subscription.update({ where: { id: current.id }, data: { plan, interval, amount: price.amount, cancelAtPeriodEnd: false } });
        await this.billing.setPlan(buyer.id, plan, { source: provider.toLowerCase(), renewsAt: current.currentPeriodEnd });
      }
      return { mode: 'updated', plan, effective };
    }

    if (provider === 'RAZORPAY') {
      const sub = await this.provider(() => this.razorpay.createSubscription({
        planId: price.providerPriceId,
        totalCount: interval === 'yearly' ? 10 : 120,
        notes: { userId: buyer.id, plan, interval, kind: 'subscription' },
        email: buyer.email,
      }));
      await this.prisma.subscription.create({
        data: { userId: buyer.id, provider, providerSubscriptionId: sub.id, plan, interval, currency, amount: price.amount, status: 'PENDING' },
      });
      return {
        mode: 'razorpay', keyId: this.razorpay.keyId, subscriptionId: sub.id, amount: price.amount, currency,
        email: buyer.email, name: `${buyer.firstName} ${buyer.lastName}`.trim(), description: `DockyDoc ${PLANS[plan].name}, ${interval}`,
      };
    }

    return {
      mode: 'paddle', clientToken: this.paddle.clientToken, env: this.paddle.env, priceId: price.providerPriceId,
      email: buyer.email, customData: { userId: buyer.id, plan, interval, kind: 'subscription' },
    };
  }

  async startTopUp(buyer: Buyer, actions: 100 | 500, currency: Currency): Promise<CheckoutSession> {
    const provider = providerFor(currency);
    const user = await this.billing.getAccount(buyer.id);
    if (!user.limits.topUps) {
      throw new HttpException({ statusCode: 402, message: 'Top-ups are available on paid plans. Choose a plan first.', code: 'topups_require_paid', plan: user.plan, upgradeTo: 'PERSONAL' }, HttpStatus.PAYMENT_REQUIRED);
    }
    this.assertProvider(provider);
    const pack = TOP_UPS.find((t) => t.actions === actions)!;
    const amount = currency === 'INR' ? pack.priceInr * 100 : pack.priceUsd * 100;

    if (provider === 'RAZORPAY') {
      const order = await this.provider(() => this.razorpay.createOrder({
        amount, currency, receipt: `topup-${buyer.id.slice(-8)}-${Date.now()}`,
        notes: { userId: buyer.id, kind: 'topup', actions: String(actions) },
      }));
      return {
        mode: 'razorpay', keyId: this.razorpay.keyId, orderId: order.id, amount, currency,
        email: buyer.email, name: `${buyer.firstName} ${buyer.lastName}`.trim(), description: `${actions} extra AI actions`,
      };
    }
    const price = await this.ensureTopUpPrice(actions, amount);
    return {
      mode: 'paddle', clientToken: this.paddle.clientToken, env: this.paddle.env, priceId: price.providerPriceId,
      email: buyer.email, customData: { userId: buyer.id, kind: 'topup', actions: String(actions) },
    };
  }

  async startStoragePack(buyer: Buyer, gb: number, currency: Currency): Promise<CheckoutSession> {
    const provider = providerFor(currency);
    const account = await this.billing.getAccount(buyer.id);
    if (!account.limits.topUps) {
      throw new HttpException({ statusCode: 402, message: 'Extra storage is available on paid plans. Choose a plan first.', code: 'topups_require_paid', plan: account.plan, upgradeTo: 'PERSONAL' }, HttpStatus.PAYMENT_REQUIRED);
    }
    this.assertProvider(provider);
    const pack = STORAGE_PACKS.find((p) => p.gb === gb);
    if (!pack) throw new BadRequestException('Unknown storage pack.');
    const amount = currency === 'INR' ? pack.priceInr * 100 : pack.priceUsd * 100;
    if (provider === 'RAZORPAY') {
      const order = await this.provider(() => this.razorpay.createOrder({
        amount, currency, receipt: `storage-${buyer.id.slice(-8)}-${Date.now()}`,
        notes: { userId: buyer.id, kind: 'storage', gb: String(gb) },
      }));
      return {
        mode: 'razorpay', keyId: this.razorpay.keyId, orderId: order.id, amount, currency,
        email: buyer.email, name: `${buyer.firstName} ${buyer.lastName}`.trim(), description: `${gb} GB extra storage for 12 months`,
      };
    }
    const price = await this.ensureStoragePrice(gb, amount);
    return {
      mode: 'paddle', clientToken: this.paddle.clientToken, env: this.paddle.env, priceId: price.providerPriceId,
      email: buyer.email, customData: { userId: buyer.id, kind: 'storage', gb: String(gb) },
    };
  }

  /** Razorpay checkout success handler: verify the signature, then apply at once. */
  async confirmRazorpay(buyer: Buyer, dto: RazorpayConfirmDto): Promise<{ applied: 'subscription' | 'topup' | 'pending' }> {
    const ok = this.razorpay.verifyCheckoutSignature({
      paymentId: dto.razorpay_payment_id, orderId: dto.razorpay_order_id, subscriptionId: dto.razorpay_subscription_id, signature: dto.razorpay_signature,
    });
    if (!ok) throw new UnauthorizedException('Payment signature did not verify.');

    if (dto.razorpay_subscription_id) {
      const sub = await this.razorpay.getSubscription(dto.razorpay_subscription_id);
      const local = await this.prisma.subscription.findUnique({ where: { providerSubscriptionId: sub.id } });
      if (!local || local.userId !== buyer.id) throw new NotFoundException('Subscription not found for this account.');
      if (['authenticated', 'active'].includes(sub.status)) {
        await this.applyRazorpaySubscription(sub);
        return { applied: 'subscription' };
      }
      return { applied: 'pending' };
    }
    if (dto.razorpay_order_id) {
      const payment = await this.razorpay.getPayment(dto.razorpay_payment_id);
      if (payment.status !== 'captured' && payment.status !== 'authorized') return { applied: 'pending' };
      if (payment.notes?.userId !== buyer.id) throw new NotFoundException('Payment not found for this account.');
      await this.applyRazorpayOneOff(payment);
      return { applied: 'topup' };
    }
    throw new BadRequestException('Send either a subscription id or an order id.');
  }

  async cancel(buyer: Buyer): Promise<{ endsAt: string | null }> {
    const current = await this.activeSubscription(buyer.id);
    if (!current) throw new BadRequestException('There is no active subscription to cancel.');
    if (current.provider === 'RAZORPAY') await this.provider(() => this.razorpay.cancelSubscription(current.providerSubscriptionId, true));
    else await this.provider(() => this.paddle.cancelSubscription(current.providerSubscriptionId, true));
    await this.prisma.subscription.update({ where: { id: current.id }, data: { cancelAtPeriodEnd: true } });
    this.logger.log(`Subscription ${current.id} for ${buyer.id} set to end at ${current.currentPeriodEnd?.toISOString() ?? 'period end'}`);
    return { endsAt: current.currentPeriodEnd?.toISOString() ?? null };
  }

  // ---- webhooks ------------------------------------------------------ //

  async razorpayWebhook(rawBody: Buffer, signature: string | undefined, eventId: string | undefined): Promise<{ ok: true }> {
    if (!this.razorpay.verifyWebhook(rawBody, signature)) throw new UnauthorizedException('Bad webhook signature');
    const body = JSON.parse(rawBody.toString('utf8')) as {
      event: string;
      payload: { subscription?: { entity: RazorpaySubscription }; payment?: { entity: RazorpayPayment } };
    };
    if (!(await this.firstDelivery('RAZORPAY', eventId ?? `${body.event}:${body.payload.payment?.entity.id ?? body.payload.subscription?.entity.id}`, body.event))) return { ok: true };
    this.logger.log(`Razorpay webhook ${body.event}`);

    const sub = body.payload.subscription?.entity;
    const payment = body.payload.payment?.entity;
    try {
      switch (body.event) {
        case 'subscription.authenticated':
        case 'subscription.activated':
        case 'subscription.charged':
        case 'subscription.updated':
        case 'subscription.resumed':
          if (sub) await this.applyRazorpaySubscription(sub, body.event === 'subscription.charged' ? payment : undefined);
          break;
        case 'subscription.pending':
        case 'subscription.halted':
          if (sub) await this.markRazorpayTrouble(sub, body.event === 'subscription.halted');
          break;
        case 'subscription.cancelled':
        case 'subscription.completed':
        case 'subscription.expired':
          if (sub) await this.endSubscription(sub.id, body.event === 'subscription.cancelled' ? 'CANCELLED' : 'EXPIRED', sub.current_end ? new Date(sub.current_end * 1000) : null);
          break;
        case 'payment.captured':
          if (payment && (payment.notes?.kind === 'topup' || payment.notes?.kind === 'storage')) await this.applyRazorpayOneOff(payment);
          break;
        case 'payment.failed':
          this.logger.warn(`Razorpay payment failed: ${payment?.id} for ${payment?.notes?.userId ?? 'unknown'}`);
          break;
        default:
          break;
      }
    } catch (err) {
      this.logger.error(`Razorpay webhook ${body.event} failed: ${(err as Error).message}`);
      this.alerts.notify('billing_webhook', 'Razorpay webhook failed', `${body.event}: ${(err as Error).message}`);
      throw err;
    }
    return { ok: true };
  }

  async paddleWebhook(rawBody: Buffer, signature: string | undefined): Promise<{ ok: true }> {
    if (!this.paddle.verifyWebhook(rawBody, signature)) throw new UnauthorizedException('Bad webhook signature');
    const body = JSON.parse(rawBody.toString('utf8')) as { event_id: string; event_type: string; data: PaddleSubscription | PaddleTransaction };
    if (!(await this.firstDelivery('PADDLE', body.event_id, body.event_type))) return { ok: true };
    this.logger.log(`Paddle webhook ${body.event_type}`);

    try {
      switch (body.event_type) {
        case 'subscription.created':
        case 'subscription.activated':
        case 'subscription.updated':
        case 'subscription.resumed':
        case 'subscription.past_due':
        case 'subscription.canceled':
          await this.applyPaddleSubscription(body.data as PaddleSubscription);
          break;
        case 'transaction.completed':
        case 'transaction.paid':
          await this.applyPaddleTransaction(body.data as PaddleTransaction);
          break;
        default:
          break;
      }
    } catch (err) {
      this.logger.error(`Paddle webhook ${body.event_type} failed: ${(err as Error).message}`);
      this.alerts.notify('billing_webhook', 'Paddle webhook failed', `${body.event_type}: ${(err as Error).message}`);
      throw err;
    }
    return { ok: true };
  }

  // ---- applying provider state -------------------------------------- //

  private async applyRazorpaySubscription(sub: RazorpaySubscription, payment?: RazorpayPayment): Promise<void> {
    const local = await this.prisma.subscription.findUnique({ where: { providerSubscriptionId: sub.id } });
    const userId = local?.userId ?? sub.notes?.userId;
    if (!userId) {
      this.logger.warn(`Razorpay subscription ${sub.id} has no local record and no userId note`);
      return;
    }
    const price = await this.prisma.providerPrice.findFirst({ where: { provider: 'RAZORPAY', providerPriceId: sub.plan_id } });
    const plan = (price ? (price.key.split(':')[0] as WorkspacePlan) : local?.plan ?? asPlan(sub.notes?.plan)) ?? 'PERSONAL';
    const interval = price ? price.key.split(':')[1] : local?.interval ?? sub.notes?.interval ?? 'monthly';
    const periodEnd = sub.current_end ? new Date(sub.current_end * 1000) : sub.charge_at ? new Date(sub.charge_at * 1000) : addInterval(new Date(), interval);
    const status: SubscriptionStatus = sub.status === 'active' || sub.status === 'authenticated' ? 'ACTIVE' : sub.status === 'pending' || sub.status === 'halted' ? 'PAST_DUE' : local?.status ?? 'PENDING';

    await this.prisma.subscription.upsert({
      where: { providerSubscriptionId: sub.id },
      create: { userId, provider: 'RAZORPAY', providerSubscriptionId: sub.id, plan, interval, currency: 'INR', amount: price?.amount ?? 0, status, currentPeriodEnd: periodEnd },
      update: { plan, interval, status, currentPeriodEnd: periodEnd, ...(price && { amount: price.amount }) },
    });
    if (status === 'ACTIVE') {
      await this.billing.setPlan(userId, plan, { source: 'razorpay', renewsAt: periodEnd });
    }
    if (payment) {
      await this.recordPayment({ userId, provider: 'RAZORPAY', providerPaymentId: payment.id, kind: 'subscription', amount: payment.amount, currency: payment.currency, plan });
    }
  }

  private async markRazorpayTrouble(sub: RazorpaySubscription, halted: boolean): Promise<void> {
    const local = await this.prisma.subscription.findUnique({ where: { providerSubscriptionId: sub.id } });
    if (!local) return;
    await this.prisma.subscription.update({ where: { id: local.id }, data: { status: halted ? 'EXPIRED' : 'PAST_DUE' } });
    if (halted) {
      // Razorpay gave up retrying the card. The plan lapses; the person can subscribe again.
      await this.billing.setPlan(local.userId, 'FREE', { source: 'lapsed', renewsAt: null });
      await this.sendMail(local.userId, 'Your DockyDoc payment did not go through', `<p>We could not collect the payment for your ${PLANS[local.plan].name} plan after several tries, so the account is back on Free. Nothing has been deleted. Open the Billing page in DockyDoc to subscribe again with a working card.</p>`);
    }
  }

  private async endSubscription(providerSubscriptionId: string, status: SubscriptionStatus, periodEnd: Date | null): Promise<void> {
    const local = await this.prisma.subscription.findUnique({ where: { providerSubscriptionId } });
    if (!local) return;
    await this.prisma.subscription.update({ where: { id: local.id }, data: { status, cancelAtPeriodEnd: true, ...(periodEnd && { currentPeriodEnd: periodEnd }) } });
    const end = periodEnd ?? local.currentPeriodEnd;
    if (!end || end.getTime() <= Date.now()) {
      await this.billing.setPlan(local.userId, 'FREE', { source: 'ended', renewsAt: null });
    } else {
      // Paid until the period ends; refreshPlan drops it to Free after that.
      await this.prisma.user.update({ where: { id: local.userId }, data: { planRenewsAt: end } });
    }
  }

  private async applyRazorpayOneOff(payment: RazorpayPayment): Promise<void> {
    const userId = payment.notes?.userId;
    if (!userId) throw new Error(`Payment ${payment.id} is missing the userId note`);
    if (payment.notes?.kind === 'storage') {
      const gb = Number(payment.notes?.gb ?? 0);
      if (!gb) throw new Error(`Storage payment ${payment.id} is missing gb`);
      await this.applyStoragePack({ userId, provider: 'RAZORPAY', providerPaymentId: payment.id, gb, amount: payment.amount, currency: payment.currency });
      return;
    }
    const actions = Number(payment.notes?.actions ?? 0);
    if (!actions) throw new Error(`Top-up payment ${payment.id} is missing actions`);
    await this.applyTopUp({ userId, provider: 'RAZORPAY', providerPaymentId: payment.id, actions, amount: payment.amount, currency: payment.currency });
  }

  private async applyStoragePack(p: { userId: string; provider: BillingProvider; providerPaymentId: string; gb: number; amount: number; currency: string }): Promise<void> {
    const { gb, ...rest } = p;
    const recorded = await this.recordPayment({ ...rest, kind: 'storage', storageGb: gb });
    if (!recorded) return;
    await this.billing.addStoragePack(p.userId, gb);
  }

  private async applyPaddleSubscription(sub: PaddleSubscription): Promise<void> {
    const local = await this.prisma.subscription.findUnique({ where: { providerSubscriptionId: sub.id } });
    const userId = local?.userId ?? sub.custom_data?.userId;
    if (!userId) {
      this.logger.warn(`Paddle subscription ${sub.id} has no local record and no userId in custom_data`);
      return;
    }
    const priceId = sub.items[0]?.price.id;
    const price = priceId ? await this.prisma.providerPrice.findFirst({ where: { provider: 'PADDLE', providerPriceId: priceId } }) : null;
    const plan = (price ? (price.key.split(':')[0] as WorkspacePlan) : local?.plan ?? asPlan(sub.custom_data?.plan)) ?? 'PERSONAL';
    const interval = price ? price.key.split(':')[1] : local?.interval ?? sub.custom_data?.interval ?? 'monthly';
    const periodEnd = sub.current_billing_period?.ends_at ? new Date(sub.current_billing_period.ends_at) : local?.currentPeriodEnd ?? addInterval(new Date(), interval);
    const status: SubscriptionStatus = sub.status === 'active' || sub.status === 'trialing' ? 'ACTIVE' : sub.status === 'past_due' ? 'PAST_DUE' : sub.status === 'canceled' ? 'CANCELLED' : 'PENDING';
    const cancelAtPeriodEnd = sub.scheduled_change?.action === 'cancel' || status === 'CANCELLED';

    await this.prisma.subscription.upsert({
      where: { providerSubscriptionId: sub.id },
      create: { userId, provider: 'PADDLE', providerSubscriptionId: sub.id, plan, interval, currency: 'USD', amount: price?.amount ?? 0, status, currentPeriodEnd: periodEnd, cancelAtPeriodEnd },
      update: { plan, interval, status, currentPeriodEnd: periodEnd, cancelAtPeriodEnd, ...(price && { amount: price.amount }) },
    });
    if (status === 'ACTIVE') {
      await this.billing.setPlan(userId, plan, { source: 'paddle', renewsAt: periodEnd });
    } else if (status === 'CANCELLED') {
      await this.endSubscription(sub.id, 'CANCELLED', periodEnd);
    }
  }

  private async applyPaddleTransaction(tx: PaddleTransaction): Promise<void> {
    if (tx.status !== 'completed' && tx.status !== 'paid') return;
    const userId = tx.custom_data?.userId;
    if (!userId) return;
    const total = Number(tx.details?.totals?.grand_total ?? tx.details?.totals?.total ?? 0);
    const kind = tx.custom_data?.kind ?? tx.items[0]?.price.custom_data?.kind;
    if (kind === 'storage') {
      const gb = Number(tx.custom_data?.gb ?? tx.items[0]?.price.custom_data?.gb ?? 0);
      if (!gb) throw new Error(`Paddle storage purchase ${tx.id} has no gb`);
      await this.applyStoragePack({ userId, provider: 'PADDLE', providerPaymentId: tx.id, gb, amount: total, currency: tx.currency_code });
      return;
    }
    if (kind === 'topup') {
      const actions = Number(tx.custom_data?.actions ?? tx.items[0]?.price.custom_data?.actions ?? 0);
      if (!actions) throw new Error(`Paddle top-up ${tx.id} has no actions`);
      await this.applyTopUp({ userId, provider: 'PADDLE', providerPaymentId: tx.id, actions, amount: total, currency: tx.currency_code });
      return;
    }
    const priceId = tx.items[0]?.price.id;
    const price = priceId ? await this.prisma.providerPrice.findFirst({ where: { provider: 'PADDLE', providerPriceId: priceId } }) : null;
    const plan = price ? (price.key.split(':')[0] as WorkspacePlan) : undefined;
    await this.recordPayment({ userId, provider: 'PADDLE', providerPaymentId: tx.id, kind: 'subscription', amount: total, currency: tx.currency_code, plan });
  }

  private async applyTopUp(p: { userId: string; provider: BillingProvider; providerPaymentId: string; actions: number; amount: number; currency: string }): Promise<void> {
    const { actions, ...rest } = p;
    const recorded = await this.recordPayment({ ...rest, kind: 'topup', topUpActions: actions });
    if (!recorded) return; // already applied
    await this.billing.addCredits(p.userId, p.actions);
    this.logger.log(`Top-up: ${p.actions} actions for ${p.userId} (${p.provider} ${p.providerPaymentId})`);
  }

  /** Records a payment once; returns false when this payment was already recorded. */
  private async recordPayment(p: { userId: string; provider: BillingProvider; providerPaymentId: string; kind: string; amount: number; currency: string; plan?: WorkspacePlan; topUpActions?: number; storageGb?: number }): Promise<boolean> {
    try {
      await this.prisma.payment.create({ data: { ...p, status: 'captured' } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return false;
      throw err;
    }
    const money = `${p.currency} ${(p.amount / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
    const what = p.kind === 'topup' ? `${p.topUpActions} extra AI actions` : p.kind === 'storage' ? `${p.storageGb} GB extra storage for 12 months` : `the ${p.plan ? PLANS[p.plan].name : ''} plan`;
    await this.sendMail(p.userId, `Receipt: ${money} for ${what}`, `<p>Thanks. We received ${money} for ${what}.</p><p>Payment reference: ${p.providerPaymentId}. The invoice with tax details is in the email from ${p.provider === 'RAZORPAY' ? 'Razorpay' : 'Paddle'}, and your plan and payment history are on the Billing page in DockyDoc.</p><p>Excelleta Tech Private Limited, Flat 706E, Sector 19B Dwarka Front, New Delhi 110075. GSTIN 07AAHCE4776H1ZC.</p>`);
    return true;
  }

  // ---- prices at the provider --------------------------------------- //

  /**
   * Create every price the checkout can ask for, at each provider that is
   * switched on, so the first real customer does not wait on it and the
   * plans are visible in the provider dashboards up front. Safe to call
   * again: prices that already exist are reused, never duplicated.
   */
  async syncPrices(): Promise<{ provider: BillingProvider; key: string; providerPriceId: string; amount: number; currency: string; created: boolean }[]> {
    const out: { provider: BillingProvider; key: string; providerPriceId: string; amount: number; currency: string; created: boolean }[] = [];
    const record = async (provider: BillingProvider, key: string, make: () => Promise<{ providerPriceId: string; amount: number; currency: string }>) => {
      const before = await this.prisma.providerPrice.findUnique({ where: { provider_key: { provider, key } } });
      const price = await make();
      out.push({ provider, key, providerPriceId: price.providerPriceId, amount: price.amount, currency: price.currency, created: !before });
    };
    const intervals: Interval[] = ['monthly', 'yearly'];
    if (this.razorpay.enabled) {
      for (const plan of PAID_PLANS) for (const interval of intervals) {
        await record('RAZORPAY', `${plan}:${interval}:INR`, () => this.ensurePlanPrice('RAZORPAY', plan, interval, 'INR'));
      }
    }
    if (this.paddle.enabled) {
      for (const plan of PAID_PLANS) for (const interval of intervals) {
        await record('PADDLE', `${plan}:${interval}:USD`, () => this.ensurePlanPrice('PADDLE', plan, interval, 'USD'));
      }
      for (const t of TOP_UPS) await record('PADDLE', `topup:${t.actions}:USD`, () => this.ensureTopUpPrice(t.actions, t.priceUsd * 100));
      for (const p of STORAGE_PACKS) await record('PADDLE', `storage:${p.gb}:USD`, () => this.ensureStoragePrice(p.gb, p.priceUsd * 100));
    }
    return out;
  }

  private async ensurePlanPrice(provider: BillingProvider, plan: PaidPlan, interval: Interval, currency: Currency) {
    const key = `${plan}:${interval}:${currency}`;
    const existing = await this.prisma.providerPrice.findUnique({ where: { provider_key: { provider, key } } });
    if (existing) return existing;
    const p = PLANS[plan];
    const amount = currency === 'INR'
      ? (interval === 'yearly' ? p.priceYearlyInr : p.priceMonthlyInr) * 100
      : (interval === 'yearly' ? p.priceYearlyUsd : p.priceMonthlyUsd) * 100;
    const name = `DockyDoc ${p.name} (${interval})`;
    let providerPriceId: string;
    if (provider === 'RAZORPAY') {
      providerPriceId = (await this.provider(() => this.razorpay.createPlan({ name, amount, currency, period: interval }))).id;
    } else {
      const productId = await this.ensurePaddleProduct();
      providerPriceId = (await this.provider(() => this.paddle.createPrice({ productId, name, amount, currency, interval: interval === 'yearly' ? 'year' : 'month', customData: { plan, interval, kind: 'subscription' } }))).id;
    }
    return this.prisma.providerPrice.create({ data: { provider, key, providerPriceId, amount, currency } });
  }

  private async ensureTopUpPrice(actions: number, amount: number) {
    const key = `topup:${actions}:USD`;
    const existing = await this.prisma.providerPrice.findUnique({ where: { provider_key: { provider: 'PADDLE', key } } });
    if (existing) return existing;
    const productId = await this.ensurePaddleProduct();
    const price = await this.paddle.createPrice({ productId, name: `${actions} extra AI actions`, amount, currency: 'USD', interval: null, customData: { kind: 'topup', actions: String(actions) } });
    return this.prisma.providerPrice.create({ data: { provider: 'PADDLE', key, providerPriceId: price.id, amount, currency: 'USD' } });
  }

  private async ensureStoragePrice(gb: number, amount: number) {
    const key = `storage:${gb}:USD`;
    const existing = await this.prisma.providerPrice.findUnique({ where: { provider_key: { provider: 'PADDLE', key } } });
    if (existing) return existing;
    const productId = await this.ensurePaddleProduct();
    const price = await this.provider(() => this.paddle.createPrice({ productId, name: `${gb} GB extra storage, 12 months`, amount, currency: 'USD', interval: null, customData: { kind: 'storage', gb: String(gb) } }));
    return this.prisma.providerPrice.create({ data: { provider: 'PADDLE', key, providerPriceId: price.id, amount, currency: 'USD' } });
  }

  private async ensurePaddleProduct(): Promise<string> {
    const key = 'product:dockydoc';
    const existing = await this.prisma.providerPrice.findUnique({ where: { provider_key: { provider: 'PADDLE', key } } });
    if (existing) return existing.providerPriceId;
    const product = await this.paddle.createProduct('DockyDoc');
    await this.prisma.providerPrice.create({ data: { provider: 'PADDLE', key, providerPriceId: product.id, amount: 0, currency: 'USD' } });
    return product.id;
  }

  // ---- helpers -------------------------------------------------------- //

  /** Runs a provider call; a failure becomes a 502 with the provider's own words instead of a bare 500. */
  private async provider<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      throw new HttpException({ statusCode: 502, code: 'provider_error', message: `The payment provider did not accept the request: ${(err as Error).message}` }, HttpStatus.BAD_GATEWAY);
    }
  }

  private assertProvider(provider: BillingProvider): void {
    if (provider === 'RAZORPAY' && !this.razorpay.enabled) {
      throw new HttpException({ statusCode: 503, code: 'provider_unavailable', message: 'Rupee payments are not open yet. Try again shortly.' }, HttpStatus.SERVICE_UNAVAILABLE);
    }
    if (provider === 'PADDLE' && !this.paddle.enabled) {
      throw new HttpException({ statusCode: 503, code: 'provider_unavailable', message: 'Card payments outside India open shortly. Email billing@dockydoc.app and we will send an invoice you can pay by card today.' }, HttpStatus.SERVICE_UNAVAILABLE);
    }
  }

  private activeSubscription(userId: string) {
    return this.prisma.subscription.findFirst({
      where: { userId, status: { in: ['ACTIVE', 'PAST_DUE'] }, cancelAtPeriodEnd: false },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async firstDelivery(provider: BillingProvider, eventId: string, type: string): Promise<boolean> {
    try {
      await this.prisma.webhookEvent.create({ data: { provider, eventId, type } });
      return true;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        this.logger.log(`Duplicate ${provider} webhook ${eventId} ignored`);
        return false;
      }
      throw err;
    }
  }

  private async sendMail(userId: string, subject: string, html: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (!user) return;
    try {
      await this.mail.send({ to: [user.email], subject, html });
    } catch (err) {
      this.logger.warn(`Billing mail to ${user.email} failed: ${(err as Error).message}`);
    }
  }
}

function asPlan(v: string | undefined): WorkspacePlan | undefined {
  return v && (v in PLANS) ? (v as WorkspacePlan) : undefined;
}

function providerFor(currency: Currency): BillingProvider {
  return currency === 'INR' ? 'RAZORPAY' : 'PADDLE';
}

function addInterval(from: Date, interval: string): Date {
  return new Date(from.getTime() + (interval === 'yearly' ? 365 : 31) * DAY);
}
