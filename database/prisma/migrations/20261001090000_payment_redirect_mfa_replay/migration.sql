-- Columns added after the initial migration: payment redirect URL + return-page locale,
-- and the last accepted TOTP time step (replay protection for staff MFA).
-- AlterTable
ALTER TABLE "payment_attempt" ADD COLUMN     "locale" "UiLocale" NOT NULL DEFAULT 'fa',
ADD COLUMN     "redirect_url" VARCHAR(1000);

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "mfa_last_time_step" INTEGER;
