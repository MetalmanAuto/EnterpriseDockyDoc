import { WorkspacePlan } from '@prisma/client';

/**
 * The four tiers people can buy, plus ENTERPRISE, which is the internal
 * unlimited tier for the platform's own accounts and hand-arranged deals.
 * Prices here are display values; the payment processors hold the real ones.
 */
export interface PlanLimits {
  name: string;
  tagline: string;
  priceMonthlyUsd: number;
  priceYearlyUsd: number;
  priceMonthlyInr: number;
  priceYearlyInr: number;
  /** Documents across every workspace the account owns. */
  documents: number;
  /** Workspaces the account may own. */
  workspaces: number;
  membersPerWorkspace: number;
  aiActionsPerMonth: number;
  apiAccess: boolean;
  /** Password and custom expiry on share links. */
  shareLinkControls: boolean;
  crossWorkspaceGrants: boolean;
  topUps: boolean;
  activityExport: boolean;
  binRetentionDays: number;
  /** File storage across every workspace the account owns, in bytes (the bin counts). */
  storageBytes: number;
  assistantModel: string;
  support: string;
}

export const UNLIMITED = Number.MAX_SAFE_INTEGER;
export const GB = 1024 * 1024 * 1024;

export const PLANS: Record<WorkspacePlan, PlanLimits> = {
  FREE: {
    name: 'Free',
    tagline: 'Try it with a handful of documents',
    priceMonthlyUsd: 0, priceYearlyUsd: 0, priceMonthlyInr: 0, priceYearlyInr: 0,
    documents: 10, workspaces: 1, membersPerWorkspace: 1, aiActionsPerMonth: 10,
    apiAccess: false, shareLinkControls: false, crossWorkspaceGrants: false, topUps: false, activityExport: false,
    binRetentionDays: 30, storageBytes: 1 * GB, assistantModel: 'claude-sonnet-5', support: 'Help pages and the in-app assistant',
  },
  PERSONAL: {
    name: 'Personal',
    tagline: 'One person or family: passports, visas, insurance, licences',
    priceMonthlyUsd: 6, priceYearlyUsd: 60, priceMonthlyInr: 499, priceYearlyInr: 4999,
    documents: 100, workspaces: 1, membersPerWorkspace: 3, aiActionsPerMonth: 50,
    apiAccess: false, shareLinkControls: true, crossWorkspaceGrants: false, topUps: true, activityExport: false,
    binRetentionDays: 30, storageBytes: 5 * GB, assistantModel: 'claude-sonnet-5', support: 'Email, 2 working days',
  },
  BUSINESS: {
    name: 'Business',
    tagline: 'Small companies and consultants: compliance documents, contracts, API access',
    priceMonthlyUsd: 23, priceYearlyUsd: 230, priceMonthlyInr: 1899, priceYearlyInr: 18999,
    documents: 1000, workspaces: 3, membersPerWorkspace: 10, aiActionsPerMonth: 300,
    apiAccess: true, shareLinkControls: true, crossWorkspaceGrants: true, topUps: true, activityExport: true,
    binRetentionDays: 90, storageBytes: 25 * GB, assistantModel: 'claude-sonnet-5', support: 'Email, 1 working day',
  },
  TEAM: {
    name: 'Team',
    tagline: 'Firms with several workspaces and 10 to 25 people',
    priceMonthlyUsd: 59, priceYearlyUsd: 590, priceMonthlyInr: 4899, priceYearlyInr: 48999,
    documents: 5000, workspaces: 10, membersPerWorkspace: 25, aiActionsPerMonth: 1000,
    apiAccess: true, shareLinkControls: true, crossWorkspaceGrants: true, topUps: true, activityExport: true,
    binRetentionDays: 90, storageBytes: 100 * GB, assistantModel: 'claude-opus-5', support: 'Priority email and an onboarding call',
  },
  ENTERPRISE: {
    name: 'Enterprise',
    tagline: 'Arranged directly',
    priceMonthlyUsd: 0, priceYearlyUsd: 0, priceMonthlyInr: 0, priceYearlyInr: 0,
    documents: UNLIMITED, workspaces: UNLIMITED, membersPerWorkspace: UNLIMITED, aiActionsPerMonth: UNLIMITED,
    apiAccess: true, shareLinkControls: true, crossWorkspaceGrants: true, topUps: true, activityExport: true,
    binRetentionDays: 365, storageBytes: UNLIMITED, assistantModel: 'claude-opus-5', support: 'Direct',
  },
};

/** Higher rank means more. Used for "Business and above" checks. */
export const PLAN_RANK: Record<WorkspacePlan, number> = { FREE: 0, PERSONAL: 1, BUSINESS: 2, TEAM: 3, ENTERPRISE: 4 };

/** The tiers shown on the pricing page, in order. */
export const PUBLIC_PLANS: WorkspacePlan[] = ['FREE', 'PERSONAL', 'BUSINESS', 'TEAM'];

export const TOP_UPS = [
  { actions: 100, priceUsd: 5, priceInr: 399 },
  { actions: 500, priceUsd: 20, priceInr: 1599 },
];

/**
 * Extra file storage, sold for 12 months at a time (S3 costs about $0.023 per
 * GB a month, so 10 GB for a year costs under $3 to serve). Paid plans only.
 */
export const STORAGE_PACKS = [
  { gb: 10, priceUsd: 10, priceInr: 799 },
  { gb: 50, priceUsd: 40, priceInr: 3199 },
];
export const STORAGE_PACK_MONTHS = 12;

/** Free share links stop working after this many days. */
export const FREE_SHARE_LINK_DAYS = 7;

/**
 * One AI action reads a document of up to 20 pages. Long scans cost more
 * because OCR and the model read every page.
 */
export function actionsForPages(pageCount: number): number {
  if (pageCount > 50) return 3;
  if (pageCount > 20) return 2;
  return 1;
}

export function isUnlimited(n: number): boolean {
  return n >= UNLIMITED;
}

/** The smallest tier that includes a feature or a bigger allowance, for upgrade hints. */
export function nextPlanWith(pick: (p: PlanLimits) => boolean, from: WorkspacePlan): WorkspacePlan | null {
  for (const plan of PUBLIC_PLANS) {
    if (PLAN_RANK[plan] > PLAN_RANK[from] && pick(PLANS[plan])) return plan;
  }
  return null;
}
