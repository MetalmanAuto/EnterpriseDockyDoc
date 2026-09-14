import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { assertWorkspaceMembership } from '../../common/helpers/workspace-access.helper';
import type { DevUserPayload } from '../../common/guards/dev-auth.guard';
import { ReminderSchedulerService } from './reminder-scheduler.service';
import {
  ExpiringDocumentDto,
  UpcomingReminderDto,
} from './dto/reminder-query.dto';

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const DEFAULT_EXPIRING_WINDOW_DAYS = 90;
const MAX_EXPIRING_WINDOW_DAYS = 3650;
const SENT_HISTORY_DAYS = 30;

@Injectable()
export class RemindersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scheduler: ReminderSchedulerService,
  ) {}

  /**
   * Returns upcoming (PENDING) reminders plus recently delivered / failed ones
   * for all documents in a workspace, soonest first.
   */
  async getWorkspaceReminders(
    workspaceId: string,
    user: DevUserPayload,
  ): Promise<UpcomingReminderDto[]> {
    assertWorkspaceMembership(user, workspaceId);

    const historyCutoff = new Date(Date.now() - SENT_HISTORY_DAYS * MS_PER_DAY);

    const reminders = await this.prisma.documentReminder.findMany({
      where: {
        document: { workspaceId, status: { not: 'DELETED' } },
        OR: [
          { status: 'PENDING' },
          { status: 'FAILED' },
          { status: 'SENT', sentAt: { gte: historyCutoff } },
        ],
      },
      include: {
        document: { select: { name: true, expiryDate: true } },
      },
      orderBy: { remindAt: 'asc' },
    });

    return reminders.map((r) => ({
      id: r.id,
      documentId: r.documentId,
      documentName: r.document.name,
      remindAt: r.remindAt,
      channel: r.channel,
      status: r.status,
      sentAt: r.sentAt,
      lastError: r.lastError,
      expiryDate: r.document.expiryDate,
    }));
  }

  /**
   * Returns documents that are expired or expiring within `days` (default 90),
   * ordered by nearest expiry first.
   */
  async getExpiringDocuments(
    workspaceId: string,
    user: DevUserPayload,
    days?: number,
  ): Promise<ExpiringDocumentDto[]> {
    assertWorkspaceMembership(user, workspaceId);

    const windowDays = Math.min(
      Math.max(Math.trunc(days ?? DEFAULT_EXPIRING_WINDOW_DAYS), 1),
      MAX_EXPIRING_WINDOW_DAYS,
    );
    const now = new Date();
    const window = new Date(now.getTime() + windowDays * MS_PER_DAY);

    const docs = await this.prisma.document.findMany({
      where: {
        workspaceId,
        status: { not: 'DELETED' },
        expiryDate: { not: null, lte: window },
      },
      include: {
        folder: { select: { name: true } },
        owner: { select: { email: true } },
      },
      orderBy: { expiryDate: 'asc' },
    });

    return docs.map((d) => {
      const expiry = d.expiryDate!;
      const daysUntilExpiry = Math.round(
        (expiry.getTime() - now.getTime()) / MS_PER_DAY,
      );
      return {
        id: d.id,
        name: d.name,
        workspaceId: d.workspaceId,
        expiryDate: expiry,
        renewalDueDate: d.renewalDueDate,
        isReminderEnabled: d.isReminderEnabled,
        remindersSnoozedUntil: d.remindersSnoozedUntil,
        folderName: d.folder?.name ?? null,
        ownerEmail: d.owner.email,
        daysUntilExpiry,
      };
    });
  }

  /** Email the current user a sample reminder so they can confirm delivery works. */
  async sendTestEmail(
    workspaceId: string,
    user: DevUserPayload,
  ): Promise<{ delivered: boolean; to: string }> {
    assertWorkspaceMembership(user, workspaceId);

    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { name: true },
    });
    if (!workspace) throw new NotFoundException(`Workspace "${workspaceId}" not found`);

    const { delivered } = await this.scheduler.sendTest(user.email, workspace.name);
    return { delivered, to: user.email };
  }
}
