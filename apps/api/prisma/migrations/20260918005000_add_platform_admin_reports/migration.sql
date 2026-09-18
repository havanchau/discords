-- Platform report review (docs/features/platform-report-review.md). Additive only: one defaulted
-- enum column on `User`, four nullable columns plus an enum on `ServerReport`, and one supporting
-- index. No existing column changes type, nullability or default; no data is rewritten.
--
-- down(): ALTER TABLE "ServerReport" DROP CONSTRAINT "ServerReport_resolvedById_fkey";
--         DROP INDEX "ServerReport_resolvedAt_createdAt_idx";
--         ALTER TABLE "ServerReport" DROP COLUMN "resolvedAt", DROP COLUMN "resolvedById",
--           DROP COLUMN "resolution", DROP COLUMN "resolutionNote";
--         ALTER TABLE "User" DROP COLUMN "platformRole";
--         DROP TYPE "PlatformReportResolution"; DROP TYPE "PlatformRole";
CREATE TYPE "PlatformRole" AS ENUM ('USER', 'ADMIN');

ALTER TABLE "User" ADD COLUMN "platformRole" "PlatformRole" NOT NULL DEFAULT 'USER';

CREATE TYPE "PlatformReportResolution" AS ENUM ('DISMISSED', 'SERVER_DELISTED');

ALTER TABLE "ServerReport" ADD COLUMN "resolvedAt" TIMESTAMP(3),
ADD COLUMN "resolvedById" TEXT,
ADD COLUMN "resolution" "PlatformReportResolution",
ADD COLUMN "resolutionNote" TEXT;

-- The status filter: OPEN is `resolvedAt IS NULL`, newest first either way.
CREATE INDEX "ServerReport_resolvedAt_createdAt_idx" ON "ServerReport"("resolvedAt", "createdAt");

ALTER TABLE "ServerReport" ADD CONSTRAINT "ServerReport_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
