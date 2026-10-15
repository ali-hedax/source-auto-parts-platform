-- Manual rollback of 20261015120000_staff_invitation_trash (run only with the previous application version).
-- The previous version does not know the trash for invitations: invitations still in the trash are
-- revoked (their link stays unusable, the row and its history are kept) and only their trash markers
-- are removed; then the column is dropped.
UPDATE "staff_invitation" SET "revoked_at" = COALESCE("revoked_at", "trashed_at") WHERE "trashed_at" IS NOT NULL;
DELETE FROM "trash_entry" WHERE "kind" = 'staff_invitation';
ALTER TABLE "staff_invitation" DROP COLUMN "trashed_at";
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261015120000_staff_invitation_trash';
