-- English (LTR) quote PDF next to the Persian one; both are rendered from the same quote version data.
ALTER TABLE "quote_version" ADD COLUMN "pdf_en_attachment_id" UUID;
