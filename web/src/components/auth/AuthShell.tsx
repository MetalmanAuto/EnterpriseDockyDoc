import Link from 'next/link';

/**
 * Shared frame for /login and /register: the animated "expiry radar" hero on
 * the left and a dark form panel on the right. The hero is a brand surface —
 * always dark, regardless of the app theme.
 */
export default function AuthShell({
  title,
  subtitle,
  footer,
  children,
}: {
  title: string;
  subtitle: string;
  footer: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-[#0f172a] text-slate-200">
      {/* ── Hero ───────────────────────────────────────────────────── */}
      <div className="relative flex-1 flex items-center justify-center overflow-hidden px-6 py-12 lg:py-0 [perspective:1500px] [perspective-origin:50%_30%]">
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(800px_500px_at_30%_60%,rgba(13,148,136,0.18),transparent_60%)]"
        />
        <RadarHero />
        <p className="absolute left-6 bottom-6 lg:left-10 lg:bottom-8 font-mono text-[11px] tracking-label uppercase text-slate-500">
          Expiry tracking · Email &amp; SMS reminders · AI-read dates
        </p>
      </div>

      {/* ── Form panel ─────────────────────────────────────────────── */}
      <div className="relative w-full lg:w-[520px] flex-shrink-0 flex flex-col justify-between gap-10 px-6 sm:px-12 lg:px-16 py-10 bg-[#0b1220] border-t lg:border-t-0 lg:border-l border-slate-400/[0.12] animate-rise">
        <Link href="/" className="flex items-center gap-2.5 w-fit">
          <div className="w-[30px] h-[30px] rounded-lg bg-brand-400 flex items-center justify-center">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#0f172a" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
              <path d="M14 3v5h5" />
            </svg>
          </div>
          <span className="font-extrabold text-base tracking-[-0.02em] text-white">DockyDoc</span>
        </Link>

        <div className="flex flex-col gap-7">
          <div className="flex flex-col gap-2.5">
            <h1 className="m-0 text-[32px] leading-[1.1] font-extrabold tracking-[-0.03em] text-white [text-wrap:balance]">
              {title}
            </h1>
            <p className="m-0 text-sm leading-relaxed text-slate-400">{subtitle}</p>
          </div>
          {/* `dark` scopes the app's dark tokens to the panel so Clerk's inputs read correctly */}
          <div className="dark flex justify-center">{children}</div>
        </div>

        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>{footer}</span>
          <span>© {new Date().getFullYear()} DockyDoc</span>
        </div>
      </div>
    </div>
  );
}

/** Clerk `appearance.elements` for the dark auth panel — shared by SignIn and SignUp. */
export const authPanelAppearance = {
  elements: {
    rootBox: 'w-full',
    cardBox: 'w-full shadow-none',
    card: 'w-full shadow-none border-0 bg-transparent p-0',
    header: 'hidden',
    footer: 'bg-transparent',
    footerAction: 'hidden',
    formFieldLabel: 'font-mono text-[11px] tracking-label uppercase text-slate-500',
    formFieldInput: 'h-11 rounded-[10px] bg-[#111a2e] border-slate-400/20 text-slate-200 focus:border-brand-400',
    formButtonPrimary: 'h-12 rounded-[10px] bg-brand-400 hover:bg-brand-300 text-slate-900 font-extrabold normal-case shadow-none text-sm',
    socialButtonsBlockButton: 'border-slate-400/20 text-slate-200 hover:bg-white/5',
    dividerLine: 'bg-slate-400/20',
    dividerText: 'text-slate-500',
    phoneInputBox: 'bg-[#111a2e] border-slate-400/20 text-slate-200',
    otpCodeFieldInput: 'bg-[#111a2e] border-slate-400/20 text-slate-100 font-mono',
    identityPreview: 'bg-[#111a2e] border-slate-400/20',
    identityPreviewText: 'text-slate-200',
    alternativeMethodsBlockButton: 'border-slate-400/20 text-slate-200 hover:bg-white/5',
    formResendCodeLink: 'text-brand-300',
    backLink: 'text-brand-300',
    formFieldHintText: 'text-slate-500',
    formFieldSuccessText: 'text-brand-300',
    formFieldErrorText: 'text-red-300',
  },
};

