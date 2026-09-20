'use client';

import { useEffect, useState } from 'react';
import { useUser } from '@/context/UserContext';
import PricingTable from '@/components/billing/PricingTable';
import { fetchBillingAccount, limitLabel, type AccountSummary } from '@/lib/billing';

/**
 * Plans, seen from inside the app. Until the payment processors are live
 * the buttons are disabled and say so; the table itself is the same one the
 * public pricing page uses.
 */
export default function PricingPage() {
  const { user } = useUser();
  const [account, setAccount] = useState<AccountSummary | null>(null);

  useEffect(() => {
    fetchBillingAccount().then(setAccount).catch(() => setAccount(null));
  }, []);

  const inr = typeof navigator !== 'undefined' && /-IN\b/i.test(navigator.language);

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-6xl">
      <div>
        <h1 className="page-title">Plans</h1>
        <p className="text-sm text-ink-2 mt-1">
          {account
            ? `You are on ${account.planName}. ${account.usage.aiActionsUsed} of ${limitLabel(account.usage.aiActionsIncluded)} AI actions used this period, ${account.usage.documents} of ${limitLabel(account.limits.documents)} documents, ${account.usage.workspaces} of ${limitLabel(account.limits.workspaces)} workspaces.`
            : 'Pick the plan that fits, upgrade or downgrade any time.'}
        </p>
      </div>
      <PricingTable
        currentPlan={account?.plan ?? user?.plan ?? null}
        currency={inr ? 'INR' : 'USD'}
        onChoose={() => undefined}
        buttonsDisabledNote="Payments open on launch day"
      />
    </div>
  );
}
