import { useId } from 'react';
import { cn } from '@/lib/utils';

type Motion = 'always' | 'hover' | 'none';

/**
 * DockyDoc mark — a capital D built from radar rings with a teal sweep and blip.
 * It doubles as the first letter of the wordmark ("D" + "ockyDoc").
 * Ring strokes use currentColor so the mark themes with its container.
 * Source of truth for the geometry: public/logo-mark.svg.
 *
 * `motion` — 'always' keeps the sweep turning, 'hover' turns it while the
 * nearest `.logo-hover` ancestor is hovered, 'none' is static. All motion is
 * disabled under prefers-reduced-motion (see globals.css).
 */
export function LogoMark({
  size = 28,
  className,
  motion = 'none',
  accent = '#2DD4BF',
}: {
  size?: number;
  className?: string;
  motion?: Motion;
  accent?: string;
}) {
  // Clip the sweep to the D so it never pokes past the stem mid-rotation.
  const clipId = `dd-clip-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden
      className={cn('flex-shrink-0', motion === 'always' && 'logo-motion', className)}
    >
      <defs>
        <clipPath id={clipId}>
          <path d="M15 8h15a24 24 0 0 1 0 48H15z" />
        </clipPath>
      </defs>
      <path d="M15 8h15a24 24 0 0 1 0 48H15z" stroke="currentColor" strokeWidth={5} strokeLinejoin="round" />
      <path d="M23 17h7a15 15 0 0 1 0 30h-7z" stroke="currentColor" strokeWidth={3.5} strokeLinejoin="round" />
      <g clipPath={`url(#${clipId})`}>
        <path d="M30 32L49.7 18.2A24 24 0 0 0 40.1 10.3z" fill={accent} opacity={0.9} className="logo-sweep" />
      </g>
      <circle cx="30" cy="32" r="3.8" fill={accent} />
      <circle cx="38.5" cy="35" r="2.2" fill="#FBBF24" className="logo-blip" />
    </svg>
  );
}

/**
 * Wordmark lockup: the ring-D mark stands in for the "D", followed by
 * "ockyDoc" with "Doc" in brand teal. `size` is the mark's box in px; the
 * type is scaled so its cap height matches the D.
 */
export default function Logo({
  size = 28,
  className,
  light = false,
  motion = 'hover',
}: {
  size?: number;
  className?: string;
  light?: boolean;
  motion?: Motion;
}) {
  const fontSize = Math.round(size * 1.02);
  return (
    <span
      className={cn(
        'inline-flex items-center select-none',
        light ? 'text-slate-900' : 'text-slate-100',
        motion === 'hover' && 'logo-hover',
        className,
      )}
      aria-label="DockyDoc"
    >
      <LogoMark size={size} motion={motion} accent={light ? '#0D9488' : '#2DD4BF'} />
      <span
        className={cn('font-extrabold tracking-[-0.04em] leading-none', motion !== 'none' && 'logo-word')}
        style={{ fontSize, marginLeft: -Math.round(size * 0.12), marginTop: Math.round(size * 0.04) }}
      >
        ocky<span className={light ? 'text-brand-600' : 'text-brand-400'}>Doc</span>
      </span>
    </span>
  );
}
