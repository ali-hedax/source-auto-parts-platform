-- Trash for staff invitations (panel → staff → «حذف (انتقال به سطل زباله)» on a pending, expired or
-- revoked invitation). A trashed invitation keeps its row, link, expiry and revocation unchanged, so
-- restoring brings back exactly the state it had; while it is in the trash its link does not work.
-- Additive only: one nullable column. Rollback: see down.sql next to this file.
-- AlterTable
ALTER TABLE "staff_invitation" ADD COLUMN "trashed_at" TIMESTAMPTZ(3);
