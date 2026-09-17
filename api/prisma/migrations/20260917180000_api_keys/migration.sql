-- Personal API keys, so other software (a WhatsApp bot, an assistant) can act
-- as the person who created the key. The key is shown once; only its hash is
-- kept. Scopes limit a key to reading, or reading and writing, documents.
CREATE TYPE "ApiKeyScope" AS ENUM ('DOCUMENTS_READ', 'DOCUMENTS_WRITE');

CREATE TABLE "api_keys" (
    "id"         TEXT NOT NULL,
    "userId"     TEXT NOT NULL,
    "name"       TEXT NOT NULL,
    "prefix"     TEXT NOT NULL,
    "keyHash"    TEXT NOT NULL,
    "scopes"     "ApiKeyScope"[],
    "lastUsedAt" TIMESTAMP(3),
    "expiresAt"  TIMESTAMP(3),
    "revokedAt"  TIMESTAMP(3),
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "api_keys_keyHash_key" ON "api_keys"("keyHash");
CREATE INDEX "api_keys_userId_idx" ON "api_keys"("userId");

ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
