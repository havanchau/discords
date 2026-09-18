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

  constructor(
    message: unknown,
    code: unknown,
    status: number,
    statusText: string,
    detail?: string,
  ) {
    const text = normalizeMessage(message) || statusText;
    super(detail ? `${text} (${detail})` : text);
    this.name = 'ApiError';
    this.code = typeof code === 'string' ? code : null;
    this.status = status;
  }
}

/** An error body that is not a JSON object reads as empty, so ApiError falls back to the status text. */
async function readErrorBody(response: Response): Promise<Record<string, unknown>> {
  const body: unknown = await response.json().catch(() => ({ message: response.statusText }));
  return typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
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
  AcceptServerOnboardingInput,
  AcceptServerOnboardingResult,
  AccountDeletionScheduledResult as ServerAccountDeletionScheduledResult,
  AuditLogEntry as ServerAuditLogEntry,
  AutoModAction,
  AutoModRuleView as ServerAutoModRuleView,
  AutoModTriggerType,
  CreateAutoModRuleInput,
  UpdateAutoModRuleInput,
  AuthSessionEntry as ServerAuthSessionEntry,
  BlockedUserEntry as ServerBlockedUserEntry,
  Channel as ServerChannel,
  ChannelCategory as ServerChannelCategory,
  ChannelPermissionOverride as ServerChannelPermissionOverride,
  CreateServerEventInput as ServerCreateServerEventInput,
  CreatePollInput as ServerCreatePollInput,
  CreateSavedMessageInput as ServerCreateSavedMessageInput,
  CustomStatus as ServerCustomStatus,
  DirectConversation as ServerDirectConversation,
  DirectMessage as ServerDirectMessage,
  DirectMessageReaction as ServerDirectMessageReaction,
  DirectMessageReplyPreview as ServerDirectMessageReplyPreview,
  ExportJobView as ServerExportJobView,
  CreateForumPostInput as ServerCreateForumPostInput,
  ForumPostListResult as ServerForumPostListResult,
  ForumPostView as ServerForumPostView,
  ForumTagView,
  UpdateForumTagsInput,
  ForwardMessageInput as ServerForwardMessageInput,
  ForwardOrigin as ServerForwardOrigin,
  FriendEntry as ServerFriendEntry,
  FriendRequestEntry as ServerFriendRequestEntry,
  FriendsSummary as ServerFriendsSummary,
  Invite as ServerInvite,
  LinkPreview as ServerLinkPreview,
  Message as ServerMessage,
  MessageAttachment as ServerMessageAttachment,
  MessageReaction as ServerMessageReaction,
  CreateMessageReportInput,
  CreateMessageReportResult as ServerCreateMessageReportResult,
  MessageReportReason,
  MessageReportStatus,
  MessageReportView as ServerMessageReportView,
  UpdateMessageReportInput,
  NotificationItem as ServerNotificationItem,
  NotificationPreference as ServerNotificationPreference,
  PollOptionView as ServerPollOptionView,
  PollUpdatedPayload as ServerPollUpdatedPayload,
  PollView as ServerPollView,
  PlatformReportDetail as ServerPlatformReportDetail,
  PlatformReportPage as ServerPlatformReportPage,
  PlatformReportResolution,
  PlatformReportStatus,
  PlatformRole,
  PlatformServerReportView as ServerPlatformServerReportView,
  PlatformServerSummary as ServerPlatformServerSummary,
  ResolvePlatformReportInput,
  PublicUser as ServerPublicUser,
  Role as ServerRole,
  SavedMessageView as ServerSavedMessageView,
  CreateScheduledMessageInput as ServerCreateScheduledMessageInput,
  ScheduledMessageUpdatedPayload,
  ScheduledMessageView as ServerScheduledMessageView,
  UpdateScheduledMessageInput as ServerUpdateScheduledMessageInput,
  ServerBanEntry as ServerServerBanEntry,
  ServerDetail as ServerServerDetail,
  ServerEmoji as ServerServerEmoji,
  ServerEventView as ServerServerEventView,
  ServerMemberDetail as ServerServerMemberDetail,
  ServerOnboardingView,
  ServerSummary as ServerServerSummary,
  SelfAssignQuestion,
  UpdateServerOnboardingInput,
  ThreadMessageResult as ServerThreadMessageResult,
  ThreadSummary as ServerThreadSummary,
  User as ServerUser,
  UserProfile as ServerUserProfile,
  UserProfileServerContext as ServerUserProfileServerContext,
  VoiceAttachmentMetadata,
  DiscoveryJoinResult,
  DiscoveryServerCard,
  DiscoveryServerPage,
  ReportServerInput,
  ServerDiscoverySettings,
  ServerTemplateSummary as ServerServerTemplateSummary,
  UpdateServerDiscoveryInput,
  ChannelWebhook as ServerChannelWebhook,
  CreateWebhookInput,
  CreateWebhookResult as ServerCreateWebhookResult,
  WebhookSecret,
  AuthorizeBotInput,
  BotAuthorizationView,
  BotSecret,
  CreateBotInput,
  CreateBotResult as ServerCreateBotResult,
  OwnedBot as ServerOwnedBot,
  ServerSticker as ServerServerSticker,
  SoundboardClip as ServerSoundboardClip,
  SoundboardPlayedPayload,
} from '@discord-clone/shared';

