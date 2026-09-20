ALTER TABLE "users" ADD COLUMN "signupSource" TEXT;
ALTER TABLE "users" ADD COLUMN "welcomeSentAt" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "nudgeSentAt" TIMESTAMP(3);
