import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { cookies, headers } from 'next/headers';
import PricingTable from '@/components/billing/PricingTable';
import { Ledger, Radar } from '@/components/marketing/ExpiryLedger';

export const metadata: Metadata = {
  title: 'DockyDoc: every expiry in one ledger',
  description:
    'Upload licences, certificates, insurance, contracts and passports. DockyDoc reads the expiry dates, keeps the ledger, and chases the right person on WhatsApp and email until the renewed copy is in.',
  openGraph: {
    title: 'DockyDoc: every expiry in one ledger. Nothing lapses unnoticed.',
    description: 'Licences, certificates, policies and contracts, read by AI, with the right person told before they lapse.',
    url: 'https://dockydoc.app',
    siteName: 'DockyDoc',
    images: [{ url: 'https://dockydoc.app/marketing/cabinet.jpg', width: 1600, height: 1075 }],
    type: 'website',
  },
};

const DOCUMENT_TYPES = [
  'GST and PAN records', 'Factory and trade licences', 'Pollution consents', 'ISO, IATF and BIS certificates',
  'Vehicle papers, the whole fleet', 'Tenders and bank guarantees', 'Rent and supply contracts', 'Employee passports and visas',
];

const FAQ: { q: string; a: string }[] = [
  { q: 'How does DockyDoc find the expiry date?', a: 'Every upload is read by OCR and then by an AI model that looks for issue, expiry and renewal dates, the issuer and reference numbers. It fills those in and shows its confidence. Wrong? One click to correct.' },
  { q: 'Who gets the reminder?', a: 'The owner you set on the document, 30, 7 and 1 day before, by email and on WhatsApp, until the renewed copy is uploaded. The workspace owner sees everything overdue on one screen.' },
  { q: 'What is an AI action?', a: 'Reading one document of up to 20 pages, answering one assistant question, or serving one API request. Free includes 10 a month, Personal 50, Business 300 and Team 1,000. Paid plans can buy more.' },
  { q: 'Where is my data kept?', a: 'Files are stored encrypted in Mumbai with a copy in Singapore. The database is in Singapore. Sign-in and AI reading use providers in the United States. The security page lists every provider.' },
  { q: 'Can a CA firm run its clients on it?', a: 'Yes. Each client gets a workspace, the client’s own accountant gets a login with a role, and the reminders go to them. Business covers three workspaces, Team ten.' },
  { q: 'Can I cancel?', a: 'Any time, from Settings. Monthly plans stop at the end of the month you paid for. Yearly plans carry a 14-day money-back promise.' },
];

