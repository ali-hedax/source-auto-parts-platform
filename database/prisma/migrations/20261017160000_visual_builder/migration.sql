-- Additive only: existing content, catalog, accounts and orders remain untouched.
CREATE TABLE "visual_page" (
  "slug" VARCHAR(60) PRIMARY KEY, "draft" JSONB NOT NULL, "published" JSONB,
  "version" INTEGER NOT NULL DEFAULT 0, "published_at" TIMESTAMPTZ(3),
  "published_by" VARCHAR(160), "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "visual_page_version_nonnegative" CHECK ("version" >= 0)
);
CREATE TABLE "visual_revision" (
  "id" UUID PRIMARY KEY, "page_slug" VARCHAR(60) NOT NULL REFERENCES "visual_page"("slug") ON DELETE RESTRICT,
  "document" JSONB NOT NULL, "action" VARCHAR(30) NOT NULL, "actor_id" UUID NOT NULL,
  "actor_name" VARCHAR(160) NOT NULL, "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "visual_revision_page_slug_created_at_idx" ON "visual_revision"("page_slug", "created_at");
CREATE TABLE "visual_media" (
  "id" UUID PRIMARY KEY, "url" VARCHAR(500) NOT NULL UNIQUE, "name" VARCHAR(160) NOT NULL,
  "alt" JSONB NOT NULL, "category" VARCHAR(60) NOT NULL DEFAULT '',
  "width" INTEGER NOT NULL, "height" INTEGER NOT NULL, "bytes" INTEGER NOT NULL,
  "archived" BOOLEAN NOT NULL DEFAULT false, "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
