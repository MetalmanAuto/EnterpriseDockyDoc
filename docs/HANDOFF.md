# DockyDoc — build handoff

Read this first when starting a new Claude Code session on this repository.
It records how the product is deployed, what is finished, and what is next.
No secrets live in this file; every key is stored in the hosting provider it belongs to.

## Product

DockyDoc (https://dockydoc.app) tracks document expiry dates and sends reminders.
Owner: Nishant (Metalman Auto). Non-technical founder; explain in plain language,
do the work end-to-end, and only stop for decisions that are genuinely theirs.

## Stack and hosting

| Layer      | Tech                                   | Where it runs                                                   |
| ---------- | -------------------------------------- | --------------------------------------------------------------- |
| Frontend   | Next.js 16 App Router, Tailwind (`web/`) | Vercel project `enterprise-docky-doc`, functions region `sin1`, domain dockydoc.app |
| Backend    | NestJS + Prisma 5 (`api/`)             | Render web service `enterprisedockydoc-api`, Singapore, paid plan |
| Database   | PostgreSQL                             | Neon project `weathered-haze-54798547` (Singapore, Launch plan). Old London project `late-unit-96838006` is a backup to delete after ~1 week |
| Auth       | Clerk (production instance on clerk.dockydoc.app) | Keys in Vercel + Render env vars                                |
| Email      | Resend, sending domain dockydoc.app (verified) | `RESEND_API_KEY`, `EMAIL_FROM` on Render                        |
| Billing    | Razorpay (test keys on Render, not built yet) |                                                                  |
| DNS/mail   | GoDaddy DNS; Zoho mail on the domain — never touch the MX/Zoho records |                                          |

Deploys: Render auto-deploys `main` (needs the Render GitHub connection to point at
MetalmanAuto/EnterpriseDockyDoc). Vercel builds from GitHub; if the Git link is missing,
trigger a deploy with the Vercel API using `gitSource: {type: github, repoId: 1205246907, ref: main}`.
`api/package.json` has a `prebuild` that runs `prisma generate` — keep it.

## Done

- Auth race/redirect flicker fixed; all infra moved to Singapore for latency.
- Email reminders: Resend mailer, planner (90/30/7-day offsets), 5-minute cron scheduler,
  snooze/resume endpoints, test-email endpoint.
- Expiry dashboard ("Expiry radar"): buckets, expired list, Renewed/Snooze quick actions.
- Domain move to dockydoc.app, reminders sent from reminders@dockydoc.app.
- Clerk production cutover: email code, SMS code working; Google SSO being configured by Nishant
  (needs his own Google OAuth client; callback https://clerk.dockydoc.app/v1/oauth_callback).
- UI: "Radar" design system (slate + teal, Manrope + JetBrains Mono), login hero, dark-mode fixes,
  every dashboard page migrated to the tokens.
- Brand: ring-D logo with animated sweep (`web/src/components/brand/Logo.tsx`, `web/public/*`).
- AI document intelligence surfaced app-wide: `/assistant` page (ask your documents,
  reading coverage with batch analyse, apply-suggestion list, risk flags), AI marker on
  document rows, AI/OCR engine status in Settings. Backed by
  `GET /ai/workspaces/:id/overview` and `POST /ai/workspaces/:id/extract-batch`.
  Reports keeps its per-report AI insights only; its old ask box now links to `/assistant`.
- Folder and label management: clickable label filtering on the documents list, label usage
  counts and merge in Settings, duplicate names blocked for both labels and folders, folders
  can be moved (edit dialog or drag), and tick-box bulk move / bulk label on the documents list.
  Migration `20260916120000_dedupe_tags_unique_name` merges pre-existing duplicate labels
  before adding the unique index, so it is safe on the live database.
- UI fixes from live use: names no longer render "undefined" (use `fullName`/`initialsOf`
  from `web/src/lib/utils.ts`, never `firstName[0] + lastName[0]`), the header search is a
  real input with Cmd-K, the sidebar workspace card is the switcher with a visible overlay
  on switch, upload can create a folder inline and set labels, and the Clerk auth panel
  shows its own card header (hiding it also hid the one-time-code instructions).

## Next up (in order)

1. Premium/"non-AI" polish pass on the logged-in pages (Dashboard, Documents, document detail).
   Nishant will send screenshots of what he dislikes.
2. Razorpay billing: plans, checkout, webhook, plan gating. Test keys are on Render as
   `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET`.
3. Infra: re-link Vercel and Render to MetalmanAuto/EnterpriseDockyDoc, delete the London Neon
   project after a week, rotate any API tokens that were pasted into chat.
4. Linting is broken in both apps: `next lint` was removed in Next 16, and the API has no
   ESLint 9 `eslint.config.js`. Builds and `tsc` are the only checks that run today.

## Testing without the live database

Postgres 16 is available in the Claude Code container. To exercise the API for real:
`initdb` a data directory under `/var/tmp` (not the scratchpad, whose permissions reset),
start it on port 5433, `npx prisma migrate deploy`, seed a workspace, then run
`node dist/main` with `DATABASE_URL`, `ENCRYPTION_KEY` and `SHARE_GRANT_SECRET` set.
Without `CLERK_SECRET_KEY` the guard falls back to an `x-dev-user-email` header, so
endpoints can be called with curl as any seeded user.

## Running the app inside a Claude Code session

`./scripts/claude-sandbox.sh up` starts the whole stack: Postgres (from the binaries in the
container, since `dev.sh` needs a Docker daemon these containers do not run), migrations, the
seed, the API and the web app. `down` stops and deletes it, `status` reports what is running.
Screenshot it with Playwright against `/opt/pw-browsers/chromium`.

With no Clerk keys it runs in dev-auth mode as `alice@acmecorp.com` and the API trusts an
`x-dev-user-email` header. The middleware passes through in that mode — do not move that key
check back inside the `clerkMiddleware()` handler, which throws before the check can run and
makes every route 500.

To see the real Clerk screens (sign-up, the one-time-code step, passkeys, the social buttons),
set `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` from a Clerk **development** instance in the Claude Code
environment variables. A production `pk_live_` key is domain-locked and will not run on
localhost. The publishable key is not a secret; it already ships in the browser bundle.
`CLERK_SECRET_KEY` is only needed to verify sessions server-side or to call Clerk's Backend API,
and `api.clerk.com` is reachable from the container.

With the publishable key alone the Clerk screens render but route protection is off: the
middleware needs both keys, because `clerkMiddleware()` throws "Missing secretKey" on every
route, public ones included, and used to 500 the whole app in that state.

Two dashboard settings decide whether sign-up can run here at all. Bot sign-up protection
(Configure → Attack protection) must be off on the development instance, because the Cloudflare
Turnstile widget never resolves in a headless container and the sign-up request is never sent.
Email address must be on as an identifier with the email verification code (Configure → Email,
phone, username), or `/login` renders no email field and sign-up has no code step.

Drive the flow with Clerk's test credentials, which skip the real inbox: any address containing
`+clerk_test`, the phone numbers `+1 555 555 0100` to `0199`, and `424242` as the code for both.
Every field Clerk marks required must be filled or the browser blocks the submit silently, with
no error text and no network request. Phone is currently required alongside email, so the run is
email, phone, then two `424242` codes, then `/dashboard`.

The dashboard that follows shows the seeded `alice@acmecorp.com`, not the account just created.
That is ClerkAuthGuard falling back to the `x-dev-user-email` header because the API has no
`CLERK_SECRET_KEY`. Set that key to see the real signed-up user.

## Platform access from a Claude Code session

The environment carries `RENDER_API_KEY` and `VERCEL_TOKEN`, so a session can read and
change hosting configuration directly rather than asking for dashboard clicks. Both were
tested and working on 17 September 2026: `GET /v1/services` on Render and `GET /v2/user`
on Vercel each returned 200.

| What | Value |
|---|---|
| Render service | `dockydoc-api-staging`, id `srv-d7ek95po3t8c73c2daug` |
| Vercel project | `enterprise-docky-doc`, id `prj_cX9rLE43AzWYmxzeFwgroQHDnTxp` |

There is one Render service, not a staging and a production pair. dockydoc.app talks to
`dockydoc-api-staging.onrender.com`, which is also the proxy's fallback when `API_URL` is
unset, so that one service is production.

Read the configuration before advising anyone to change it. As of this check the API
already has `RESEND_API_KEY`, `CLERK_SECRET_KEY`, `EMAIL_FROM` set to
`DockyDoc <reminders@dockydoc.app>`, and `APP_URL` set to `https://dockydoc.app`. Email
delivery and the links inside outgoing mail were never the missing piece; until this
branch, the invitations module simply never called MailService.

A Render API key is account-wide, so it can change or delete any service on the account.
Read freely; treat a write as a production change and confirm it first.

## Working agreements

- Commit to `main` directly (solo founder, no PR flow yet) with clear messages.
- Verify before reporting: `npx tsc --noEmit` and `npx next build` in `web/`, `npm run build` in `api/`.
- Never disable TLS verification, never touch Zoho DNS records, never print secret values in chat.
