-- Timed notification mute (docs/features/timed-notification-mute.md). Stored as an absolute UTC
-- instant; NULL keeps today's meaning for every existing row (muted = true means muted indefinitely),
-- and a past value is read as unmuted by the API, so expiry needs no job. Nullable with no default:
-- a metadata-only change, no table rewrite.
-- down(): ALTER TABLE "NotificationPreference" DROP COLUMN "mutedUntil";
--         (drops only the expiry of timed mutes; those rows fall back to muted indefinitely.)
ALTER TABLE "NotificationPreference" ADD COLUMN "mutedUntil" TIMESTAMP(3);
