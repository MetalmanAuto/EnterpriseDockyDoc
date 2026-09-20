import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'DockyDoc security and data locations',
  description: 'Where DockyDoc keeps your files and data, who processes them, and how they are protected.',
};

const PROCESSORS: { name: string; what: string; where: string }[] = [
  { name: 'Amazon Web Services (S3)', what: 'Encrypted file storage', where: 'Mumbai, India, with a copy in Singapore' },
  { name: 'Neon', what: 'Database (document details, dates, accounts)', where: 'Singapore' },
  { name: 'Render', what: 'Application servers', where: 'Singapore' },
  { name: 'Vercel', what: 'Web application delivery', where: 'Global edge network; application code runs in Singapore' },
  { name: 'Clerk', what: 'Sign-in and two-factor authentication', where: 'United States' },
  { name: 'Anthropic', what: 'AI reading of documents and the assistant', where: 'United States; documents are not used to train models' },
  { name: 'Microsoft Azure Document Intelligence', what: 'OCR of scans and photos', where: 'Microsoft Azure; text only, not stored after reading' },
  { name: 'OpenAI and Mistral', what: 'OCR fallbacks when Azure cannot read a file', where: 'United States and European Union' },
  { name: 'Resend', what: 'Email reminders and notifications', where: 'United States' },
  { name: 'Razorpay', what: 'Payments from India', where: 'India' },
  { name: 'Paddle', what: 'Payments from outside India, tax collection', where: 'United Kingdom' },
];

export default function SecurityPage() {
  return (
    <section className="mx-auto max-w-4xl px-4 py-16">
      <h1 className="text-4xl font-extrabold tracking-tight">Security and where your data lives</h1>
      <p className="mt-4 text-ink-2 leading-relaxed">
        DockyDoc holds passports, contracts and licences, so this page says plainly what protects them, where they are, and who else touches them. It is written for the person who has to answer a customer's security questionnaire.
      </p>

      <h2 className="mt-12 text-2xl font-bold">How files and data are protected</h2>
      <ul className="mt-4 space-y-3 text-sm text-ink-2 leading-relaxed">
        <li><strong className="text-ink">In transit:</strong> every connection uses TLS. There is no unencrypted path to the app, the API or storage.</li>
        <li><strong className="text-ink">At rest:</strong> files are stored in a private bucket with server-side encryption; the database is encrypted at rest by the provider.</li>
        <li><strong className="text-ink">Downloads:</strong> files are never public. Every download is a short-lived signed link tied to a signed-in user or a share link you created.</li>
        <li><strong className="text-ink">Sign-in:</strong> handled by Clerk with verified email and optional two-factor authentication; Team workspaces can require two-factor for everyone. DockyDoc never stores your password.</li>
        <li><strong className="text-ink">Access:</strong> workspace roles Owner, Admin, Editor and Viewer; API keys are hashed, scoped to read or write, and revocable; share links can carry a password and an expiry and can be revoked.</li>
        <li><strong className="text-ink">Audit:</strong> uploads, downloads, shares, deletions and member changes are logged with who and when; Business and Team can export the log.</li>
        <li><strong className="text-ink">Backups:</strong> file versioning with a copy in a second region, database point-in-time restore, and a monthly restore drill.</li>
        <li><strong className="text-ink">Deletion:</strong> deleted documents sit in a bin (30 to 90 days by plan, or a retention policy you set) and are then shredded from storage. You can delete your whole account yourself from Settings.</li>
      </ul>

      <h2 className="mt-12 text-2xl font-bold">Who processes your data</h2>
      <p className="mt-2 text-sm text-ink-2">DockyDoc is run by Excelleta Tech Private Limited, New Delhi, India. These providers process data on its behalf under written data processing terms.</p>
      <div className="mt-4 overflow-x-auto rounded-xl border border-stroke">
        <table className="w-full text-sm">
          <thead className="bg-surface-high text-left text-xs uppercase tracking-wide text-ink-3">
            <tr><th className="px-4 py-2">Provider</th><th className="px-4 py-2">What it does</th><th className="px-4 py-2">Where</th></tr>
          </thead>
          <tbody>
            {PROCESSORS.map((p) => (
              <tr key={p.name} className="border-t border-stroke-soft">
                <td className="px-4 py-2.5 font-medium text-ink whitespace-nowrap">{p.name}</td>
                <td className="px-4 py-2.5 text-ink-2">{p.what}</td>
                <td className="px-4 py-2.5 text-ink-2">{p.where}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mt-12 text-2xl font-bold">Your rights</h2>
      <p className="mt-2 text-sm text-ink-2 leading-relaxed">
        Wherever you are, you can see, export and delete everything DockyDoc holds about you from Settings, without asking. For people in the European Union and the United Kingdom this is under GDPR and UK GDPR; for people in India under the Digital Personal Data Protection Act 2023. Questions and requests go to <a href="mailto:privacy@dockydoc.app" className="underline">privacy@dockydoc.app</a> and are answered within 30 days. If DockyDoc ever suffers a breach affecting your data, you are told within 72 hours of it being confirmed.
      </p>

      <h2 className="mt-12 text-2xl font-bold">Reporting a security problem</h2>
      <p className="mt-2 text-sm text-ink-2 leading-relaxed">
        Email <a href="mailto:security@dockydoc.app" className="underline">security@dockydoc.app</a>. Reports are acknowledged within two working days and fixed before they are discussed publicly.
      </p>
    </section>
  );
}
