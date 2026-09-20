import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import PricingTable from '@/components/billing/PricingTable';

export const metadata: Metadata = {
  title: 'DockyDoc: never miss an expiry again',
  description:
    'Upload licences, certificates, passports, visas, insurance and contracts. DockyDoc reads the expiry dates with AI, reminds you before they lapse, and hands the file to your assistant when you ask.',
  openGraph: {
    title: 'DockyDoc: the compliance vault for small companies',
    description: 'Every licence, certificate, policy and contract, with its expiry date read by AI and a reminder before it lapses.',
    url: 'https://dockydoc.app',
    siteName: 'DockyDoc',
    images: [{ url: 'https://dockydoc.app/marketing/documents.png', width: 2880, height: 1800 }],
    type: 'website',
  },
};

const DOCUMENT_TYPES = [
  'Factory and trade licences', 'ISO, IATF and other certificates', 'Insurance policies', 'Contracts and agreements',
  'Passports and visas', 'Vehicle registration and pollution certificates', 'GST, PAN and tax records', 'Tenders and bank guarantees',
];

const FAQ: { q: string; a: string }[] = [
  { q: 'How does DockyDoc find the expiry date?', a: 'Every upload is read by OCR and then by an AI model that looks for issue, expiry and renewal dates, the issuer and reference numbers. It fills those in and shows its confidence; you can correct anything with one click.' },
  { q: 'What is an AI action?', a: 'Reading one document of up to 20 pages, answering one assistant question, or serving one API request. Free includes 10 a month, Personal 50, Business 300 and Team 1,000. Paid plans can buy more, 100 for $5.' },
  { q: 'Where is my data kept?', a: 'Files are stored encrypted in Mumbai with a copy in Singapore; the database is in Singapore. Sign-in and AI reading use providers in the United States. The security page lists every provider.' },
  { q: 'Can my team use it?', a: 'Yes. Personal covers three people, Business ten per workspace across three workspaces, Team twenty-five across ten. Roles are Owner, Admin, Editor and Viewer.' },
  { q: 'Can I get a document through WhatsApp or my own AI assistant?', a: 'On Business and Team, yes. DockyDoc has a REST API and an MCP server, so an assistant such as Clawdbot can say "send me my passport" and receive a link that expires.' },
  { q: 'Can I cancel?', a: 'Any time, from Settings. Monthly plans stop at the end of the month you paid for. Yearly plans carry a 14-day money-back promise.' },
];

