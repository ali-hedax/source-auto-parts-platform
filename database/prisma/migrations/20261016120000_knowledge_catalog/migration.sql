-- Phase 1 knowledge center: secured catalog source metadata and empty RAG-ready chunks.
ALTER TYPE "AttachmentPurpose" ADD VALUE 'KNOWLEDGE_CATALOG';

CREATE TYPE "CatalogDocumentStatus" AS ENUM ('UPLOADED', 'PENDING_PROCESSING', 'NEEDS_REVIEW', 'APPROVED', 'REJECTED');

CREATE TABLE "catalog_document" (
    "id" UUID NOT NULL,
    "attachment_id" UUID NOT NULL,
    "uploader_id" UUID NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "version" VARCHAR(40) NOT NULL,
    "status" "CatalogDocumentStatus" NOT NULL DEFAULT 'UPLOADED',
    "processing_error" VARCHAR(500),
    "processed_at" TIMESTAMPTZ(3),
    "approved_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "catalog_document_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "catalog_document_chunk" (
    "id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "content_text" TEXT NOT NULL,
    "page_number" INTEGER,
    "row_start" INTEGER,
    "row_end" INTEGER,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "catalog_document_chunk_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "catalog_document_attachment_id_key" ON "catalog_document"("attachment_id");
CREATE INDEX "catalog_document_status_created_at_idx" ON "catalog_document"("status", "created_at");
CREATE INDEX "catalog_document_uploader_id_created_at_idx" ON "catalog_document"("uploader_id", "created_at");
CREATE UNIQUE INDEX "catalog_document_chunk_document_id_ordinal_key" ON "catalog_document_chunk"("document_id", "ordinal");

ALTER TABLE "catalog_document" ADD CONSTRAINT "catalog_document_attachment_id_fkey" FOREIGN KEY ("attachment_id") REFERENCES "attachment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "catalog_document" ADD CONSTRAINT "catalog_document_uploader_id_fkey" FOREIGN KEY ("uploader_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "catalog_document_chunk" ADD CONSTRAINT "catalog_document_chunk_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "catalog_document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
