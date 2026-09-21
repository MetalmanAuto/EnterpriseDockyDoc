-- Folder deletes move every document inside to the bin in one go; the
-- activity log now records that, so bulk disappearances are explained.
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'FOLDER_DELETED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'FOLDER_RESTORED';
ALTER TYPE "AuditEntityType" ADD VALUE IF NOT EXISTS 'FOLDER';