export default function LandingPage() {
  return (
    <>
      {/* Hero */}
      <section className="mx-auto max-w-6xl px-4 pt-16 pb-10 sm:pt-24">
        <div className="max-w-3xl">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand-600">For small companies and families</p>
          <h1 className="mt-3 text-4xl sm:text-5xl font-extrabold tracking-[-0.03em] leading-[1.05]">
            Every licence, certificate and contract, with its expiry date read by AI and a reminder before it lapses.
          </h1>
          <p className="mt-5 text-lg text-ink-2 leading-relaxed">
            Upload once. DockyDoc reads the dates, files the document, reminds the right person in time, and hands the file to your assistant on WhatsApp when you ask for it.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/register" className="h-11 px-5 inline-flex items-center rounded-lg bg-brand-600 text-white font-semibold hover:bg-brand-700">Start free, no card needed</Link>
            <Link href="/pricing" className="h-11 px-5 inline-flex items-center rounded-lg border border-stroke font-semibold text-ink hover:bg-surface-high">See pricing</Link>
          </div>
          <p className="mt-3 text-xs text-ink-3">Free includes 10 documents and 10 AI reads a month. Upgrade when you outgrow it.</p>
        </div>
        <div className="mt-12 rounded-2xl border border-stroke bg-surface p-2 shadow-xl">
          <Image src="/marketing/documents.png" alt="The DockyDoc documents list, showing expiry dates and status for each file" width={1440} height={900} priority className="rounded-xl" />
        </div>
      </section>

      {/* Three things it does */}
      <section className="mx-auto max-w-6xl px-4 py-16 grid gap-6 md:grid-cols-3">
        <Feature title="Reads the dates for you" body="Scans, photos and PDFs are read by OCR and AI. Expiry, renewal and issue dates, issuer and reference numbers appear on the document with a confidence score. Sixty seconds after upload, not sixty minutes of typing." />
        <Feature title="Reminds the right person in time" body="Set reminders on any document, or let DockyDoc set them from the dates it found. Email reminders go to the people responsible, 90, 30 and 7 days before, until it is renewed." />
        <Feature title="Hands the file over when asked" body="Share a link with a password and an expiry. Or connect an assistant through the API and MCP, and say “send me the ISO certificate” on WhatsApp to get a link that expires in an hour." />
      </section>

      {/* Built for compliance */}
      <section className="bg-surface border-y border-stroke-soft">
        <div className="mx-auto max-w-6xl px-4 py-16 grid gap-10 md:grid-cols-2 items-center">
          <div>
            <h2 className="text-3xl font-extrabold tracking-tight">Built for the documents that expire</h2>
            <p className="mt-3 text-ink-2 leading-relaxed">
              A small company renews a dozen things a year and a missed one stops a shipment or a factory. A family has passports, visas and policies with dates nobody remembers. DockyDoc is one place for both, with roles so the accountant sees the tax file and the driver sees the vehicle papers.
            </p>
            <ul className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-ink-2">
              {DOCUMENT_TYPES.map((t) => (
                <li key={t} className="flex items-start gap-2"><span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />{t}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-stroke bg-canvas p-2 shadow-lg">
            <Image src="/marketing/dashboard.png" alt="The DockyDoc dashboard with documents expiring soon" width={1440} height={900} className="rounded-xl" />
          </div>
        </div>
      </section>

      {/* Security strip */}
      <section className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="text-3xl font-extrabold tracking-tight">Treated like the originals</h2>
        <p className="mt-3 text-ink-2 max-w-2xl">These are passports and contracts, so the boring parts are done properly.</p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Badge title="Encrypted end to end" body="TLS on every request, encryption at rest for the database and every file, private storage with expiring download links." />
          <Badge title="Backed up twice" body="Files kept in Mumbai with a copy in Singapore, database with point-in-time restore, a restore drill every month." />
          <Badge title="You control access" body="Owner, Admin, Editor and Viewer roles, two-factor sign-in, share links you can revoke, an activity log of every action." />
          <Badge title="Privacy by law, not by promise" body="GDPR and UK GDPR for Europe, DPDP for India. Export or delete your account yourself, any time." />
        </div>
        <Link href="/security" className="mt-6 inline-block text-sm font-semibold text-brand-600 hover:underline">Where your data lives and who touches it</Link>
      </section>

      {/* Pricing */}
      <section id="pricing" className="bg-surface border-y border-stroke-soft">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="text-3xl font-extrabold tracking-tight text-center">Simple prices, yearly is two months free</h2>
          <p className="mt-3 text-ink-2 text-center max-w-2xl mx-auto">Start free. Move up when you need more documents, more people, or the API.</p>
          <div className="mt-10"><PricingTable signupHref="/register" /></div>
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-3xl px-4 py-16">
        <h2 className="text-3xl font-extrabold tracking-tight">Questions people ask</h2>
        <dl className="mt-8 divide-y divide-stroke-soft">
          {FAQ.map((f) => (
            <div key={f.q} className="py-5">
              <dt className="font-semibold text-ink">{f.q}</dt>
              <dd className="mt-2 text-sm text-ink-2 leading-relaxed">{f.a}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-8 rounded-2xl border border-brand-500/40 bg-brand-500/5 p-6 text-center">
          <p className="text-lg font-bold">Ten documents, free, in the next two minutes.</p>
          <Link href="/register" className="mt-4 inline-flex h-11 px-5 items-center rounded-lg bg-brand-600 text-white font-semibold hover:bg-brand-700">Start free</Link>
        </div>
      </section>
    </>
  );
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-stroke bg-surface p-6">
      <h3 className="text-lg font-bold">{title}</h3>
      <p className="mt-2 text-sm text-ink-2 leading-relaxed">{body}</p>
    </div>
  );
}

function Badge({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-stroke bg-surface p-5">
      <p className="font-semibold">{title}</p>
      <p className="mt-1.5 text-sm text-ink-2 leading-relaxed">{body}</p>
    </div>
  );
}
