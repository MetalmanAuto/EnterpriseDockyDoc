import type { Metadata } from 'next';
import Link from 'next/link';
import LegalPage from '@/components/marketing/LegalPage';

export const metadata: Metadata = { title: 'DockyDoc terms of service' };

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of service"
      updated="21 September 2026"
      intro="These terms are the agreement between you and Excelleta Tech Private Limited (“Excelleta”, “we”) for the use of DockyDoc at dockydoc.app, its API and its related services. By creating an account or using the service you accept them. If you use DockyDoc for a company, you confirm you may bind that company."
    >
      <section>
        <h2>1. What DockyDoc is</h2>
        <p>DockyDoc stores documents you upload, reads them with optical character recognition and AI to find dates, issuers and reference numbers, sends reminders before dates lapse, lets you share documents by link, and offers an API for software you connect. It is a tool to help you keep track of documents; it does not give legal, tax or compliance advice.</p>
      </section>
      <section>
        <h2>2. Your account</h2>
        <p>You must be at least 18 and give a working email address. You are responsible for what happens under your account and for keeping your sign-in and API keys private. Tell us at <a href="mailto:security@dockydoc.app">security@dockydoc.app</a> at once if you think your account has been used without permission.</p>
        <p>A workspace belongs to its Owner. The Owner's plan sets the limits for everyone in that workspace and the Owner is responsible for the documents in it and for the members they add.</p>
      </section>
      <section>
        <h2>3. Plans, payment and renewal</h2>
        <p>Plans, limits and prices are on the <Link href="/pricing">pricing page</Link>. Paid plans renew automatically, monthly or yearly, until cancelled. You can cancel any time from Settings; the plan then stays active until the end of the period already paid for. Extra AI actions bought as top-ups are valid for 12 months.</p>
        <p>Payments from India are taken by Razorpay in rupees; Indian GST applies. Payments from elsewhere are taken by Paddle, which acts as the merchant of record and adds the taxes of your country at checkout. Refunds are described in the <Link href="/refunds">refund policy</Link>.</p>
        <p>If a payment fails we tell you and retry for 14 days. If it still fails the account drops to the Free plan; your documents are kept, but anything over the Free limits is read-only until the account is upgraded or reduced.</p>
        <p>We may change prices with 30 days' notice by email. A change applies from your next renewal after the notice.</p>
      </section>
      <section>
        <h2>4. AI features</h2>
        <p>Dates, names and numbers found by AI are suggestions with a confidence score. They can be wrong, especially on poor scans. You must check them before relying on them, and DockyDoc is not responsible for a missed renewal caused by a misread date. Documents are sent to the AI providers listed on the <Link href="/security">security page</Link> only to be read; they are not used to train models.</p>
        <p>One AI action is defined on the pricing page. Actions are counted when the work is done and are not refunded if a document turns out to be unreadable.</p>
      </section>
      <section>
        <h2>5. Your content</h2>
        <p>You keep every right to the documents you upload. You give us only the permission needed to store, read, show, back up and deliver them as the service requires, to you and to the people you share with. You confirm you have the right to upload what you upload and that it does not break the <Link href="/acceptable-use">acceptable use policy</Link>.</p>
        <p>We do not look at your documents except to fix a problem you have reported, to investigate abuse, or where the law requires it.</p>
      </section>
      <section>
        <h2>6. Sharing and the API</h2>
        <p>A share link gives anyone who has it the access you set. You are responsible for who you send links to and for revoking them. API keys act as you; anything done with a key counts as done by you. Business and Team plans include the API; keys stop working if the plan is reduced.</p>
      </section>
      <section>
        <h2>7. Privacy</h2>
        <p>How we handle personal data is in the <Link href="/privacy">privacy policy</Link>, which is part of these terms. Business and Team customers who need a signed data processing agreement can request one at <a href="mailto:privacy@dockydoc.app">privacy@dockydoc.app</a>.</p>
      </section>
      <section>
        <h2>8. Availability and support</h2>
        <p>We aim to keep DockyDoc available at all times and publish incidents on the status page. Team plans carry a 99.9% monthly uptime commitment; if it is missed, the remedy is a credit of one month's fee for that month, claimed within 30 days. Support response times are those listed for each plan on the pricing page.</p>
      </section>
      <section>
        <h2>9. Ending the agreement</h2>
        <p>You can delete your account at any time from Settings; this permanently removes your data as described in the privacy policy. We may suspend or end an account that breaks these terms or the acceptable use policy, does not pay, or exposes us or other customers to legal risk. Where we can, we give notice and time to export your documents.</p>
        <p>If we ever close the service we give at least 90 days' notice and keep export working until then.</p>
      </section>
      <section>
        <h2>10. What we are not liable for</h2>
        <p>To the extent the law allows, DockyDoc is provided as is. We are not liable for indirect or consequential loss, lost profits, or loss caused by a misread document, a missed reminder, a share link you sent, or events outside our control. Our total liability to you in any 12-month period is limited to the amount you paid us in that period. Nothing here limits liability that cannot be limited by law.</p>
      </section>
      <section>
        <h2>11. Law and disputes</h2>
        <p>These terms are governed by the laws of India. Disputes go to the courts of New Delhi, after both sides have tried for 30 days to settle the matter by discussion. Consumers in the European Union and the United Kingdom keep any rights their local law gives them that cannot be taken away by contract.</p>
      </section>
      <section>
        <h2>12. Changes and contact</h2>
        <p>We may update these terms; material changes are announced by email and in the app at least 14 days before they take effect. Continuing to use DockyDoc after that date is acceptance. Questions: <a href="mailto:support@dockydoc.app">support@dockydoc.app</a>, or by post to Excelleta Tech Private Limited, Flat No. 706E, 7th Floor, Sector 19B Dwarka Front, Near MCD Toll, Dwarka, New Delhi 110075, India. GSTIN 07AAHCE4776H1ZC.</p>
      </section>
    </LegalPage>
  );
}
