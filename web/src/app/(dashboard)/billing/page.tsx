'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useUser } from '@/context/UserContext';
import ConfirmModal from '@/components/ui/ConfirmModal';
import { useToast } from '@/components/ui/Toast';
import { ApiError } from '@/lib/api';
import { runCheckout } from '@/lib/checkout';
import { cancelSubscription, defaultCurrency, fetchBillingAccount, formatMoney, limitLabel, startTopUp, type AccountSummary, type Currency } from '@/lib/billing';
import { cn } from '@/lib/utils';

/** Plan, renewal, cancel, top-ups and the payment history. */
export default function BillingPage() {
  const { refreshUser } = useUser();
  const toast = useToast();
  const [account, setAccount] = useState<AccountSummary | null>(null);
  const [currency, setCurrency] = useState<Currency>('USD');
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const reload = useCallback(() => fetchBillingAccount().then(setAccount).catch(() => setAccount(null)), []);
  useEffect(() => { setCurrency(defaultCurrency()); reload(); }, [reload]);

  async function buy(actions: 100 | 500) {
    setBusy(`topup-${actions}`);
    try {
      const before = account?.usage.aiCreditActions ?? 0;
      const session = await startTopUp(actions, currency);
      const result = await runCheckout(session);
      if (result === 'closed') return;
      if (result === 'applied') {
        toast.success(`${actions} AI actions added.`);
        await reload();
        return;
      }
      toast.success('Payment received. Adding your actions…');
      for (let i = 0; i < 12; i++) {
        await new Promise((r) => setTimeout(r, 2500));
        const a = await fetchBillingAccount().catch(() => null);
        if (a) setAccount(a);
        if (a && a.usage.aiCreditActions > before) return;
      }
      toast.error('Payment went through but the actions have not landed yet. They will within a few minutes.');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Could not start the purchase.');
    } finally {
      setBusy(null);
    }
  }

  async function cancel() {
    setBusy('cancel');
    try {
      const r = await cancelSubscription();
      toast.success(r.endsAt ? `Cancelled. Your plan runs until ${new Date(r.endsAt).toLocaleDateString()}.` : 'Cancelled at the end of the paid period.');
      setConfirmCancel(false);
      await reload();
      await refreshUser();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not cancel.');
    } finally {
      setBusy(null);
    }
  }

  if (!account) return <div className="p-6"><div className="h-40 rounded-2xl bg-surface-high animate-pulse" /></div>;

  const sub = account.subscription;
  const renews = account.planRenewsAt ? new Date(account.planRenewsAt).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }) : null;

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-4xl">
      <div>
        <h1 className="page-title">Billing</h1>
        <p className="page-subtitle">Your plan, renewals, extra AI actions and receipts.</p>
      </div>

      <section className="rounded-2xl border border-stroke bg-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-ink-3">Current plan</p>
            <p className="text-2xl font-bold text-ink mt-1">{account.planName}</p>
            <p className="text-sm text-ink-2 mt-1">
              {sub
                ? sub.cancelAtPeriodEnd
                  ? `Cancelled. Paid until ${renews ?? 'the end of the period'}, then Free.`
                  : sub.status === 'PAST_DUE'
                    ? 'Payment failed. The processor will retry; update your card from the email they sent.'
                    : `${sub.amount > 0 ? `${formatMoney(sub.amount, sub.currency)} ${sub.interval === 'yearly' ? 'a year' : 'a month'}, ` : ''}renews ${renews ?? 'automatically'} through ${sub.provider === 'RAZORPAY' ? 'Razorpay' : 'Paddle'}.`
                : account.planSource === 'complimentary' && renews
                  ? `Complimentary until ${renews}.`
                  : account.plan === 'FREE'
                    ? 'No card on file.'
                    : ''}
            </p>
            <p className="text-xs text-ink-3 mt-2">
              {account.usage.aiActionsUsed} of {limitLabel(account.usage.aiActionsIncluded)} included AI actions used this period
              {account.usage.aiCreditActions > 0 && `, plus ${account.usage.aiCreditActions} bought actions in reserve`}.
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <Link href="/plans" className="h-9 px-4 inline-flex items-center rounded-lg bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700">
              {account.plan === 'FREE' ? 'Choose a plan' : 'Change plan'}
            </Link>
            {sub && !sub.cancelAtPeriodEnd && (
              <button type="button" onClick={() => setConfirmCancel(true)} className="text-xs text-ink-3 hover:text-red-600 underline">
                Cancel subscription
              </button>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-stroke bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-ink">Extra AI actions</h2>
            <p className="text-xs text-ink-3 mt-0.5">Bought actions are used after the monthly allowance runs out and stay valid for 12 months.</p>
          </div>
          <div className="flex items-center gap-1 text-xs">
            {(['INR', 'USD'] as Currency[]).map((c) => (
              <button key={c} type="button" onClick={() => setCurrency(c)} className={cn('h-8 px-2.5 rounded-lg border font-semibold', currency === c ? 'bg-brand-600 text-white border-brand-600' : 'border-stroke text-ink-2 hover:bg-surface-high')}>
                {c === 'INR' ? '₹ INR' : '$ USD'}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {account.topUps.map((t) => (
            <button
              key={t.actions}
              type="button"
              disabled={!account.limits.topUps || busy !== null}
              onClick={() => buy(t.actions as 100 | 500)}
              className="rounded-xl border border-stroke p-4 text-left hover:border-brand-500 hover:bg-surface-high disabled:opacity-50"
            >
              <p className="text-lg font-bold text-ink">{t.actions} actions</p>
              <p className="text-sm text-ink-2">{currency === 'INR' ? `₹${t.priceInr.toLocaleString('en-IN')}` : `$${t.priceUsd}`} one-off</p>
              {busy === `topup-${t.actions}` && <p className="text-xs text-ink-3 mt-1">Opening checkout…</p>}
            </button>
          ))}
        </div>
        {!account.limits.topUps && <p className="mt-2 text-xs text-ink-3">Top-ups are for paid plans. <Link href="/plans" className="underline">Choose a plan</Link> first.</p>}
      </section>

      <section className="rounded-2xl border border-stroke bg-surface p-5">
        <h2 className="text-base font-semibold text-ink">Payments</h2>
        {account.payments.length === 0 ? (
          <p className="text-sm text-ink-3 mt-2">No payments yet.</p>
        ) : (
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-3">
                <th className="py-1.5 font-medium">Date</th>
                <th className="py-1.5 font-medium">For</th>
                <th className="py-1.5 font-medium">Amount</th>
                <th className="py-1.5 font-medium">Reference</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stroke-soft">
              {account.payments.map((p) => (
                <tr key={p.id}>
                  <td className="py-2 text-ink-2">{new Date(p.date).toLocaleDateString()}</td>
                  <td className="py-2 text-ink">{p.kind === 'topup' ? `${p.topUpActions} AI actions` : `${p.plan ? p.plan.charAt(0) + p.plan.slice(1).toLowerCase() : ''} plan`}</td>
                  <td className="py-2 text-ink tabular-nums">{formatMoney(p.amount, p.currency)}</td>
                  <td className="py-2 text-xs text-ink-3 font-mono">{p.reference}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="mt-3 text-xs text-ink-3">Tax invoices come by email from {sub?.provider === 'PADDLE' ? 'Paddle' : 'Razorpay'} for each payment. Questions: billing@dockydoc.app.</p>
      </section>

      {confirmCancel && (
        <ConfirmModal
          title="Cancel your subscription?"
          body="Your plan stays active until the end of the period you have paid for. After that the account moves to Free. Nothing is deleted."
          confirmLabel="Cancel subscription"
          danger
          loading={busy === 'cancel'}
          onConfirm={cancel}
          onClose={() => { if (busy !== 'cancel') setConfirmCancel(false); }}
        />
      )}
    </div>
  );
}
