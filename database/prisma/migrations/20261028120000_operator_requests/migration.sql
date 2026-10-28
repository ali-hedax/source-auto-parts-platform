-- "Contact an operator" from the site guide (additive only): visitor messages with name and phone,
-- answered later by staff. No existing table or row is changed.
CREATE TABLE "operator_request" (
  "id" UUID NOT NULL,
  "access_key_hash" VARCHAR(128) NOT NULL,
  "locale" VARCHAR(2) NOT NULL,
  "name" VARCHAR(80) NOT NULL,
  "phone" VARCHAR(30) NOT NULL,
  "user_id" UUID,
  "ip_hash" VARCHAR(128),
  "status" VARCHAR(10) NOT NULL DEFAULT 'OPEN',
  "unread_by_staff" BOOLEAN NOT NULL DEFAULT true,
  "last_message_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closed_at" TIMESTAMPTZ(3),
  CONSTRAINT "operator_request_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "operator_request_status_last_message_at_idx" ON "operator_request"("status", "last_message_at");
CREATE INDEX "operator_request_user_id_last_message_at_idx" ON "operator_request"("user_id", "last_message_at");
ALTER TABLE "operator_request" ADD CONSTRAINT "operator_request_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "operator_request" ADD CONSTRAINT "operator_request_status_check" CHECK ("status" IN ('OPEN', 'ANSWERED', 'CLOSED'));
ALTER TABLE "operator_request" ADD CONSTRAINT "operator_request_locale_check" CHECK ("locale" IN ('fa', 'en'));

CREATE TABLE "operator_message" (
  "id" UUID NOT NULL,
  "request_id" UUID NOT NULL,
  "sender" VARCHAR(10) NOT NULL,
  "staff_id" UUID,
  "body" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "operator_message_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "operator_message_request_id_created_at_idx" ON "operator_message"("request_id", "created_at");
ALTER TABLE "operator_message" ADD CONSTRAINT "operator_message_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "operator_request"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "operator_message" ADD CONSTRAINT "operator_message_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "operator_message" ADD CONSTRAINT "operator_message_sender_check" CHECK ("sender" IN ('VISITOR', 'STAFF'));
