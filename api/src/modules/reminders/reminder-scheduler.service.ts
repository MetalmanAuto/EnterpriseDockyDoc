import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { AuditService, AuditAction, AuditEntityType } from '../audit/audit.service';
import { buildReminderEmail } from './reminder-email';

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const MAX_ATTEMPTS = 3;
const BATCH_SIZE = 100;

export interface SchedulerRunResult {
  sent: number;
  failed: number;
  cancelled: number;
}

/**
 * Delivers due reminders. Runs in-process on a cron; each row is claimed with a
 * conditional update so concurrent instances never double-send.
 */
@Injectable()
export class ReminderSchedulerService {
  private readonly logger = new Logger(ReminderSchedulerService.name);
  private readonly enabled: boolean;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
    config: ConfigService,
  ) {
    this.enabled = config.get<string>('ENABLE_SCHEDULER') !== 'false';
    if (!this.enabled) this.logger.warn('ENABLE_SCHEDULER=false — reminder delivery is off on this instance');
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async tick(): Promise<void> {
    if (!this.enabled || this.running) return;
    this.running = true;
    try {
      const result = await this.processDue();
      if (result.sent || result.failed || result.cancelled) {
        this.logger.log(`Reminder run: sent=${result.sent} failed=${result.failed} cancelled=${result.cancelled}`);
      }
    } catch (err) {
      this.logger.error(`Reminder run crashed: ${(err as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  async processDue(limit = BATCH_SIZE): Promise<SchedulerRunResult> {
    const result: SchedulerRunResult = { sent: 0, failed: 0, cancelled: 0 };
    const now = new Date();

    const due = await this.prisma.documentReminder.findMany({
      where: { status: 'PENDING', remindAt: { lte: now } },
      include: {
        document: {
          include: {
            owner: { select: { email: true, isActive: true } },
            workspace: {
              select: {
                id: true,
                name: true,
                members: {
                  where: { status: 'ACTIVE', role: { in: ['OWNER', 'ADMIN'] } },
                  select: { user: { select: { email: true, isActive: true } } },
                },
              },
            },
          },
        },
      },
      orderBy: { remindAt: 'asc' },
      take: limit,
    });

    for (const reminder of due) {
      const doc = reminder.document;

      if (doc.status !== 'ACTIVE' || !doc.isReminderEnabled || !doc.expiryDate) {
        await this.prisma.documentReminder.updateMany({
          where: { id: reminder.id, status: 'PENDING' },
          data: { status: 'CANCELLED' },
        });
        result.cancelled++;
        continue;
      }

      // Snoozed: leave the row PENDING; it goes out on the first run after the snooze ends.
      if (doc.remindersSnoozedUntil && doc.remindersSnoozedUntil > now) continue;

      // Claim: only one instance can flip PENDING → SENT for this row.
      const claimed = await this.prisma.documentReminder.updateMany({
        where: { id: reminder.id, status: 'PENDING' },
        data: { status: 'SENT', sentAt: now, attempts: { increment: 1 } },
      });
      if (claimed.count !== 1) continue;

      const recipients = Array.from(
        new Set(
          [doc.owner, ...doc.workspace.members.map((m) => m.user)]
            .filter((u) => u.isActive)
            .map((u) => u.email.toLowerCase()),
        ),
      );
      const daysUntilExpiry = Math.round((doc.expiryDate.getTime() - now.getTime()) / MS_PER_DAY);

      try {
        const email = buildReminderEmail({
          documentName: doc.name,
          workspaceName: doc.workspace.name,
          expiryDate: doc.expiryDate,
          daysUntilExpiry,
          documentUrl: `${this.mail.appUrl}/documents/${doc.id}`,
          remindersUrl: `${this.mail.appUrl}/reminders`,
        });

        const delivery = recipients.length > 0 ? await this.mail.send({ to: recipients, ...email }) : null;

        await this.prisma.documentReminder.update({
          where: { id: reminder.id },
          data: {
            sentTo: delivery ? recipients : [],
            lastError: delivery
              ? null
              : recipients.length === 0
                ? 'No active recipients'
                : 'Email delivery disabled (RESEND_API_KEY not set)',
          },
        });

        this.audit.log({
          workspaceId: doc.workspaceId,
          userId: null,
          action: AuditAction.REMINDER_SENT,
          entityType: AuditEntityType.REMINDER,
          entityId: doc.id,
          metadata: {
            documentName: doc.name,
            reminderId: reminder.id,
            daysUntilExpiry,
            recipients: delivery ? recipients.length : 0,
            delivered: Boolean(delivery),
          },
        });
        result.sent++;
      } catch (err) {
        const attempts = reminder.attempts + 1;
        const message = (err as Error).message.slice(0, 500);
        await this.prisma.documentReminder.update({
          where: { id: reminder.id },
          data: {
            status: attempts >= MAX_ATTEMPTS ? 'FAILED' : 'PENDING',
            sentAt: null,
            lastError: message,
          },
        });
        this.logger.error(`Reminder ${reminder.id} for doc ${doc.id} failed (attempt ${attempts}): ${message}`);
        result.failed++;
      }
    }

    return result;
  }

  /** Send a sample reminder to one address — used by the "Send test email" action. */
  async sendTest(to: string, workspaceName: string): Promise<{ delivered: boolean }> {
    const expiryDate = new Date();
    expiryDate.setUTCDate(expiryDate.getUTCDate() + 30);
    const email = buildReminderEmail({
      documentName: 'Sample document (test)',
      workspaceName,
      expiryDate,
      daysUntilExpiry: 30,
      documentUrl: `${this.mail.appUrl}/documents`,
      remindersUrl: `${this.mail.appUrl}/reminders`,
    });
    const delivery = await this.mail.send({ to: [to], ...email });
    return { delivered: Boolean(delivery) };
  }
}
