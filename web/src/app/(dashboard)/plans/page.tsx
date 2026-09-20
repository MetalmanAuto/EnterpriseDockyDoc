'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useUser } from '@/context/UserContext';
import PricingTable from '@/components/billing/PricingTable';
import ConfirmModal from '@/components/ui/ConfirmModal';
import { useToast } from '@/components/ui/Toast';
import { ApiError } from '@/lib/api';
import { runCheckout } from '@/lib/checkout';
import { cancelSubscription, defaultCurrency, fetchBillingAccount, fetchBillingConfig, limitLabel, startCheckout, type AccountSummary, type BillingConfig, type Currency, type PlanId } from '@/lib/billing';
import { cn } from '@/lib/utils';

/**
 * Plans, seen from inside the app. Choosing a paid plan opens the
 * processor's checkout (Razorpay for rupees, Paddle for dollars); choosing
 * Free cancels the subscription at the end of the paid period.
 */
export default function PlansPage() {
  const { user, refreshUser } = useUser();
  const toast = useToast();
  const [account, setAccount] = useState<AccountSummary | null>(null);
  const [config, setConfig] = useState<BillingConfig | null>(null);
  const [currency, setCurrency] = useState<Currency>('USD');
  const [busy, setBusy] = useState(false);
  const [confirmFree, setConfirmFree] = useState(false);

  const reload = useCallback(() => fetchBillingAccount().then(setAccount).catch(() => setAccount(null)), []);

  useEffect(() => {
    setCurrency(defaultCurrency());
    reload();
    fetchBillingConfig().then(setConfig).catch(() => setConfig(null));
  }, [reload]);

  /** The webhook lands a few seconds after checkout; poll until the plan changes. */
  async function waitForPlan(expected: PlanId, tries = 12): Promise<boolean> {
    for (let i = 0; i < tries; i++) {
      await new Promise((r) => setTimeout(r, 2500));
      const a = await fetchBillingAccount().catch(() => null);
      if (a) setAccount(a);
      if (a?.plan === expected) return true;
    }
    return false;
  }

  async function choose(plan: PlanId, cycle: 'monthly' | 'yearly') {
    if (plan === 'FREE') {
      setConfirmFree(true);
      return;
    }
    if (plan === 'ENTERPRISE') return;
    setBusy(true);
    try {
      const session = await startCheckout(plan, cycle, currency);
      if (session.mode === 'updated') {
        toast.success(session.effective === 'now' ? `You are now on ${plan === 'PERSONAL' ? 'Personal' : plan === 'BUSINESS' ? 'Business' : 'Team'}.` : 'Your plan changes at the end of the current billing period.');
        await reload();
        await refreshUser();
        return;
      }
      const result = await runCheckout(session);
      if (result === 'closed') return;
      if (result === 'applied') {
        toast.success('Payment received. Your plan is active.');
        await reload();
        await refreshUser();
        return;
      }
      toast.success('Payment received. Activating your plan…');
      const ok = await waitForPlan(plan);
      await refreshUser();
      if (!ok) toast.error('Payment went through but the plan has not switched yet. It will within a few minutes; if not, email billing@dockydoc.app with your payment reference.');
    } catch (err) {
      const msg = err instanceof ApiError && err.status === 503 ? err.message : err instanceof Error ? err.message : 'Checkout failed.';
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  async function goFree() {
    setBusy(true);
    try {
      const r = await cancelSubscription();
      toast.success(r.endsAt ? `Done. Your paid plan runs until ${new Date(r.endsAt).toLocaleDateString()} and then switches to Free.` : 'Done. Your plan switches to Free at the end of the paid period.');
      setConfirmFree(false);
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not cancel.');
    } finally {
      setBusy(false);
    }
  }

  const processorNote = config
    ? currency === 'INR'
      ? config.razorpay.enabled ? undefined : 'Rupee payments open shortly.'
      : config.paddle.enabled ? undefined : 'Card payments outside India open shortly. Email billing@dockydoc.app for an invoice you can pay by card today.'
    : undefined;

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-6xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="page-title">Plans</h1>
          <p className="text-sm text-ink-2 mt-1">
            {account
              ? `You are on ${account.planName}. ${account.usage.aiActionsUsed} of ${limitLabel(account.usage.aiActionsIncluded)} AI actions used this period, ${account.usage.documents} of ${limitLabel(account.limits.documents)} documents, ${account.usage.workspaces} of ${limitLabel(account.limits.workspaces)} workspaces.`
              : 'Pick the plan that fits, upgrade or downgrade any time.'}
            {account?.subscription && (
              <>
                {' '}<Link href="/billing" className="font-semibold text-brand-600 hover:underline">Billing and receipts</Link>
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-1 text-xs">
          <span className="text-ink-3 mr-1">Pay in</span>
          {(['INR', 'USD'] as Currency[]).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCurrency(c)}
              className={cn('h-8 px-2.5 rounded-lg border font-semibold', currency === c ? 'bg-brand-600 text-white border-brand-600' : 'border-stroke text-ink-2 hover:bg-surface-high')}
            >
              {c === 'INR' ? '₹ INR' : '$ USD'}
            </button>
          ))}
        </div>
      </div>

      <div className={cn(busy && 'opacity-60 pointer-events-none')}>
        <PricingTable
          currentPlan={account?.plan ?? user?.plan ?? null}
          currency={currency}
          onChoose={choose}
          buttonsDisabledNote={processorNote}
        />
      </div>

      <p className="text-xs text-ink-3">
        {currency === 'INR'
          ? 'Rupee payments are taken by Razorpay on behalf of Excelleta Tech Private Limited. GST invoices come from Razorpay.'
          : 'Dollar payments are taken by Paddle.com, our reseller and merchant of record, which adds your local tax and sends the invoice.'}
        {' '}Yearly plans have a 14-day money-back window. See the <Link href="/refunds" className="underline">refund policy</Link>.
      </p>

      {confirmFree && (
        <ConfirmModal
          title="Switch to Free?"
          body="Your paid plan keeps running until the end of the period you have paid for, then the account moves to Free. Documents above the Free limit stay but cannot be added to until you are under it."
          confirmLabel="Switch to Free"
          danger
          loading={busy}
          onConfirm={goFree}
          onClose={() => { if (!busy) setConfirmFree(false); }}
        />
      )}
    </div>
  );
}
