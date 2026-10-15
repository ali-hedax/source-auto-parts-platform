-- Trash for staff (panel → staff → trash): a staff member moved to the trash keeps every row and
-- their e-mail (reserved), gets the status TRASHED (signed out, cannot sign in) and one trash_entry.
-- Additive only: a new enum value and a new table. Rollback: see down.sql next to this file.
-- AlterEnum
ALTER TYPE "UserStatus" ADD VALUE 'TRASHED';

-- CreateTable
CREATE TABLE "trash_entry" (
    "id" UUID NOT NULL,
    "kind" VARCHAR(40) NOT NULL,
    "entity_id" UUID NOT NULL,
    "label" VARCHAR(200) NOT NULL,
    "restore_state" JSONB NOT NULL DEFAULT '{}',
    "trashed_by_id" UUID,
    "trashed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trash_entry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "trash_entry_trashed_at_idx" ON "trash_entry"("trashed_at");

-- CreateIndex
CREATE UNIQUE INDEX "trash_entry_kind_entity_id_key" ON "trash_entry"("kind", "entity_id");