export type AccountDeletionScheduledResult = Json<ServerAccountDeletionScheduledResult>;
export type AuditLogEntry = Json<ServerAuditLogEntry>;
export type AutoModRule = Json<ServerAutoModRuleView>;
export type { AutoModAction, AutoModTriggerType, CreateAutoModRuleInput, UpdateAutoModRuleInput };
export type AuthSessionEntry = Json<ServerAuthSessionEntry>;
export type BlockedUserEntry = Json<ServerBlockedUserEntry>;
export type Channel = Json<ServerChannel>;
export type ChannelCategory = Json<ServerChannelCategory>;
export type ChannelPermissionOverride = Json<ServerChannelPermissionOverride>;
export type CreatePollInput = Json<ServerCreatePollInput>;
export type CreateSavedMessageInput = Json<ServerCreateSavedMessageInput>;
export type CreateServerEventInput = Json<ServerCreateServerEventInput>;
export type CustomStatus = Json<ServerCustomStatus>;
export type DirectConversation = Json<ServerDirectConversation>;
export type DirectMessage = Json<ServerDirectMessage>;
export type DirectMessageReaction = Json<ServerDirectMessageReaction>;
export type DirectMessageReplyPreview = Json<ServerDirectMessageReplyPreview>;
export type ExportJob = Json<ServerExportJobView>;
export type CreateForumPostInput = Json<ServerCreateForumPostInput>;
export type ForumPost = Json<ServerForumPostView>;
export type ForumPostListResult = Json<ServerForumPostListResult>;
export type { ForumTagView, UpdateForumTagsInput };
export type ForwardMessageInput = Json<ServerForwardMessageInput>;
export type ForwardOrigin = Json<ServerForwardOrigin>;
export type FriendEntry = Json<ServerFriendEntry>;
export type FriendRequestEntry = Json<ServerFriendRequestEntry>;
export type FriendsSummary = Json<ServerFriendsSummary>;
export type Invite = Json<ServerInvite>;
export type LinkPreview = Json<ServerLinkPreview>;
export type Message = Json<ServerMessage>;
export type MessageAttachment = Json<ServerMessageAttachment>;
export type MessageReaction = Json<ServerMessageReaction>;
export type MessageReport = Json<ServerMessageReportView>;
export type CreateMessageReportResult = Json<ServerCreateMessageReportResult>;
export type {
  CreateMessageReportInput,
  MessageReportReason,
  MessageReportStatus,
  UpdateMessageReportInput,
};
export type NotificationItem = Json<ServerNotificationItem>;
export type NotificationPreference = Json<ServerNotificationPreference>;
export type Poll = Json<ServerPollView>;
export type PollOption = Json<ServerPollOptionView>;
export type PollUpdatedPayload = Json<ServerPollUpdatedPayload>;
export type PlatformReportDetail = Json<ServerPlatformReportDetail>;
export type PlatformReportPage = Json<ServerPlatformReportPage>;
export type PlatformServerReportView = Json<ServerPlatformServerReportView>;
export type PlatformServerSummary = Json<ServerPlatformServerSummary>;
export type {
  PlatformReportResolution,
  PlatformReportStatus,
  PlatformRole,
  ResolvePlatformReportInput,
};
export type PublicUser = Json<ServerPublicUser>;
export type Role = Json<ServerRole>;
export type SavedMessage = Json<ServerSavedMessageView>;
export type ScheduledMessage = Json<ServerScheduledMessageView>;
export type CreateScheduledMessageInput = Json<ServerCreateScheduledMessageInput>;
export type UpdateScheduledMessageInput = Json<ServerUpdateScheduledMessageInput>;
export type { ScheduledMessageUpdatedPayload };
export type ServerBanEntry = Json<ServerServerBanEntry>;
export type ServerDetail = Json<ServerServerDetail>;
export type ServerEmoji = Json<ServerServerEmoji>;
export type ServerEventView = Json<ServerServerEventView>;
export type ServerMemberDetail = Json<ServerServerMemberDetail>;
export type ServerOnboarding = Json<ServerOnboardingView>;
export type {
  AcceptServerOnboardingInput,
  AcceptServerOnboardingResult,
  SelfAssignQuestion,
  UpdateServerOnboardingInput,
};
export type ServerSummary = Json<ServerServerSummary>;
export type ChannelWebhook = Json<ServerChannelWebhook>;
export type CreateWebhookResult = Json<ServerCreateWebhookResult>;
export type { CreateWebhookInput, WebhookSecret };
export type OwnedBot = Json<ServerOwnedBot>;
export type CreateBotResult = Json<ServerCreateBotResult>;
export type BotAuthorization = Json<BotAuthorizationView>;
export type { AuthorizeBotInput, BotSecret, CreateBotInput };
export type ServerTemplateSummary = Json<ServerServerTemplateSummary>;
export type ServerSticker = Json<ServerServerSticker>;
export type SoundboardClip = Json<ServerSoundboardClip>;
export type { SoundboardPlayedPayload };
export type {
  DiscoveryJoinResult,
  DiscoveryServerCard,
  DiscoveryServerPage,
  ReportServerInput,
  ServerDiscoverySettings,
  UpdateServerDiscoveryInput,
};
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
    const error = await readErrorBody(response);
    throw new ApiError(error.message, error.code, response.status, response.statusText);
  }

  return (await response.json()) as T;
}

