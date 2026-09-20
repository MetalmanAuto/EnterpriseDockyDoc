import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { WorkspacePlan, DocumentStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PlanLimitException } from '../../common/exceptions/plan-limit.exception';
import { AlertsService } from '../alerts/alerts.service';
import { FREE_SHARE_LINK_DAYS, PLAN_RANK, PLANS, TOP_UPS, PUBLIC_PLANS, isUnlimited, nextPlanWith, type PlanLimits } from './plans';

const DAY = 86_400_000;

export interface AccountSummary {
  plan: WorkspacePlan;
  planName: string;
  planSource: string | null;
  planRenewsAt: string | null;
  limits: PlanLimits;
  usage: {
    aiActionsUsed: number;
    aiActionsIncluded: number;
    aiCreditActions: number;
    aiActionsRemaining: number;
    periodStart: string;
    periodEnd: string;
    documents: number;
    workspaces: number;
  };
  topUps: typeof TOP_UPS;
}

type PlanUser = {
  id: string;
  plan: WorkspacePlan;
  planSource: string | null;
  planRenewsAt: Date | null;
  aiActionsUsed: number;
  aiActionsPeriodStart: Date;
  aiCreditActions: number;
};

const PLAN_USER_SELECT = {
  id: true, plan: true, planSource: true, planRenewsAt: true,
  aiActionsUsed: true, aiActionsPeriodStart: true, aiCreditActions: true,
} as const;

/**
 * Plans, limits and AI-action metering. The plan belongs to a person and
 * covers every workspace they own; a workspace's members spend the owner's
 * allowance. Every check throws a 402 with an upgrade hint when it fails.
 */
