-- Vehicle-brand logo uploaded in the panel (additive; existing brands keep NULL = no logo).
ALTER TABLE "vehicle_brand" ADD COLUMN "logo_url" VARCHAR(500);
