import { cn } from '@/lib/utils';

/**
 * The homepage hero: a radar of documents by days to expiry, and the
 * ledger the radar is drawn from. Static sample rows, written to look
 * like a real plant's ledger; nothing here is customer data.
 */

type Tone = 'ok' | 'soon' | 'late';

const ROWS: { doc: string; issuer: string; expires: string; owner: string; days: number; status: string; tone: Tone }[] = [
  { doc: 'Factory licence, Unit 2', issuer: 'DIC Aurangabad', expires: '12 Mar 2027', owner: 'Ramesh Pawar', days: 172, status: 'Renewal not due', tone: 'ok' },
  { doc: 'Consent to operate, air and water', issuer: 'MPCB', expires: '18 Oct 2026', owner: 'Sunita Kale', days: 27, status: 'Reminder sent on WhatsApp, 2 h ago', tone: 'soon' },
  { doc: 'Fire NOC', issuer: 'Fire Services', expires: '30 Sep 2026', owner: 'Sunita Kale', days: 9, status: 'Overdue for action, escalated to owner', tone: 'late' },
  { doc: 'IATF 16949 certificate', issuer: 'TUV Nord', expires: '04 Jun 2028', owner: 'Quality head', days: 621, status: 'Surveillance audit due first', tone: 'ok' },
  { doc: 'Insurance, MH 20 EJ 4412', issuer: 'ICICI Lombard', expires: '02 Nov 2026', owner: 'Transport desk', days: 42, status: 'Reminder scheduled, 3 Oct', tone: 'soon' },
  { doc: 'Bank guarantee, tender 22/A', issuer: 'HDFC Bank', expires: '15 Jan 2027', owner: 'Accounts', days: 116, status: 'Renewal not due', tone: 'ok' },
];

const TONE_TEXT: Record<Tone, string> = { ok: 'text-teal-300', soon: 'text-amber-300', late: 'text-[#ff7a59]' };
const TONE_FILL: Record<Tone, string> = { ok: '#5eead4', soon: '#f2b63a', late: '#ff7a59' };

