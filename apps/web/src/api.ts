
const API_URL = import.meta.env.VITE_API_URL || '/api';

export type OAuthProviderName = 'google' | 'facebook';

/* Provider sign-in starts with a full-page navigation so the API can set its flow cookie and redirect. */
export function oauthStartUrl(provider: OAuthProviderName) {
  return `${API_URL}/auth/oauth/${provider}`;
}
export const API_ORIGIN =
  API_URL === '/api' ? window.location.origin : API_URL.replace(/\/api\/?$/, '');

export interface AuthState {
  accessToken: string;
  refreshToken: string;
  user: User;
}

interface AuthRefreshConfig {
  getAuth: () => AuthState | null;
  setAuth: (auth: AuthState) => void;
  clearAuth: () => void;
}

let authRefreshConfig: AuthRefreshConfig | null = null;
let refreshPromise: Promise<AuthState> | null = null;

/**
 * The API translates `message` for the request locale and adds a stable `code`; callers that need to
 * branch on a specific failure use `code`, never the text.
 */
export class ApiError extends Error {
  readonly code: string | null;
  readonly status: number;

  constructor(message: unknown, code: unknown, status: number, statusText: string, detail?: string) {
    const text = normalizeMessage(message) || statusText;
    super(detail ? `${text} (${detail})` : text);
    this.name = 'ApiError';
    this.code = typeof code === 'string' ? code : null;
    this.status = status;
  }
}

/** Upload failures name the file so a user with several queued uploads knows which one failed. */
function fileDetail(file: File) {
  return `${file.name}, ${file.type || 'unknown'}`;
}

function normalizeMessage(message: unknown): string {
  if (Array.isArray(message)) return message.filter((part) => typeof part === 'string').join(', ');
  return typeof message === 'string' ? message : '';
}

let requestLocale = 'en';

/** Set by LocaleProvider so the API answers errors and emails in the locale the user is looking at. */
export function setRequestLocale(locale: string) {
  requestLocale = locale;
}

export function configureAuthRefresh(config: AuthRefreshConfig) {
  authRefreshConfig = config;
}

/**
 * Response shapes live in `@discord-clone/shared`, declared the way the server holds them. `Json<T>`
 * is the same type after JSON serialization, which is what a client actually receives: a `Date` has
 * become an ISO string. Both ends come from one declaration and cannot drift.
 *
 * They are re-exported here because callers already import them from `./api` next to the request
 * helpers.
 */
import type {
  Json,
  AuditLogEntry as ServerAuditLogEntry,
  AuthSessionEntry as ServerAuthSessionEntry,
  BlockedUserEntry as ServerBlockedUserEntry,
  Channel as ServerChannel,
  ChannelCategory as ServerChannelCategory,
  ChannelPermissionOverride as ServerChannelPermissionOverride,
  CreateServerEventInput as ServerCreateServerEventInput,
  CustomStatus as ServerCustomStatus,
  DirectConversation as ServerDirectConversation,
  DirectMessage as ServerDirectMessage,
  DirectMessageReaction as ServerDirectMessageReaction,
  DirectMessageReplyPreview as ServerDirectMessageReplyPreview,
  FriendEntry as ServerFriendEntry,
  FriendRequestEntry as ServerFriendRequestEntry,
  FriendsSummary as ServerFriendsSummary,
  Invite as ServerInvite,
  LinkPreview as ServerLinkPreview,
  Message as ServerMessage,
  MessageAttachment as ServerMessageAttachment,
  MessageReaction as ServerMessageReaction,
  NotificationItem as ServerNotificationItem,
  NotificationPreference as ServerNotificationPreference,
  PublicUser as ServerPublicUser,
  Role as ServerRole,
  ServerBanEntry as ServerServerBanEntry,
  ServerDetail as ServerServerDetail,
  ServerEmoji as ServerServerEmoji,
  ServerEventView as ServerServerEventView,
  ServerMemberDetail as ServerServerMemberDetail,
  ServerSummary as ServerServerSummary,
  ThreadMessageResult as ServerThreadMessageResult,
  ThreadSummary as ServerThreadSummary,
  User as ServerUser,
  UserProfile as ServerUserProfile,
  UserProfileServerContext as ServerUserProfileServerContext,
} from '@discord-clone/shared';