/** A file route that needs the bearer token, so it cannot be a plain link. */
export async function apiDownload(path: string, token: string): Promise<Blob> {
  let response = await fetch(`${API_URL}${path}`, { headers: buildHeaders({}, token) });

  if (response.status === 401 && authRefreshConfig) {
    const nextAuth = await refreshAuth();
    response = await fetch(`${API_URL}${path}`, {
      headers: buildHeaders({}, nextAuth.accessToken),
    });
  }

  if (!response.ok) {
    const error = await readErrorBody(response);
    throw new ApiError(error.message, error.code, response.status, response.statusText);
  }

  return response.blob();
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
    const error = await readErrorBody(response);
    throw new ApiError(
      error.message,
      error.code,
      response.status,
      response.statusText,
      fileDetail(file),
    );
  }

  const result = (await response.json()) as { attachment: MessageAttachment };
  return result.attachment;
}

/**
 * Posts a multipart form to an API route that stores the file itself (stickers, soundboard clips).
 * `apiRequest` always sends JSON, so the browser must set the multipart boundary here.
 */
export async function postMultipart<T>(path: string, form: FormData, token: string): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'X-Locale': requestLocale },
    body: form,
  });

  if (response.status === 401 && authRefreshConfig) {
    const nextAuth = await refreshAuth();
    return postMultipart(path, form, nextAuth.accessToken);
  }

  if (!response.ok) {
    const error = await readErrorBody(response);
    throw new ApiError(error.message, error.code, response.status, response.statusText);
  }

  return (await response.json()) as T;
}

/** Uploads a message's files; `voice` is the metadata of the single recording a voice send carries. */
export async function uploadMessageAttachments(
  files: File[],
  token: string,
  voice?: VoiceAttachmentMetadata | null,
): Promise<MessageAttachment[]> {
  const attachments = await Promise.all(files.map((file) => uploadFile(file, token)));
  return voice ? attachments.map((attachment) => ({ ...attachment, ...voice })) : attachments;
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
      const error = await readErrorBody(response);
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

/** Absolute URL of an API route, for a URL someone copies out of the app (a webhook URL). */
export function apiEndpointUrl(path: string) {
  return new URL(`${API_URL}${path}`, window.location.origin).toString();
}

export function assetUrl(url: string) {
  if (!url) return '';
  if (/^https?:\/\//i.test(url) || url.startsWith('data:')) return url;
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
