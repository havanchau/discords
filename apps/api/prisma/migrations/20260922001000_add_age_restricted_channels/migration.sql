-- Age-restricted channels (docs/features/age-restricted-channels.md). Both columns are additive:
-- the channel flag defaults to false (every existing channel stays unrestricted) and the user
-- confirmation is nullable (every existing user is unconfirmed). Metadata-only, no table rewrite.
-- down(): ALTER TABLE "Channel" DROP COLUMN "isAgeRestricted";
--         ALTER TABLE "User" DROP COLUMN "ageConfirmedAt";
--         (drops every recorded confirmation; users would have to confirm again after a re-apply.)
ALTER TABLE "Channel" ADD COLUMN "isAgeRestricted" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "User" ADD COLUMN "ageConfirmedAt" TIMESTAMP(3);
