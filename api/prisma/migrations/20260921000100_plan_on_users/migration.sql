-- The plan moves to the person. AI actions are metered per account.
ALTER TABLE "users"
  ADD COLUMN "plan" "WorkspacePlan" NOT NULL DEFAULT 'FREE',
  ADD COLUMN "planSource" TEXT,
  ADD COLUMN "planRenewsAt" TIMESTAMP(3),
  ADD COLUMN "aiActionsUsed" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "aiActionsPeriodStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "aiCreditActions" INTEGER NOT NULL DEFAULT 0;

-- Everyone who signed up before launch keeps a complimentary Team plan for six months.
UPDATE "users" SET "plan" = 'TEAM', "planSource" = 'complimentary', "planRenewsAt" = NOW() + INTERVAL '6 months';

-- People who already own an Enterprise workspace (the platform's own accounts) stay unlimited.
UPDATE "users" u SET "plan" = 'ENTERPRISE', "planSource" = 'complimentary', "planRenewsAt" = NULL
WHERE EXISTS (
  SELECT 1 FROM "workspace_users" wu JOIN "workspaces" w ON w.id = wu."workspaceId"
  WHERE wu."userId" = u.id AND wu.role = 'OWNER' AND w.plan = 'ENTERPRISE'
);

-- Workspaces mirror their owner's plan.
UPDATE "workspaces" w SET "plan" = u."plan"
FROM "workspace_users" wu JOIN "users" u ON u.id = wu."userId"
WHERE wu."workspaceId" = w.id AND wu.role = 'OWNER';
