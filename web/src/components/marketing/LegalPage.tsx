/** Shared frame for terms, privacy and the other policy pages. */
export default function LegalPage({ title, updated, intro, children }: { title: string; updated: string; intro: string; children: React.ReactNode }) {
  return (
    <article className="mx-auto max-w-3xl px-4 py-16 legal">
      <h1 className="text-4xl font-extrabold tracking-tight">{title}</h1>
      <p className="mt-2 text-xs text-ink-3">Last updated {updated}. Operated by Excelleta Tech Private Limited, New Delhi, India.</p>
      <p className="mt-6 text-ink-2 leading-relaxed">{intro}</p>
      <div className="mt-8 space-y-8 text-sm text-ink-2 leading-relaxed [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-ink [&_h2]:mt-2 [&_p]:mt-2 [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:mt-1 [&_strong]:text-ink [&_a]:underline">
        {children}
      </div>
    </article>
  );
}
