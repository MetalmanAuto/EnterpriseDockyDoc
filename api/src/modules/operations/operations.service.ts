import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { AlertsService } from '../alerts/alerts.service';
import { platformAdminEmails } from '../../common/helpers/platform-admin';
import { PLANS } from '../billing/plans';

const DAY = 86_400_000;

/**
 * The jobs that let one person run the product: onboarding emails to new
 * sign-ups, and a Monday report to the platform admins with the numbers
 * that matter (sign-ups by source, activity, revenue).
 */
@Injectable()
export class OperationsService {
  private readonly logger = new Logger(OperationsService.name);
  private readonly enabled: boolean;
  private readonly appUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly alerts: AlertsService,
    config: ConfigService,
  ) {
    this.enabled = config.get<string>('ENABLE_SCHEDULER') !== 'false';
    this.appUrl = (config.get<string>('APP_URL') ?? 'https://dockydoc.app').replace(/\/+$/, '');
  }

  /** Every hour: welcome mail after the first hour, a nudge after three quiet days. */
  @Cron('15 * * * *')
  async hourly(): Promise<void> {
    if (!this.enabled) return;
    try {
      const r = await this.runOnboarding();
      if (r.welcomed || r.nudged) this.logger.log(`Onboarding mails: welcomed=${r.welcomed} nudged=${r.nudged}`);
    } catch (err) {
      this.logger.error(`Onboarding run failed: ${(err as Error).message}`);
    }
  }

  /** Monday 03:30 UTC (09:00 IST). */
  @Cron('30 3 * * 1')
  async weekly(): Promise<void> {
    if (!this.enabled) return;
    try {
      await this.sendWeeklyReport();
    } catch (err) {
      this.logger.error(`Weekly report failed: ${(err as Error).message}`);
      this.alerts.notify('weekly_report', 'Weekly report failed', (err as Error).message);
    }
  }

  async runOnboarding(): Promise<{ welcomed: number; nudged: number }> {
    const now = Date.now();
    let welcomed = 0;
    let nudged = 0;

    const fresh = await this.prisma.user.findMany({
      where: { welcomeSentAt: null, isActive: true, createdAt: { lt: new Date(now - 60 * 60_000), gt: new Date(now - 14 * DAY) } },
      select: { id: true, email: true, firstName: true },
      take: 200,
    });
    for (const u of fresh) {
      await this.prisma.user.update({ where: { id: u.id }, data: { welcomeSentAt: new Date() } });
      await this.safeSend(u.email, 'Welcome to DockyDoc: three things to do first', welcomeHtml(u.firstName, this.appUrl));
      welcomed++;
    }

    const quiet = await this.prisma.user.findMany({
      where: {
        nudgeSentAt: null, isActive: true, welcomeSentAt: { not: null },
        createdAt: { lt: new Date(now - 3 * DAY), gt: new Date(now - 30 * DAY) },
        ownedDocuments: { none: {} },
      },
      select: { id: true, email: true, firstName: true },
      take: 200,
    });
    for (const u of quiet) {
      await this.prisma.user.update({ where: { id: u.id }, data: { nudgeSentAt: new Date() } });
      await this.safeSend(u.email, 'Need a hand getting your first document in?', nudgeHtml(u.firstName, this.appUrl));
      nudged++;
    }
    return { welcomed, nudged };
  }

  async weeklyNumbers() {
    const now = new Date();
    const since = new Date(now.getTime() - 7 * DAY);
    const prior = new Date(now.getTime() - 14 * DAY);
    const [newUsers, priorUsers, totalUsers, activeUsers, docs, priorDocs, aiUsers, payments, subs, bySource, byPlan] = await Promise.all([
      this.prisma.user.count({ where: { createdAt: { gte: since } } }),
      this.prisma.user.count({ where: { createdAt: { gte: prior, lt: since } } }),
      this.prisma.user.count(),
      this.prisma.auditLog.findMany({ where: { createdAt: { gte: since }, userId: { not: null } }, distinct: ['userId'], select: { userId: true } }),
      this.prisma.document.count({ where: { createdAt: { gte: since } } }),
      this.prisma.document.count({ where: { createdAt: { gte: prior, lt: since } } }),
      this.prisma.user.aggregate({ _sum: { aiActionsUsed: true } }),
      this.prisma.payment.groupBy({ by: ['currency'], where: { createdAt: { gte: since }, status: 'captured' }, _sum: { amount: true }, _count: { _all: true } }),
      this.prisma.subscription.groupBy({ by: ['plan'], where: { status: 'ACTIVE' }, _count: { _all: true } }),
      this.prisma.user.groupBy({ by: ['signupSource'], where: { createdAt: { gte: since } }, _count: { _all: true } }),
      this.prisma.user.groupBy({ by: ['plan'], _count: { _all: true } }),
    ]);
    return {
      period: { from: since.toISOString(), to: now.toISOString() },
      signups: { thisWeek: newUsers, lastWeek: priorUsers, total: totalUsers },
      activePeople: activeUsers.length,
      documents: { thisWeek: docs, lastWeek: priorDocs },
      aiActionsThisPeriod: aiUsers._sum.aiActionsUsed ?? 0,
      revenue: payments.map((p) => ({ currency: p.currency, amount: p._sum.amount ?? 0, payments: p._count._all })),
      payingSubscriptions: subs.map((s) => ({ plan: s.plan, count: s._count._all })),
      signupsBySource: bySource.map((s) => ({ source: s.signupSource ?? 'direct', count: s._count._all })).sort((a, b) => b.count - a.count),
      peopleByPlan: byPlan.map((p) => ({ plan: p.plan, count: p._count._all })),
    };
  }

  async sendWeeklyReport(): Promise<{ sentTo: string[] }> {
    const to = [...platformAdminEmails()];
    if (to.length === 0) return { sentTo: [] };
    const n = await this.weeklyNumbers();
    const money = (c: string, a: number) => `${c} ${(a / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
    const rows = [
      ['New sign-ups', `${n.signups.thisWeek} (last week ${n.signups.lastWeek}, total ${n.signups.total})`],
      ['People active', String(n.activePeople)],
      ['Documents added', `${n.documents.thisWeek} (last week ${n.documents.lastWeek})`],
      ['AI actions used this period', String(n.aiActionsThisPeriod)],
      ['Revenue this week', n.revenue.length ? n.revenue.map((r) => `${money(r.currency, r.amount)} from ${r.payments} payment${r.payments === 1 ? '' : 's'}`).join(', ') : 'none'],
      ['Paying subscriptions', n.payingSubscriptions.length ? n.payingSubscriptions.map((s) => `${s.count} ${PLANS[s.plan].name}`).join(', ') : 'none'],
      ['Sign-ups by source', n.signupsBySource.length ? n.signupsBySource.map((s) => `${s.source}: ${s.count}`).join(', ') : 'none'],
      ['Everyone by plan', n.peopleByPlan.map((p) => `${PLANS[p.plan].name} ${p.count}`).join(', ')],
    ];
    const html = `<p>DockyDoc, week to ${n.period.to.slice(0, 10)}.</p><table cellpadding="6" style="border-collapse:collapse">${rows.map(([k, v]) => `<tr><td style="color:#666">${k}</td><td><b>${v}</b></td></tr>`).join('')}</table><p><a href="${this.appUrl}/admin">Open the admin page</a> for the per-person view.</p>`;
    try {
      await this.mail.send({ to, subject: `DockyDoc weekly: ${n.signups.thisWeek} sign-ups, ${n.documents.thisWeek} documents, ${n.revenue.length ? n.revenue.map((r) => money(r.currency, r.amount)).join(' + ') : 'no revenue'}`, html });
    } catch (err) {
      throw new HttpException({ statusCode: 502, message: `The mail service refused the report: ${(err as Error).message}` }, HttpStatus.BAD_GATEWAY);
    }
    this.logger.log(`Weekly report sent to ${to.join(', ')}`);
    return { sentTo: to };
  }

  private async safeSend(to: string, subject: string, html: string): Promise<void> {
    try {
      await this.mail.send({ to: [to], subject, html });
    } catch (err) {
      this.logger.warn(`Mail to ${to} failed: ${(err as Error).message}`);
    }
  }
}

function welcomeHtml(name: string, appUrl: string): string {
  return `<p>Hi ${name || 'there'},</p>
<p>Thanks for signing up. Three things worth doing in your first ten minutes:</p>
<ol>
<li><b>Upload one real document</b>, a passport, a policy or a contract. DockyDoc reads it and fills in the expiry date, issuer and type for you. <a href="${appUrl}/documents">Upload now</a>.</li>
<li><b>Check the expiry date it found</b> and set who gets reminded. Reminders go out 90, 30, 7 and 1 day before.</li>
<li><b>Ask the assistant a question</b>, like "when does my visa expire" or "which policies renew this quarter". <a href="${appUrl}/assistant">Try it</a>.</li>
</ol>
<p>Your files are encrypted at rest, kept in Mumbai, and never used to train any model. The <a href="${appUrl}/help">help pages</a> cover the rest. Reply to this email if anything is unclear; a person reads it.</p>
<p>Nishant<br>DockyDoc, by Excelleta Tech Private Limited</p>`;
}

function nudgeHtml(name: string, appUrl: string): string {
  return `<p>Hi ${name || 'there'},</p>
<p>You signed up a few days ago but have not added a document yet. The fastest way to see what DockyDoc does is to upload one thing that has an expiry date: a passport, a driving licence, an insurance policy, a lease.</p>
<p><a href="${appUrl}/documents">Upload a document</a>. It takes about a minute, and the AI fills in the details.</p>
<p>If something stopped you, reply and tell me what. I read every reply.</p>
<p>Nishant<br>DockyDoc</p>`;
}
