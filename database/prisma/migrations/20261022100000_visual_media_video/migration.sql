-- Hero videos in the visual-builder media library (additive; existing images keep kind 'image').
ALTER TABLE "visual_media"
  ADD COLUMN "kind" VARCHAR(10) NOT NULL DEFAULT 'image',
  ADD COLUMN "mime" VARCHAR(40) NOT NULL DEFAULT '',
  ADD COLUMN "duration_ms" INTEGER,
  ADD COLUMN "release_cleared" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "cleared_by" VARCHAR(160),
  ADD COLUMN "cleared_at" TIMESTAMPTZ(3);
