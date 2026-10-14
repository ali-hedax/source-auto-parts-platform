-- Manual rollback of 20261015090000_staff_trash (run only with the previous application version).
-- Staff still in the trash get back the status they had before (as kept in restore_state), so no
-- account is lost; then the table is dropped. PostgreSQL cannot drop an enum value: 'TRASHED' stays
-- defined but unused, which the previous version ignores.
UPDATE "user" u SET "status" = COALESCE((t."restore_state"->>'status')::"UserStatus", 'SUSPENDED')
FROM "trash_entry" t WHERE t."kind" = 'staff' AND t."entity_id" = u."id" AND u."status" = 'TRASHED';
UPDATE "user" SET "status" = 'SUSPENDED' WHERE "status" = 'TRASHED';
DROP TABLE "trash_entry";
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261015090000_staff_trash';
