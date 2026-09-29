import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { WorkspacePlan } from '@prisma/client';
import { randomInt } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { BillingService } from './billing.service';
import { PLANS, PLAN_RANK } from './plans';
import type { CreatePromoCodesDto } from './dto/promo.dto';

/** No 0, O, 1 or I, so a code read over the phone cannot be misheard. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MONTH_MS = 30.44 * 86_400_000;

export interface PromoCodeRow {
  id: string;
  code: string;
  plan: WorkspacePlan;
  months: number;
  maxUses: number | null;
  usedCount: number;
  expiresAt: string | null;
  note: string | null;
  disabledAt: string | null;
  createdAt: string;
  redemptions: { email: string; redeemedAt: string; planUntil: string }[];
}

/**
 * Codes that give a plan free for a number of months. An admin makes them,
 * a person types one on the Billing page, and the plan is set as
 * complimentary until the date, after which refreshPlan drops it to Free.
 */
@Injectable()
export class PromoService {
  private readonly logger = new Logger(PromoService.name);

  constructor(private readonly prisma: PrismaService, private readonly billing: BillingService, private readonly mail: MailService) {}

  // ---- admin --------------------------------------------------------- //

  async create(dto: CreatePromoCodesDto, createdById: string): Promise<PromoCodeRow[]> {
    const count = dto.code ? 1 : (dto.count ?? 1);
    if (dto.code && dto.count && dto.count > 1) throw new BadRequestException('A custom code can only be made once; leave "count" out.');
    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    if (expiresAt && expiresAt.getTime() < Date.now()) throw new BadRequestException('The expiry date is in the past.');

    const codes: string[] = [];
    if (dto.code) {
      const custom = canonical(dto.code);
      if (await this.prisma.promoCode.findUnique({ where: { code: custom } })) throw new BadRequestException(`The code ${custom} already exists.`);
      codes.push(custom);
    } else {
      while (codes.length < count) {
        const c = generate();
        if (!codes.includes(c) && !(await this.prisma.promoCode.findUnique({ where: { code: c } }))) codes.push(c);
      }
    }

    const rows = await this.prisma.$transaction(
      codes.map((code) => this.prisma.promoCode.create({
        data: { code, plan: dto.plan, months: dto.months, maxUses: dto.maxUses ?? 1, expiresAt, note: dto.note?.trim() || null, createdById },
        include: { redemptions: { include: { user: { select: { email: true } } } } },
      })),
    );
    this.logger.log(`${rows.length} promo code(s) made for ${dto.plan}, ${dto.months} months, by ${createdById}`);
    return rows.map(toRow);
  }

  async list(): Promise<PromoCodeRow[]> {
    const rows = await this.prisma.promoCode.findMany({
      orderBy: { createdAt: 'desc' },
      include: { redemptions: { include: { user: { select: { email: true } } }, orderBy: { redeemedAt: 'desc' } } },
    });
    return rows.map(toRow);
  }

  async disable(id: string): Promise<PromoCodeRow> {
    const row = await this.prisma.promoCode.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Code not found');
    const updated = await this.prisma.promoCode.update({
      where: { id },
      data: { disabledAt: row.disabledAt ?? new Date() },
      include: { redemptions: { include: { user: { select: { email: true } } } } },
    });
    return toRow(updated);
  }

  // ---- redeeming ----------------------------------------------------- //

