-- Reminder delivery tracking: FAILED status, REMINDER_SENT audit action,
-- and per-reminder send bookkeeping used by the scheduler.

ALTER TYPE "ReminderStatus" ADD VALUE IF NOT EXISTS 'FAILED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'REMINDER_SENT';

ALTER TABLE "document_reminders"
  ADD COLUMN IF NOT EXISTS "sentAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "lastError" TEXT,
  ADD COLUMN IF NOT EXISTS "sentTo" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
