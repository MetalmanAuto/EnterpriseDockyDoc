'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { fetchPlans, limitLabel, type PlanId, type PlansResponse } from '@/lib/billing';

export type BillingCycle = 'monthly' | 'yearly';

interface Props {
  /** The signed-in account's plan, to mark "your plan". */
  currentPlan?: PlanId | null;
  /** Called when a plan button is pressed. Omit to render sign-up links instead. */
  onChoose?: (plan: PlanId, cycle: BillingCycle) => void;
  /** Where the buttons go when there is no onChoose (the public page). */
  signupHref?: string;
  /** Show rupee prices instead of dollars. */
  currency?: 'USD' | 'INR';
  /** Text under a disabled button, for example when payments are not open yet. */
  buttonsDisabledNote?: string;
  className?: string;
}

/**
 * The four public tiers side by side, with a monthly / yearly switch.
 * Used on the public pricing page and inside the app.
 */
export default function PricingTable({ currentPlan, onChoose, signupHref = '/register', currency = 'USD', buttonsDisabledNote, className }: Props) {
  const [data, setData] = useState<PlansResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cycle, setCycle] = useState<BillingCycle>('yearly');

  useEffect(() => {
    fetchPlans().then(setData).catch((e) => setError(e instanceof Error ? e.message : 'Could not load plans'));
  }, []);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!data) return <div className="h-96 rounded-2xl bg-surface-high animate-pulse" />;

  const money = (usd: number, inr: number) => (currency === 'INR' ? `₹${inr.toLocaleString('en-IN')}` : `$${usd}`);

  return (
    <div className={cn('space-y-6', className)}>
      <div className="flex items-center justify-center gap-2 text-sm">
        <button
          type="button"
          onClick={() => setCycle('monthly')}
          className={cn('px-3 h-9 rounded-lg border font-semibold', cycle === 'monthly' ? 'bg-brand-600 text-white border-brand-600' : 'border-stroke text-ink-2 hover:bg-surface-high')}
        >
          Monthly
        </button>
        <button
          type="button"
          onClick={() => setCycle('yearly')}
          className={cn('px-3 h-9 rounded-lg border font-semibold', cycle === 'yearly' ? 'bg-brand-600 text-white border-brand-600' : 'border-stroke text-ink-2 hover:bg-surface-high')}
        >
          Yearly <span className={cn('ml-1 text-xs font-normal', cycle === 'yearly' ? 'text-white/80' : 'text-ink-3')}>2 months free</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {data.plans.map((p) => {
          const isCurrent = currentPlan === p.plan;
          const highlight = p.plan === 'BUSINESS';
          const price = cycle === 'yearly' ? money(p.priceYearlyUsd, p.priceYearlyInr) : money(p.priceMonthlyUsd, p.priceMonthlyInr);
          const per = p.priceMonthlyUsd === 0 ? '' : cycle === 'yearly' ? ' / year' : ' / month';
          const monthlyEquivalent = cycle === 'yearly' && p.priceMonthlyUsd > 0
            ? `${money(Math.round((p.priceYearlyUsd / 12) * 100) / 100, Math.round(p.priceYearlyInr / 12))} a month, billed yearly`
            : p.priceMonthlyUsd > 0 ? 'billed monthly' : 'no card needed';
          return (
            <div
              key={p.plan}
              className={cn(
                'relative flex flex-col rounded-2xl border bg-surface p-5',
                highlight ? 'border-brand-500 shadow-[0_0_0_3px_var(--accent-ring)]' : 'border-stroke',
              )}
            >
              {highlight && (
                <span className="absolute -top-3 left-5 rounded-full bg-brand-600 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">Most popular</span>
              )}
              <h3 className="text-lg font-bold text-ink">{p.name}</h3>
              <p className="mt-1 text-xs text-ink-3 min-h-[2.5rem]">{p.tagline}</p>
              <p className="mt-4 text-3xl font-extrabold tracking-tight text-ink tabular-nums">
                {price}<span className="text-sm font-medium text-ink-3">{per}</span>
              </p>
              <p className="text-[11px] text-ink-3 mt-1">{monthlyEquivalent}</p>

              <ul className="mt-5 space-y-1.5 text-sm text-ink-2 flex-1">
                <Li>{limitLabel(p.documents)} documents</Li>
                <Li>{p.workspaces === 1 ? '1 workspace' : `${limitLabel(p.workspaces)} workspaces`}</Li>
                <Li>{p.membersPerWorkspace === 1 ? 'Just you' : `Up to ${limitLabel(p.membersPerWorkspace)} members per workspace`}</Li>
                <Li>{limitLabel(p.aiActionsPerMonth)} AI actions a month</Li>
                <Li>Expiry tracking and reminders</Li>
                <Li>{p.shareLinkControls ? 'Share links with password and expiry' : `Share links, open for ${data.freeShareLinkDays} days`}</Li>
                <Li muted={!p.apiAccess}>{p.apiAccess ? 'API, MCP and WhatsApp assistants' : 'No API access'}</Li>
                <Li muted={!p.crossWorkspaceGrants}>{p.crossWorkspaceGrants ? 'Grant members access across workspaces' : 'Single workspace'}</Li>
                <Li muted={!p.topUps}>{p.topUps ? 'Buy extra AI actions any time' : 'Upgrade for more AI actions'}</Li>
                <Li muted={!p.activityExport}>{p.activityExport ? 'Activity log export' : 'Activity log in the app'}</Li>
                <Li>Bin keeps deleted files {p.binRetentionDays} days</Li>
                <Li>{p.support}</Li>
              </ul>

              <div className="mt-5">
                {isCurrent ? (
                  <span className="block w-full h-10 leading-10 text-center rounded-lg border border-stroke text-sm font-semibold text-ink-2">Your plan</span>
                ) : onChoose ? (
                  <button
                    type="button"
                    onClick={() => onChoose(p.plan, cycle)}
                    disabled={!!buttonsDisabledNote}
                    className={cn('w-full h-10 rounded-lg text-sm font-semibold', highlight ? 'bg-brand-600 text-white hover:bg-brand-700' : 'border border-stroke text-ink hover:bg-surface-high', 'disabled:opacity-50')}
                  >
                    {p.plan === 'FREE' ? 'Switch to Free' : `Choose ${p.name}`}
                  </button>
                ) : (
                  <a
                    href={signupHref}
                    className={cn('block w-full h-10 leading-10 text-center rounded-lg text-sm font-semibold', highlight ? 'bg-brand-600 text-white hover:bg-brand-700' : 'border border-stroke text-ink hover:bg-surface-high')}
                  >
                    {p.plan === 'FREE' ? 'Start free' : `Start with ${p.name}`}
                  </a>
                )}
                {buttonsDisabledNote && !isCurrent && <p className="mt-1.5 text-[11px] text-ink-3 text-center">{buttonsDisabledNote}</p>}
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-center text-xs text-ink-3">
        One AI action reads one document of up to 20 pages, answers one assistant question, or serves one API request.
        Extra actions: {data.topUps.map((t) => `${t.actions} for ${money(t.priceUsd, t.priceInr)}`).join(', or ')}, valid 12 months.
        {currency === 'INR' ? ' Prices for companies exclude GST.' : ' Local taxes are added at checkout.'}
      </p>
    </div>
  );
}

function Li({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <li className={cn('flex items-start gap-2', muted && 'text-ink-3')}>
      <span aria-hidden className={cn('mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full', muted ? 'bg-stroke' : 'bg-brand-500')} />
      <span>{children}</span>
    </li>
  );
}
