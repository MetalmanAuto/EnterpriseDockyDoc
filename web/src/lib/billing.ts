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
  storageBytes: number;
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
  storagePacks: { gb: number; priceUsd: number; priceInr: number }[];
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
    storageBytes: number;
    storageAllowedBytes: number;
    storagePackBytes: number;
    storagePackExpiresAt: string | null;
  };
  topUps: TopUp[];
  storagePacks: { gb: number; priceUsd: number; priceInr: number }[];
  subscription: {
    provider: 'RAZORPAY' | 'PADDLE';
    status: string;
    plan: PlanId;
    interval: string;
    currency: string;
    amount: number;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
  } | null;
  payments: { id: string; date: string; provider: string; kind: string; amount: number; currency: string; plan: PlanId | null; topUpActions: number | null; storageGb: number | null; reference: string }[];
}

export type Currency = 'INR' | 'USD';

export interface BillingConfig {
  razorpay: { enabled: boolean; keyId: string | null };
  paddle: { enabled: boolean; clientToken: string | null; env: 'sandbox' | 'production' };
}

export type CheckoutSession =
  | { mode: 'updated'; plan: PlanId; effective: 'now' | 'cycle_end' }
  | { mode: 'razorpay'; keyId: string; subscriptionId?: string; orderId?: string; amount: number; currency: string; email: string; name: string; description: string }
  | { mode: 'paddle'; clientToken: string; env: 'sandbox' | 'production'; priceId: string; email: string; customData: Record<string, string> };

export function fetchBillingConfig(): Promise<BillingConfig> {
  return apiFetch<BillingConfig>('/api/v1/billing/config');
}

export function startCheckout(plan: PlanId, interval: 'monthly' | 'yearly', currency: Currency): Promise<CheckoutSession> {
  return apiFetch<CheckoutSession>('/api/v1/billing/checkout', { method: 'POST', body: JSON.stringify({ plan, interval, currency }) });
}

export function startStoragePack(gb: 10 | 50, currency: Currency): Promise<CheckoutSession> {
  return apiFetch<CheckoutSession>('/api/v1/billing/storage', { method: 'POST', body: JSON.stringify({ gb, currency }) });
}

const GB = 1024 * 1024 * 1024;
/** "1.2 GB", "250 MB", or "Unlimited". */
export function storageLabel(bytes: number): string {
  if (bytes >= Number.MAX_SAFE_INTEGER / 2) return 'Unlimited';
  if (bytes >= GB) return `${bytes % GB === 0 || bytes >= 10 * GB ? Math.round(bytes / GB) : (bytes / GB).toFixed(1)} GB`;
  return `${Math.max(1, Math.round(bytes / (1024 * 1024)))} MB`;
}

export function startTopUp(actions: 100 | 500, currency: Currency): Promise<CheckoutSession> {
  return apiFetch<CheckoutSession>('/api/v1/billing/topup', { method: 'POST', body: JSON.stringify({ actions, currency }) });
}

export function confirmRazorpay(body: { razorpay_payment_id: string; razorpay_subscription_id?: string; razorpay_order_id?: string; razorpay_signature: string }): Promise<{ applied: 'subscription' | 'topup' | 'pending' }> {
  return apiFetch('/api/v1/billing/razorpay/confirm', { method: 'POST', body: JSON.stringify(body) });
}

export function cancelSubscription(): Promise<{ endsAt: string | null }> {
  return apiFetch('/api/v1/billing/cancel', { method: 'POST', body: '{}' });
}

/** INR for visitors in India (Vercel's country header, set as a cookie by the middleware), USD otherwise. */
export function defaultCurrency(): Currency {
  if (typeof document === 'undefined') return 'USD';
  const m = document.cookie.match(/(?:^|; )dd_country=([A-Z]{2})/);
  if (m) return m[1] === 'IN' ? 'INR' : 'USD';
  return typeof navigator !== 'undefined' && /-IN\b/i.test(navigator.language) ? 'INR' : 'USD';
}

export function formatMoney(amountMinor: number, currency: string): string {
  const v = amountMinor / 100;
  return currency === 'INR' ? `₹${v.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : `$${v.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
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
