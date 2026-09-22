import type { Metadata } from 'next';
import { cookies, headers } from 'next/headers';
import PricingTable from '@/components/billing/PricingTable';

export const metadata: Metadata = {
  title: 'DockyDoc pricing',
  description: 'Free for ten documents. Personal ₹499 or $6, Business ₹1,899 or $23 with API access, Team ₹4,899 or $59. Yearly plans are two months free.',
};

export default async function PublicPricingPage() {
  // The cookie is set by the middleware on the first response, so on a first
  // visit read Vercel's country header directly.
  const country = (await cookies()).get('dd_country')?.value ?? (await headers()).get('x-vercel-ip-country') ?? undefined;
  const currency = country === 'IN' ? 'INR' : 'USD';

  return (
    <section className="mx-auto max-w-7xl px-4 sm:px-6 py-16">
      <div className="max-w-2xl">
        <h1 className="font-display text-4xl sm:text-5xl font-extrabold tracking-[-0.03em]">Pricing</h1>
        <p className="mt-4 text-ink-2 leading-relaxed">
          Documents and people are generous on every plan. AI actions, workspaces and the API are what you pay more for. Change plan or cancel any time.
        </p>
      </div>
      <div className="mt-10"><PricingTable signupHref="/register" currency={currency} /></div>
      <div className="mt-14 grid gap-8 sm:grid-cols-3 text-sm text-ink-2">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.12em] text-brand-600">What counts as an AI action</p>
          <p className="mt-2 leading-relaxed">Reading one uploaded document of up to 20 pages (21 to 50 pages count as two, more as three), one assistant question, or one API request that finds or fetches a document.</p>
        </div>
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.12em] text-brand-600">Taxes and currency</p>
          <p className="mt-2 leading-relaxed">Indian customers pay in rupees through Razorpay. GST is included for Personal and added for companies. Everyone else pays in their own currency and local tax is added at checkout.</p>
        </div>
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.12em] text-brand-600">Money back</p>
          <p className="mt-2 leading-relaxed">Yearly plans carry a 14-day money-back promise. Monthly plans can be cancelled any time and stop at the end of the month paid for.</p>
        </div>
      </div>
    </section>
  );
}
