import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'API and developers | DockyDoc',
  description: 'Connect your own software, a WhatsApp bot or an AI assistant to DockyDoc: find documents from a plain sentence, get download links, upload files. REST and MCP, one key.',
};

const BASE = 'https://dockydoc.app/api/v1';

function Code({ children }: { children: string }) {
  return (
    <pre className="mt-3 overflow-x-auto rounded-xl border border-stroke bg-slate-950 p-4 text-[12.5px] leading-relaxed text-slate-100"><code>{children}</code></pre>
  );
}

function H2({ id, children }: { id: string; children: React.ReactNode }) {
  return <h2 id={id} className="text-xl font-semibold text-ink mt-12 scroll-mt-24">{children}</h2>;
}

const NAV = [
  ['start', 'Get a key'],
  ['auth', 'Base URL and auth'],
  ['fetch', 'The one call a bot needs'],
  ['calls', 'All calls'],
  ['examples', 'Examples'],
  ['mcp', 'MCP for assistants'],
  ['whatsapp', 'WhatsApp bots'],
  ['errors', 'Errors and limits'],
  ['reference', 'Interactive reference'],
];

export default function DevelopersPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="text-3xl font-bold text-ink">API and developers</h1>
      <p className="mt-2 text-ink-2">
        DockyDoc can act for you inside other software: a WhatsApp bot, an AI assistant, a script. You give the tool a personal API key; from then on it can find your documents from a plain sentence, get a download link for them, and store new ones. Everything it does, it does as you, in the workspaces you belong to.
      </p>
      <p className="mt-2 text-sm text-ink-3">API access is part of the Business plan and above. Two ways in, same key for both: REST for anything that can make an HTTP call, and MCP for assistants such as Claude.</p>
      <nav className="mt-6 flex flex-wrap gap-2 text-sm">
        {NAV.map(([id, label]) => <a key={id} href={`#${id}`} className="rounded-full border border-stroke px-3 py-1 text-ink-2 hover:bg-surface-high">{label}</a>)}
      </nav>

      <H2 id="start">1. Get a key</H2>
      <p className="mt-2 text-sm text-ink-2 leading-relaxed">
        In DockyDoc open <b>Settings → Integrations → New key</b>. Name it after the thing you are connecting, for example &ldquo;Clawdbot on WhatsApp&rdquo;. Leave <b>Allow uploads and changes</b> off unless the tool needs to save files: a read-only key can find and download but cannot change anything, so a leak costs less.
      </p>
      <p className="mt-2 text-sm text-ink-2 leading-relaxed">
        The key is shown once. Copy it into the other tool. If you lose it, revoke it and make another; the old one stops working the moment you revoke it. Keys look like <code className="rounded bg-surface-high px-1">dd_live_</code> followed by 40 characters.
      </p>

      <H2 id="auth">2. Base URL and auth</H2>
      <Code>{`Base URL:   ${BASE}
Header:     Authorization: Bearer dd_live_…
Body:       JSON (Content-Type: application/json), except upload which is multipart/form-data`}</Code>
      <p className="mt-2 text-sm text-ink-2 leading-relaxed">
        Check a key works with <code className="rounded bg-surface-high px-1">GET /integrations/me</code>. It returns who the key belongs to, whether it can write, and their workspaces.
      </p>

      <H2 id="fetch">3. The one call a bot needs</H2>
      <p className="mt-2 text-sm text-ink-2 leading-relaxed">Send the person&rsquo;s sentence; get back download links, or a question to put to them.</p>
      <Code>{`POST ${BASE}/integrations/fetch
{ "query": "my passport and UK visa", "expiresInMinutes": 15 }`}</Code>
      <Code>{`{
  "mode": "ai",
  "items": [
    {
      "ask": "passport",
      "match": { "id": "…", "name": "Alice passport", "fileName": "passport.pdf", "confidence": 0.95,
                 "labels": ["passport", "travel"], "workspace": { "id": "…", "name": "Alice's Workspace" } },
      "alternatives": [],
      "delivery": { "url": "https://dockydoc.app/api/v1/public/shares/…/download", "fileName": "passport.pdf",
                    "mimeType": "application/pdf", "expiresAt": "2026-09-17T18:45:00Z" },
      "needsChoice": false
    },
    {
      "ask": "UK visa",
      "match": { "name": "UK visa 2024", "confidence": 0.55 },
      "alternatives": [{ "name": "UK visa 2019" }],
      "delivery": null,
      "needsChoice": true
    }
  ]
}`}</Code>
      <p className="mt-3 text-sm text-ink-2 leading-relaxed">
        Read it like this. When <code className="rounded bg-surface-high px-1">delivery</code> is set, send the person the <code className="rounded bg-surface-high px-1">url</code>; it needs no login and stops working at <code className="rounded bg-surface-high px-1">expiresAt</code> (default 15 minutes, up to a day). When <code className="rounded bg-surface-high px-1">needsChoice</code> is true, DockyDoc was not sure enough to hand a document over: show <code className="rounded bg-surface-high px-1">match</code> and <code className="rounded bg-surface-high px-1">alternatives</code>, let the person pick, then call <code className="rounded bg-surface-high px-1">/integrations/deliver</code> with the id they chose. Sending the wrong passport is worse than asking.
      </p>
      <p className="mt-2 text-sm text-ink-3"><code className="rounded bg-surface-high px-1">mode</code> says how the matching was done: <code className="rounded bg-surface-high px-1">ai</code> uses the model, <code className="rounded bg-surface-high px-1">lexical</code> is a word-overlap fallback. Both return the same shape.</p>

      <H2 id="calls">4. All calls</H2>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-ink-3"><th className="py-2 pr-4 font-medium">Call</th><th className="py-2 font-medium">Does</th></tr></thead>
          <tbody className="divide-y divide-stroke-soft align-top">
            <tr><td className="py-2 pr-4 font-mono text-xs whitespace-nowrap">GET /integrations/me</td><td className="py-2 text-ink-2">Who the key belongs to, whether it can write, and their workspaces.</td></tr>
            <tr><td className="py-2 pr-4 font-mono text-xs whitespace-nowrap">POST /integrations/find</td><td className="py-2 text-ink-2"><code>{'{query, workspaceId?}'}</code>. Matching only, no links. Same items as fetch minus delivery.</td></tr>
            <tr><td className="py-2 pr-4 font-mono text-xs whitespace-nowrap">POST /integrations/deliver</td><td className="py-2 text-ink-2"><code>{'{documentIds[], expiresInMinutes?}'}</code>. Links for documents you already know the ids of. Up to 10 at a time.</td></tr>
            <tr><td className="py-2 pr-4 font-mono text-xs whitespace-nowrap">POST /integrations/fetch</td><td className="py-2 text-ink-2"><code>{'{query, workspaceId?, expiresInMinutes?}'}</code>. Find and deliver in one call.</td></tr>
            <tr><td className="py-2 pr-4 font-mono text-xs whitespace-nowrap">POST /integrations/upload</td><td className="py-2 text-ink-2">multipart: <code>file</code>, <code>name?</code>, <code>description?</code>, <code>labels?</code> (comma-separated, created if missing), <code>workspaceId?</code>. Needs a key with write access. Files over 4 MB: send them to the API host directly, <code>https://dockydoc-api-staging.onrender.com/api/v1/integrations/upload</code>, same key.</td></tr>
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-sm text-ink-3">Every other endpoint in the API also accepts a key, with one rule: a read-only key can only make GET requests there. Each find, fetch or deliver counts as one AI action on the key owner&rsquo;s plan.</p>

      <H2 id="examples">5. Examples</H2>
      <p className="mt-2 text-sm font-medium text-ink">curl</p>
      <Code>{`KEY=dd_live_…
curl -s ${BASE}/integrations/fetch \\
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \\
  -d '{"query": "my passport"}'

# upload
curl -s ${BASE}/integrations/upload \\
  -H "Authorization: Bearer $KEY" \\
  -F "file=@policy.pdf" -F "name=Car insurance 2026" -F "labels=insurance,car"`}</Code>
      <p className="mt-4 text-sm font-medium text-ink">Python</p>
      <Code>{`import requests

KEY = "dd_live_…"
H = {"Authorization": f"Bearer {KEY}"}

r = requests.post("${BASE}/integrations/fetch", headers=H,
                  json={"query": "my passport and UK visa"}, timeout=60)
for item in r.json()["items"]:
    if item["delivery"]:
        print(item["ask"], "->", item["delivery"]["url"])
    elif item["needsChoice"]:
        names = [item["match"]["name"]] + [a["name"] for a in item["alternatives"]]
        print(item["ask"], "-> which one?", names)
    else:
        print(item["ask"], "-> nothing found")`}</Code>
      <p className="mt-4 text-sm font-medium text-ink">JavaScript (Node 18+)</p>
      <Code>{`const KEY = "dd_live_…";
const res = await fetch("${BASE}/integrations/fetch", {
  method: "POST",
  headers: { Authorization: \`Bearer \${KEY}\`, "Content-Type": "application/json" },
  body: JSON.stringify({ query: "my passport", expiresInMinutes: 30 }),
});
const { items } = await res.json();
for (const item of items) {
  if (item.delivery) console.log(item.ask, item.delivery.url);
  else if (item.needsChoice) console.log(item.ask, "ask the person:", item.match?.name, item.alternatives.map((a) => a.name));
}`}</Code>

      <H2 id="mcp">6. MCP for assistants</H2>
      <p className="mt-2 text-sm text-ink-2 leading-relaxed">
        Server URL <code className="rounded bg-surface-high px-1">{BASE}/mcp</code>, transport Streamable HTTP, header <code className="rounded bg-surface-high px-1">Authorization: Bearer dd_live_…</code>. Stateless, so no session handling. Add it to Claude, or any assistant that speaks the Model Context Protocol, and it gets these tools:
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-ink-3"><th className="py-2 pr-4 font-medium">Tool</th><th className="py-2 font-medium">Same as</th></tr></thead>
          <tbody className="divide-y divide-stroke-soft">
            <tr><td className="py-2 pr-4 font-mono text-xs">whoami</td><td className="py-2 text-ink-2">GET /integrations/me</td></tr>
            <tr><td className="py-2 pr-4 font-mono text-xs">find_documents</td><td className="py-2 text-ink-2">POST /integrations/find</td></tr>
            <tr><td className="py-2 pr-4 font-mono text-xs">get_download_links</td><td className="py-2 text-ink-2">POST /integrations/deliver</td></tr>
            <tr><td className="py-2 pr-4 font-mono text-xs">fetch_documents</td><td className="py-2 text-ink-2">POST /integrations/fetch. The tool description tells the assistant to put alternatives to the person when needsChoice is true.</td></tr>
            <tr><td className="py-2 pr-4 font-mono text-xs">upload_document</td><td className="py-2 text-ink-2">POST /integrations/upload, with the file as base64.</td></tr>
          </tbody>
        </table>
      </div>

      <H2 id="whatsapp">7. WhatsApp bots</H2>
      <p className="mt-2 text-sm text-ink-2 leading-relaxed">
        DockyDoc does not run a WhatsApp number of its own. A bot you already run (Clawdbot, or one built on the WhatsApp Business API, Twilio or a similar service) calls DockyDoc with your key. When it receives &ldquo;send me my passport and UK visa&rdquo; from your number it should:
      </p>
      <ol className="mt-2 list-decimal pl-5 text-sm text-ink-2 space-y-1">
        <li>Call <code className="rounded bg-surface-high px-1">POST /integrations/fetch</code> with that sentence as <code className="rounded bg-surface-high px-1">query</code>.</li>
        <li>For each item with <code className="rounded bg-surface-high px-1">delivery</code>, send the <code className="rounded bg-surface-high px-1">url</code>, or download the file and attach it (the link serves the bytes with the right file name).</li>
        <li>For each item with <code className="rounded bg-surface-high px-1">needsChoice</code>, list the match and the alternatives by name and ask which one. When the person answers, call <code className="rounded bg-surface-high px-1">/integrations/deliver</code> with that document&rsquo;s id.</li>
      </ol>
      <p className="mt-2 text-sm text-ink-2 leading-relaxed">
        If the bot supports MCP servers, add the MCP URL above with the key and it gets the same behaviour without any of that being written by hand. A bot serving several people needs one key per person, each made from that person&rsquo;s DockyDoc account.
      </p>

      <H2 id="errors">8. Errors and limits</H2>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-ink-3"><th className="py-2 pr-4 font-medium">Status</th><th className="py-2 font-medium">Meaning</th></tr></thead>
          <tbody className="divide-y divide-stroke-soft">
            <tr><td className="py-2 pr-4 font-mono text-xs">401</td><td className="py-2 text-ink-2">Missing, wrong or revoked key.</td></tr>
            <tr><td className="py-2 pr-4 font-mono text-xs">402</td><td className="py-2 text-ink-2">The key owner&rsquo;s plan does not allow this (API needs Business or above; AI actions used up). The body carries <code>code</code>, <code>plan</code> and <code>upgradeTo</code>.</td></tr>
            <tr><td className="py-2 pr-4 font-mono text-xs">403</td><td className="py-2 text-ink-2">Read-only key trying to change something, or no access to that workspace.</td></tr>
            <tr><td className="py-2 pr-4 font-mono text-xs">429</td><td className="py-2 text-ink-2">Rate limit: 120 requests a minute on Business, 600 on Team, per account. Twenty wrong keys a minute from one address are refused too.</td></tr>
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-sm text-ink-2 leading-relaxed">
        Every link handed out is an ordinary external share on the document, visible in its share list and revocable there, and each download is recorded with time, IP and user agent. Links are bearer tokens: anyone holding one can download until it expires, so keep <code className="rounded bg-surface-high px-1">expiresInMinutes</code> short for anything like a passport.
      </p>

      <H2 id="reference">9. Interactive reference</H2>
      <p className="mt-2 text-sm text-ink-2 leading-relaxed">
        The full request and response shapes, with a &ldquo;Try it out&rdquo; button that runs against your account once you paste a key: <Link href="/api/docs" className="underline">dockydoc.app/api/docs</Link>. The same in OpenAPI 3 JSON for Postman, code generators or an AI tool: <Link href="/api/docs-json" className="underline">dockydoc.app/api/docs-json</Link>.
      </p>
      <p className="mt-6 text-sm text-ink-3">Questions or a use case we have not covered: <a href="mailto:support@dockydoc.app" className="underline">support@dockydoc.app</a>.</p>
    </div>
  );
}
