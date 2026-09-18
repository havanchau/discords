-- Upload ownership (docs/features/upload-ownership.md). One `Upload` row per file stored through
-- `POST /uploads`, so `avatarUrl`/`bannerUrl` set-time validation can prove the caller owns the URL,
-- and a replace/anonymize flow can delete the old file once no other row still references it.
-- Additive only: a new table, plus indexes on existing nullable columns already scanned by the
-- reference-count query; no existing column changes type, nullability or default.
--
-- down(): DROP TABLE "Upload"; DROP INDEX "User_avatarUrl_idx"; DROP INDEX "User_bannerUrl_idx";
--         DROP INDEX "Server_avatarUrl_idx"; DROP INDEX "ServerMember_avatarUrl_idx";
CREATE TABLE "Upload" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Upload_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Upload_url_key" ON "Upload"("url");

CREATE INDEX "Upload_ownerId_createdAt_idx" ON "Upload"("ownerId", "createdAt");

ALTER TABLE "Upload" ADD CONSTRAINT "Upload_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Supports the reference-count check in `deleteUploadIfUnreferenced`: is this URL still used by
-- another User/Server/ServerMember row before the old file is deleted.
CREATE INDEX "User_avatarUrl_idx" ON "User"("avatarUrl");

CREATE INDEX "User_bannerUrl_idx" ON "User"("bannerUrl");

CREATE INDEX "Server_avatarUrl_idx" ON "Server"("avatarUrl");

CREATE INDEX "ServerMember_avatarUrl_idx" ON "ServerMember"("avatarUrl");
