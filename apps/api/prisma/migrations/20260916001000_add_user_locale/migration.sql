-- Preferred UI/email/push language. Nullable so existing users keep following their browser
-- instead of being pinned to English at migration time.
ALTER TABLE "User" ADD COLUMN "locale" TEXT;
