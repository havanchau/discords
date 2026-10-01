-- Per-device E2EE key management (docs/features/e2ee-key-management.md).
--
-- Every change here is additive: two new tables (DeviceKey, EncryptedChannelKey) and two defaulted
-- columns on each of Channel and DirectConversation. No existing column is altered or dropped, and
-- no row is backfilled.
--
-- Lock duration: both ADD COLUMN statements use a constant DEFAULT, which PostgreSQL 11+ records as
-- metadata without rewriting the table, so neither statement rewrites Channel or DirectConversation
-- however large they are. The new tables are empty at creation, so their indexes build instantly.
--
-- DirectConversation."isEncrypted" deliberately defaults to FALSE at the column level even though
-- DMs are encrypted by default going forward. A DEFAULT TRUE would retroactively mark every
-- pre-existing plaintext conversation as encrypted, which is false and would make the client try to
-- decrypt plaintext. The application sets TRUE explicitly when it creates a conversation; nothing
-- relies on the column default for existing rows (docs/features/e2ee-key-management.md -> DB /
-- migration).
--
-- EncryptedChannelKey carries two composite unique indexes rather than one across both scope
-- columns. PostgreSQL treats NULLs as distinct in a unique index, and every row of this table has
-- exactly one of "channelId"/"conversationId" NULL, so a single composite across both would never
-- fire and duplicate wrap rows would be accepted. Each row has exactly one non-null scope column, so
-- exactly one of the two indexes below covers it (same doc -> Correction 2026-10-01).
--
-- down():
--   ALTER TABLE "EncryptedChannelKey" DROP CONSTRAINT "EncryptedChannelKey_deviceKeyId_fkey";
--   ALTER TABLE "EncryptedChannelKey" DROP CONSTRAINT "EncryptedChannelKey_conversationId_fkey";
--   ALTER TABLE "EncryptedChannelKey" DROP CONSTRAINT "EncryptedChannelKey_channelId_fkey";
--   DROP TABLE "EncryptedChannelKey";
--   ALTER TABLE "DeviceKey" DROP CONSTRAINT "DeviceKey_userId_fkey";
--   DROP TABLE "DeviceKey";
--   ALTER TABLE "DirectConversation" DROP COLUMN "encryptionKeyVersion", DROP COLUMN "isEncrypted";
--   ALTER TABLE "Channel" DROP COLUMN "encryptionKeyVersion", DROP COLUMN "isEncrypted";
--
--   THIS down() IS DATA-DESTROYING AND NOT RECOVERABLE. Dropping EncryptedChannelKey deletes every
--   wrapped content key. The server never held an unwrapped content key, so there is no copy to
--   restore from: the effect is identical to every member losing every device at once, for every
--   channel and conversation that was ever encrypted. Ciphertext already written to
--   Message."content" / DirectMessage."content" stays in the database and becomes permanently
--   unreadable. Dropping DeviceKey additionally deletes every registered public key, so clients
--   would have to re-register. Rolling back the application code alone (leaving these tables in
--   place but unused) is the reversible option and is what the feature doc's Risks & rollback
--   section recommends; run this down() only when the data loss above is intended.
ALTER TABLE "Channel" ADD COLUMN     "encryptionKeyVersion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "isEncrypted" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "DirectConversation" ADD COLUMN     "encryptionKeyVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "isEncrypted" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "DeviceKey" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "DeviceKey_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EncryptedChannelKey" (
    "id" TEXT NOT NULL,
    "channelId" TEXT,
    "conversationId" TEXT,
    "keyId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "deviceKeyId" TEXT NOT NULL,
    "wrappedKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EncryptedChannelKey_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DeviceKey_userId_idx" ON "DeviceKey"("userId");

CREATE UNIQUE INDEX "DeviceKey_userId_deviceId_key" ON "DeviceKey"("userId", "deviceId");

CREATE INDEX "EncryptedChannelKey_deviceKeyId_idx" ON "EncryptedChannelKey"("deviceKeyId");

CREATE INDEX "EncryptedChannelKey_channelId_version_idx" ON "EncryptedChannelKey"("channelId", "version");

CREATE INDEX "EncryptedChannelKey_conversationId_version_idx" ON "EncryptedChannelKey"("conversationId", "version");

CREATE UNIQUE INDEX "EncryptedChannelKey_channelId_keyId_deviceKeyId_key" ON "EncryptedChannelKey"("channelId", "keyId", "deviceKeyId");

CREATE UNIQUE INDEX "EncryptedChannelKey_conversationId_keyId_deviceKeyId_key" ON "EncryptedChannelKey"("conversationId", "keyId", "deviceKeyId");

ALTER TABLE "DeviceKey" ADD CONSTRAINT "DeviceKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EncryptedChannelKey" ADD CONSTRAINT "EncryptedChannelKey_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EncryptedChannelKey" ADD CONSTRAINT "EncryptedChannelKey_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "DirectConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EncryptedChannelKey" ADD CONSTRAINT "EncryptedChannelKey_deviceKeyId_fkey" FOREIGN KEY ("deviceKeyId") REFERENCES "DeviceKey"("id") ON DELETE CASCADE ON UPDATE CASCADE;
