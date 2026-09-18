-- Token lookup (docs/features/qa-follow-ups-2026-09-18.md): refresh and email-verification tokens
-- are now looked up by an indexed SHA-256 hash instead of scanning every row with bcrypt.compare.
-- Columns keep their names and types (a hex SHA-256 fits the existing string column); no data is
-- rewritten. Existing bcrypt-hashed rows can never match a SHA-256 lookup again, so every
-- pre-deploy session and unused verification link stops working after this ships (intended, see
-- the doc's Deployment Notes).
--
-- down(): DROP INDEX "Session_refreshHash_key"; DROP INDEX "EmailVerificationToken_tokenHash_key";
CREATE UNIQUE INDEX "Session_refreshHash_key" ON "Session"("refreshHash");

CREATE UNIQUE INDEX "EmailVerificationToken_tokenHash_key" ON "EmailVerificationToken"("tokenHash");
