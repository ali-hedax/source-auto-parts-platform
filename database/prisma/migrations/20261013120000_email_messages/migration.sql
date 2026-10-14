-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('QUEUED', 'SENDING', 'SENT', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "email_message" (
    "id" UUID NOT NULL,
    "kind" VARCHAR(40) NOT NULL,
    "to_address" VARCHAR(200) NOT NULL,
    "subject" VARCHAR(200) NOT NULL,
    "payload" JSONB NOT NULL,
    "secret_enc" TEXT,
    "status" "EmailStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" VARCHAR(300),
    "smtp_message_id" VARCHAR(300),
    "smtp_response" VARCHAR(300),
    "sent_at" TIMESTAMPTZ(3),
    "invitation_id" UUID,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_message_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "email_message_invitation_id_created_at_idx" ON "email_message"("invitation_id", "created_at");

-- CreateIndex
CREATE INDEX "email_message_status_created_at_idx" ON "email_message"("status", "created_at");

-- AddForeignKey
ALTER TABLE "email_message" ADD CONSTRAINT "email_message_invitation_id_fkey" FOREIGN KEY ("invitation_id") REFERENCES "staff_invitation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

