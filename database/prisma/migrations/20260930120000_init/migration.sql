-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserKind" AS ENUM ('CUSTOMER', 'STAFF');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DELETED');

-- CreateEnum
CREATE TYPE "UiLocale" AS ENUM ('fa', 'en');

-- CreateEnum
CREATE TYPE "CustomerType" AS ENUM ('CONSUMER', 'WORKSHOP', 'WHOLESALER');

-- CreateEnum
CREATE TYPE "GroupApprovalStatus" AS ENUM ('NONE', 'PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "CurrencyCode" AS ENUM ('IRR', 'AED');

-- CreateEnum
CREATE TYPE "PartType" AS ENUM ('GENUINE', 'OEM', 'AFTERMARKET');

-- CreateEnum
CREATE TYPE "PhysicalCondition" AS ENUM ('NEW', 'USED', 'REFURBISHED');

-- CreateEnum
CREATE TYPE "ProductOrigin" AS ENUM ('DOMESTIC', 'IMPORTED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('ACTIVE', 'CONSUMED', 'RELEASED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "InventoryMovementType" AS ENUM ('RECEIPT', 'ADJUSTMENT', 'IMPORT_ADJUSTMENT', 'RESERVE', 'RELEASE', 'CONSUME', 'RETURN_RESTOCK', 'REALLOCATE');

-- CreateEnum
CREATE TYPE "StockOrderStatus" AS ENUM ('AWAITING_PAYMENT', 'CONFIRMED', 'PREPARING', 'READY_TO_SHIP', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'EXCEPTION');

-- CreateEnum
CREATE TYPE "PaymentSummaryStatus" AS ENUM ('UNPAID', 'PENDING', 'PAID', 'PARTIALLY_REFUNDED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "SourcingRequestStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'NEEDS_CUSTOMER_INFO', 'QUOTED', 'CONVERTED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SourcingPreference" AS ENUM ('ANY', 'GENUINE', 'AFTERMARKET', 'STOCK');

-- CreateEnum
CREATE TYPE "Urgency" AS ENUM ('NORMAL', 'URGENT');

-- CreateEnum
CREATE TYPE "QuoteVersionStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'EXPIRED', 'REJECTED', 'SUPERSEDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "QuoteItemAvailability" AS ENUM ('AVAILABLE', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "CompatibilityStatus" AS ENUM ('CONFIRMED', 'LIKELY', 'NEEDS_CUSTOMER_CONFIRMATION');

-- CreateEnum
CREATE TYPE "LeadTimeUnit" AS ENUM ('HOURS', 'DAYS');

-- CreateEnum
CREATE TYPE "DayKind" AS ENUM ('CALENDAR', 'BUSINESS');

-- CreateEnum
CREATE TYPE "LeadTimeWording" AS ENUM ('ESTIMATE', 'COMMITMENT');

-- CreateEnum
CREATE TYPE "ProcurementStatus" AS ENUM ('AWAITING_PAYMENT', 'PROCUREMENT_PENDING', 'SOURCING', 'PURCHASED', 'IN_TRANSIT_TO_WAREHOUSE', 'RECEIVED', 'READY_TO_SHIP', 'SHIPPED', 'DELIVERED', 'ON_HOLD', 'CANCELLED', 'EXCEPTION');

-- CreateEnum
CREATE TYPE "ProcurementItemStatus" AS ENUM ('PENDING', 'SOURCING', 'PURCHASED', 'RECEIVED', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "PaymentSubjectType" AS ENUM ('STOCK_ORDER', 'PROCUREMENT');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('CREATED', 'PENDING', 'PENDING_VERIFICATION', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('REQUESTED', 'APPROVED', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ResolutionCaseKind" AS ENUM ('LATE_PAYMENT_NO_STOCK', 'OVERPAYMENT', 'AMOUNT_MISMATCH', 'UNFULFILLABLE_AFTER_PAYMENT', 'PAYMENT_AFTER_FAILURE');

-- CreateEnum
CREATE TYPE "ResolutionCaseStatus" AS ENUM ('OPEN', 'RESOLVED');

-- CreateEnum
CREATE TYPE "ConversationSubject" AS ENUM ('SUPPORT', 'SOURCING_REQUEST', 'STOCK_ORDER', 'PROCUREMENT');

-- CreateEnum
CREATE TYPE "ParticipantRole" AS ENUM ('CUSTOMER', 'STAFF');

-- CreateEnum
CREATE TYPE "SenderKind" AS ENUM ('CUSTOMER', 'STAFF', 'SYSTEM');

-- CreateEnum
CREATE TYPE "AttachmentPurpose" AS ENUM ('MESSAGE', 'SOURCING_REQUEST', 'RETURN_REQUEST', 'BUSINESS_VERIFICATION', 'PRODUCT_MEDIA', 'IMPORT', 'IMPORT_REPORT', 'QUOTE_PDF', 'EXPORT');

-- CreateEnum
CREATE TYPE "AttachmentVisibility" AS ENUM ('PRIVATE', 'PUBLIC_PRODUCT');

-- CreateEnum
CREATE TYPE "AttachmentStatus" AS ENUM ('UPLOADING', 'SCANNING', 'READY', 'REJECTED', 'DELETED');

-- CreateEnum
CREATE TYPE "ImportMode" AS ENUM ('UPDATE_ONLY', 'CREATE_AND_UPDATE');

-- CreateEnum
CREATE TYPE "ImportJobStatus" AS ENUM ('QUEUED', 'PARSING', 'PREVIEW_READY', 'FAILED', 'COMMITTING', 'COMMITTED', 'CONFLICT', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ImportRowAction" AS ENUM ('CREATE', 'UPDATE', 'UNCHANGED', 'ERROR');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'SMS');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'DONE', 'FAILED');

-- CreateEnum
CREATE TYPE "ActorKind" AS ENUM ('CUSTOMER', 'STAFF', 'SYSTEM', 'PROVIDER');

-- CreateEnum
CREATE TYPE "PolicyKind" AS ENUM ('TERMS', 'PRIVACY', 'RETURNS', 'SHIPPING', 'SOURCING', 'WARRANTY');

-- CreateEnum
CREATE TYPE "PolicyStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'RETIRED');

-- CreateEnum
CREATE TYPE "ReturnKind" AS ENUM ('CANCEL', 'RETURN');

-- CreateEnum
CREATE TYPE "ReturnRequestStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'ITEMS_RECEIVED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ShipmentStatus" AS ENUM ('PENDING', 'SHIPPED', 'DELIVERED', 'RETURNED');

-- CreateEnum
CREATE TYPE "EventSubject" AS ENUM ('STOCK_ORDER', 'PROCUREMENT', 'SOURCING_REQUEST', 'QUOTE_VERSION', 'PAYMENT', 'REFUND', 'RETURN_REQUEST', 'SHIPMENT');

-- CreateTable
CREATE TABLE "user" (
    "id" UUID NOT NULL,
    "kind" "UserKind" NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "mobile_e164" VARCHAR(16),
    "mobile_verified_at" TIMESTAMPTZ(3),
    "email" VARCHAR(200),
    "password_hash" TEXT,
    "full_name" VARCHAR(120),
    "preferred_locale" "UiLocale" NOT NULL DEFAULT 'fa',
    "mfa_secret_enc" TEXT,
    "mfa_enabled_at" TIMESTAMPTZ(3),
    "auth_version" INTEGER NOT NULL DEFAULT 0,
    "last_login_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_profile" (
    "user_id" UUID NOT NULL,
    "customer_type" "CustomerType" NOT NULL DEFAULT 'CONSUMER',
    "customer_group_id" UUID,
    "group_status" "GroupApprovalStatus" NOT NULL DEFAULT 'NONE',
    "requested_type" "CustomerType",
    "business_name" VARCHAR(200),
    "business_city" VARCHAR(60),
    "business_note" VARCHAR(1000),
    "company_role" VARCHAR(100),
    "group_decided_by_id" UUID,
    "group_decided_at" TIMESTAMPTZ(3),
    "group_decision_note" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "customer_profile_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "address" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "label" VARCHAR(60),
    "recipient_name" VARCHAR(120) NOT NULL,
    "recipient_mobile" VARCHAR(16) NOT NULL,
    "province" VARCHAR(60) NOT NULL,
    "city" VARCHAR(60) NOT NULL,
    "address_line" VARCHAR(400) NOT NULL,
    "postal_code" VARCHAR(10) NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "address_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "user_id" UUID NOT NULL,
    "kind" "UserKind" NOT NULL,
    "auth_version" INTEGER NOT NULL,
    "mfa_verified" BOOLEAN NOT NULL DEFAULT false,
    "user_agent" VARCHAR(200),
    "ip_hash" CHAR(64),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "revoked_reason" VARCHAR(60),

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "otp_challenge" (
    "id" UUID NOT NULL,
    "mobile_e164" VARCHAR(16) NOT NULL,
    "code_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "consumed_at" TIMESTAMPTZ(3),
    "ip_hash" CHAR(64),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otp_challenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mfa_challenge" (
    "id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "user_id" UUID NOT NULL,
    "purpose" VARCHAR(30) NOT NULL,
    "pending_secret_enc" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "consumed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mfa_challenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mfa_recovery_code" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "code_hash" CHAR(64) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mfa_recovery_code_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_invitation" (
    "id" UUID NOT NULL,
    "email" VARCHAR(200) NOT NULL,
    "full_name" VARCHAR(120) NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "role_ids" UUID[],
    "invited_by_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "accepted_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bootstrap_token" (
    "id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bootstrap_token_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role" (
    "id" UUID NOT NULL,
    "key" VARCHAR(40) NOT NULL,
    "name_fa" VARCHAR(80) NOT NULL,
    "name_en" VARCHAR(80) NOT NULL,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "is_owner" BOOLEAN NOT NULL DEFAULT false,
    "requires_mfa" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permission" (
    "key" VARCHAR(60) NOT NULL,
    "description" VARCHAR(200) NOT NULL,

    CONSTRAINT "permission_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "role_permission" (
    "role_id" UUID NOT NULL,
    "permission_key" VARCHAR(60) NOT NULL,

    CONSTRAINT "role_permission_pkey" PRIMARY KEY ("role_id","permission_key")
);

-- CreateTable
CREATE TABLE "user_role" (
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "granted_by_id" UUID,
    "granted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_role_pkey" PRIMARY KEY ("user_id","role_id")
);

-- CreateTable
CREATE TABLE "vehicle_brand" (
    "id" UUID NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "slug" VARCHAR(80) NOT NULL,
    "name_fa" VARCHAR(80) NOT NULL,
    "name_en" VARCHAR(80),
    "is_featured" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "vehicle_brand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "manufacturer_brand" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(80) NOT NULL,
    "name_fa" VARCHAR(120) NOT NULL,
    "name_en" VARCHAR(120),
    "normalized_name" VARCHAR(120) NOT NULL,
    "country_code" CHAR(2),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "manufacturer_brand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "category" (
    "id" UUID NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "slug" VARCHAR(80) NOT NULL,
    "parent_id" UUID,
    "name_fa" VARCHAR(120) NOT NULL,
    "name_en" VARCHAR(120),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product" (
    "id" UUID NOT NULL,
    "sku" VARCHAR(64) NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "category_id" UUID NOT NULL,
    "manufacturer_brand_id" UUID,
    "part_type" "PartType" NOT NULL,
    "condition" "PhysicalCondition" NOT NULL,
    "origin" "ProductOrigin" NOT NULL,
    "country_of_manufacture" CHAR(2),
    "unit" VARCHAR(30) NOT NULL DEFAULT 'عدد',
    "pack_quantity" INTEGER NOT NULL DEFAULT 1,
    "oem_codes" TEXT[],
    "specs" JSONB NOT NULL DEFAULT '[]',
    "published" BOOLEAN NOT NULL DEFAULT false,
    "published_at" TIMESTAMPTZ(3),
    "is_sellable" BOOLEAN NOT NULL DEFAULT true,
    "archived_at" TIMESTAMPTZ(3),
    "search_text" TEXT NOT NULL DEFAULT '',
    "search_compact" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_by_id" UUID,
    "updated_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_translation" (
    "product_id" UUID NOT NULL,
    "locale" "UiLocale" NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "technical_notes" TEXT,
    "warranty" VARCHAR(500),
    "aliases" TEXT[],

    CONSTRAINT "product_translation_pkey" PRIMARY KEY ("product_id","locale")
);

-- CreateTable
CREATE TABLE "product_vehicle_brand" (
    "product_id" UUID NOT NULL,
    "vehicle_brand_id" UUID NOT NULL,

    CONSTRAINT "product_vehicle_brand_pkey" PRIMARY KEY ("product_id","vehicle_brand_id")
);

-- CreateTable
CREATE TABLE "product_media" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "storage_key" VARCHAR(200) NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "mime" VARCHAR(40) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "alt_fa" VARCHAR(200) NOT NULL,
    "alt_en" VARCHAR(200),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "source_attachment_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "product_media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_fitment" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "vehicle_brand_id" UUID,
    "model_text" VARCHAR(120) NOT NULL,
    "year_from" INTEGER,
    "year_to" INTEGER,
    "note" VARCHAR(300),

    CONSTRAINT "product_fitment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_group" (
    "id" UUID NOT NULL,
    "key" VARCHAR(40) NOT NULL,
    "name_fa" VARCHAR(80) NOT NULL,
    "name_en" VARCHAR(80) NOT NULL,
    "requires_approval" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_price" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "base_currency" "CurrencyCode" NOT NULL,
    "base_amount_minor" BIGINT NOT NULL,
    "manual_irr_minor" BIGINT,
    "manual_aed_minor" BIGINT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "updated_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "product_price_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quantity_price_rule" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "customer_group_id" UUID,
    "min_qty" INTEGER NOT NULL,
    "max_qty" INTEGER,
    "base_currency" "CurrencyCode" NOT NULL,
    "base_amount_minor" BIGINT NOT NULL,
    "manual_irr_minor" BIGINT,
    "manual_aed_minor" BIGINT,
    "valid_from" TIMESTAMPTZ(3),
    "valid_to" TIMESTAMPTZ(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "quantity_price_rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exchange_rate" (
    "id" UUID NOT NULL,
    "irr_per_aed" DECIMAL(24,6) NOT NULL,
    "effective_from" TIMESTAMPTZ(3) NOT NULL,
    "note" VARCHAR(300),
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exchange_rate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouse" (
    "id" UUID NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "warehouse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_balance" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "on_hand" INTEGER NOT NULL DEFAULT 0,
    "reserved" INTEGER NOT NULL DEFAULT 0,
    "low_stock_threshold" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "inventory_balance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_reservation" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "order_item_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'ACTIVE',
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "released_at" TIMESTAMPTZ(3),
    "consumed_at" TIMESTAMPTZ(3),
    "release_reason" VARCHAR(60),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_reservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_movement" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "type" "InventoryMovementType" NOT NULL,
    "on_hand_delta" INTEGER NOT NULL,
    "reserved_delta" INTEGER NOT NULL,
    "on_hand_after" INTEGER NOT NULL,
    "reserved_after" INTEGER NOT NULL,
    "reason" VARCHAR(60) NOT NULL,
    "note" VARCHAR(500),
    "reference_type" VARCHAR(40),
    "reference_id" UUID,
    "actor_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_movement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cart" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "guest_token_hash" CHAR(64),
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "cart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cart_item" (
    "id" UUID NOT NULL,
    "cart_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "added_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cart_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipping_method" (
    "id" UUID NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "name_fa" VARCHAR(120) NOT NULL,
    "name_en" VARCHAR(120),
    "carrier_code" VARCHAR(40),
    "tracking_url_template" VARCHAR(300),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "shipping_method_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipping_zone" (
    "id" UUID NOT NULL,
    "method_id" UUID NOT NULL,
    "provinces" TEXT[],
    "cost_irr_minor" BIGINT,
    "min_days" INTEGER,
    "max_days" INTEGER,

    CONSTRAINT "shipping_zone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order" (
    "id" UUID NOT NULL,
    "reference" VARCHAR(20) NOT NULL,
    "user_id" UUID NOT NULL,
    "status" "StockOrderStatus" NOT NULL DEFAULT 'AWAITING_PAYMENT',
    "payment_status" "PaymentSummaryStatus" NOT NULL DEFAULT 'UNPAID',
    "currency" "CurrencyCode" NOT NULL DEFAULT 'IRR',
    "items_total_minor" BIGINT NOT NULL,
    "discount_minor" BIGINT NOT NULL DEFAULT 0,
    "shipping_minor" BIGINT NOT NULL,
    "tax_minor" BIGINT NOT NULL DEFAULT 0,
    "grand_total_minor" BIGINT NOT NULL,
    "fx_rate_id" UUID,
    "irr_per_aed" DECIMAL(24,6),
    "rounding_rule" VARCHAR(30) NOT NULL,
    "tax_rule_snapshot" JSONB,
    "pricing_rules_version" VARCHAR(30) NOT NULL,
    "address_snapshot" JSONB NOT NULL,
    "shipping_method_id" UUID NOT NULL,
    "shipping_snapshot" JSONB NOT NULL,
    "policy_version_id" UUID NOT NULL,
    "customer_note" VARCHAR(1000),
    "idempotency_key" VARCHAR(128) NOT NULL,
    "reservation_expires_at" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "confirmed_at" TIMESTAMPTZ(3),
    "cancelled_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_item" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "sku_snapshot" VARCHAR(64) NOT NULL,
    "name_fa_snapshot" VARCHAR(200) NOT NULL,
    "name_en_snapshot" VARCHAR(200),
    "part_type" "PartType" NOT NULL,
    "condition" "PhysicalCondition" NOT NULL,
    "origin" "ProductOrigin" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price_minor" BIGINT NOT NULL,
    "line_total_minor" BIGINT NOT NULL,
    "price_snapshot" JSONB NOT NULL,
    "returned_quantity" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "order_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_event" (
    "id" UUID NOT NULL,
    "subject_type" "EventSubject" NOT NULL,
    "subject_id" UUID NOT NULL,
    "type" VARCHAR(60) NOT NULL,
    "from_state" VARCHAR(40),
    "to_state" VARCHAR(40),
    "reason" VARCHAR(1000),
    "actor_kind" "ActorKind" NOT NULL,
    "actor_id" UUID,
    "customer_visible" BOOLEAN NOT NULL DEFAULT true,
    "data" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipment" (
    "id" UUID NOT NULL,
    "order_id" UUID,
    "procurement_id" UUID,
    "shipping_method_id" UUID NOT NULL,
    "carrier_code" VARCHAR(40),
    "tracking_code" VARCHAR(80),
    "destination_snapshot" JSONB NOT NULL,
    "cost_irr_minor" BIGINT,
    "status" "ShipmentStatus" NOT NULL DEFAULT 'PENDING',
    "shipped_at" TIMESTAMPTZ(3),
    "delivered_at" TIMESTAMPTZ(3),
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "shipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sourcing_request" (
    "id" UUID NOT NULL,
    "reference" VARCHAR(20) NOT NULL,
    "customer_id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "note" VARCHAR(3000),
    "urgency" "Urgency" NOT NULL DEFAULT 'NORMAL',
    "status" "SourcingRequestStatus" NOT NULL DEFAULT 'SUBMITTED',
    "delivery_province" VARCHAR(80),
    "delivery_city" VARCHAR(80),
    "assignee_id" UUID,
    "client_request_id" VARCHAR(64) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "submitted_at" TIMESTAMPTZ(3),
    "closed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sourcing_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sourcing_request_item" (
    "id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "part_name" VARCHAR(200) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "vehicle_brand_id" UUID,
    "vehicle_brand_text" VARCHAR(80),
    "vehicle_model" VARCHAR(80),
    "vehicle_year" INTEGER,
    "part_code" VARCHAR(64),
    "vin" VARCHAR(17),
    "preference" "SourcingPreference" NOT NULL DEFAULT 'ANY',
    "notes" VARCHAR(1000),
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "sourcing_request_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote" (
    "id" UUID NOT NULL,
    "reference" VARCHAR(20) NOT NULL,
    "request_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "current_version_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "quote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_version" (
    "id" UUID NOT NULL,
    "quote_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "status" "QuoteVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "created_by_id" UUID NOT NULL,
    "validity_hours" INTEGER NOT NULL DEFAULT 24,
    "sent_at" TIMESTAMPTZ(3),
    "valid_until" TIMESTAMPTZ(3),
    "accepted_at" TIMESTAMPTZ(3),
    "accepted_by_id" UUID,
    "rejected_at" TIMESTAMPTZ(3),
    "reject_reason" VARCHAR(1000),
    "superseded_at" TIMESTAMPTZ(3),
    "superseded_by_version_id" UUID,
    "cancelled_at" TIMESTAMPTZ(3),
    "cancel_reason" VARCHAR(1000),
    "fx_rate_id" UUID,
    "irr_per_aed" DECIMAL(24,6),
    "rounding_rule" VARCHAR(30) NOT NULL,
    "tax_snapshot" JSONB,
    "items_irr_minor" BIGINT NOT NULL DEFAULT 0,
    "costs_irr_minor" BIGINT NOT NULL DEFAULT 0,
    "tax_irr_minor" BIGINT NOT NULL DEFAULT 0,
    "total_payable_irr_minor" BIGINT NOT NULL DEFAULT 0,
    "reference_total_aed_minor" BIGINT,
    "lead_time_wording" "LeadTimeWording" NOT NULL DEFAULT 'ESTIMATE',
    "lead_time_origin" VARCHAR(30) NOT NULL DEFAULT 'PAYMENT_VERIFIED',
    "business_calendar_id" UUID,
    "calendar_snapshot" JSONB,
    "shipping_lead_time" JSONB,
    "terms_policy_version_id" UUID NOT NULL,
    "customer_note" VARCHAR(2000),
    "pdf_attachment_id" UUID,
    "content_hash" CHAR(64),
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "quote_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_item" (
    "id" UUID NOT NULL,
    "quote_version_id" UUID NOT NULL,
    "sourcing_item_id" UUID,
    "description" VARCHAR(300) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "manufacturer" VARCHAR(120),
    "part_type" "PartType" NOT NULL,
    "condition" "PhysicalCondition" NOT NULL,
    "compatibility" "CompatibilityStatus" NOT NULL,
    "alternative_note" VARCHAR(500),
    "availability" "QuoteItemAvailability" NOT NULL,
    "included" BOOLEAN NOT NULL DEFAULT true,
    "unit_price_currency" "CurrencyCode" NOT NULL,
    "unit_price_minor" BIGINT NOT NULL,
    "discount_currency" "CurrencyCode",
    "discount_minor" BIGINT,
    "line_total_irr_minor" BIGINT,
    "lead_min" INTEGER NOT NULL,
    "lead_max" INTEGER NOT NULL,
    "lead_unit" "LeadTimeUnit" NOT NULL,
    "lead_day_kind" "DayKind" NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "quote_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_item_internal_cost" (
    "quote_item_id" UUID NOT NULL,
    "currency" "CurrencyCode" NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "supplier_id" UUID,

    CONSTRAINT "quote_item_internal_cost_pkey" PRIMARY KEY ("quote_item_id")
);

-- CreateTable
CREATE TABLE "quote_cost" (
    "id" UUID NOT NULL,
    "quote_version_id" UUID NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "label" VARCHAR(120) NOT NULL,
    "currency" "CurrencyCode" NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "amount_irr_minor" BIGINT NOT NULL,

    CONSTRAINT "quote_cost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier" (
    "id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "country" CHAR(2),
    "city" VARCHAR(80),
    "contact" VARCHAR(300),
    "notes" VARCHAR(2000),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "procurement" (
    "id" UUID NOT NULL,
    "reference" VARCHAR(20) NOT NULL,
    "quote_version_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "status" "ProcurementStatus" NOT NULL DEFAULT 'AWAITING_PAYMENT',
    "payment_status" "PaymentSummaryStatus" NOT NULL DEFAULT 'UNPAID',
    "total_payable_irr_minor" BIGINT NOT NULL,
    "paid_at" TIMESTAMPTZ(3),
    "promised_ready_at" TIMESTAMPTZ(3),
    "current_ready_estimate" TIMESTAMPTZ(3),
    "promised_delivery_at" TIMESTAMPTZ(3),
    "current_delivery_estimate" TIMESTAMPTZ(3),
    "address_snapshot" JSONB,
    "operational_origin" VARCHAR(80),
    "assignee_id" UUID,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "procurement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "procurement_item" (
    "id" UUID NOT NULL,
    "procurement_id" UUID NOT NULL,
    "quote_item_id" UUID NOT NULL,
    "description" VARCHAR(300) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "status" "ProcurementItemStatus" NOT NULL DEFAULT 'PENDING',
    "supplier_id" UUID,
    "supplier_order_ref" VARCHAR(80),
    "unit_cost_currency" "CurrencyCode",
    "unit_cost_minor" BIGINT,
    "internal_note" VARCHAR(1000),
    "purchased_at" TIMESTAMPTZ(3),
    "received_at" TIMESTAMPTZ(3),

    CONSTRAINT "procurement_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "procurement_date_change" (
    "id" UUID NOT NULL,
    "procurement_id" UUID NOT NULL,
    "field" VARCHAR(30) NOT NULL,
    "previous_estimate" TIMESTAMPTZ(3),
    "new_estimate" TIMESTAMPTZ(3) NOT NULL,
    "reason" VARCHAR(1000) NOT NULL,
    "actor_id" UUID NOT NULL,
    "notified_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "procurement_date_change_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_calendar" (
    "id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "time_zone" VARCHAR(40) NOT NULL DEFAULT 'Asia/Tehran',
    "weekend_days" INTEGER[],
    "holidays" TEXT[],
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 0,
    "updated_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "business_calendar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_attempt" (
    "id" UUID NOT NULL,
    "reference" VARCHAR(24) NOT NULL,
    "subject_type" "PaymentSubjectType" NOT NULL,
    "order_id" UUID,
    "procurement_id" UUID,
    "customer_id" UUID NOT NULL,
    "provider" VARCHAR(40) NOT NULL,
    "merchant_id" VARCHAR(80) NOT NULL,
    "provider_reference" VARCHAR(120),
    "provider_transaction_id" VARCHAR(120),
    "amount_irr_minor" BIGINT NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'CREATED',
    "snapshot" JSONB NOT NULL,
    "provider_deadline" TIMESTAMPTZ(3),
    "verified_at" TIMESTAMPTZ(3),
    "verified_amount_irr_minor" BIGINT,
    "overpayment_irr_minor" BIGINT NOT NULL DEFAULT 0,
    "card_mask" VARCHAR(24),
    "failure_code" VARCHAR(60),
    "last_inquiry_at" TIMESTAMPTZ(3),
    "inquiry_count" INTEGER NOT NULL DEFAULT 0,
    "idempotency_key" VARCHAR(128) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "payment_attempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_settlement" (
    "id" UUID NOT NULL,
    "subject_type" "PaymentSubjectType" NOT NULL,
    "subject_id" UUID NOT NULL,
    "payment_attempt_id" UUID NOT NULL,
    "amount_irr_minor" BIGINT NOT NULL,
    "settled_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_settlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_event" (
    "id" UUID NOT NULL,
    "payment_attempt_id" UUID NOT NULL,
    "type" VARCHAR(40) NOT NULL,
    "dedupe_key" VARCHAR(200),
    "data" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refund" (
    "id" UUID NOT NULL,
    "reference" VARCHAR(24) NOT NULL,
    "payment_attempt_id" UUID NOT NULL,
    "amount_irr_minor" BIGINT NOT NULL,
    "status" "RefundStatus" NOT NULL DEFAULT 'REQUESTED',
    "reason" VARCHAR(1000) NOT NULL,
    "return_request_id" UUID,
    "resolution_case_id" UUID,
    "requested_by_id" UUID,
    "approved_by_id" UUID,
    "processed_by_id" UUID,
    "provider_refund_reference" VARCHAR(120),
    "manual_reference" VARCHAR(120),
    "provider_result" JSONB,
    "idempotency_key" VARCHAR(128) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "completed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "refund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resolution_case" (
    "id" UUID NOT NULL,
    "kind" "ResolutionCaseKind" NOT NULL,
    "status" "ResolutionCaseStatus" NOT NULL DEFAULT 'OPEN',
    "subject_type" "PaymentSubjectType" NOT NULL,
    "subject_id" UUID NOT NULL,
    "payment_attempt_id" UUID,
    "amount_irr_minor" BIGINT,
    "note" VARCHAR(2000),
    "resolution" VARCHAR(2000),
    "resolved_by_id" UUID,
    "resolved_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resolution_case_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_record" (
    "id" UUID NOT NULL,
    "scope" VARCHAR(60) NOT NULL,
    "actor_key" VARCHAR(80) NOT NULL,
    "key" VARCHAR(128) NOT NULL,
    "request_hash" CHAR(64) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'IN_PROGRESS',
    "response_status" INTEGER,
    "response_body" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "idempotency_record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation" (
    "id" UUID NOT NULL,
    "subject_kind" "ConversationSubject" NOT NULL,
    "subject_id" UUID,
    "subject" VARCHAR(200) NOT NULL,
    "customer_id" UUID NOT NULL,
    "assignee_id" UUID,
    "closed_at" TIMESTAMPTZ(3),
    "last_message_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "participant" (
    "conversation_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "ParticipantRole" NOT NULL,
    "joined_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removed_at" TIMESTAMPTZ(3),

    CONSTRAINT "participant_pkey" PRIMARY KEY ("conversation_id","user_id")
);

-- CreateTable
CREATE TABLE "message" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "sender_id" UUID,
    "sender_kind" "SenderKind" NOT NULL,
    "client_message_id" VARCHAR(64) NOT NULL,
    "body" VARCHAR(4000) NOT NULL DEFAULT '',
    "quote_version_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_attachment" (
    "message_id" UUID NOT NULL,
    "attachment_id" UUID NOT NULL,

    CONSTRAINT "message_attachment_pkey" PRIMARY KEY ("message_id","attachment_id")
);

-- CreateTable
CREATE TABLE "message_read_cursor" (
    "conversation_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "last_read_message_id" UUID NOT NULL,
    "last_read_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "message_read_cursor_pkey" PRIMARY KEY ("conversation_id","user_id")
);

-- CreateTable
CREATE TABLE "internal_note" (
    "id" UUID NOT NULL,
    "conversation_id" UUID,
    "subject_type" "EventSubject" NOT NULL,
    "subject_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "body" VARCHAR(4000) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "internal_note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachment" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "purpose" "AttachmentPurpose" NOT NULL,
    "visibility" "AttachmentVisibility" NOT NULL DEFAULT 'PRIVATE',
    "status" "AttachmentStatus" NOT NULL DEFAULT 'UPLOADING',
    "storage_key" VARCHAR(200) NOT NULL,
    "original_filename" VARCHAR(160) NOT NULL,
    "extension" VARCHAR(10) NOT NULL,
    "detected_mime" VARCHAR(120),
    "size_bytes" INTEGER NOT NULL,
    "sha256" CHAR(64),
    "reject_reason" VARCHAR(60),
    "legacy_office" BOOLEAN NOT NULL DEFAULT false,
    "scan_engine" VARCHAR(60),
    "scanned_at" TIMESTAMPTZ(3),
    "subject_type" VARCHAR(40),
    "subject_id" UUID,
    "retention_until" TIMESTAMPTZ(3),
    "deleted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_job" (
    "id" UUID NOT NULL,
    "kind" VARCHAR(20) NOT NULL DEFAULT 'PRODUCTS',
    "attachment_id" UUID NOT NULL,
    "uploader_id" UUID NOT NULL,
    "mode" "ImportMode" NOT NULL,
    "file_checksum" CHAR(64) NOT NULL,
    "idempotency_key" VARCHAR(128) NOT NULL,
    "status" "ImportJobStatus" NOT NULL DEFAULT 'QUEUED',
    "mapping" JSONB NOT NULL DEFAULT '{}',
    "options" JSONB NOT NULL DEFAULT '{}',
    "summary" JSONB,
    "plan_checksum" CHAR(64),
    "progress" INTEGER NOT NULL DEFAULT 0,
    "total_rows" INTEGER,
    "failure_reason" VARCHAR(500),
    "error_report_attachment_id" UUID,
    "committed_by_id" UUID,
    "committed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "import_job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_row" (
    "id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "row_number" INTEGER NOT NULL,
    "sku" VARCHAR(64),
    "action" "ImportRowAction" NOT NULL,
    "issues" JSONB NOT NULL DEFAULT '[]',
    "values" JSONB,
    "changes" JSONB NOT NULL DEFAULT '[]',
    "expected_product_version" INTEGER,
    "expected_inventory_version" INTEGER,
    "product_id" UUID,
    "applied_at" TIMESTAMPTZ(3),

    CONSTRAINT "import_row_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" VARCHAR(60) NOT NULL,
    "params" JSONB NOT NULL DEFAULT '{}',
    "link_path" VARCHAR(300),
    "dedupe_key" VARCHAR(200) NOT NULL,
    "read_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_delivery" (
    "id" UUID NOT NULL,
    "notification_id" UUID NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" VARCHAR(500),
    "provider_message_id" VARCHAR(120),
    "next_attempt_at" TIMESTAMPTZ(3),
    "sent_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_delivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_event" (
    "id" UUID NOT NULL,
    "type" VARCHAR(60) NOT NULL,
    "aggregate_type" VARCHAR(40) NOT NULL,
    "aggregate_id" UUID NOT NULL,
    "payload" JSONB NOT NULL,
    "dedupe_key" VARCHAR(200) NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "available_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_at" TIMESTAMPTZ(3),
    "processed_at" TIMESTAMPTZ(3),
    "last_error" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbox_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL,
    "actor_id" UUID,
    "actor_kind" "ActorKind" NOT NULL,
    "action" VARCHAR(80) NOT NULL,
    "entity_type" VARCHAR(60) NOT NULL,
    "entity_id" VARCHAR(80),
    "before" JSONB,
    "after" JSONB,
    "request_id" VARCHAR(64),
    "ip_hash" CHAR(64),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_setting" (
    "key" VARCHAR(60) NOT NULL,
    "value" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "updated_by_id" UUID,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "site_setting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "policy_version" (
    "id" UUID NOT NULL,
    "kind" "PolicyKind" NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "PolicyStatus" NOT NULL DEFAULT 'DRAFT',
    "title_fa" VARCHAR(200) NOT NULL,
    "title_en" VARCHAR(200),
    "body_fa" TEXT NOT NULL,
    "body_en" TEXT,
    "content_hash" CHAR(64) NOT NULL,
    "published_at" TIMESTAMPTZ(3),
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "policy_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "policy_acceptance" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "policy_version_id" UUID NOT NULL,
    "subject_type" VARCHAR(40) NOT NULL,
    "subject_id" UUID NOT NULL,
    "accepted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "policy_acceptance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "return_request" (
    "id" UUID NOT NULL,
    "reference" VARCHAR(24) NOT NULL,
    "customer_id" UUID NOT NULL,
    "order_id" UUID,
    "procurement_id" UUID,
    "kind" "ReturnKind" NOT NULL,
    "status" "ReturnRequestStatus" NOT NULL DEFAULT 'REQUESTED',
    "reason" VARCHAR(1000) NOT NULL,
    "decision_reason" VARCHAR(1000),
    "decided_by_id" UUID,
    "decided_at" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "return_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "return_request_item" (
    "id" UUID NOT NULL,
    "return_request_id" UUID NOT NULL,
    "order_item_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "received_quantity" INTEGER NOT NULL DEFAULT 0,
    "restocked_quantity" INTEGER NOT NULL DEFAULT 0,
    "inspection_note" VARCHAR(1000),

    CONSTRAINT "return_request_item_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_mobile_e164_key" ON "user"("mobile_e164");

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE INDEX "user_kind_status_idx" ON "user"("kind", "status");

-- CreateIndex
CREATE INDEX "customer_profile_group_status_idx" ON "customer_profile"("group_status");

-- CreateIndex
CREATE INDEX "address_user_id_idx" ON "address"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_hash_key" ON "session"("token_hash");

-- CreateIndex
CREATE INDEX "session_user_id_revoked_at_idx" ON "session"("user_id", "revoked_at");

-- CreateIndex
CREATE INDEX "session_expires_at_idx" ON "session"("expires_at");

-- CreateIndex
CREATE INDEX "otp_challenge_mobile_e164_created_at_idx" ON "otp_challenge"("mobile_e164", "created_at");

-- CreateIndex
CREATE INDEX "otp_challenge_ip_hash_created_at_idx" ON "otp_challenge"("ip_hash", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "mfa_challenge_token_hash_key" ON "mfa_challenge"("token_hash");

-- CreateIndex
CREATE INDEX "mfa_recovery_code_user_id_idx" ON "mfa_recovery_code"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "staff_invitation_token_hash_key" ON "staff_invitation"("token_hash");

-- CreateIndex
CREATE INDEX "staff_invitation_email_idx" ON "staff_invitation"("email");

-- CreateIndex
CREATE UNIQUE INDEX "bootstrap_token_token_hash_key" ON "bootstrap_token"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "role_key_key" ON "role"("key");

-- CreateIndex
CREATE INDEX "user_role_role_id_idx" ON "user_role"("role_id");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_brand_code_key" ON "vehicle_brand"("code");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_brand_slug_key" ON "vehicle_brand"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "manufacturer_brand_slug_key" ON "manufacturer_brand"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "manufacturer_brand_normalized_name_key" ON "manufacturer_brand"("normalized_name");

-- CreateIndex
CREATE UNIQUE INDEX "category_code_key" ON "category"("code");

-- CreateIndex
CREATE UNIQUE INDEX "category_slug_key" ON "category"("slug");

-- CreateIndex
CREATE INDEX "category_parent_id_idx" ON "category"("parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_sku_key" ON "product"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "product_slug_key" ON "product"("slug");

-- CreateIndex
CREATE INDEX "product_published_archived_at_category_id_idx" ON "product"("published", "archived_at", "category_id");

-- CreateIndex
CREATE INDEX "product_origin_idx" ON "product"("origin");

-- CreateIndex
CREATE INDEX "product_vehicle_brand_vehicle_brand_id_idx" ON "product_vehicle_brand"("vehicle_brand_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_media_storage_key_key" ON "product_media"("storage_key");

-- CreateIndex
CREATE INDEX "product_media_product_id_sort_order_idx" ON "product_media"("product_id", "sort_order");

-- CreateIndex
CREATE INDEX "product_fitment_product_id_idx" ON "product_fitment"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "customer_group_key_key" ON "customer_group"("key");

-- CreateIndex
CREATE UNIQUE INDEX "product_price_product_id_key" ON "product_price"("product_id");

-- CreateIndex
CREATE INDEX "quantity_price_rule_product_id_customer_group_id_active_idx" ON "quantity_price_rule"("product_id", "customer_group_id", "active");

-- CreateIndex
CREATE INDEX "exchange_rate_effective_from_idx" ON "exchange_rate"("effective_from");

-- CreateIndex
CREATE UNIQUE INDEX "warehouse_code_key" ON "warehouse"("code");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_balance_product_id_warehouse_id_key" ON "inventory_balance"("product_id", "warehouse_id");

-- CreateIndex
CREATE INDEX "inventory_reservation_status_expires_at_idx" ON "inventory_reservation"("status", "expires_at");

-- CreateIndex
CREATE INDEX "inventory_reservation_order_id_idx" ON "inventory_reservation"("order_id");

-- CreateIndex
CREATE INDEX "inventory_movement_product_id_created_at_idx" ON "inventory_movement"("product_id", "created_at");

-- CreateIndex
CREATE INDEX "inventory_movement_reference_type_reference_id_idx" ON "inventory_movement"("reference_type", "reference_id");

-- CreateIndex
CREATE UNIQUE INDEX "cart_user_id_key" ON "cart"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "cart_guest_token_hash_key" ON "cart"("guest_token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "cart_item_cart_id_product_id_key" ON "cart_item"("cart_id", "product_id");

-- CreateIndex
CREATE UNIQUE INDEX "shipping_method_code_key" ON "shipping_method"("code");

-- CreateIndex
CREATE INDEX "shipping_zone_method_id_idx" ON "shipping_zone"("method_id");

-- CreateIndex
CREATE UNIQUE INDEX "order_reference_key" ON "order"("reference");

-- CreateIndex
CREATE INDEX "order_status_created_at_idx" ON "order"("status", "created_at");

-- CreateIndex
CREATE INDEX "order_user_id_created_at_idx" ON "order"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "order_user_id_idempotency_key_key" ON "order"("user_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "order_item_order_id_idx" ON "order_item"("order_id");

-- CreateIndex
CREATE INDEX "order_item_product_id_idx" ON "order_item"("product_id");

-- CreateIndex
CREATE INDEX "order_event_subject_type_subject_id_created_at_idx" ON "order_event"("subject_type", "subject_id", "created_at");

-- CreateIndex
CREATE INDEX "shipment_order_id_idx" ON "shipment"("order_id");

-- CreateIndex
CREATE INDEX "shipment_procurement_id_idx" ON "shipment"("procurement_id");

-- CreateIndex
CREATE UNIQUE INDEX "sourcing_request_reference_key" ON "sourcing_request"("reference");

-- CreateIndex
CREATE INDEX "sourcing_request_status_created_at_idx" ON "sourcing_request"("status", "created_at");

-- CreateIndex
CREATE INDEX "sourcing_request_assignee_id_status_idx" ON "sourcing_request"("assignee_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "sourcing_request_customer_id_client_request_id_key" ON "sourcing_request"("customer_id", "client_request_id");

-- CreateIndex
CREATE INDEX "sourcing_request_item_request_id_idx" ON "sourcing_request_item"("request_id");

-- CreateIndex
CREATE UNIQUE INDEX "quote_reference_key" ON "quote"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "quote_current_version_id_key" ON "quote"("current_version_id");

-- CreateIndex
CREATE INDEX "quote_request_id_idx" ON "quote"("request_id");

-- CreateIndex
CREATE INDEX "quote_version_status_valid_until_idx" ON "quote_version"("status", "valid_until");

-- CreateIndex
CREATE UNIQUE INDEX "quote_version_quote_id_version_number_key" ON "quote_version"("quote_id", "version_number");

-- CreateIndex
CREATE INDEX "quote_item_quote_version_id_idx" ON "quote_item"("quote_version_id");

-- CreateIndex
CREATE INDEX "quote_cost_quote_version_id_idx" ON "quote_cost"("quote_version_id");

-- CreateIndex
CREATE UNIQUE INDEX "procurement_reference_key" ON "procurement"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "procurement_quote_version_id_key" ON "procurement"("quote_version_id");

-- CreateIndex
CREATE INDEX "procurement_status_current_ready_estimate_idx" ON "procurement"("status", "current_ready_estimate");

-- CreateIndex
CREATE UNIQUE INDEX "procurement_item_quote_item_id_key" ON "procurement_item"("quote_item_id");

-- CreateIndex
CREATE INDEX "procurement_item_procurement_id_idx" ON "procurement_item"("procurement_id");

-- CreateIndex
CREATE INDEX "procurement_date_change_procurement_id_idx" ON "procurement_date_change"("procurement_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_attempt_reference_key" ON "payment_attempt"("reference");

-- CreateIndex
CREATE INDEX "payment_attempt_status_last_inquiry_at_idx" ON "payment_attempt"("status", "last_inquiry_at");

-- CreateIndex
CREATE INDEX "payment_attempt_order_id_idx" ON "payment_attempt"("order_id");

-- CreateIndex
CREATE INDEX "payment_attempt_procurement_id_idx" ON "payment_attempt"("procurement_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_attempt_provider_merchant_id_provider_reference_key" ON "payment_attempt"("provider", "merchant_id", "provider_reference");

-- CreateIndex
CREATE UNIQUE INDEX "payment_attempt_customer_id_idempotency_key_key" ON "payment_attempt"("customer_id", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "payment_settlement_payment_attempt_id_key" ON "payment_settlement"("payment_attempt_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_settlement_subject_type_subject_id_key" ON "payment_settlement"("subject_type", "subject_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_event_dedupe_key_key" ON "payment_event"("dedupe_key");

-- CreateIndex
CREATE INDEX "payment_event_payment_attempt_id_created_at_idx" ON "payment_event"("payment_attempt_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "refund_reference_key" ON "refund"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "refund_idempotency_key_key" ON "refund"("idempotency_key");

-- CreateIndex
CREATE INDEX "refund_payment_attempt_id_status_idx" ON "refund"("payment_attempt_id", "status");

-- CreateIndex
CREATE INDEX "resolution_case_status_created_at_idx" ON "resolution_case"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "resolution_case_kind_payment_attempt_id_key" ON "resolution_case"("kind", "payment_attempt_id");

-- CreateIndex
CREATE INDEX "idempotency_record_expires_at_idx" ON "idempotency_record"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_record_scope_actor_key_key_key" ON "idempotency_record"("scope", "actor_key", "key");

-- CreateIndex
CREATE INDEX "conversation_customer_id_last_message_at_idx" ON "conversation"("customer_id", "last_message_at");

-- CreateIndex
CREATE INDEX "conversation_assignee_id_last_message_at_idx" ON "conversation"("assignee_id", "last_message_at");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_subject_kind_subject_id_key" ON "conversation"("subject_kind", "subject_id");

-- CreateIndex
CREATE INDEX "participant_user_id_idx" ON "participant"("user_id");

-- CreateIndex
CREATE INDEX "message_conversation_id_created_at_id_idx" ON "message"("conversation_id", "created_at", "id");

-- CreateIndex
CREATE UNIQUE INDEX "message_conversation_id_sender_kind_client_message_id_key" ON "message"("conversation_id", "sender_kind", "client_message_id");

-- CreateIndex
CREATE UNIQUE INDEX "message_attachment_attachment_id_key" ON "message_attachment"("attachment_id");

-- CreateIndex
CREATE INDEX "internal_note_subject_type_subject_id_idx" ON "internal_note"("subject_type", "subject_id");

-- CreateIndex
CREATE UNIQUE INDEX "attachment_storage_key_key" ON "attachment"("storage_key");

-- CreateIndex
CREATE INDEX "attachment_owner_id_created_at_idx" ON "attachment"("owner_id", "created_at");

-- CreateIndex
CREATE INDEX "attachment_subject_type_subject_id_idx" ON "attachment"("subject_type", "subject_id");

-- CreateIndex
CREATE INDEX "attachment_status_idx" ON "attachment"("status");

-- CreateIndex
CREATE UNIQUE INDEX "import_job_idempotency_key_key" ON "import_job"("idempotency_key");

-- CreateIndex
CREATE INDEX "import_job_status_created_at_idx" ON "import_job"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "import_row_job_id_row_number_key" ON "import_row"("job_id", "row_number");

-- CreateIndex
CREATE UNIQUE INDEX "notification_dedupe_key_key" ON "notification"("dedupe_key");

-- CreateIndex
CREATE INDEX "notification_user_id_read_at_created_at_idx" ON "notification"("user_id", "read_at", "created_at");

-- CreateIndex
CREATE INDEX "notification_delivery_status_next_attempt_at_idx" ON "notification_delivery"("status", "next_attempt_at");

-- CreateIndex
CREATE UNIQUE INDEX "notification_delivery_notification_id_channel_key" ON "notification_delivery"("notification_id", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "outbox_event_dedupe_key_key" ON "outbox_event"("dedupe_key");

-- CreateIndex
CREATE INDEX "outbox_event_status_available_at_idx" ON "outbox_event"("status", "available_at");

-- CreateIndex
CREATE INDEX "audit_log_entity_type_entity_id_created_at_idx" ON "audit_log"("entity_type", "entity_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_log_actor_id_created_at_idx" ON "audit_log"("actor_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "policy_version_kind_version_key" ON "policy_version"("kind", "version");

-- CreateIndex
CREATE UNIQUE INDEX "policy_acceptance_policy_version_id_subject_type_subject_id_key" ON "policy_acceptance"("policy_version_id", "subject_type", "subject_id");

-- CreateIndex
CREATE UNIQUE INDEX "return_request_reference_key" ON "return_request"("reference");

-- CreateIndex
CREATE INDEX "return_request_status_created_at_idx" ON "return_request"("status", "created_at");

-- CreateIndex
CREATE INDEX "return_request_customer_id_idx" ON "return_request"("customer_id");

-- CreateIndex
CREATE INDEX "return_request_item_return_request_id_idx" ON "return_request_item"("return_request_id");

-- AddForeignKey
ALTER TABLE "customer_profile" ADD CONSTRAINT "customer_profile_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_profile" ADD CONSTRAINT "customer_profile_customer_group_id_fkey" FOREIGN KEY ("customer_group_id") REFERENCES "customer_group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "address" ADD CONSTRAINT "address_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mfa_challenge" ADD CONSTRAINT "mfa_challenge_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mfa_recovery_code" ADD CONSTRAINT "mfa_recovery_code_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_invitation" ADD CONSTRAINT "staff_invitation_invited_by_id_fkey" FOREIGN KEY ("invited_by_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permission" ADD CONSTRAINT "role_permission_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permission" ADD CONSTRAINT "role_permission_permission_key_fkey" FOREIGN KEY ("permission_key") REFERENCES "permission"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_role" ADD CONSTRAINT "user_role_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_role" ADD CONSTRAINT "user_role_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_role" ADD CONSTRAINT "user_role_granted_by_id_fkey" FOREIGN KEY ("granted_by_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category" ADD CONSTRAINT "category_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product" ADD CONSTRAINT "product_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product" ADD CONSTRAINT "product_manufacturer_brand_id_fkey" FOREIGN KEY ("manufacturer_brand_id") REFERENCES "manufacturer_brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_translation" ADD CONSTRAINT "product_translation_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_vehicle_brand" ADD CONSTRAINT "product_vehicle_brand_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_vehicle_brand" ADD CONSTRAINT "product_vehicle_brand_vehicle_brand_id_fkey" FOREIGN KEY ("vehicle_brand_id") REFERENCES "vehicle_brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_media" ADD CONSTRAINT "product_media_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_fitment" ADD CONSTRAINT "product_fitment_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_price" ADD CONSTRAINT "product_price_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quantity_price_rule" ADD CONSTRAINT "quantity_price_rule_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quantity_price_rule" ADD CONSTRAINT "quantity_price_rule_customer_group_id_fkey" FOREIGN KEY ("customer_group_id") REFERENCES "customer_group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exchange_rate" ADD CONSTRAINT "exchange_rate_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_balance" ADD CONSTRAINT "inventory_balance_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_balance" ADD CONSTRAINT "inventory_balance_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_reservation" ADD CONSTRAINT "inventory_reservation_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_reservation" ADD CONSTRAINT "inventory_reservation_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_reservation" ADD CONSTRAINT "inventory_reservation_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_reservation" ADD CONSTRAINT "inventory_reservation_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movement" ADD CONSTRAINT "inventory_movement_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movement" ADD CONSTRAINT "inventory_movement_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart" ADD CONSTRAINT "cart_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_item" ADD CONSTRAINT "cart_item_cart_id_fkey" FOREIGN KEY ("cart_id") REFERENCES "cart"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_item" ADD CONSTRAINT "cart_item_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipping_zone" ADD CONSTRAINT "shipping_zone_method_id_fkey" FOREIGN KEY ("method_id") REFERENCES "shipping_method"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order" ADD CONSTRAINT "order_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order" ADD CONSTRAINT "order_shipping_method_id_fkey" FOREIGN KEY ("shipping_method_id") REFERENCES "shipping_method"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order" ADD CONSTRAINT "order_policy_version_id_fkey" FOREIGN KEY ("policy_version_id") REFERENCES "policy_version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_item" ADD CONSTRAINT "order_item_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_item" ADD CONSTRAINT "order_item_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment" ADD CONSTRAINT "shipment_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment" ADD CONSTRAINT "shipment_procurement_id_fkey" FOREIGN KEY ("procurement_id") REFERENCES "procurement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment" ADD CONSTRAINT "shipment_shipping_method_id_fkey" FOREIGN KEY ("shipping_method_id") REFERENCES "shipping_method"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sourcing_request" ADD CONSTRAINT "sourcing_request_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sourcing_request" ADD CONSTRAINT "sourcing_request_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sourcing_request_item" ADD CONSTRAINT "sourcing_request_item_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "sourcing_request"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sourcing_request_item" ADD CONSTRAINT "sourcing_request_item_vehicle_brand_id_fkey" FOREIGN KEY ("vehicle_brand_id") REFERENCES "vehicle_brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote" ADD CONSTRAINT "quote_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "sourcing_request"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote" ADD CONSTRAINT "quote_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote" ADD CONSTRAINT "quote_current_version_id_fkey" FOREIGN KEY ("current_version_id") REFERENCES "quote_version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_version" ADD CONSTRAINT "quote_version_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "quote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_version" ADD CONSTRAINT "quote_version_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_version" ADD CONSTRAINT "quote_version_terms_policy_version_id_fkey" FOREIGN KEY ("terms_policy_version_id") REFERENCES "policy_version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_item" ADD CONSTRAINT "quote_item_quote_version_id_fkey" FOREIGN KEY ("quote_version_id") REFERENCES "quote_version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_item" ADD CONSTRAINT "quote_item_sourcing_item_id_fkey" FOREIGN KEY ("sourcing_item_id") REFERENCES "sourcing_request_item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_item_internal_cost" ADD CONSTRAINT "quote_item_internal_cost_quote_item_id_fkey" FOREIGN KEY ("quote_item_id") REFERENCES "quote_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_item_internal_cost" ADD CONSTRAINT "quote_item_internal_cost_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_cost" ADD CONSTRAINT "quote_cost_quote_version_id_fkey" FOREIGN KEY ("quote_version_id") REFERENCES "quote_version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procurement" ADD CONSTRAINT "procurement_quote_version_id_fkey" FOREIGN KEY ("quote_version_id") REFERENCES "quote_version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procurement" ADD CONSTRAINT "procurement_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procurement" ADD CONSTRAINT "procurement_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procurement_item" ADD CONSTRAINT "procurement_item_procurement_id_fkey" FOREIGN KEY ("procurement_id") REFERENCES "procurement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procurement_item" ADD CONSTRAINT "procurement_item_quote_item_id_fkey" FOREIGN KEY ("quote_item_id") REFERENCES "quote_item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procurement_item" ADD CONSTRAINT "procurement_item_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procurement_date_change" ADD CONSTRAINT "procurement_date_change_procurement_id_fkey" FOREIGN KEY ("procurement_id") REFERENCES "procurement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_attempt" ADD CONSTRAINT "payment_attempt_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_attempt" ADD CONSTRAINT "payment_attempt_procurement_id_fkey" FOREIGN KEY ("procurement_id") REFERENCES "procurement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_attempt" ADD CONSTRAINT "payment_attempt_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_settlement" ADD CONSTRAINT "payment_settlement_payment_attempt_id_fkey" FOREIGN KEY ("payment_attempt_id") REFERENCES "payment_attempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_event" ADD CONSTRAINT "payment_event_payment_attempt_id_fkey" FOREIGN KEY ("payment_attempt_id") REFERENCES "payment_attempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund" ADD CONSTRAINT "refund_payment_attempt_id_fkey" FOREIGN KEY ("payment_attempt_id") REFERENCES "payment_attempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund" ADD CONSTRAINT "refund_return_request_id_fkey" FOREIGN KEY ("return_request_id") REFERENCES "return_request"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participant" ADD CONSTRAINT "participant_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participant" ADD CONSTRAINT "participant_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message" ADD CONSTRAINT "message_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message" ADD CONSTRAINT "message_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_attachment" ADD CONSTRAINT "message_attachment_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "message"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_attachment" ADD CONSTRAINT "message_attachment_attachment_id_fkey" FOREIGN KEY ("attachment_id") REFERENCES "attachment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_read_cursor" ADD CONSTRAINT "message_read_cursor_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_read_cursor" ADD CONSTRAINT "message_read_cursor_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "internal_note" ADD CONSTRAINT "internal_note_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "internal_note" ADD CONSTRAINT "internal_note_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachment" ADD CONSTRAINT "attachment_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_job" ADD CONSTRAINT "import_job_uploader_id_fkey" FOREIGN KEY ("uploader_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_row" ADD CONSTRAINT "import_row_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "import_job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_delivery" ADD CONSTRAINT "notification_delivery_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "notification"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_acceptance" ADD CONSTRAINT "policy_acceptance_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_acceptance" ADD CONSTRAINT "policy_acceptance_policy_version_id_fkey" FOREIGN KEY ("policy_version_id") REFERENCES "policy_version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_request" ADD CONSTRAINT "return_request_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_request" ADD CONSTRAINT "return_request_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_request" ADD CONSTRAINT "return_request_procurement_id_fkey" FOREIGN KEY ("procurement_id") REFERENCES "procurement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_request_item" ADD CONSTRAINT "return_request_item_return_request_id_fkey" FOREIGN KEY ("return_request_id") REFERENCES "return_request"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_request_item" ADD CONSTRAINT "return_request_item_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