export default async function LandingPage() {
  // The cookie is set by the middleware on the first response, so on a first
  // visit read Vercel's country header directly.
  const country = (await cookies()).get('dd_country')?.value ?? (await headers()).get('x-vercel-ip-country') ?? undefined;
  const currency = country === 'IN' ? 'INR' : 'USD';

  return (
    <>
      {/* Hero */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 pt-14 sm:pt-20 pb-10">
        <p className="font-mono text-xs sm:text-[13px] text-brand-600">For the person who owns compliance at a plant, a fleet or a CA firm</p>
        <h1 className="mt-5 font-display text-[44px] leading-[0.98] sm:text-7xl lg:text-[88px] font-extrabold tracking-[-0.03em] max-w-5xl text-balance">
          Every expiry in one ledger. Nothing lapses unnoticed.
        </h1>
        <p className="mt-6 max-w-2xl text-lg sm:text-xl text-ink-2 leading-relaxed">
          Upload the paper. DockyDoc reads the dates, keeps the ledger, and chases the right person on WhatsApp and email until the renewed copy is in.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-4">
          <Link href="/register" className="h-12 px-6 inline-flex items-center rounded-md bg-brand-600 text-[15px] font-bold">Start free, 10 documents</Link>
          <Link href="#ledger" className="h-12 px-2 inline-flex items-center text-[15px] font-medium text-ink border-b border-ink/40 hover:border-ink">See the ledger</Link>
        </div>
        <p className="mt-3 font-mono text-xs text-ink-3">No card. Paid plans from {currency === 'INR' ? '₹499' : '$6'} a month.</p>
      </section>

      {/* Radar and ledger */}
      <section id="ledger" className="mx-auto max-w-7xl px-4 sm:px-6 py-10 sm:py-14 scroll-mt-20">
        <div className="grid gap-8 lg:grid-cols-[460px_minmax(0,1fr)] lg:items-start">
          <div className="mx-auto w-full max-w-[460px]">
            <Radar />
            <p className="mt-2 text-center font-mono text-xs text-ink-3">Nearer the centre, sooner it lapses.</p>
          </div>
          <div>
            <Ledger />
            <div className="mt-6 flex flex-col sm:flex-row sm:items-center gap-4 sm:justify-between">
              <p className="font-mono text-xs sm:text-[13px] text-ink-3 max-w-xl leading-relaxed">
                A ledger like this one, read from the paper you already have. Dates are found by OCR and a model, shown with a confidence score, corrected in one click.
              </p>
              <Link href="/register" className="h-11 px-5 inline-flex items-center justify-center rounded-md bg-brand-600 text-sm font-bold whitespace-nowrap">Start with 10 documents, free</Link>
            </div>
          </div>
        </div>
      </section>

      {/* The cabinet */}
      <section className="border-y border-stroke-soft">
        <div className="mx-auto max-w-7xl grid lg:grid-cols-2">
          <div className="relative min-h-[320px] lg:min-h-[560px]">
            <Image src="/marketing/cabinet.jpg" alt="A steel filing cabinet drawer full of client folders" fill sizes="(min-width: 1024px) 50vw, 100vw" className="object-cover saturate-[0.85]" />
          </div>
          <div className="px-4 sm:px-6 lg:px-14 py-14 lg:py-20 flex flex-col justify-center gap-6">
            <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-[-0.02em] leading-[1.05] text-balance">Your cabinet, read by a machine and watched by a clock</h2>
            <p className="text-ink-2 leading-relaxed text-[17px]">
              A CA firm with 60 clients holds a few thousand documents that expire. Put each client in its own workspace, give the client&rsquo;s accountant a login, and let the reminders do the chasing. Bulk upload takes a whole folder at once.
            </p>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 font-mono text-sm text-ink">
              {DOCUMENT_TYPES.map((t) => (
                <li key={t} className="py-2.5 border-b border-stroke">{t}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Three points */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 py-16 grid gap-10 md:grid-cols-3">
        <Point label="Ask for it, get it" body="Say “send me the fire NOC” on WhatsApp and get a link that dies in an hour. The auditor gets the file, not your login." />
        <Point label="Legal hold and retention" body="Freeze a document so nobody can delete it during a dispute. Set a folder to keep files for seven years, then shred." />
        <Point label="Activity you can export" body="Who uploaded, who downloaded, who shared, as a CSV for the auditor. Data stays in Mumbai with a copy in Singapore." />
      </section>

      {/* The desk */}
      <section className="border-y border-stroke-soft bg-surface">
        <div className="mx-auto max-w-7xl grid lg:grid-cols-2">
          <div className="px-4 sm:px-6 lg:px-14 py-14 lg:py-20 flex flex-col justify-center gap-5 order-2 lg:order-1">
            <p className="font-mono text-xs text-brand-600">Why it exists</p>
            <p className="font-display text-2xl sm:text-[28px] leading-[1.3] font-medium text-balance">
              &ldquo;At Metalman we renew about forty licences and certificates a year across our plants. One missed date can stop a shipment or a line. DockyDoc exists so the person who has to act hears about it in time, without anyone keeping a spreadsheet.&rdquo;
            </p>
            <p className="text-sm text-ink-2">Nishant Jairath, Director, Metalman Auto. Founder, DockyDoc.</p>
          </div>
          <div className="relative min-h-[320px] lg:min-h-[520px] order-1 lg:order-2">
            <Image src="/marketing/desk.jpg" alt="A factory office desk with a licence under a brass paperweight" fill sizes="(min-width: 1024px) 50vw, 100vw" className="object-cover saturate-[0.9]" />
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="mx-auto max-w-7xl px-4 sm:px-6 py-16 sm:py-20">
        <div className="max-w-2xl">
          <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-[-0.02em]">Pricing</h2>
          <p className="mt-3 text-ink-2 leading-relaxed">
            {currency === 'INR' ? 'Rupees through Razorpay with a GST invoice.' : 'Paid in your own currency, local tax added at checkout.'} Yearly is two months free. Cancel any time from Settings.
          </p>
        </div>
        <div className="mt-10"><PricingTable signupHref="/register" currency={currency} /></div>
      </section>

      {/* FAQ */}
      <section className="border-t border-stroke-soft">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-16 grid gap-10 lg:grid-cols-[320px_minmax(0,1fr)]">
          <h2 className="font-display text-3xl font-bold tracking-[-0.02em]">Questions people ask</h2>
          <dl className="divide-y divide-stroke-soft">
            {FAQ.map((f) => (
              <div key={f.q} className="py-5 grid gap-2 sm:grid-cols-[280px_minmax(0,1fr)] sm:gap-8">
                <dt className="font-semibold text-ink">{f.q}</dt>
                <dd className="text-sm text-ink-2 leading-relaxed">{f.a}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* Last call */}
      <section className="border-t border-stroke-soft">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-16 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
          <p className="font-display text-2xl sm:text-[34px] font-bold tracking-[-0.02em] leading-[1.15] max-w-3xl text-balance">Upload the one that worries you. The ledger starts from there.</p>
          <Link href="/register" className="h-12 px-6 inline-flex items-center justify-center rounded-md bg-brand-600 text-[15px] font-bold whitespace-nowrap">Start free</Link>
        </div>
      </section>
    </>
  );
}

function Point({ label, body }: { label: string; body: string }) {
  return (
    <div>
      <p className="font-mono text-[13px] text-brand-600">{label}</p>
      <p className="mt-3 text-[17px] text-ink-2 leading-relaxed">{body}</p>
    </div>
  );
}
