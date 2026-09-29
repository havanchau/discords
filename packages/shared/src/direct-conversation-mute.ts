import type { DirectConversation, MuteDuration } from './api-contract.js';

/**
 * Body of `PATCH /direct-conversations/:conversationId/mute`. Same shape as
 * `UpdateNotificationPreferenceInput`'s mute fields, scoped to one DM conversation instead of a
 * server/channel: `muteDuration` is only accepted with `muted: true` (omitted there means `forever`).
 */
export interface UpdateDirectConversationMuteInput {
  muted: boolean;
  muteDuration?: MuteDuration;
}

/** Response of the mute PATCH: the conversation's mute state after the write. */
export interface DirectConversationMuteResult {
  conversationId: string;
  muted: boolean;
  mutedUntil: string | null;
}

/**
 * `GET /direct-conversations` items carry these two flat, optional fields alongside the rest of
 * `DirectConversation` (docs/features/dm-conversation-mute.md). Kept as an intersection type in its
 * own file rather than added directly to `DirectConversation` in `api-contract.ts`, which another
 * change is editing concurrently (see that doc's Deviations section).
 */
export type DirectConversationWithMute = DirectConversation & {
  muted?: boolean;
  mutedUntil?: string | null;
};
