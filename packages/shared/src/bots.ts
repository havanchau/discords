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

/**
 * Bot gateway and slash commands, phase 2/3 (`bot-gateway-and-slash-commands.md`). Shared constants
 * rather than env vars, per Open Question 34 — the same choice already made for the phase-1 bot rate
 * limits above.
 */
/** A bot may hold at most this many live gateway sockets; a newer connection replaces the oldest. */
export const BOT_GATEWAY_MAX_CONNECTIONS = 1;
/** Deadline for a bot to answer an interaction before it times out (Discord's own initial-response deadline). */
export const INTERACTION_TIMEOUT_MS = 15_000;
/** Per bot, per server. */
export const SLASH_COMMANDS_MAX_PER_BOT_PER_SERVER = 25;
export const SLASH_COMMAND_OPTIONS_MAX = 25;
/** Lowercase slug, distinct from `BOT_NAME_PATTERN` (a display name, which allows spaces). */
export const SLASH_COMMAND_NAME_PATTERN = /^[a-z][a-z0-9_-]{0,31}$/;
/** The four client-side built-ins (`apps/web/src/utils/slashCommands.ts`); a bot can never claim one. */
export const RESERVED_SLASH_COMMAND_NAMES = ['me', 'nick', 'poll', 'invite'] as const;

export type SlashCommandOptionType = 'STRING' | 'INTEGER' | 'BOOLEAN' | 'USER' | 'CHANNEL';

export interface SlashCommandOption {
  name: string;
  description: string;
  type: SlashCommandOptionType;
  required?: boolean;
}

export type InteractionStatus = 'PENDING' | 'RESPONDED' | 'TIMED_OUT';

/** A server-registered command, as returned to its owning bot. */
export interface SlashCommandView {
  id: string;
  botId: string;
  serverId: string;
  name: string;
  description: string;
  options: SlashCommandOption[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateSlashCommandInput {
  name: string;
  description: string;
  options?: SlashCommandOption[];
}

export interface UpdateSlashCommandInput {
  description?: string;
  options?: SlashCommandOption[];
}

/** `POST /channels/:channelId/interactions` body (session auth — the invoker is a human member). */
export interface InvokeInteractionInput {
  commandId: string;
  /** Raw text after the command name, parsed against the command's declared options server-side. */
  args: string;
}

export interface InvokeInteractionResult {
  interactionToken: string;
}

/** `POST /bot-api/interactions/:interactionToken/callback` body — identical shape to a bot's message send. */
export interface InteractionCallbackInput {
  content: string;
  replyToMessageId?: string;
}

/** Delivered only to the owning bot's gateway socket (targeted emit, not a room broadcast). */
export interface InteractionCreatePayload {
  interactionToken: string;
  commandName: string;
  args: string;
  channelId: string;
  serverId: string;
  invoker: { id: string; username: string; displayName: string };
}

/** Delivered to the invoker's own room once their interaction times out with no answer. */
export interface InteractionTimeoutPayload {
  interactionToken: string;
}
