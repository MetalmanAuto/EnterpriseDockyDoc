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

## Next up (in order)

1. Premium/"non-AI" polish pass on the logged-in pages (Dashboard, Documents, document detail).
   Nishant will send screenshots of what he dislikes.
2. Razorpay billing: plans, checkout, webhook, plan gating. Test keys are on Render as
   `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET`.
3. Infra: re-link Vercel and Render to MetalmanAuto/EnterpriseDockyDoc, delete the London Neon
   project after a week, rotate any API tokens that were pasted into chat.
4. Linting is broken in both apps: `next lint` was removed in Next 16, and the API has no
   ESLint 9 `eslint.config.js`. Builds and `tsc` are the only checks that run today.

## Working agreements

- Commit to `main` directly (solo founder, no PR flow yet) with clear messages.
- Verify before reporting: `npx tsc --noEmit` and `npx next build` in `web/`, `npm run build` in `api/`.
- Never disable TLS verification, never touch Zoho DNS records, never print secret values in chat.
