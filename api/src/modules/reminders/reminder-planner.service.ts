import { Injectable, Logger } from '@nestjs/common';
import { Prisma, ReminderChannel } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/** Days before expiry at which reminders fire when the user hasn't chosen offsets. */
export const DEFAULT_OFFSET_DAYS = [90, 30, 7];

const MS_PER_DAY = 1000 * 60 * 60 * 24;

type Tx = Prisma.TransactionClient | PrismaService;

/**
 * Owns the lifecycle of DocumentReminder rows relative to a document's expiry
 * date, so every code path that touches expiryDate (manual edit, reminder
 * panel, AI auto-fill) produces the same schedule.
 */
@Injectable()
export class ReminderPlannerService {
  private readonly logger = new Logger(ReminderPlannerService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Cancel PENDING reminders for the document and create a fresh schedule from
   * `offsetDays` relative to `expiryDate`. Offsets already in the past are skipped.
   * Returns the number of reminders created.
   */
  async regenerate(
    tx: Tx,
    documentId: string,
    expiryDate: Date | null,
    offsetDays: number[],
    channel: ReminderChannel = ReminderChannel.EMAIL,
  ): Promise<number> {
    await tx.documentReminder.updateMany({
      where: { documentId, status: 'PENDING' },
      data: { status: 'CANCELLED' },
    });

    if (!expiryDate || offsetDays.length === 0) return 0;

    const now = new Date();
    const rows = Array.from(new Set(offsetDays))
      .filter((d) => Number.isInteger(d) && d > 0)
      .map((days) => ({ documentId, remindAt: this.remindAtFor(expiryDate, days), channel, status: 'PENDING' as const }))
      .filter((r) => r.remindAt > now);

    if (rows.length === 0) return 0;
    const result = await tx.documentReminder.createMany({ data: rows });
    return result.count;
  }

  /**
   * Recover the offsets a document is currently scheduled with, derived from
   * its PENDING reminders and the expiry date they were computed against.
   * Falls back to DEFAULT_OFFSET_DAYS when nothing is pending.
   */
  async currentOffsets(documentId: string, expiryDate: Date | null): Promise<number[]> {
    if (!expiryDate) return [...DEFAULT_OFFSET_DAYS];

    const pending = await this.prisma.documentReminder.findMany({
      where: { documentId, status: 'PENDING' },
      select: { remindAt: true },
    });
    if (pending.length === 0) return [...DEFAULT_OFFSET_DAYS];

    const offsets = pending
      .map((r) => Math.round((this.endOfDayUtc(expiryDate).getTime() - r.remindAt.getTime()) / MS_PER_DAY))
      .filter((d) => d > 0);
    return offsets.length > 0 ? Array.from(new Set(offsets)) : [...DEFAULT_OFFSET_DAYS];
  }

  /**
   * Keep the schedule consistent after expiryDate changed outside the reminder
   * panel (PATCH /documents/:id, AI auto-fill). Preserves the user's existing
   * offsets when they can be derived; enables reminders automatically the first
   * time a document gains an expiry date.
   */
  async syncForExpiryChange(
    documentId: string,
    previousExpiry: Date | null,
    newExpiry: Date | null,
  ): Promise<void> {
    const doc = await this.prisma.document.findUnique({
      where: { id: documentId },
      select: { isReminderEnabled: true },
    });
    if (!doc) return;

    const offsets = await this.currentOffsets(documentId, previousExpiry);
    const enable = doc.isReminderEnabled || previousExpiry === null;

    await this.prisma.$transaction(async (tx) => {
      if (enable !== doc.isReminderEnabled) {
        await tx.document.update({ where: { id: documentId }, data: { isReminderEnabled: enable } });
      }
      const created = await this.regenerate(tx, documentId, enable ? newExpiry : null, offsets);
      this.logger.log(
        `[Planner] doc=${documentId} expiry ${previousExpiry?.toISOString().slice(0, 10) ?? '—'} → ` +
          `${newExpiry?.toISOString().slice(0, 10) ?? '—'} | enabled=${enable} | reminders=${created}`,
      );
    });
  }

  /** Toggle reminders on/off without changing the expiry date. */
  async setEnabled(documentId: string, enabled: boolean): Promise<void> {
    const doc = await this.prisma.document.findUnique({
      where: { id: documentId },
      select: { expiryDate: true },
    });
    if (!doc) return;

    await this.prisma.$transaction(async (tx) => {
      await tx.document.update({ where: { id: documentId }, data: { isReminderEnabled: enabled } });
      if (!enabled) {
        await this.regenerate(tx, documentId, null, []);
        return;
      }
      const pending = await tx.documentReminder.count({ where: { documentId, status: 'PENDING' } });
      if (pending === 0) {
        await this.regenerate(tx, documentId, doc.expiryDate, DEFAULT_OFFSET_DAYS);
      }
    });
  }

  /** Reminders fire at 09:00 UTC, `days` days before the expiry date. */
  remindAtFor(expiryDate: Date, days: number): Date {
    const at = this.endOfDayUtc(expiryDate);
    at.setUTCDate(at.getUTCDate() - days);
    at.setUTCHours(9, 0, 0, 0);
    return at;
  }

  private endOfDayUtc(d: Date): Date {
    const x = new Date(d);
    x.setUTCHours(23, 59, 59, 999);
    return x;
  }
}
