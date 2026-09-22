/**
 * Announcement channels (docs/features/announcement-channels.md): following an ANNOUNCEMENT channel
 * into a text channel of another server, and publishing (crossposting) one message to every follower.
 */
import type { Message } from './api-contract.js';

/** One side of a follow, as named for the viewer of a follower list. */
export interface ChannelFollowEndpoint {
  channelId: string;
  channelName: string;
  serverId: string;
  serverName: string;
}

/**
 * A follow: copies of messages published in `source` are delivered into `target`. Listed from the
 * source side (`GET /channels/:id/followers`) and from the target side
 * (`GET /channels/:id/followed-channels`).
 */
export interface ChannelFollow {
  id: string;
  source: ChannelFollowEndpoint;
  target: ChannelFollowEndpoint;
  createdAt: Date;
}

/** Body of `POST /channels/:channelId/followers`, where `:channelId` is the source channel. */
export interface CreateChannelFollowInput {
  targetChannelId: string;
}

/** Response of `POST /messages/:messageId/publish`. */
export interface PublishMessageResult {
  /** The source message, now with `publishedAt` set. */
  message: Message;
  /** How many following channels received a copy. */
  followerCount: number;
}
