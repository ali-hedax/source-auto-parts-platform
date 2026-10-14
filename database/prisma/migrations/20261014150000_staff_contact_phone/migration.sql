-- Staff contact number (panel → staff): on invitations and copied to the account on acceptance.
-- Additive and nullable; it is not a sign-in identifier (customers sign in with mobile_e164).
-- AlterTable
ALTER TABLE "user" ADD COLUMN     "contact_phone" VARCHAR(20);

-- AlterTable
ALTER TABLE "staff_invitation" ADD COLUMN     "contact_phone" VARCHAR(20);

