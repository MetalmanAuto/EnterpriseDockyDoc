'use client';

import { useEffect, useState } from 'react';
import { useToast } from '@/components/ui/Toast';
import { ApiError } from '@/lib/api';
import { createPromoCodes, disablePromoCode, fetchPromoCodes, type CreatePromoCodesInput, type PromoCodeRow } from '@/lib/admin';
import { cn } from '@/lib/utils';

const PLAN_NAMES: Record<string, string> = { PERSONAL: 'Personal', BUSINESS: 'Business', TEAM: 'Team' };

/**
 * Make and manage codes that give a plan free for a number of months.
 * New codes are shown once as a block that can be copied and pasted into
 * an email or a WhatsApp message.
 */
export default function PromoCodesPanel() {
  const toast = useToast();
  const [rows, setRows] = useState<PromoCodeRow[] | null>(null);
  const [form, setForm] = useState<CreatePromoCodesInput>({ plan: 'BUSINESS', months: 12, count: 1, maxUses: 1 });
  const [busy, setBusy] = useState(false);
  const [fresh, setFresh] = useState<PromoCodeRow[]>([]);
  const [open, setOpen] = useState<string | null>(null);

  const load = () => fetchPromoCodes().then(setRows).catch(() => setRows([]));
  useEffect(() => { void load(); }, []);

  async function make(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const made = await createPromoCodes({
        plan: form.plan,
        months: form.months,
        count: form.code ? undefined : form.count,
        maxUses: form.maxUses,
        expiresAt: form.expiresAt || undefined,
        note: form.note?.trim() || undefined,
        code: form.code?.trim() || undefined,
      });
      setFresh(made);
      setForm((f) => ({ ...f, code: '', note: '' }));
      await load();
      toast.success(`${made.length} code${made.length === 1 ? '' : 's'} made.`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not make the codes.');
    } finally {
      setBusy(false);
    }
  }

  async function withdraw(row: PromoCodeRow) {
    if (!window.confirm(`Withdraw ${row.code}? People who already used it keep their plan.`)) return;
    try {
      await disablePromoCode(row.id);
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not withdraw the code.');
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Copied.');
    } catch {
      toast.error('Could not copy. Select the text and copy it by hand.');
    }
  }

  const field = 'h-9 rounded-lg border border-stroke bg-canvas px-2.5 text-sm text-ink';

  return (
    <section className="rounded-2xl border border-stroke bg-surface">
      <div className="px-5 py-4 border-b border-stroke-soft">
        <h2 className="text-sm font-bold text-ink">Free plan codes <span className="text-ink-3 font-normal">({rows?.length ?? 0})</span></h2>
        <p className="mt-1 text-xs text-ink-3">A code puts a plan on someone's account free for the months it covers. They type it on their Billing page. One use per person; the plan drops to Free when the months end.</p>
      </div>

      <form onSubmit={make} className="px-5 py-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 border-b border-stroke-soft">
        <label className="text-xs text-ink-2 flex flex-col gap-1">Plan
          <select value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value as CreatePromoCodesInput['plan'] })} className={field}>
            <option value="PERSONAL">Personal</option>
            <option value="BUSINESS">Business</option>
            <option value="TEAM">Team</option>
          </select>
        </label>
        <label className="text-xs text-ink-2 flex flex-col gap-1">Months free
          <input type="number" min={1} max={36} value={form.months} onChange={(e) => setForm({ ...form, months: Number(e.target.value) })} className={field} />
        </label>
        <label className="text-xs text-ink-2 flex flex-col gap-1">How many codes
          <input type="number" min={1} max={100} value={form.count ?? 1} disabled={!!form.code} onChange={(e) => setForm({ ...form, count: Number(e.target.value) })} className={cn(field, 'disabled:opacity-50')} />
        </label>
        <label className="text-xs text-ink-2 flex flex-col gap-1">Uses per code
          <input type="number" min={1} max={100000} value={form.maxUses ?? 1} onChange={(e) => setForm({ ...form, maxUses: Number(e.target.value) })} className={field} />
        </label>
        <label className="text-xs text-ink-2 flex flex-col gap-1">Last day to redeem (optional)
          <input type="date" value={form.expiresAt ?? ''} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} className={field} />
        </label>
        <label className="text-xs text-ink-2 flex flex-col gap-1">Custom code (optional)
          <input value={form.code ?? ''} placeholder="Leave empty to generate" onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} className={cn(field, 'font-mono uppercase placeholder:normal-case placeholder:font-sans')} />
        </label>
        <label className="text-xs text-ink-2 flex flex-col gap-1 sm:col-span-2 lg:col-span-1">Note, who it is for
          <input value={form.note ?? ''} placeholder="CA firms met at the Gurugram meet, Oct 2026" onChange={(e) => setForm({ ...form, note: e.target.value })} className={field} />
        </label>
        <div className="flex items-end">
          <button type="submit" disabled={busy} className="h-9 px-4 rounded-lg bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 disabled:opacity-50">
            {busy ? 'Making…' : 'Make codes'}
          </button>
        </div>
      </form>

      {fresh.length > 0 && (
        <div className="px-5 py-4 border-b border-stroke-soft bg-brand-500/5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-ink">New codes, {PLAN_NAMES[fresh[0].plan]} for {fresh[0].months} months</p>
            <button type="button" onClick={() => void copy(fresh.map((r) => r.code).join('\n'))} className="h-8 px-3 rounded-lg border border-stroke text-xs font-semibold text-ink hover:bg-surface-high">Copy all</button>
          </div>
          <pre className="mt-2 rounded-lg bg-canvas border border-stroke p-3 text-sm font-mono text-ink whitespace-pre-wrap">{fresh.map((r) => r.code).join('\n')}</pre>
          <p className="mt-2 text-xs text-ink-3">Send with: &ldquo;Sign in at dockydoc.app, open Billing, type the code under Have a code.&rdquo;</p>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-ink-3">
              <th className="px-5 py-2 font-semibold">Code</th>
              <th className="px-4 py-2 font-semibold">Plan</th>
              <th className="px-4 py-2 font-semibold text-right">Months</th>
              <th className="px-4 py-2 font-semibold text-right">Used</th>
              <th className="px-4 py-2 font-semibold">Redeem by</th>
              <th className="px-4 py-2 font-semibold">Note</th>
              <th className="px-4 py-2 font-semibold"></th>
            </tr>
          </thead>
          <tbody>
            {rows === null && <tr><td colSpan={7} className="px-5 py-6 text-center text-ink-3">Loading…</td></tr>}
            {rows?.length === 0 && <tr><td colSpan={7} className="px-5 py-6 text-center text-ink-3">No codes yet.</td></tr>}
            {rows?.map((r) => {
              const spent = r.maxUses !== null && r.usedCount >= r.maxUses;
              const expired = r.expiresAt ? new Date(r.expiresAt).getTime() < Date.now() : false;
              const dead = !!r.disabledAt || spent || expired;
              return (
                <FragmentRow key={r.id}>
                  <tr className={cn('border-t border-stroke-soft', dead && 'text-ink-3')}>
                    <td className="px-5 py-2.5 font-mono text-ink whitespace-nowrap">
                      <button type="button" onClick={() => void copy(r.code)} title="Copy" className="hover:underline">{r.code}</button>
                      {r.disabledAt && <span className="ml-2 text-[11px] uppercase text-red-600">withdrawn</span>}
                      {!r.disabledAt && expired && <span className="ml-2 text-[11px] uppercase">expired</span>}
                      {!r.disabledAt && !expired && spent && <span className="ml-2 text-[11px] uppercase">used up</span>}
                    </td>
                    <td className="px-4 py-2.5">{PLAN_NAMES[r.plan] ?? r.plan}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{r.months}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {r.redemptions.length > 0
                        ? <button type="button" onClick={() => setOpen(open === r.id ? null : r.id)} className="underline">{r.usedCount} of {r.maxUses ?? '∞'}</button>
                        : <>{r.usedCount} of {r.maxUses ?? '∞'}</>}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">{r.expiresAt ? new Date(r.expiresAt).toLocaleDateString() : 'no limit'}</td>
                    <td className="px-4 py-2.5 text-ink-2 max-w-[240px] truncate" title={r.note ?? ''}>{r.note}</td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      {!dead && <button type="button" onClick={() => void withdraw(r)} className="text-xs text-ink-3 hover:text-red-600 underline">Withdraw</button>}
                    </td>
                  </tr>
                  {open === r.id && (
                    <tr className="bg-surface-high/50">
                      <td colSpan={7} className="px-5 py-2 text-xs text-ink-2">
                        {r.redemptions.map((x) => (
                          <div key={x.email + x.redeemedAt}>{x.email}, redeemed {new Date(x.redeemedAt).toLocaleDateString()}, plan until {new Date(x.planUntil).toLocaleDateString()}</div>
                        ))}
                      </td>
                    </tr>
                  )}
                </FragmentRow>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function FragmentRow({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
