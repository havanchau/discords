import type { ForwardOrigin } from '@discord-clone/shared';

/**
 * The columns a forwarded copy stores on `Message` and `DirectMessage`. Passed to the send paths as
 * an internal argument, never read from a request body, so a normal send cannot forge a label.
 */
export interface ForwardSnapshot {
  forwardedFromMessageId: string | null;
  forwardedFromDirectMessageId: string | null;
  forwardOriginAuthorName: string;
  forwardOriginContent: string;
  /** The source channel's name; null for a direct-message source. */
  forwardOriginLabel: string | null;
}

type ForwardColumns = { [Key in keyof ForwardSnapshot]: string | null };

export const forwardColumnsSelect = {
  forwardedFromMessageId: true,
  forwardedFromDirectMessageId: true,
  forwardOriginAuthorName: true,
  forwardOriginContent: true,
  forwardOriginLabel: true,
} as const;

export function formatForwardOrigin(row: ForwardColumns): ForwardOrigin | null {
  if (row.forwardOriginAuthorName === null || row.forwardOriginContent === null) return null;
  return {
    sourceType: row.forwardedFromDirectMessageId ? 'DIRECT' : 'CHANNEL',
    authorName: row.forwardOriginAuthorName,
    content: row.forwardOriginContent,
    channelName: row.forwardOriginLabel,
  };
}

/** A forward of a forward keeps the original snapshot, so chains always name the first source. */
export function carriedForwardSnapshot(row: ForwardColumns): ForwardSnapshot | null {
  if (row.forwardOriginAuthorName === null || row.forwardOriginContent === null) return null;
  return {
    forwardedFromMessageId: row.forwardedFromMessageId,
    forwardedFromDirectMessageId: row.forwardedFromDirectMessageId,
    forwardOriginAuthorName: row.forwardOriginAuthorName,
    forwardOriginContent: row.forwardOriginContent,
    forwardOriginLabel: row.forwardOriginLabel,
  };
}
