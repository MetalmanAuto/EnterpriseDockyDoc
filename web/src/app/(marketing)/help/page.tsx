import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Help centre | DockyDoc',
  description: 'How to upload documents, let the AI read them, set reminders, share safely, manage workspaces, plans and the API.',
};

const SECTIONS: { id: string; title: string; items: { q: string; a: React.ReactNode }[] }[] = [
  {
    id: 'start',
    title: 'Getting started',
    items: [
      { q: 'What is DockyDoc for?', a: 'Keeping documents that expire or renew in one place, with the dates read out automatically and reminders before they lapse. Passports, visas, insurance, licences, leases, contracts, certificates.' },
      { q: 'What should I do first?', a: <>Upload one real document from the <Link href="/documents" className="underline">Documents</Link> page. DockyDoc reads it, suggests the type, issuer and expiry date, and you confirm. Then ask the assistant something like &ldquo;what expires this quarter&rdquo;.</> },
      { q: 'Which file types work?', a: 'PDF, JPG, PNG, WebP, GIF, Word, Excel and PowerPoint. Scans and phone photos are fine; the text is read by OCR. Programs and web pages dressed up as documents are refused.' },
      { q: 'Is there a size limit?', a: 'Each file can be up to 50 MB. Very long documents count as more than one AI action to read (two above 20 pages, three above 50).' },
      { q: 'Can I upload many at once?', a: 'Yes. On the Documents page choose Upload many, or drop several files or a whole folder onto the page. Each file becomes one document with the same folder and labels; a dropped folder can keep its sub-folders. Three upload at a time and the AI reads them in turn, so a hundred files take a few minutes. If a file is refused, the line says why and you can retry the failures.' },
    ],
  },
  {
    id: 'ai',
    title: 'AI reading and the assistant',
    items: [
      { q: 'What does the AI read?', a: 'The text of the file, to find the document type, issuer, holder, reference numbers and dates. Suggested dates are marked as suggestions until you confirm them.' },
      { q: 'What is an AI action?', a: 'One document read (of up to 20 pages), one assistant question, one API find, or one report insight. Each plan includes a monthly number; paid plans can buy more from the Billing page. Actions you buy do not expire for 12 months.' },
      { q: 'Is my data used to train models?', a: 'No. Files are sent to the model only to answer your request, under agreements that exclude training. See the security page for the list of processors.' },
      { q: 'Can I use my own AI key?', a: 'Yes. In Settings, choose Bring your own key and paste an Anthropic key. Reads then bill to your key and are not counted as AI actions.' },
      { q: 'The assistant gave a wrong answer', a: 'Open the document it cited and check the dates. If a date was misread, correct it on the document; the assistant uses the confirmed value from then on. Reply to any DockyDoc email to report a bad read.' },
    ],
  },
  {
    id: 'reminders',
    title: 'Expiry dates and reminders',
    items: [
      { q: 'When do reminders go out?', a: '90, 30, 7 and 1 day before the expiry or renewal date, by email, to the people you choose on the document. You can snooze a document or turn its reminders off.' },
      { q: 'Can I set my own dates?', a: 'Yes. Edit the document and set the expiry and renewal due dates by hand. Reminders follow whatever dates are saved.' },
      { q: 'Where do I see everything expiring?', a: 'The Reminders page lists upcoming and overdue items; the Dashboard shows the next 30 days; Reports gives the per-month picture.' },
    ],
  },
  {
    id: 'sharing',
    title: 'Sharing',
    items: [
      { q: 'How do share links work?', a: 'A link opens one document for anyone who has it, read-only or with download. On paid plans you can add a password and an expiry to the link and see who opened it. On Free, links stop working after 7 days.' },
      { q: 'Can I revoke a link?', a: 'Yes, from the document page. The link stops working at once. Every open is written to the activity log.' },
    ],
  },
  {
    id: 'workspaces',
    title: 'Workspaces, members and roles',
    items: [
      { q: 'What is a workspace?', a: 'A container of documents with its own members. A person has one on Free and Personal, three on Business, ten on Team. Companies use one per entity or department.' },
      { q: 'What can each role do?', a: 'Viewer reads and downloads. Editor uploads, edits and deletes. Admin also manages members, folders, retention and legal hold. Owner can do everything, including billing and deleting the workspace.' },
      { q: 'How do I invite someone?', a: 'Members page → Invite. They get an email link; the invitation expires in 7 days. Member limits depend on the workspace owner\'s plan.' },
    ],
  },
  {
    id: 'retention',
    title: 'Deleting, the bin, retention and legal hold',
    items: [
      { q: 'What happens when I delete a document?', a: 'It moves to the bin, where it can be restored. The bin empties itself after the number of days set in Settings → Retention (30 by default, up to 90 on Business and Team). Shred deletes it at once.' },
      { q: 'What is a folder retention rule?', a: 'Edit a folder and set a number of days. Documents in it move to the bin that many days after their expiry date (or after upload if they have none). Useful for records you must not keep beyond a period.' },
      { q: 'What is legal hold?', a: 'An admin can freeze a document from its page. It cannot be deleted, shredded or aged out until the hold is lifted, and every change is logged.' },
    ],
  },
  {
    id: 'billing',
    title: 'Plans and billing',
    items: [
      { q: 'How do I upgrade?', a: <>Open <Link href="/plans" className="underline">Plans</Link>, pick a plan and pay in rupees (Razorpay) or dollars (Paddle). The plan is active the moment the payment goes through.</> },
      { q: 'Can I cancel?', a: 'Any time, from the Billing page. Your plan runs until the end of the period you paid for, then moves to Free. Nothing is deleted.' },
      { q: 'Refunds?', a: <>Yearly plans have a 14-day money-back window. Monthly plans and top-ups are not refunded. The <Link href="/refunds" className="underline">refund policy</Link> has the details.</> },
      { q: 'Where is my invoice?', a: 'Razorpay or Paddle emails a tax invoice for every payment. The Billing page lists every payment with its reference.' },
    ],
  },
  {
    id: 'api',
    title: 'API, MCP and assistants',
    items: [
      { q: 'How do I get an API key?', a: 'Settings → Integrations, on Business and above. Keys start with dd_live_ and can be read-only or read-write. Each request counts against your plan\'s rate limit (120 a minute on Business, 600 on Team).' },
      { q: 'What can the API do?', a: 'Find documents in plain language, read a document\'s details and files, upload, and list what expires soon. The OpenAPI reference is at /api/docs on the API host.' },
      { q: 'MCP and WhatsApp?', a: 'The same key works with the MCP server for Claude and other assistants, and with the WhatsApp assistant on Team. Setup steps are in Settings → Integrations.' },
    ],
  },
  {
    id: 'data',
    title: 'Your data and your account',
    items: [
      { q: 'Where is data stored?', a: <>Files in Mumbai (AWS S3), the database in Singapore (Neon), both encrypted at rest and in transit. The <Link href="/security" className="underline">security page</Link> lists every processor.</> },
      { q: 'Can I export everything?', a: 'Yes. Settings → Security → Export my data gives one JSON file with your profile, documents, dates, labels, shares and activity. Files download from each document page.' },
      { q: 'How do I delete my account?', a: 'Settings → Security → Delete my account. It refuses while a workspace you own still has other members (hand it over or remove them first). Deletion removes your files, workspaces and sign-in within minutes.' },
      { q: 'Two-factor sign-in?', a: 'Settings → Security → Manage sign-in, then add an authenticator app or passkey.' },
    ],
  },
  {
    id: 'trouble',
    title: 'When something goes wrong',
    items: [
      { q: 'Upload refused', a: 'The file is a program, or its contents do not match its name (for example a web page saved as .pdf). Export it again from the source application and retry.' },
      { q: '"AI actions exhausted"', a: 'You have used this month\'s allowance. Buy extra actions from Billing, upgrade, or wait for the period to reset (the date is on the Billing page).' },
      { q: 'A reminder email did not arrive', a: 'Check spam for mail from dockydoc.app, and that the document has a date and reminders on. Reply to any DockyDoc email and we will trace it.' },
      { q: 'Contact', a: <>Email support@dockydoc.app. Business and Team plans get a reply within one working day. The <Link href="/contact" className="underline">contact page</Link> has the company details.</> },
    ],
  },
];

export default function HelpPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="text-3xl font-bold text-ink">Help centre</h1>
      <p className="mt-2 text-ink-2">Short answers to the questions people ask most. Reply to any DockyDoc email if yours is not here.</p>
      <nav className="mt-6 flex flex-wrap gap-2 text-sm">
        {SECTIONS.map((s) => (
          <a key={s.id} href={`#${s.id}`} className="rounded-full border border-stroke px-3 py-1 text-ink-2 hover:bg-surface-high">{s.title}</a>
        ))}
      </nav>
      <div className="mt-10 space-y-10">
        {SECTIONS.map((s) => (
          <section key={s.id} id={s.id}>
            <h2 className="text-xl font-semibold text-ink">{s.title}</h2>
            <dl className="mt-4 divide-y divide-stroke-soft">
              {s.items.map((it) => (
                <div key={it.q} className="py-4">
                  <dt className="font-medium text-ink">{it.q}</dt>
                  <dd className="mt-1 text-sm text-ink-2 leading-relaxed">{it.a}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </div>
  );
}