export type AuditLogEntry = Json<ServerAuditLogEntry>;
export type AuthSessionEntry = Json<ServerAuthSessionEntry>;
export type BlockedUserEntry = Json<ServerBlockedUserEntry>;
export type Channel = Json<ServerChannel>;
export type ChannelCategory = Json<ServerChannelCategory>;
export type ChannelPermissionOverride = Json<ServerChannelPermissionOverride>;
export type CreateServerEventInput = Json<ServerCreateServerEventInput>;
export type CustomStatus = Json<ServerCustomStatus>;
export type DirectConversation = Json<ServerDirectConversation>;
export type DirectMessage = Json<ServerDirectMessage>;
export type DirectMessageReaction = Json<ServerDirectMessageReaction>;
export type DirectMessageReplyPreview = Json<ServerDirectMessageReplyPreview>;
export type FriendEntry = Json<ServerFriendEntry>;
export type FriendRequestEntry = Json<ServerFriendRequestEntry>;
export type FriendsSummary = Json<ServerFriendsSummary>;
export type Invite = Json<ServerInvite>;
export type LinkPreview = Json<ServerLinkPreview>;
export type Message = Json<ServerMessage>;
export type MessageAttachment = Json<ServerMessageAttachment>;
export type MessageReaction = Json<ServerMessageReaction>;
export type NotificationItem = Json<ServerNotificationItem>;
export type NotificationPreference = Json<ServerNotificationPreference>;
export type PublicUser = Json<ServerPublicUser>;
export type Role = Json<ServerRole>;
export type ServerBanEntry = Json<ServerServerBanEntry>;
export type ServerDetail = Json<ServerServerDetail>;
export type ServerEmoji = Json<ServerServerEmoji>;
export type ServerEventView = Json<ServerServerEventView>;
export type ServerMemberDetail = Json<ServerServerMemberDetail>;
export type ServerSummary = Json<ServerServerSummary>;
export type ThreadMessageResult = Json<ServerThreadMessageResult>;
export type ThreadSummary = Json<ServerThreadSummary>;
export type User = Json<ServerUser>;
export type UserProfile = Json<ServerUserProfile>;
export type UserProfileServerContext = Json<ServerUserProfileServerContext>;

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
  token?: string | null,
): Promise<T> {
  let response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: buildHeaders(options.headers, token),
  });

  if (response.status === 401 && token && authRefreshConfig) {
    const nextAuth = await refreshAuth();
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: buildHeaders(options.headers, nextAuth.accessToken),
    });
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new ApiError(error.message, error.code, response.status, response.statusText);
  }

  return response.json();
}

export async function uploadFile(file: File, token: string): Promise<MessageAttachment> {
  if (file.size > CHUNKED_UPLOAD_THRESHOLD_BYTES) {
    return uploadFileInChunks(file, token);
  }

  const form = new FormData();
  form.append('file', file);

  const response = await fetch(`${API_URL}/uploads`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: form,
  });

  if (response.status === 401 && authRefreshConfig) {
    const nextAuth = await refreshAuth();
    return uploadFile(file, nextAuth.accessToken);
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new ApiError(error.message, error.code, response.status, response.statusText, fileDetail(file));
  }

  const result = (await response.json()) as { attachment: MessageAttachment };
  return result.attachment;
}

const CHUNKED_UPLOAD_THRESHOLD_BYTES = 5 * 1024 * 1024;
const UPLOAD_CHUNK_BYTES = 2 * 1024 * 1024;

async function uploadFileInChunks(file: File, token: string): Promise<MessageAttachment> {
  const uploadId = createUploadId();
  const totalChunks = Math.ceil(file.size / UPLOAD_CHUNK_BYTES);
  let attachment: MessageAttachment | null = null;

  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex += 1) {
    const start = chunkIndex * UPLOAD_CHUNK_BYTES;
    const chunk = file.slice(start, Math.min(start + UPLOAD_CHUNK_BYTES, file.size));
    const form = new FormData();
    form.append('uploadId', uploadId);
    form.append('chunkIndex', String(chunkIndex));
    form.append('totalChunks', String(totalChunks));
    form.append('fileName', file.name);
    form.append('mimeType', file.type || 'application/octet-stream');
    form.append('fileSize', String(file.size));
    form.append('chunk', chunk, file.name);

    const response = await fetch(`${API_URL}/uploads/chunks`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: form,
    });

    if (response.status === 401 && authRefreshConfig) {
      const nextAuth = await refreshAuth();
      return uploadFileInChunks(file, nextAuth.accessToken);
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText }));
      throw new ApiError(
        error.message,
        error.code,
        response.status,
        response.statusText,
        fileDetail(file),
      );
    }

    const result = (await response.json()) as {
      done: boolean;
      attachment?: MessageAttachment;
    };
    if (result.done && result.attachment) {
      attachment = result.attachment;
    }
  }

  if (!attachment) {
    throw new Error(`Chunk upload did not complete (${file.name})`);
  }

  return attachment;
}

function createUploadId() {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function assetUrl(url: string) {
  if (/^https?:\/\//i.test(url)) return url;
  return `${API_ORIGIN}${url}`;
}

function buildHeaders(headers: RequestInit['headers'], token?: string | null) {
  return {
    'Content-Type': 'application/json',
    'X-Locale': requestLocale,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...headers,
  };
}

async function refreshAuth() {
  if (!authRefreshConfig) {
    throw new Error('Authentication refresh is not configured');
  }

  if (!refreshPromise) {
    refreshPromise = refreshAuthState(authRefreshConfig).finally(() => {
      refreshPromise = null;
    });
  }

  return refreshPromise;
}

async function refreshAuthState(config: AuthRefreshConfig) {
  const current = config.getAuth();

  if (!current?.refreshToken) {
    config.clearAuth();
    throw new Error('Session expired');
  }

  const response = await fetch(`${API_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: current.refreshToken }),
  });

  if (!response.ok) {
    config.clearAuth();
    throw new Error('Session expired');
  }

  const nextAuth = (await response.json()) as AuthState;
  config.setAuth(nextAuth);
  return nextAuth;
}
