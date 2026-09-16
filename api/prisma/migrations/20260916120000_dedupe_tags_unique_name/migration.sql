-- Labels used to be free-form: a workspace could hold "Insurance", "insurance"
-- and another "Insurance" all at once, and the AI's apply-suggested-tags path
-- made that likely. This folds every duplicate into the oldest label of that
-- name, then stops new exact duplicates at the database level.
--
-- Written to be safe on a workspace that already holds duplicates: the merge
-- runs first, so the unique index at the end cannot fail the deploy.

-- 1. The label that survives for each (workspace, case-insensitive name):
--    the oldest one, so the ID people have been using keeps working.
CREATE TEMP TABLE tag_keepers AS
SELECT DISTINCT ON ("workspaceId", lower("name"))
       "id" AS keep_id,
       "workspaceId",
       lower("name") AS lname
FROM "document_tags"
ORDER BY "workspaceId", lower("name"), "createdAt" ASC, "id" ASC;

CREATE TEMP TABLE tag_dupes AS
SELECT t."id" AS dup_id, k.keep_id
FROM "document_tags" t
JOIN tag_keepers k
  ON k."workspaceId" = t."workspaceId"
 AND k.lname = lower(t."name")
WHERE t."id" <> k.keep_id;

-- 2. Every document carrying a duplicate now carries the keeper instead.
--    Documents already carrying both keep the single mapping they have.
INSERT INTO "document_tag_mappings" ("id", "documentId", "tagId")
SELECT gen_random_uuid()::text, m."documentId", d.keep_id
FROM "document_tag_mappings" m
JOIN tag_dupes d ON d.dup_id = m."tagId"
ON CONFLICT ("documentId", "tagId") DO NOTHING;

-- 3. Drop the duplicates. Their old mappings go with them (ON DELETE CASCADE).
DELETE FROM "document_tags"
WHERE "id" IN (SELECT dup_id FROM tag_dupes);

DROP TABLE tag_dupes;
DROP TABLE tag_keepers;

-- 4. No two labels in a workspace may share a name from here on. Case variants
--    are caught in the service layer, which matches names case-insensitively.
CREATE UNIQUE INDEX "document_tags_workspaceId_name_key" ON "document_tags"("workspaceId", "name");
