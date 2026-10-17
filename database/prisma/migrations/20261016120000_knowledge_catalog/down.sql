-- Manual rollback. Back up catalog metadata before running.
BEGIN;
DROP TABLE "catalog_document_chunk";
DROP TABLE "catalog_document";
DROP TYPE "CatalogDocumentStatus";
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261016120000_knowledge_catalog';
COMMIT;
-- PostgreSQL enum values cannot be removed safely in-place. KNOWLEDGE_CATALOG
-- remains as an unused AttachmentPurpose value after rollback.
