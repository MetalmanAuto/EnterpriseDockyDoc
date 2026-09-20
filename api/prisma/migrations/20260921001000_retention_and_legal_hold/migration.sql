ALTER TABLE "documents" ADD COLUMN "legalHold" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "folders" ADD COLUMN "retentionDays" INTEGER;
