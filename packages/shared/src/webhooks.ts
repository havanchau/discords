/**
 * Incoming webhooks: limits shared by the settings form and the API, and the settings API shapes.
 * The public posting endpoint is `POST /webhooks/:webhookId/:token`.
 */
export const WEBHOOK_MAX_PER_CHANNEL = 10;
export const WEBHOOK_NAME_MAX_LENGTH = 80;
export const WEBHOOK_CONTENT_MAX_LENGTH = 2000;
/** Posts accepted per webhook per minute, counted across API instances. */
export const WEBHOOK_POSTS_PER_MINUTE = 30;

/**
 * What a `User` row stands for. Only HUMAN users sign in or appear in friend lists; a BOT joins servers
 * as a member (member kind BOT) and authenticates with its bot token, never a session.
 */
export type UserKind = 'HUMAN' | 'WEBHOOK' | 'BOT' | 'WORKFLOW';

/** A webhook as settings list it. The token is never part of it. */
export interface ChannelWebhook {
  id: string;
  channelId: string;
  name: string;
  avatarUrl: string | null;
  createdAt: Date;
}

export interface CreateWebhookInput {
  name: string;
  avatarUrl?: string | null;
}

/**
 * Returned once, by create and regenerate. `path` carries the plaintext token and is relative to the
 * API base URL; nothing can return it again.
 */
export interface WebhookSecret {
  path: string;
}

export interface CreateWebhookResult extends WebhookSecret {
  webhook: ChannelWebhook;
}

/** Body of `POST /webhooks/:webhookId/:token`. */
export interface ExecuteWebhookInput {
  content: string;
  username?: string;
  avatarUrl?: string;
}
