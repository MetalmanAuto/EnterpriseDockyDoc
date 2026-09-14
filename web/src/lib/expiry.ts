import type { ExpiringDocument } from '@/types';

export const MS_PER_DAY = 1000 * 60 * 60 * 24;

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export function daysLabel(days: number): { text: string; class: string } {
  if (days < 0) return { text: `${Math.abs(days)}d overdue`, class: 'text-red-600' };
  if (days === 0) return { text: 'Expires today', class: 'text-red-600' };
  if (days <= 7) return { text: `${days}d left`, class: 'text-orange-600' };
  if (days <= 30) return { text: `${days}d left`, class: 'text-yellow-700' };
  return { text: `${days}d left`, class: 'text-gray-500' };
}

export type ExpiryBucketId = 'expired' | 'week' | 'month' | 'quarter';

export interface ExpiryBucket {
  id: ExpiryBucketId;
  label: string;
  hint: string;
  docs: ExpiringDocument[];
}

/** Split the 90-day expiring list into non-overlapping urgency buckets, most urgent first. */
export function bucketize(docs: ExpiringDocument[]): ExpiryBucket[] {
  const sorted = [...docs].sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);
  return [
    { id: 'expired', label: 'Expired',    hint: 'already lapsed',   docs: sorted.filter((d) => d.daysUntilExpiry < 0) },
    { id: 'week',    label: 'This week',  hint: 'next 7 days',      docs: sorted.filter((d) => d.daysUntilExpiry >= 0 && d.daysUntilExpiry <= 7) },
    { id: 'month',   label: 'This month', hint: '8–30 days',        docs: sorted.filter((d) => d.daysUntilExpiry > 7 && d.daysUntilExpiry <= 30) },
    { id: 'quarter', label: 'Next 90 days', hint: '31–90 days',     docs: sorted.filter((d) => d.daysUntilExpiry > 30 && d.daysUntilExpiry <= 90) },
  ];
}

export function isSnoozed(doc: { remindersSnoozedUntil: string | null }): boolean {
  return !!doc.remindersSnoozedUntil && new Date(doc.remindersSnoozedUntil) > new Date();
}

/** 'YYYY-MM-DD' for <input type="date"> defaults, `daysFromNow` days ahead. */
export function dateInputValue(daysFromNow = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}
