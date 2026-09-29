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

/**
 * A bot as a server's `MANAGE_SERVER` admin sees it (`server-bot-commands-admin-view.md`) — not the
 * bot's owner. Deliberately excludes `OwnedBot.serverCount` and any owner identity: a non-owner admin
 * must never learn which other servers a bot belongs to or who owns it.
 */
export interface ServerInstalledBot {
  id: string;
  name: string;
  avatarUrl: string | null;
  /** This bot's slash commands registered in the one server being viewed, not its commands elsewhere. */
  commands: SlashCommandView[];
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

/**
 * `POST /bot-api/interactions/:interactionToken/callback` body
 * (`bot-message-components.md` → Changes, step 7).
 *
 * `type` defaults to `'MESSAGE'` when omitted, so a bot that only ever answered a slash command
 * before this feature needs no change. `content` is required for `'MESSAGE'` and optional for
 * `'UPDATE_MESSAGE'` (an update may touch only `components`, e.g. disabling a button after a click,
 * without changing the text — omitted keeps the existing content). `components` replaces the
 * message's components wholesale when present; omitted leaves them unchanged.
 */
export interface InteractionCallbackInput {
  type?: 'MESSAGE' | 'UPDATE_MESSAGE';
  content?: string;
  replyToMessageId?: string;
  components?: MessageComponentRow[];
}

export type InteractionType = 'APPLICATION_COMMAND' | 'MESSAGE_COMPONENT';

/** Delivered only to the owning bot's gateway socket (targeted emit, not a room broadcast). */
export interface InteractionCreatePayload {
  interactionToken: string;
  type: InteractionType;
  /** Set only for `type: 'APPLICATION_COMMAND'`. */
  commandName?: string;
  /** Set only for `type: 'APPLICATION_COMMAND'`. */
  args?: string;
  /** Set only for `type: 'MESSAGE_COMPONENT'`. */
  messageId?: string;
  /** Set only for `type: 'MESSAGE_COMPONENT'`. */
  customId?: string;
  /** Set only for `type: 'MESSAGE_COMPONENT'`. */
  componentType?: MessageComponentType;
  /** The select's chosen values; set only for a `'SELECT'` component click. */
  values?: string[];
  channelId: string;
  serverId: string;
  invoker: { id: string; username: string; displayName: string };
}

/** Delivered to the invoker's own room once their interaction times out with no answer. */
export interface InteractionTimeoutPayload {
  interactionToken: string;
}

/**
 * Message components — buttons and a single-select select menu attached by a bot
 * (`bot-message-components.md` → Scope/Changes). Up to 5 action rows, each row either up to 5
 * buttons or exactly 1 select menu; enforced server-side by `message-components.ts`'s
 * `validateComponentRows`, not by these types alone.
 */
export const MESSAGE_COMPONENT_MAX_ROWS = 5;
export const MESSAGE_COMPONENT_MAX_BUTTONS_PER_ROW = 5;
export const MESSAGE_COMPONENT_LABEL_MAX_LENGTH = 80;
export const MESSAGE_COMPONENT_CUSTOM_ID_MAX_LENGTH = 100;
export const MESSAGE_COMPONENT_URL_MAX_LENGTH = 1000;
export const SELECT_OPTIONS_MIN = 1;
export const SELECT_OPTIONS_MAX = 25;
export const SELECT_OPTION_LABEL_MAX_LENGTH = 100;
export const SELECT_OPTION_VALUE_MAX_LENGTH = 100;
export const SELECT_OPTION_DESCRIPTION_MAX_LENGTH = 100;
export const SELECT_PLACEHOLDER_MAX_LENGTH = 150;

export type MessageComponentType = 'BUTTON' | 'SELECT';
export type ButtonStyle = 'PRIMARY' | 'SECONDARY' | 'SUCCESS' | 'DANGER' | 'LINK';
export const BUTTON_STYLES: ButtonStyle[] = ['PRIMARY', 'SECONDARY', 'SUCCESS', 'DANGER', 'LINK'];

export interface SelectOption {
  label: string;
  value: string;
  description?: string;
}

export interface ButtonComponent {
  type: 'BUTTON';
  style: ButtonStyle;
  label: string;
  /** Required for every style except `'LINK'`; mutually exclusive with `url`. */
  customId?: string;
  /** Required only for `style: 'LINK'`; validated `http`/`https`. Never sent to the API on click. */
  url?: string;
  disabled?: boolean;
}

export interface SelectComponent {
  type: 'SELECT';
  customId: string;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
}

export type MessageComponent = ButtonComponent | SelectComponent;

/** One action row on a message. */
export interface MessageComponentRow {
  components: MessageComponent[];
}

/**
 * `POST /messages/:messageId/component-interactions` body (session auth — the same click-invoke
 * shape a slash-command invoke has, but keyed on the message and its component instead of a
 * registered command).
 */
export interface ComponentClickInput {
  customId: string;
  /** The select's chosen values; omitted/ignored for a button. */
  values?: string[];
}
