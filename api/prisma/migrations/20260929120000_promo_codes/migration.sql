-- Codes that give a plan free for a number of months.
CREATE TABLE "promo_codes" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "plan" "WorkspacePlan" NOT NULL,
  "months" INTEGER NOT NULL,
  "maxUses" INTEGER,
  "usedCount" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" TIMESTAMP(3),
  "note" TEXT,
  "createdById" TEXT,
  "disabledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "promo_codes_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "promo_codes_code_key" ON "promo_codes"("code");

CREATE TABLE "promo_redemptions" (
  "id" TEXT NOT NULL,
  "codeId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "planBefore" "WorkspacePlan" NOT NULL,
  "planUntil" TIMESTAMP(3) NOT NULL,
  "redeemedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "promo_redemptions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "promo_redemptions_codeId_userId_key" ON "promo_redemptions"("codeId", "userId");
CREATE INDEX "promo_redemptions_userId_idx" ON "promo_redemptions"("userId");
ALTER TABLE "promo_redemptions" ADD CONSTRAINT "promo_redemptions_codeId_fkey" FOREIGN KEY ("codeId") REFERENCES "promo_codes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "promo_redemptions" ADD CONSTRAINT "promo_redemptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