// ------------------------------------------------------------------ //
// Hero — a tilted live "expiry radar" panel (pure CSS animation)
// ------------------------------------------------------------------ //

const HERO_BUCKETS = [
  { label: 'EXPIRED',    value: 1, tone: 'bg-red-400/10 border-red-400/35 text-red-300',       num: 'text-red-200' },
  { label: 'THIS WEEK',  value: 2, tone: 'bg-amber-400/10 border-amber-400/35 text-amber-300', num: 'text-amber-100' },
  { label: 'THIS MONTH', value: 2, tone: 'bg-brand-400/10 border-brand-400/30 text-brand-300', num: 'text-brand-100' },
  { label: '90 DAYS',    value: 4, tone: 'bg-slate-400/10 border-slate-400/25 text-slate-400', num: 'text-slate-200' },
];

function RadarHero() {
  return (
    <div
      aria-hidden
      className="relative w-full max-w-[640px] aspect-[4/3] rounded-[18px] bg-[#111a2e] border border-slate-400/[0.16] shadow-[0_60px_120px_rgba(2,6,23,0.7),0_0_0_1px_rgba(13,148,136,0.15)] p-5 sm:p-6 flex flex-col gap-4 animate-radar-tilt [transform-style:preserve-3d] motion-reduce:animate-none"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-brand-400" />
          <span className="font-bold text-sm tracking-[-0.01em] text-slate-100">Expiry radar</span>
          <span className="font-mono text-[11px] text-slate-500">next 90 days</span>
        </div>
        <span className="hidden sm:inline font-mono text-[11px] text-slate-500">148 documents</span>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] sm:grid-cols-[240px_minmax(0,1fr)] gap-4 flex-1">
        <div className="relative flex items-center justify-center min-h-[220px]">
          <div className="absolute w-60 h-60 rounded-full border border-slate-400/[0.18]" />
          <div className="absolute w-[170px] h-[170px] rounded-full border border-slate-400/[0.22]" />
          <div className="absolute w-[100px] h-[100px] rounded-full border border-red-400/45 bg-red-400/[0.06]" />
          <div className="absolute w-60 h-60 rounded-full animate-radar-sweep motion-reduce:animate-none [background:conic-gradient(from_0deg,rgba(45,212,191,0.35),transparent_70deg)]" />
          <span className="absolute left-[96px] top-[92px] w-2.5 h-2.5 rounded-full bg-red-400 shadow-[0_0_12px_#f87171] animate-radar-blip motion-reduce:animate-none" />
          <span className="absolute left-[150px] top-[70px] w-2 h-2 rounded-full bg-amber-400 shadow-[0_0_10px_#fbbf24] animate-radar-blip [animation-delay:.6s] motion-reduce:animate-none" />
          <span className="absolute left-[60px] top-[160px] w-2 h-2 rounded-full bg-amber-400 shadow-[0_0_10px_#fbbf24] animate-radar-blip [animation-delay:1.1s] motion-reduce:animate-none" />
          <span className="absolute left-[190px] top-[150px] w-[7px] h-[7px] rounded-full bg-brand-400" />
          <span className="absolute left-[40px] top-[60px] w-[7px] h-[7px] rounded-full bg-brand-400" />
        </div>

        <div className="grid grid-cols-2 gap-2.5 content-start">
          {HERO_BUCKETS.map((b) => (
            <div key={b.label} className={`rounded-[10px] px-3.5 py-3 border flex flex-col gap-1 ${b.tone}`}>
              <span className="font-mono text-[10px] tracking-label">{b.label}</span>
              <span className={`text-[26px] leading-none font-extrabold ${b.num}`}>{b.value}</span>
            </div>
          ))}
          <div className="col-span-2 flex flex-col gap-2 mt-1">
            <div className="flex items-center justify-between px-2.5 py-2 rounded-lg bg-white/[0.03] border border-slate-400/[0.12] text-xs text-slate-200">
              <span>Insurance · Plant 1</span>
              <span className="font-mono text-red-300">3d over</span>
            </div>
            <div className="flex items-center justify-between px-2.5 py-2 rounded-lg bg-white/[0.03] border border-slate-400/[0.12] text-xs text-slate-200">
              <span>GST registration</span>
              <span className="font-mono text-amber-300">6d</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
