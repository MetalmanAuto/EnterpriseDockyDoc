import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { DocumentStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { STORAGE_SERVICE } from '../storage/storage.module';
import type { IStorageService } from '../storage/storage.interface';
import { AuditService, AuditAction, AuditEntityType } from '../audit/audit.service';
import { BillingService } from '../billing/billing.service';
import { PLANS } from '../billing/plans';
import { AlertsService } from '../alerts/alerts.service';

const DAY = 86_400_000;

export interface RetentionRunResult {
  shredded: number;
  binned: number;
  skippedOnHold: number;
  errors: number;
}

/**
 * Two nightly jobs that keep the retention promises on the pricing page:
 *
 * 1. The bin empties itself. A deleted document is shredded (file and row)
 *    once it has sat in the bin for the workspace's retention period,
 *    capped by the owner's plan.
 * 2. Folder retention policies. A folder can say "delete documents N days
 *    after they expire (or after upload if they have no expiry)"; matching
 *    documents move to the bin, from where rule 1 takes over.
 *
 * A document on legal hold is never touched by either.
 */
@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name);
  private readonly enabled: boolean;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_SERVICE) private readonly storage: IStorageService,
    private readonly audit: AuditService,
    private readonly billing: BillingService,
    private readonly alerts: AlertsService,
    config: ConfigService,
  ) {
    this.enabled = config.get<string>('ENABLE_SCHEDULER') !== 'false';
  }

  @Cron('0 3 * * *')
  async nightly(): Promise<void> {
    if (!this.enabled || this.running) return;
    this.running = true;
    try {
      const result = await this.run();
      this.logger.log(`Retention run: shredded=${result.shredded} binned=${result.binned} onHold=${result.skippedOnHold} errors=${result.errors}`);
      if (result.errors > 0) {
        this.alerts.notify('retention_errors', `Retention job had ${result.errors} error(s)`, `Nightly retention finished with ${result.errors} error(s). Shredded ${result.shredded}, binned ${result.binned}. Check the API logs around 03:00 UTC.`);
      }
    } catch (err) {
      this.logger.error(`Retention run crashed: ${(err as Error).message}`);
      this.alerts.notify('retention_crash', 'Retention job crashed', (err as Error).message);
    } finally {
      this.running = false;
    }
  }

  async run(): Promise<RetentionRunResult> {
    const result: RetentionRunResult = { shredded: 0, binned: 0, skippedOnHold: 0, errors: 0 };
    await this.applyFolderPolicies(result);
    await this.emptyBins(result);
    return result;
  }

  /** How long a workspace keeps deleted documents: its own setting, capped by the owner's plan. */
  async effectiveBinDays(workspaceId: string): Promise<number> {
    const [ws, owner] = await Promise.all([
      this.prisma.workspace.findUnique({ where: { id: workspaceId }, select: { trashRetentionDays: true } }),
      this.billing.ownerOfWorkspace(workspaceId).catch(() => null),
    ]);
    const planMax = owner ? PLANS[owner.plan].binRetentionDays : 30;
    return Math.max(1, Math.min(ws?.trashRetentionDays ?? 30, planMax));
  }

  private async emptyBins(result: RetentionRunResult): Promise<void> {
    const workspaces = await this.prisma.workspace.findMany({
      where: { documents: { some: { status: DocumentStatus.DELETED } } },
      select: { id: true },
    });
    for (const { id: workspaceId } of workspaces) {
      const days = await this.effectiveBinDays(workspaceId);
      const cutoff = new Date(Date.now() - days * DAY);
      const due = await this.prisma.document.findMany({
        where: { workspaceId, status: DocumentStatus.DELETED, updatedAt: { lt: cutoff } },
        select: { id: true, name: true, legalHold: true, versions: { select: { storageKey: true } } },
      });
      for (const doc of due) {
        if (doc.legalHold) {
          result.skippedOnHold++;
          continue;
        }
        try {
          for (const v of doc.versions) {
            try {
              await this.storage.delete(v.storageKey);
            } catch {
              /* already gone */
            }
          }
          await this.prisma.document.delete({ where: { id: doc.id } });
          this.audit.log({ workspaceId, userId: null, action: AuditAction.DOCUMENT_SHREDDED, entityType: AuditEntityType.DOCUMENT, entityId: doc.id, metadata: { documentName: doc.name, reason: `bin retention ${days} days` } });
          result.shredded++;
        } catch (err) {
          result.errors++;
          this.logger.error(`Could not shred ${doc.id}: ${(err as Error).message}`);
        }
      }
    }
  }

  private async applyFolderPolicies(result: RetentionRunResult): Promise<void> {
    const folders = await this.prisma.folder.findMany({
      where: { retentionDays: { not: null }, deletedAt: null },
      select: { id: true, workspaceId: true, name: true, retentionDays: true },
    });
    const now = Date.now();
    for (const folder of folders) {
      const days = folder.retentionDays!;
      const cutoff = new Date(now - days * DAY);
      // Expired documents: expiry + N days has passed. No expiry: upload + N days has passed.
      const due = await this.prisma.document.findMany({
        where: {
          folderId: folder.id,
          status: DocumentStatus.ACTIVE,
          OR: [{ expiryDate: { lt: cutoff } }, { expiryDate: null, createdAt: { lt: cutoff } }],
        },
        select: { id: true, name: true, legalHold: true },
      });
      for (const doc of due) {
        if (doc.legalHold) {
          result.skippedOnHold++;
          continue;
        }
        try {
          await this.prisma.document.update({ where: { id: doc.id }, data: { status: DocumentStatus.DELETED } });
          this.audit.log({ workspaceId: folder.workspaceId, userId: null, action: AuditAction.DOCUMENT_DELETED, entityType: AuditEntityType.DOCUMENT, entityId: doc.id, metadata: { documentName: doc.name, reason: `folder "${folder.name}" retention ${days} days` } });
          result.binned++;
        } catch (err) {
          result.errors++;
          this.logger.error(`Could not bin ${doc.id}: ${(err as Error).message}`);
        }
      }
    }
  }
}
