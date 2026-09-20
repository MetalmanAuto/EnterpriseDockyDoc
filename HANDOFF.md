
## Enterprise controls (added 21 Sept 2026)

- **Upload checks** (`api/src/common/upload/sniff.ts`): every upload's first bytes are read with `file-type`. Programs (exe, elf, jar, msi, sh...) are refused, and a declared type that does not match the real contents (an HTML page named `.pdf`) is refused with a plain message. Runs inside `DocumentsService.upload`, so the REST/MCP upload path is covered too.
- **Legal hold**: `POST /documents/:id/legal-hold` `{hold}` (Admin/Owner). A held document cannot be binned, shredded, or aged out; the button sits on the document page. Every change is an audit `DOCUMENT_UPDATED` row with `legalHold` in the metadata.
- **Retention** (`api/src/modules/retention`): a 03:00 UTC job. (1) Bin purge: deleted documents older than the workspace's `trashRetentionDays` (Settings → Retention; capped by the plan's `binRetentionDays`) are shredded, files first. (2) Folder policies: `PATCH /folders/:id` `{retentionDays: 30..3650 | null}` bins documents that many days after expiry (or upload when no expiry). `POST /admin/retention/run` runs it now. Set `ENABLE_SCHEDULER=false` to stop the cron on a second instance.
- **Activity export**: `GET /audit/export?workspaceId=` returns CSV (Admin/Owner; Business and above, else 402). Button on the Activity page.
- **Rate limits**: browser and anonymous traffic keep the 100/min per-IP throttle. API-key requests skip it (`ApiAwareThrottlerGuard`) and are limited per account by plan in `ClerkAuthGuard` (Business 120, Team 600, Enterprise 1,200 a minute) plus 20 failed key attempts a minute per IP. Both counters are in memory, per instance.
- **Security headers**: `helmet` on the API (CSP off, cross-origin resource policy open for file fetches); `next.config.ts` sets HSTS, nosniff, frame deny, referrer and permissions policies on the web.
- **Alerts** (`api/src/modules/alerts`): `AlertsService.notify(kind, subject, detail, threshold)` emails everyone in `PLATFORM_ADMIN_EMAILS`, at most one mail per kind per `ALERT_QUIET_MINUTES` (15). Wired to: 5+ unhandled 500s in a window, retention job errors or crash, and more than `AI_DAILY_ACTION_ALERT` (2,000) AI actions in a day.
- **Dependabot** (`.github/dependabot.yml`): weekly grouped update PRs for `api`, `web` and GitHub Actions; security advisories arrive as soon as published.

## Plans, limits and AI-action metering (added 21 Sept 2026)

- Tiers: FREE, PERSONAL ($6), BUSINESS ($23), TEAM ($59), plus ENTERPRISE (internal, unlimited). Limits and prices live in `api/src/modules/billing/plans.ts`; the public pricing table reads them from `GET /api/v1/billing/plans`.
- The plan belongs to the person (`User.plan`) and is mirrored onto every workspace they own. AI is metered in actions (`aiActionsUsed` per monthly period plus bought `aiCreditActions`), pooled across the workspaces they own. BYOK workspaces are not metered.
- `BillingService` (global) does every check and throws a 402 `PlanLimitException` with `code` and `upgradeTo`; the web app can act on those. Checks: document quota, workspace quota, member quota, API access (Business+), share-link controls (Free: no password, 7-day expiry), cross-workspace grants (Business+), activity export (Business+).
- Charges: one action per document read (2 for more than 20 pages, 3 for more than 50), one per assistant question, one per API find, one per report insight.
- Platform admins can hand out complimentary plans: `PATCH /api/v1/admin/users/:id/plan` and the dropdown on the admin page. Complimentary plans with an end date fall back to Free on their own.
- Migration `20260921000100_plan_on_users` put every existing account on a complimentary TEAM plan for six months, except owners of ENTERPRISE workspaces, who stay ENTERPRISE.
- Payments are not wired yet; the pricing page buttons are disabled until Razorpay (India) and Paddle (rest of world) land.
