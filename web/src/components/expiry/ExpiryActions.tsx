'use client';

import { useState } from 'react';
import { snoozeDocumentReminders, unsnoozeDocumentReminders, updateDocument } from '@/lib/documents';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';
import { dateInputValue, formatDate, isSnoozed } from '@/lib/expiry';

interface Target {
  id: string;
  name: string;
  expiryDate: string | null;
  remindersSnoozedUntil: string | null;
}

interface Props {
  doc: Target;
  /** Called with the new expiry / snooze values after a successful action. */
  onChanged: (patch: Partial<Target>) => void;
  size?: 'sm' | 'md';
}

/**
 * Quick actions for an expiring document: mark it renewed (new expiry date),
 * snooze its reminder emails, or resume them.
 */
export default function ExpiryActions({ doc, onChanged, size = 'sm' }: Props) {
  const toast = useToast();
  const [mode, setMode] = useState<'idle' | 'renew' | 'snooze'>('idle');
  const [newExpiry, setNewExpiry] = useState(dateInputValue(365));
  const [busy, setBusy] = useState(false);
  const snoozed = isSnoozed(doc);

  const btn = cn(
    'rounded-md border font-medium transition-colors disabled:opacity-50',
    size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs',
  );
  const neutral = 'border-gray-200 text-gray-600 hover:border-brand-400 hover:text-brand-700 bg-white';
  const primary = 'border-brand-600 bg-brand-600 text-white hover:bg-brand-700';

  async function run<T>(label: string, fn: () => Promise<T>, apply: (r: T) => Partial<Target>) {
    setBusy(true);
    try {
      const r = await fn();
      onChanged(apply(r));
      toast.success(label);
      setMode('idle');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  function renew() {
    if (!newExpiry) return;
    const exp = new Date(newExpiry);
    exp.setHours(23, 59, 59, 999);
    if (exp <= new Date()) { toast.error('New expiry date must be in the future.'); return; }
    void run(
      `"${doc.name}" renewed until ${formatDate(newExpiry)}`,
      () => updateDocument(doc.id, { expiryDate: newExpiry, isReminderEnabled: true }),
      (d) => ({ expiryDate: d.expiryDate, remindersSnoozedUntil: null }),
    );
  }

  function snooze(days: number) {
    void run(
      `Reminders for "${doc.name}" paused for ${days} days`,
      () => snoozeDocumentReminders(doc.id, days),
      (d) => ({ remindersSnoozedUntil: d.remindersSnoozedUntil }),
    );
  }

  function resume() {
    void run(
      `Reminders for "${doc.name}" resumed`,
      () => unsnoozeDocumentReminders(doc.id),
      () => ({ remindersSnoozedUntil: null }),
    );
  }

  if (mode === 'renew') {
    return (
      <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
        <input
          type="date"
          value={newExpiry}
          min={dateInputValue(1)}
          onChange={(e) => setNewExpiry(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') renew(); if (e.key === 'Escape') setMode('idle'); }}
          aria-label="New expiry date"
          className="text-[11px] border border-gray-300 rounded-md px-1.5 py-0.5 focus:outline-none focus:ring-2 focus:ring-brand-500"
          autoFocus
        />
        <button type="button" disabled={busy} onClick={renew} className={cn(btn, primary)}>{busy ? '…' : 'Save'}</button>
        <button type="button" disabled={busy} onClick={() => setMode('idle')} className={cn(btn, neutral)}>Cancel</button>
      </div>
    );
  }

  if (mode === 'snooze') {
    return (
      <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
        <span className="text-[11px] text-gray-500">Pause emails for</span>
        {[7, 30].map((d) => (
          <button key={d} type="button" disabled={busy} onClick={() => snooze(d)} className={cn(btn, neutral)}>{d} days</button>
        ))}
        <button type="button" disabled={busy} onClick={() => setMode('idle')} className={cn(btn, neutral)} aria-label="Cancel">×</button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
      <button type="button" disabled={busy} onClick={() => setMode('renew')} className={cn(btn, neutral)} title="Set the new expiry date after renewal">
        Renewed
      </button>
      {snoozed ? (
        <button type="button" disabled={busy} onClick={resume} className={cn(btn, 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100')} title={`Paused until ${formatDate(doc.remindersSnoozedUntil)}`}>
          Paused · resume
        </button>
      ) : (
        <button type="button" disabled={busy} onClick={() => setMode('snooze')} className={cn(btn, neutral)} title="Pause reminder emails for a while">
          Snooze
        </button>
      )}
    </div>
  );
}
