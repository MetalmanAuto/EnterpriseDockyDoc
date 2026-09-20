import type { Metadata } from 'next';
import Link from 'next/link';
import LegalPage from '@/components/marketing/LegalPage';

export const metadata: Metadata = { title: 'DockyDoc privacy policy' };

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy policy"
      updated="21 September 2026"
      intro="DockyDoc exists to hold documents that are private by nature, so this policy is written to be read. It says what we collect, why, where it goes, how long we keep it, and how you get it back or delete it. Excelleta Tech Private Limited, New Delhi, India, is the data controller (and “data fiduciary” under Indian law)."
    >
      <section>
        <h2>1. What we collect</h2>
        <ul>
          <li><strong>Account details:</strong> name, email address, and sign-in records, handled by our sign-in provider Clerk. We never see or store your password.</li>
          <li><strong>Your documents:</strong> the files you upload, the text read from them, and the dates, names and numbers found in them, including personal data they contain (for example passport details).</li>
          <li><strong>Workspace data:</strong> workspace names, members and roles, folders, labels, reminders, share links and who opened them.</li>
          <li><strong>Usage records:</strong> an activity log of uploads, downloads, shares and member changes, AI actions used, and API requests, with timestamps and IP addresses kept for security.</li>
          <li><strong>Billing details:</strong> plan, invoices and payment status. Card and bank details are held by Razorpay or Paddle, never by us.</li>
          <li><strong>Marketing measurement:</strong> only if you accept it in the cookie banner, our advertising partners' tags record that their ad led to a visit or sign-up.</li>
        </ul>
      </section>
      <section>
        <h2>2. Why, and on what legal basis</h2>
        <ul>
          <li>To provide the service you asked for: storing, reading, reminding, sharing (performance of a contract).</li>
          <li>To keep the service secure and prevent abuse: activity logs, rate limits, fraud checks (legitimate interest, and legal obligation).</li>
          <li>To bill you and keep accounts, including tax records (legal obligation).</li>
          <li>To send you emails about your account, reminders you set, and important changes (contract). Marketing emails only with your consent, with an unsubscribe link in each.</li>
          <li>To measure advertising (consent, given in the cookie banner and withdrawable there).</li>
        </ul>
        <p>For people in India, the Digital Personal Data Protection Act 2023 applies; the notice at sign-up is the consent under that Act, and you may withdraw it by deleting your account.</p>
      </section>
      <section>
        <h2>3. Who else processes your data, and where</h2>
        <p>The full list, with locations, is on the <Link href="/security">security page</Link> and is part of this policy. In short: files in Mumbai with a copy in Singapore, database and servers in Singapore, sign-in and AI reading in the United States, email in the United States, payments in India (Razorpay) or the United Kingdom (Paddle). Each provider works under a written data processing agreement. For transfers out of the European Union and the United Kingdom, those agreements include the standard contractual clauses approved for that purpose.</p>
        <p>AI providers receive the text of a document only to read it and return what they found. They do not keep it or use it to train models.</p>
        <p>We do not sell personal data and we do not share it with anyone else, except where the law requires it or to protect someone's safety.</p>
      </section>
      <section>
        <h2>4. How long we keep it</h2>
        <ul>
          <li>Documents: as long as your account exists, unless you delete them. Deleted documents sit in the bin for the period your plan sets (30 to 90 days, or a retention policy you choose) and are then permanently erased from storage and backups within a further 35 days.</li>
          <li>Account and workspace data: until you delete the account, then erased within 30 days.</li>
          <li>Activity logs: 12 months, then deleted.</li>
          <li>Invoices and tax records: 8 years, as Indian law requires, without the documents themselves.</li>
        </ul>
      </section>
      <section>
        <h2>5. Your rights</h2>
        <p>From Settings you can, at any time and without asking us: see everything we hold about you, download it (data export), correct your details, and delete your account and all its data. If you own a workspace with other members you are asked to hand it over or remove them first, so their data is not deleted by your choice.</p>
        <p>You can also ask us to restrict or object to processing, and, in the EU and UK, complain to your data protection authority. Requests go to <a href="mailto:privacy@dockydoc.app">privacy@dockydoc.app</a> and are answered within 30 days.</p>
        <p><strong>Grievance Officer (India, DPDP Act 2023):</strong> The Grievance Officer, Excelleta Tech Private Limited, Flat No. 706E, 7th Floor, Sector 19B Dwarka Front, Near MCD Toll, Dwarka, New Delhi 110075. Email <a href="mailto:privacy@dockydoc.app">privacy@dockydoc.app</a>. Grievances are acknowledged within 48 hours and resolved within 30 days.</p>
        <p><strong>EU and UK representatives:</strong> named here once appointed; until then, write to the Grievance Officer above.</p>
      </section>
      <section>
        <h2>6. Security</h2>
        <p>Encryption in transit and at rest, private storage with expiring download links, two-factor sign-in, role-based access, an activity log, backups in two regions and a monthly restore drill. Details are on the <Link href="/security">security page</Link>. If a breach affects your data we tell you and the relevant authority within 72 hours of confirming it.</p>
      </section>
      <section>
        <h2>7. Cookies</h2>
        <p>DockyDoc sets one essential cookie to keep you signed in and one to remember your cookie choice. Advertising measurement tags (Meta, LinkedIn, Google) load only after you press “Accept all” in the banner, and you can change that choice by clearing your browser's site data. We do not use analytics cookies beyond those.</p>
      </section>
      <section>
        <h2>8. Children</h2>
        <p>DockyDoc is for people aged 18 and over. Documents about children (for example a child's passport) may be stored by the adult responsible for them.</p>
      </section>
      <section>
        <h2>9. Changes</h2>
        <p>We tell you by email and in the app at least 14 days before a material change to this policy. The date at the top is the version in force.</p>
      </section>
    </LegalPage>
  );
}
