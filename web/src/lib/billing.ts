/**
 * Plans and AI-action usage. Mirrors api/src/modules/billing.
 */
import { apiFetch } from './api';

export type PlanId = 'FREE' | 'PERSONAL' | 'BUSINESS' | 'TEAM' | 'ENTERPRISE';

export interface PlanLimits {
  name: string;
  tagline: string;
  priceMonthlyUsd: number;
  priceYearlyUsd: number;
  priceMonthlyInr: number;
  priceYearlyInr: number;
  documents: number;
  workspaces: number;
  membersPerWorkspace: number;
  aiActionsPerMonth: number;
  apiAccess: boolean;
  shareLinkControls: boolean;
  crossWorkspaceGrants: boolean;
  topUps: boolean;
  activityExport: boolean;
  binRetentionDays: number;
  assistantModel: string;
  support: string;
}

export interface TopUp {
  actions: number;
  priceUsd: number;
  priceInr: number;
}

export interface PlansResponse {
  plans: (PlanLimits & { plan: PlanId })[];
  topUps: TopUp[];
  freeShareLinkDays: number;
}

export interface AccountSummary {
  plan: PlanId;
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
  topUps: TopUp[];
}

/** Public, no sign-in needed. */
export async function fetchPlans(): Promise<PlansResponse> {
  const res = await fetch('/api/v1/billing/plans');
  if (!res.ok) throw new Error('Could not load plans');
  return res.json();
}

export function fetchBillingAccount(): Promise<AccountSummary> {
  return apiFetch<AccountSummary>('/api/v1/billing/account');
}

export const PLAN_RANK: Record<PlanId, number> = { FREE: 0, PERSONAL: 1, BUSINESS: 2, TEAM: 3, ENTERPRISE: 4 };

export const UNLIMITED_THRESHOLD = 1_000_000_000;

export function limitLabel(n: number): string {
  return n >= UNLIMITED_THRESHOLD ? 'Unlimited' : n.toLocaleString('en-IN');
}