  async redeem(userId: string, rawCode: string): Promise<{ plan: WorkspacePlan; planName: string; until: string }> {
    const code = await this.prisma.promoCode.findUnique({ where: { code: canonical(rawCode) } });
    const bad = (why: string) => new BadRequestException(why);
    if (!code) throw bad('That code does not exist. Check the letters and try again.');
    if (code.disabledAt) throw bad('That code has been withdrawn.');
    if (code.expiresAt && code.expiresAt.getTime() < Date.now()) throw bad('That code has expired.');
    if (await this.prisma.promoRedemption.findUnique({ where: { codeId_userId: { codeId: code.id, userId } } })) {
      throw bad('You have already used this code.');
    }
    if (code.maxUses !== null && code.usedCount >= code.maxUses) throw bad('That code has already been used the maximum number of times.');

    const account = await this.billing.getAccount(userId);
    if (account.subscription && account.subscription.status !== 'CANCELLED') {
      throw bad('You have a paid subscription. Cancel it from this page first; the code can be used once it has ended.');
    }
    if (PLAN_RANK[account.plan] > PLAN_RANK[code.plan] && !(account.planSource === 'expired')) {
      throw bad(`You are already on ${account.planName}, which is above what this code gives.`);
    }
    // Setting a plan re-plans every workspace the person owns, so never let a
    // code pull an Enterprise or Team workspace down.
    const higher = await this.prisma.workspaceUser.findFirst({
      where: { userId, role: 'OWNER', status: 'ACTIVE', workspace: { plan: { in: (Object.keys(PLAN_RANK) as WorkspacePlan[]).filter((p) => PLAN_RANK[p] > PLAN_RANK[code.plan]) } } },
      select: { workspace: { select: { name: true, plan: true } } },
    });
    if (higher) throw bad(`Your workspace "${higher.workspace.name}" is on ${PLANS[higher.workspace.plan].name}, which is above what this code gives.`);

    // Same plan already running as a gift: add the months on the end rather than restart.
    const base = account.plan === code.plan && account.planSource === 'complimentary' && account.planRenewsAt && new Date(account.planRenewsAt).getTime() > Date.now()
      ? new Date(account.planRenewsAt).getTime()
      : Date.now();
    const until = new Date(base + code.months * MONTH_MS);

    // Take a use atomically, so two people cannot both get the last one.
    const taken = await this.prisma.promoCode.updateMany({
      where: { id: code.id, disabledAt: null, ...(code.maxUses !== null && { usedCount: { lt: code.maxUses } }) },
      data: { usedCount: { increment: 1 } },
    });
    if (taken.count === 0) throw bad('That code has just been used up.');

    await this.prisma.promoRedemption.create({ data: { codeId: code.id, userId, planBefore: account.plan, planUntil: until } });
    await this.billing.setPlan(userId, code.plan, { source: 'complimentary', renewsAt: until });
    this.logger.log(`Promo ${code.code} redeemed by ${userId}: ${code.plan} until ${until.toISOString()}`);

    const planName = PLANS[code.plan].name;
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (user) {
      try {
        await this.mail.send({
          to: [user.email],
          subject: `Your DockyDoc ${planName} plan is on`,
          html: `<p>Your code has been applied. Your account is on the ${planName} plan until ${until.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}, at no charge.</p><p>When it ends the account goes back to Free, with your documents intact; you can pick a paid plan any time before that from the Billing page.</p>`,
        });
      } catch (err) {
        this.logger.warn(`Promo mail to ${user.email} failed: ${(err as Error).message}`);
      }
    }
    return { plan: code.plan, planName, until: until.toISOString() };
  }
}

/** Upper case, no spaces; dashes kept so "DD-7K2M-9QXH" matches what was printed. */
function canonical(raw: string): string {
  const compact = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  // Generated codes are DD + 8 characters; re-insert their dashes so a code typed without them still matches.
  if (/^DD[A-Z0-9]{8}$/.test(compact)) return `DD-${compact.slice(2, 6)}-${compact.slice(6)}`;
  return raw.toUpperCase().trim().replace(/\s+/g, '');
}

function generate(): string {
  let s = '';
  for (let i = 0; i < 8; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return `DD-${s.slice(0, 4)}-${s.slice(4)}`;
}

type RowWithRedemptions = {
  id: string; code: string; plan: WorkspacePlan; months: number; maxUses: number | null; usedCount: number;
  expiresAt: Date | null; note: string | null; disabledAt: Date | null; createdAt: Date;
  redemptions: { redeemedAt: Date; planUntil: Date; user: { email: string } }[];
};

function toRow(r: RowWithRedemptions): PromoCodeRow {
  return {
    id: r.id, code: r.code, plan: r.plan, months: r.months, maxUses: r.maxUses, usedCount: r.usedCount,
    expiresAt: r.expiresAt?.toISOString() ?? null, note: r.note, disabledAt: r.disabledAt?.toISOString() ?? null, createdAt: r.createdAt.toISOString(),
    redemptions: r.redemptions.map((x) => ({ email: x.user.email, redeemedAt: x.redeemedAt.toISOString(), planUntil: x.planUntil.toISOString() })),
  };
}
