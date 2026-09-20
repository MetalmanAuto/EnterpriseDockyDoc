-- New tiers. Kept in its own migration so the values exist before anything uses them.
ALTER TYPE "WorkspacePlan" ADD VALUE IF NOT EXISTS 'PERSONAL';
ALTER TYPE "WorkspacePlan" ADD VALUE IF NOT EXISTS 'TEAM';
ALTER TYPE "WorkspacePlan" RENAME VALUE 'PRO' TO 'BUSINESS';
