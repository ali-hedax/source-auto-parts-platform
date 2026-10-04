-- HEDAX integrity rules that Prisma's schema language cannot express.
-- Spec §6 (inventory), §9 (money), §12 (import), §16 (constraints), §13/§16 (append-only audit).

-- ---------------------------------------------------------------------------
-- Search (pg_trgm). Queries run against normalized columns written by the API
-- with normalizeSearchText(); the original names stay untouched.
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX "product_search_text_trgm_idx" ON "product" USING GIN ("search_text" gin_trgm_ops);
CREATE INDEX "product_search_compact_trgm_idx" ON "product" USING GIN ("search_compact" gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- Inventory: available = on_hand - reserved can never be negative.
-- ---------------------------------------------------------------------------
ALTER TABLE "inventory_balance"
  ADD CONSTRAINT "inventory_balance_on_hand_nonneg" CHECK ("on_hand" >= 0),
  ADD CONSTRAINT "inventory_balance_reserved_nonneg" CHECK ("reserved" >= 0),
  ADD CONSTRAINT "inventory_balance_reserved_le_on_hand" CHECK ("reserved" <= "on_hand"),
  ADD CONSTRAINT "inventory_balance_threshold_nonneg" CHECK ("low_stock_threshold" >= 0);

ALTER TABLE "inventory_reservation"
  ADD CONSTRAINT "inventory_reservation_qty_pos" CHECK ("quantity" > 0);

-- At most one ACTIVE reservation per order line.
CREATE UNIQUE INDEX "inventory_reservation_active_line_uq"
  ON "inventory_reservation" ("order_item_id") WHERE "status" = 'ACTIVE';

-- Exactly one default warehouse.
CREATE UNIQUE INDEX "warehouse_single_default_uq" ON "warehouse" ("is_default") WHERE "is_default" = TRUE;

-- ---------------------------------------------------------------------------
-- Money and quantities
-- ---------------------------------------------------------------------------
ALTER TABLE "exchange_rate" ADD CONSTRAINT "exchange_rate_positive" CHECK ("irr_per_aed" > 0);

ALTER TABLE "product_price"
  ADD CONSTRAINT "product_price_base_pos" CHECK ("base_amount_minor" > 0),
  ADD CONSTRAINT "product_price_manual_irr_pos" CHECK ("manual_irr_minor" IS NULL OR "manual_irr_minor" > 0),
  ADD CONSTRAINT "product_price_manual_aed_pos" CHECK ("manual_aed_minor" IS NULL OR "manual_aed_minor" > 0);

ALTER TABLE "quantity_price_rule"
  ADD CONSTRAINT "qpr_base_pos" CHECK ("base_amount_minor" > 0),
  ADD CONSTRAINT "qpr_min_qty" CHECK ("min_qty" >= 1),
  ADD CONSTRAINT "qpr_max_qty" CHECK ("max_qty" IS NULL OR "max_qty" >= "min_qty"),
  ADD CONSTRAINT "qpr_validity" CHECK ("valid_to" IS NULL OR "valid_from" IS NULL OR "valid_to" > "valid_from"),
  ADD CONSTRAINT "qpr_manual_irr_pos" CHECK ("manual_irr_minor" IS NULL OR "manual_irr_minor" > 0),
  ADD CONSTRAINT "qpr_manual_aed_pos" CHECK ("manual_aed_minor" IS NULL OR "manual_aed_minor" > 0);

ALTER TABLE "cart_item" ADD CONSTRAINT "cart_item_qty_pos" CHECK ("quantity" > 0);
ALTER TABLE "product" ADD CONSTRAINT "product_pack_qty_pos" CHECK ("pack_quantity" >= 1);

ALTER TABLE "order"
  ADD CONSTRAINT "order_currency_irr" CHECK ("currency" = 'IRR'),
  ADD CONSTRAINT "order_amounts_nonneg" CHECK (
    "items_total_minor" >= 0 AND "discount_minor" >= 0 AND "shipping_minor" >= 0 AND "tax_minor" >= 0
  ),
  ADD CONSTRAINT "order_discount_le_items" CHECK ("discount_minor" <= "items_total_minor"),
  ADD CONSTRAINT "order_grand_total" CHECK (
    "grand_total_minor" = "items_total_minor" - "discount_minor" + "shipping_minor" + "tax_minor" AND "grand_total_minor" > 0
  );

ALTER TABLE "order_item"
  ADD CONSTRAINT "order_item_qty_pos" CHECK ("quantity" > 0),
  ADD CONSTRAINT "order_item_price_pos" CHECK ("unit_price_minor" > 0),
  ADD CONSTRAINT "order_item_line_total" CHECK ("line_total_minor" = "unit_price_minor" * "quantity"),
  ADD CONSTRAINT "order_item_returned_le_qty" CHECK ("returned_quantity" >= 0 AND "returned_quantity" <= "quantity");

ALTER TABLE "shipping_zone"
  ADD CONSTRAINT "shipping_zone_cost_nonneg" CHECK ("cost_irr_minor" IS NULL OR "cost_irr_minor" >= 0),
  ADD CONSTRAINT "shipping_zone_days" CHECK ("min_days" IS NULL OR "max_days" IS NULL OR "max_days" >= "min_days");

ALTER TABLE "shipping_method"
  ADD CONSTRAINT "shipping_method_tracking_template" CHECK (
    "tracking_url_template" IS NULL OR ("tracking_url_template" LIKE 'https://%' AND "tracking_url_template" LIKE '%{code}%')
  );

ALTER TABLE "sourcing_request_item"
  ADD CONSTRAINT "sri_qty_pos" CHECK ("quantity" > 0),
  ADD CONSTRAINT "sri_year" CHECK ("vehicle_year" IS NULL OR "vehicle_year" BETWEEN 1950 AND 2100);

ALTER TABLE "quote_version"
  ADD CONSTRAINT "quote_version_number_pos" CHECK ("version_number" >= 1),
  ADD CONSTRAINT "quote_version_validity" CHECK ("validity_hours" BETWEEN 1 AND 720),
  ADD CONSTRAINT "quote_version_totals_nonneg" CHECK (
    "items_irr_minor" >= 0 AND "costs_irr_minor" >= 0 AND "tax_irr_minor" >= 0
    AND "total_payable_irr_minor" = "items_irr_minor" + "costs_irr_minor" + "tax_irr_minor"
  ),
  ADD CONSTRAINT "quote_version_sent_has_validity" CHECK ("status" = 'DRAFT' OR "valid_until" IS NOT NULL);

ALTER TABLE "quote_item"
  ADD CONSTRAINT "quote_item_qty_pos" CHECK ("quantity" > 0),
  ADD CONSTRAINT "quote_item_price_nonneg" CHECK ("unit_price_minor" >= 0),
  ADD CONSTRAINT "quote_item_discount_nonneg" CHECK ("discount_minor" IS NULL OR "discount_minor" >= 0),
  ADD CONSTRAINT "quote_item_lead" CHECK ("lead_min" >= 0 AND "lead_max" >= "lead_min"),
  ADD CONSTRAINT "quote_item_lead_business_days" CHECK (NOT ("lead_unit" = 'HOURS' AND "lead_day_kind" = 'BUSINESS'));

ALTER TABLE "quote_cost" ADD CONSTRAINT "quote_cost_nonneg" CHECK ("amount_minor" >= 0 AND "amount_irr_minor" >= 0);

ALTER TABLE "procurement" ADD CONSTRAINT "procurement_total_pos" CHECK ("total_payable_irr_minor" > 0);
ALTER TABLE "procurement_item" ADD CONSTRAINT "procurement_item_qty_pos" CHECK ("quantity" > 0);

ALTER TABLE "payment_attempt"
  ADD CONSTRAINT "payment_attempt_amount_pos" CHECK ("amount_irr_minor" > 0),
  ADD CONSTRAINT "payment_attempt_overpayment_nonneg" CHECK ("overpayment_irr_minor" >= 0),
  ADD CONSTRAINT "payment_attempt_subject" CHECK (
    ("subject_type" = 'STOCK_ORDER' AND "order_id" IS NOT NULL AND "procurement_id" IS NULL)
    OR ("subject_type" = 'PROCUREMENT' AND "procurement_id" IS NOT NULL AND "order_id" IS NULL)
  ),
  ADD CONSTRAINT "payment_attempt_success_verified" CHECK ("status" <> 'SUCCEEDED' OR "verified_at" IS NOT NULL);

ALTER TABLE "payment_settlement" ADD CONSTRAINT "payment_settlement_amount_pos" CHECK ("amount_irr_minor" > 0);
ALTER TABLE "refund" ADD CONSTRAINT "refund_amount_pos" CHECK ("amount_irr_minor" > 0);

ALTER TABLE "shipment" ADD CONSTRAINT "shipment_subject" CHECK (("order_id" IS NULL) <> ("procurement_id" IS NULL));
ALTER TABLE "return_request" ADD CONSTRAINT "return_request_subject" CHECK (("order_id" IS NULL) <> ("procurement_id" IS NULL));
ALTER TABLE "return_request_item"
  ADD CONSTRAINT "return_item_qty" CHECK (
    "quantity" > 0 AND "received_quantity" BETWEEN 0 AND "quantity" AND "restocked_quantity" BETWEEN 0 AND "received_quantity"
  );

ALTER TABLE "attachment" ADD CONSTRAINT "attachment_size_pos" CHECK ("size_bytes" > 0);
ALTER TABLE "product_media" ADD CONSTRAINT "product_media_dims" CHECK ("width" > 0 AND "height" > 0 AND "size_bytes" > 0);

-- One primary image per product among non-deleted media.
CREATE UNIQUE INDEX "product_media_single_primary_uq"
  ON "product_media" ("product_id") WHERE "is_primary" = TRUE AND "deleted_at" IS NULL;

-- One default address per customer among non-archived addresses.
CREATE UNIQUE INDEX "address_single_default_uq"
  ON "address" ("user_id") WHERE "is_default" = TRUE AND "archived_at" IS NULL;

-- One published version per policy kind.
CREATE UNIQUE INDEX "policy_version_single_published_uq"
  ON "policy_version" ("kind") WHERE "status" = 'PUBLISHED';

-- One default business calendar.
CREATE UNIQUE INDEX "business_calendar_single_default_uq" ON "business_calendar" ("is_default") WHERE "is_default" = TRUE;

-- A draft is the only mutable quote version; at most one open draft per quote.
CREATE UNIQUE INDEX "quote_version_single_draft_uq" ON "quote_version" ("quote_id") WHERE "status" = 'DRAFT';

-- ---------------------------------------------------------------------------
-- Append-only tables: audit, payment events, state history, stock ledger,
-- FX history and settlements. Corrections are new rows, never rewrites.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION hedax_forbid_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'table % is append-only', TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_append_only BEFORE UPDATE OR DELETE ON "audit_log"
  FOR EACH ROW EXECUTE FUNCTION hedax_forbid_mutation();
CREATE TRIGGER payment_event_append_only BEFORE UPDATE OR DELETE ON "payment_event"
  FOR EACH ROW EXECUTE FUNCTION hedax_forbid_mutation();
CREATE TRIGGER order_event_append_only BEFORE UPDATE OR DELETE ON "order_event"
  FOR EACH ROW EXECUTE FUNCTION hedax_forbid_mutation();
CREATE TRIGGER inventory_movement_append_only BEFORE UPDATE OR DELETE ON "inventory_movement"
  FOR EACH ROW EXECUTE FUNCTION hedax_forbid_mutation();
CREATE TRIGGER exchange_rate_append_only BEFORE UPDATE OR DELETE ON "exchange_rate"
  FOR EACH ROW EXECUTE FUNCTION hedax_forbid_mutation();
CREATE TRIGGER payment_settlement_append_only BEFORE UPDATE OR DELETE ON "payment_settlement"
  FOR EACH ROW EXECUTE FUNCTION hedax_forbid_mutation();

-- Products referenced by orders are archived, never deleted.
CREATE OR REPLACE FUNCTION hedax_forbid_product_delete() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'products are archived, not deleted (product %)', OLD.id USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER product_no_delete BEFORE DELETE ON "product"
  FOR EACH ROW EXECUTE FUNCTION hedax_forbid_product_delete();
