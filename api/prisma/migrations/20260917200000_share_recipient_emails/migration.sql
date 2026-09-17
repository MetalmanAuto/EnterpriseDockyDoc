-- Who an external share link was emailed to, so the share list can say
-- "sent to a@b.com". The link is still what grants access; this is a record.
ALTER TABLE "document_shares" ADD COLUMN IF NOT EXISTS "recipientEmails" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
