-- Rules screening config. Defaulted and nullable, so existing servers keep screening off and the
-- ALTER does not rewrite the table.
ALTER TABLE "Server" ADD COLUMN "onboardingEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "rulesText" TEXT,
ADD COLUMN "selfAssignQuestions" JSONB;

-- When a member accepted the rules; null means not yet. It lives on the member row, so leaving,
-- being kicked, or account deletion removes it with the membership.
ALTER TABLE "ServerMember" ADD COLUMN "onboardingAcceptedAt" TIMESTAMP(3);
