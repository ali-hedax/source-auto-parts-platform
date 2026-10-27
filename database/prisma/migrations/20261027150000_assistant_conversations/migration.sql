-- Site guide (Hexi) conversation log (additive only). The owner reviews visitor questions and the
-- guide's replies in the admin panel; rows older than the retention period are deleted by the
-- hourly cleanup job. No existing table or row is changed.
CREATE TABLE "assistant_conversation" (
  "id" UUID NOT NULL,
  "client_key" UUID NOT NULL,
  "locale" VARCHAR(2) NOT NULL,
  "user_id" UUID,
  "ip_hash" VARCHAR(128),
  "message_count" INTEGER NOT NULL DEFAULT 0,
  "failed_count" INTEGER NOT NULL DEFAULT 0,
  "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_message_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "assistant_conversation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "assistant_conversation_client_key_key" ON "assistant_conversation"("client_key");
CREATE INDEX "assistant_conversation_last_message_at_idx" ON "assistant_conversation"("last_message_at");
CREATE INDEX "assistant_conversation_user_id_idx" ON "assistant_conversation"("user_id");
ALTER TABLE "assistant_conversation" ADD CONSTRAINT "assistant_conversation_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "assistant_conversation" ADD CONSTRAINT "assistant_conversation_locale_check" CHECK ("locale" IN ('fa', 'en'));

CREATE TABLE "assistant_message" (
  "id" UUID NOT NULL,
  "conversation_id" UUID NOT NULL,
  "question" TEXT NOT NULL,
  "answer" TEXT,
  "status" VARCHAR(12) NOT NULL,
  "error_reason" VARCHAR(120),
  "product_skus" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "provider" VARCHAR(20),
  "model" VARCHAR(120),
  "prompt_tokens" INTEGER,
  "completion_tokens" INTEGER,
  "latency_ms" INTEGER,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "assistant_message_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "assistant_message_conversation_id_created_at_idx" ON "assistant_message"("conversation_id", "created_at");
CREATE INDEX "assistant_message_created_at_idx" ON "assistant_message"("created_at");
ALTER TABLE "assistant_message" ADD CONSTRAINT "assistant_message_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "assistant_conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "assistant_message" ADD CONSTRAINT "assistant_message_status_check" CHECK ("status" IN ('ANSWERED', 'FAILED'));
