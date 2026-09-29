-- Role hoist and icon (docs/features/role-hoist-and-icon.md). Additive only: two nullable columns
-- and one defaulted boolean on "Role". No existing column changes type, nullability, or default;
-- no data is rewritten.
--
-- down(): ALTER TABLE "Role" DROP COLUMN "isHoisted", DROP COLUMN "iconUrl", DROP COLUMN "iconMimeType";
ALTER TABLE "Role" ADD COLUMN "isHoisted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Role" ADD COLUMN "iconUrl" TEXT;
ALTER TABLE "Role" ADD COLUMN "iconMimeType" TEXT;

-- Backfill: every role that exists before this migration keeps the grouping it has today.
-- MemberSidebar.tsx:75-98 groups online members by EVERY non-'@everyone' role right now, so
-- shipping the column at its `false` default would silently delete every server's existing member
-- list grouping on deploy day. That is a behavior change nobody asked for (AGENTS.md section 1), so
-- existing rows are backfilled to true and only roles created AFTER this migration get the
-- Discord-style opt-in default of false.
UPDATE "Role" SET "isHoisted" = true;
