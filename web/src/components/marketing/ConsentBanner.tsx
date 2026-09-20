'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

export type Consent = 'all' | 'essential';
const KEY = 'dd_consent';

export function readConsent(): Consent | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'all' || v === 'essential' ? v : null;
  } catch {
    return null;
  }
}

/**
 * Cookie and tracking consent. DockyDoc itself sets only the sign-in
 * cookie, which is essential. The advertising pixels load only after
 * "Accept all", which is what the EU, UK and India rules need.
 */
export default function ConsentBanner() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(readConsent() === null);
  }, []);

  function choose(value: Consent) {
    try {
      localStorage.setItem(KEY, value);
    } catch {
      /* private mode: the banner shows again next visit, which is fine */
    }
    window.dispatchEvent(new CustomEvent('dd-consent', { detail: value }));
    setOpen(false);
  }

  if (!open) return null;
  return (
    <div role="dialog" aria-label="Cookie choices" className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-3xl rounded-2xl border border-stroke bg-surface p-4 shadow-xl sm:flex sm:items-center sm:gap-4">
      <p className="text-sm text-ink-2 flex-1">
        DockyDoc uses one essential cookie to keep you signed in. With your permission it also lets our advertising partners measure whether their ads brought you here.
        {' '}<Link href="/privacy" className="underline text-ink">Privacy policy</Link>
      </p>
      <div className="mt-3 sm:mt-0 flex gap-2 shrink-0">
        <button type="button" onClick={() => choose('essential')} className="h-9 px-3 rounded-lg border border-stroke text-sm font-semibold text-ink hover:bg-surface-high">Essential only</button>
        <button type="button" onClick={() => choose('all')} className="h-9 px-3 rounded-lg bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700">Accept all</button>
      </div>
    </div>
  );
}
