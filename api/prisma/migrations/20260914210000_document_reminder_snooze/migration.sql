-- Time-boxed reminder snooze: while set and in the future, the scheduler
-- holds any due reminders for the document instead of sending them.
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "remindersSnoozedUntil" TIMESTAMP(3);
