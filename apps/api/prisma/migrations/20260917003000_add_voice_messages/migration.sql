-- Voice-message metadata on both attachment tables. All columns are nullable: existing attachments
-- and ordinary file uploads keep NULL, and the player falls back to the generic audio block.
ALTER TABLE "MessageAttachment" ADD COLUMN     "durationMs" INTEGER,
ADD COLUMN     "kind" TEXT,
ADD COLUMN     "waveform" JSONB;

-- The same columns on direct-message attachments (table created by 20260917002000_add_message_forwarding).
ALTER TABLE "DirectMessageAttachment" ADD COLUMN     "durationMs" INTEGER,
ADD COLUMN     "kind" TEXT,
ADD COLUMN     "waveform" JSONB;
