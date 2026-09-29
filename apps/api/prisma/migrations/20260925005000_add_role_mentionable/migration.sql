-- Everyone/here/role mentions (docs/features/everyone-here-and-role-mentions.md). Additive only:
-- one defaulted boolean on "Role". No existing column changes type, nullability, or default; no
-- data is rewritten.
--
-- down(): ALTER TABLE "Role" DROP COLUMN "isMentionable";
ALTER TABLE "Role" ADD COLUMN "isMentionable" BOOLEAN NOT NULL DEFAULT true;