export function Ledger({ className }: { className?: string }) {
  return (
    <div className={cn('overflow-hidden rounded-lg border border-stroke bg-surface', className)}>
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink-3 border-b border-stroke">
            <th className="px-4 py-3 font-medium">Document</th>
            <th className="px-4 py-3 font-medium hidden lg:table-cell">Issuer</th>
            <th className="px-4 py-3 font-medium hidden md:table-cell">Expires</th>
            <th className="px-4 py-3 font-medium hidden lg:table-cell">Owner</th>
            <th className="px-4 py-3 font-medium text-right">Days</th>
            <th className="px-4 py-3 font-medium hidden sm:table-cell">Status</th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map((r) => (
            <tr key={r.doc} className={cn('border-b border-stroke-soft last:border-0', r.tone === 'soon' && 'bg-surface-high/60')}>
              <td className="px-4 py-3.5">
                <div className="font-semibold text-ink">{r.doc}</div>
                <div className={cn('sm:hidden mt-0.5 text-xs', TONE_TEXT[r.tone])}>{r.status}</div>
              </td>
              <td className="px-4 py-3.5 text-ink-2 hidden lg:table-cell">{r.issuer}</td>
              <td className="px-4 py-3.5 font-mono text-ink hidden md:table-cell whitespace-nowrap">{r.expires}</td>
              <td className="px-4 py-3.5 text-ink-2 hidden lg:table-cell">{r.owner}</td>
              <td className={cn('px-4 py-3.5 font-mono text-right tabular-nums', TONE_TEXT[r.tone])}>{r.days}</td>
              <td className={cn('px-4 py-3.5 hidden sm:table-cell', TONE_TEXT[r.tone])}>{r.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Documents plotted by days to expiry: the closer to the centre, the
 * sooner it lapses. Rings at 7, 30 and 90 days. The sweep turns like the
 * one in the logo, and stops under prefers-reduced-motion.
 */
export function Radar({ className }: { className?: string }) {
  const C = 200;
  const R = 180;
  // Distance grows with the square root of days left, so 7, 30 and 90 days
  // spread out evenly and anything past 180 days sits on the outer ring.
  const radius = (days: number) => Math.min(R, 40 + 140 * Math.sqrt(Math.min(days, 180) / 180));
  const blips = [
    { label: 'Fire NOC', days: 9, angle: 205, tone: 'late' as Tone },
    { label: 'Consent to operate', days: 27, angle: 335, tone: 'soon' as Tone },
    { label: 'Fleet insurance', days: 42, angle: 55, tone: 'soon' as Tone },
    { label: 'Bank guarantee', days: 116, angle: 130, tone: 'ok' as Tone },
    { label: 'Factory licence', days: 172, angle: 260, tone: 'ok' as Tone },
    { label: 'IATF 16949', days: 621, angle: 15, tone: 'ok' as Tone },
  ].map((b) => {
    const a = (b.angle * Math.PI) / 180;
    const r = radius(b.days);
    return { ...b, x: C + r * Math.cos(a), y: C + r * Math.sin(a) };
  });

  return (
    <svg viewBox="-110 -10 620 420" className={cn('w-full h-auto', className)} role="img" aria-label="Six documents plotted by days to expiry; the Fire NOC at 9 days sits nearest the centre">
      <defs>
        <radialGradient id="dd-radar-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#2dd4bf" stopOpacity="0.16" />
          <stop offset="100%" stopColor="#2dd4bf" stopOpacity="0" />
        </radialGradient>
        <clipPath id="dd-radar-clip"><circle cx={C} cy={C} r={R} /></clipPath>
      </defs>
      <circle cx={C} cy={C} r={R} fill="url(#dd-radar-glow)" />
      {[radius(7), radius(30), radius(90), R].map((r) => (
        <circle key={r} cx={C} cy={C} r={r} fill="none" stroke="#2c3037" strokeWidth="1" />
      ))}
      <line x1={C - R} y1={C} x2={C + R} y2={C} stroke="#23262c" strokeWidth="1" />
      <line x1={C} y1={C - R} x2={C} y2={C + R} stroke="#23262c" strokeWidth="1" />
      <g clipPath="url(#dd-radar-clip)">
        <path className="radar-sweep" d={`M${C} ${C} L${C + R} ${C} A${R} ${R} 0 0 0 ${C + R * Math.cos(-Math.PI / 3)} ${C + R * Math.sin(-Math.PI / 3)} Z`} fill="#2dd4bf" opacity="0.22" />
      </g>
      {[[7, 'text-ink-3'], [30, 'text-ink-3'], [90, 'text-ink-3']].map(([d, cls]) => (
        <text key={String(d)} x={C + 4} y={C - radius(Number(d)) - 4} className={cn('font-mono', cls as string)} fill="#8b857b" fontSize="10">{d} days</text>
      ))}
      {blips.map((b) => (
        <g key={b.label}>
          <circle cx={b.x} cy={b.y} r="9" fill={TONE_FILL[b.tone]} opacity="0.18" />
          <circle className="radar-blip" cx={b.x} cy={b.y} r="4" fill={TONE_FILL[b.tone]} />
          <text x={b.x + (b.x > C ? 12 : -12)} y={b.y + 4} textAnchor={b.x > C ? 'start' : 'end'} fill="#ece7de" fontSize="11" className="font-mono">{b.label}</text>
          <text x={b.x + (b.x > C ? 12 : -12)} y={b.y + 17} textAnchor={b.x > C ? 'start' : 'end'} fill={TONE_FILL[b.tone]} fontSize="10" className="font-mono">{b.days} d</text>
        </g>
      ))}
      <circle cx={C} cy={C} r="3" fill="#2dd4bf" />
    </svg>
  );
}