@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  private dailyActions = { day: '', count: 0 };

  constructor(private readonly prisma: PrismaService, private readonly alerts: AlertsService) {}

  /** Platform-wide guard: a day with far more AI actions than usual gets a person's eyes on it. */
  private countPlatformActions(count: number): void {
    const day = new Date().toISOString().slice(0, 10);
    if (this.dailyActions.day !== day) this.dailyActions = { day, count: 0 };
    this.dailyActions.count += count;
    const guard = Number(process.env.AI_DAILY_ACTION_ALERT ?? 2000);
    if (this.dailyActions.count >= guard) {
      this.alerts.notify('ai_daily_spend', `AI actions today passed ${guard}`, `${this.dailyActions.count} AI actions have been charged so far on ${day}, above the AI_DAILY_ACTION_ALERT guard of ${guard}. At about 2 cents each that is roughly $${(this.dailyActions.count * 0.02).toFixed(0)} of model spend today. Check the admin page for who is driving it.`);
    }
  }

  // ---- reading ------------------------------------------------------ //

  plansForDisplay() {
    return {
      plans: PUBLIC_PLANS.map((plan) => ({ plan, ...PLANS[plan] })),
      topUps: TOP_UPS,
      freeShareLinkDays: FREE_SHARE_LINK_DAYS,
    };
  }

  async getAccount(userId: string): Promise<AccountSummary> {
    const user = await this.loadUser(userId);
    const limits = PLANS[user.plan];
    const [workspaces, documents] = await Promise.all([this.ownedWorkspaceIds(userId), this.ownedDocumentCount(userId)]);
    const included = limits.aiActionsPerMonth;
    const remaining = isUnlimited(included) ? included : Math.max(0, included - user.aiActionsUsed) + user.aiCreditActions;
    return {
      plan: user.plan,
      planName: limits.name,
      planSource: user.planSource,
      planRenewsAt: user.planRenewsAt?.toISOString() ?? null,
      limits,
      usage: {
        aiActionsUsed: user.aiActionsUsed,
        aiActionsIncluded: included,
        aiCreditActions: user.aiCreditActions,
        aiActionsRemaining: remaining,
        periodStart: user.aiActionsPeriodStart.toISOString(),
        periodEnd: addMonths(user.aiActionsPeriodStart, 1).toISOString(),
        documents,
        workspaces: workspaces.length,
      },
      topUps: TOP_UPS,
    };
  }

  /** The person whose plan governs a workspace: its owner. */
  async ownerOfWorkspace(workspaceId: string): Promise<PlanUser> {
    const owner = await this.prisma.workspaceUser.findFirst({
      where: { workspaceId, role: 'OWNER', status: 'ACTIVE' },
      select: { user: { select: PLAN_USER_SELECT } },
      orderBy: { createdAt: 'asc' },
    });
    if (!owner) throw new NotFoundException(`Workspace "${workspaceId}" has no owner`);
    return this.refreshPlan(owner.user);
  }

  // ---- limits ------------------------------------------------------- //

  async assertDocumentQuota(workspaceId: string): Promise<void> {
    const owner = await this.ownerOfWorkspace(workspaceId);
    const limit = PLANS[owner.plan].documents;
    if (isUnlimited(limit)) return;
    const count = await this.ownedDocumentCount(owner.id);
    if (count >= limit) {
      throw new PlanLimitException(
        'documents_limit',
        `The ${PLANS[owner.plan].name} plan holds ${limit} documents and this account has ${count}. Upgrade to add more, or delete documents you no longer need.`,
        owner.plan,
        nextPlanWith((p) => p.documents > limit, owner.plan),
      );
    }
  }

  async assertWorkspaceQuota(userId: string): Promise<void> {
    const user = await this.loadUser(userId);
    const limit = PLANS[user.plan].workspaces;
    if (isUnlimited(limit)) return;
    const owned = await this.ownedWorkspaceIds(userId);
    if (owned.length >= limit) {
      throw new PlanLimitException(
        'workspaces_limit',
        limit === 1
          ? `The ${PLANS[user.plan].name} plan includes one workspace. Upgrade to Business for three.`
          : `The ${PLANS[user.plan].name} plan includes ${limit} workspaces and this account owns ${owned.length}.`,
        user.plan,
        nextPlanWith((p) => p.workspaces > limit, user.plan),
      );
    }
  }

  async assertMemberQuota(workspaceId: string): Promise<void> {
    const owner = await this.ownerOfWorkspace(workspaceId);
    const limit = PLANS[owner.plan].membersPerWorkspace;
    if (isUnlimited(limit)) return;
    const members = await this.prisma.workspaceUser.count({ where: { workspaceId, status: 'ACTIVE' } });
    if (members >= limit) {
      throw new PlanLimitException(
        'members_limit',
        limit === 1
          ? `The Free plan is for one person. Upgrade to Personal to add up to 3 members.`
          : `The ${PLANS[owner.plan].name} plan allows ${limit} members per workspace and this one has ${members}.`,
        owner.plan,
        nextPlanWith((p) => p.membersPerWorkspace > limit, owner.plan),
      );
    }
  }

  assertApiAccess(user: { plan: WorkspacePlan }): void {
    if (!PLANS[user.plan].apiAccess) {
      throw new PlanLimitException(
        'api_requires_business',
        'API keys, REST and MCP access are part of the Business plan and above.',
        user.plan,
        'BUSINESS',
      );
    }
  }

  async assertCrossWorkspaceGrants(workspaceId: string): Promise<void> {
    const owner = await this.ownerOfWorkspace(workspaceId);
    if (!PLANS[owner.plan].crossWorkspaceGrants) {
      throw new PlanLimitException(
        'cross_workspace_requires_business',
        'Granting members access to other workspaces is part of the Business plan and above.',
        owner.plan,
        'BUSINESS',
      );
    }
  }

  async assertActivityExport(workspaceId: string): Promise<void> {
    const owner = await this.ownerOfWorkspace(workspaceId);
    if (!PLANS[owner.plan].activityExport) {
      throw new PlanLimitException(
        'activity_export_requires_business',
        'Activity log export is part of the Business plan and above.',
        owner.plan,
        'BUSINESS',
      );
    }
  }

  /**
   * Free share links: no password, and they stop working after 7 days.
   * Returns the expiry the link must use.
   */
  async shareLinkExpiry(workspaceId: string, requested: { password?: string; expiresAt?: Date | null }): Promise<Date | null> {
    const owner = await this.ownerOfWorkspace(workspaceId);
    if (PLANS[owner.plan].shareLinkControls) return requested.expiresAt ?? null;
    if (requested.password) {
      throw new PlanLimitException(
        'share_controls_require_paid',
        'Password-protected share links are part of the Personal plan and above. Free links stay open for 7 days.',
        owner.plan,
        'PERSONAL',
      );
    }
    const cap = new Date(Date.now() + FREE_SHARE_LINK_DAYS * DAY);
    return requested.expiresAt && requested.expiresAt < cap ? requested.expiresAt : cap;
  }

  // ---- AI actions ---------------------------------------------------- //

  /** Charge a workspace's owner for AI work done in that workspace. BYOK workspaces are not metered. */
  async chargeAiActions(workspaceId: string, count: number, reason: string): Promise<void> {
    const ws = await this.prisma.workspace.findUnique({ where: { id: workspaceId }, select: { aiProvider: true } });
    if (ws?.aiProvider === 'BYOK') return;
    const owner = await this.ownerOfWorkspace(workspaceId);
    await this.chargeUserAiActions(owner.id, count, reason);
  }

  /** Charge a person directly (API calls made with their key). */
  async chargeUserAiActions(userId: string, count: number, reason: string): Promise<void> {
    const user = await this.loadUser(userId);
    const included = PLANS[user.plan].aiActionsPerMonth;
    if (isUnlimited(included)) {
      await this.prisma.user.update({ where: { id: userId }, data: { aiActionsUsed: { increment: count } } });
      this.countPlatformActions(count);
      return;
    }
    const fromAllowance = Math.max(0, Math.min(count, included - user.aiActionsUsed));
    const fromCredits = count - fromAllowance;
    if (fromCredits > user.aiCreditActions) {
      const left = Math.max(0, included - user.aiActionsUsed) + user.aiCreditActions;
      throw new PlanLimitException(
        'ai_actions_exhausted',
        left === 0
          ? `This account has used all ${included} AI actions for the month${user.aiCreditActions === 0 && PLANS[user.plan].topUps ? '. Buy a top-up or upgrade to keep going' : PLANS[user.plan].topUps ? '' : '. Upgrade to keep going'}.`
          : `This needs ${count} AI actions and the account has ${left} left this month.`,
        user.plan,
        nextPlanWith((p) => p.aiActionsPerMonth > included, user.plan),
      );
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        aiActionsUsed: { increment: fromAllowance },
        aiCreditActions: fromCredits ? { decrement: fromCredits } : undefined,
      },
    });
    this.countPlatformActions(count);
    this.logger.log(`AI actions: ${count} for ${reason} on ${userId} (${fromAllowance} from allowance, ${fromCredits} from credits)`);
  }

  async addCredits(userId: string, actions: number): Promise<void> {
    await this.prisma.user.update({ where: { id: userId }, data: { aiCreditActions: { increment: actions } } });
  }

  // ---- plan changes -------------------------------------------------- //

  /** Set a person's plan and mirror it on every workspace they own. */
  async setPlan(userId: string, plan: WorkspacePlan, opts: { source: string; renewsAt: Date | null }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { plan, planSource: opts.source, planRenewsAt: opts.renewsAt } });
      await tx.workspace.updateMany({
        where: { members: { some: { userId, role: 'OWNER', status: 'ACTIVE' } } },
        data: { plan },
      });
    });
    this.logger.log(`Plan for ${userId} set to ${plan} (${opts.source}${opts.renewsAt ? `, until ${opts.renewsAt.toISOString().slice(0, 10)}` : ''})`);
  }

  assistantModelFor(plan: WorkspacePlan): string {
    return PLANS[plan].assistantModel;
  }

  rank(plan: WorkspacePlan): number {
    return PLAN_RANK[plan];
  }

  // ---- internals ---------------------------------------------------- //

  private async loadUser(userId: string): Promise<PlanUser> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: PLAN_USER_SELECT });
    if (!user) throw new NotFoundException(`User "${userId}" not found`);
    return this.refreshPlan(user);
  }

  /**
   * Two lazy housekeeping jobs, done whenever a plan is read: start a new
   * monthly period when the old one has ended, and drop an expired
   * complimentary plan back to Free.
   */
  private async refreshPlan(user: PlanUser): Promise<PlanUser> {
    const now = new Date();
    let changed = false;
    if (user.planSource === 'complimentary' && user.planRenewsAt && user.planRenewsAt < now && user.plan !== 'FREE') {
      await this.setPlan(user.id, 'FREE', { source: 'expired', renewsAt: null });
      user = { ...user, plan: 'FREE', planSource: 'expired', planRenewsAt: null };
    }
    let periodStart = user.aiActionsPeriodStart;
    while (addMonths(periodStart, 1) <= now) {
      periodStart = addMonths(periodStart, 1);
      changed = true;
    }
    if (changed) {
      await this.prisma.user.update({ where: { id: user.id }, data: { aiActionsUsed: 0, aiActionsPeriodStart: periodStart } });
      user = { ...user, aiActionsUsed: 0, aiActionsPeriodStart: periodStart };
    }
    return user;
  }

  private async ownedWorkspaceIds(userId: string): Promise<string[]> {
    const rows = await this.prisma.workspaceUser.findMany({
      where: { userId, role: 'OWNER', status: 'ACTIVE', workspace: { status: 'ACTIVE' } },
      select: { workspaceId: true },
    });
    return rows.map((r) => r.workspaceId);
  }

  private async ownedDocumentCount(userId: string): Promise<number> {
    const ids = await this.ownedWorkspaceIds(userId);
    if (ids.length === 0) return 0;
    return this.prisma.document.count({ where: { workspaceId: { in: ids }, status: { not: DocumentStatus.DELETED } } });
  }
}

function addMonths(d: Date, months: number): Date {
  const out = new Date(d);
  out.setUTCMonth(out.getUTCMonth() + months);
  return out;
}
