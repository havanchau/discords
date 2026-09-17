import type { Role } from './api-contract.js';

/**
 * Bot API, phase 1 (REST only). A person owns bots; a server admin authorizes a bot into a server with
 * one role. The bot calls the `/bot-api/*` routes with `Authorization: Bot <token>`.
 */
export const BOT_MAX_PER_OWNER = 10;
export const BOT_NAME_MIN_LENGTH = 2;
export const BOT_NAME_MAX_LENGTH = 32;
/** Requests accepted per bot token per minute across every `/bot-api/*` route and API instance. */
export const BOT_API_REQUESTS_PER_MINUTE = 120;
/** Channel messages accepted per bot per minute, the same ceiling a person's REST send has. */
export const BOT_MESSAGES_PER_MINUTE = 30;
/** Display name: letters, digits, spaces, `_` and `-`; trimmed before storing. */
export const BOT_NAME_PATTERN = /^[\p{L}\p{N}_ -]+$/u;

/** A bot as its owner lists it. The token is never part of it. */
export interface OwnedBot {
  id: string;
  name: string;
  avatarUrl: string | null;
  createdAt: Date;
  /** Servers the bot is currently a member of. */
  serverCount: number;
}

export interface CreateBotInput {
  name: string;
  avatarUrl?: string | null;
}

/** Returned once, by create and regenerate. Nothing can return the token again. */
export interface BotSecret {
  token: string;
}

export interface CreateBotResult extends BotSecret {
  bot: OwnedBot;
}

/** What the authorize dialog needs: the bot, and the servers the caller may add it to. */
export interface BotAuthorizationView {
  bot: { id: string; name: string; avatarUrl: string | null };
  servers: BotAuthorizationServer[];
}

export interface BotAuthorizationServer {
  id: string;
  name: string;
  /** Already a member; it cannot be authorized again. */
  alreadyMember: boolean;
  /** Banned from this server; it cannot be authorized until unbanned. */
  banned: boolean;
  /** Roles whose permissions the caller holds themselves, so granting one is not an escalation. */
  grantableRoles: Role[];
}

export interface AuthorizeBotInput {
  serverId: string;
  roleId: string;
}
