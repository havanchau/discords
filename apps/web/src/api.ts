const API_URL = import.meta.env.VITE_API_URL || '/api';
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

export function configureAuthRefresh(config: AuthRefreshConfig) {
  authRefreshConfig = config;
}

export interface User {
  id: string;
  email: string;
  username: string;
  displayName: string;
  avatarUrl?: string | null;
  bio?: string | null;
  status?: string;
  emailVerifiedAt?: string | null;
}

export interface ServerSummary {
  id: string;
  name: string;
  description?: string | null;
  channels: Channel[];
}

export interface ServerDetail extends ServerSummary {
  members: Array<{ id: string; user: User; kind: string; roles?: Array<{ role: Role }> }>;
  roles: Role[];
}

export interface Role {
  id: string;
  name: string;
  color?: string | null;
  permissions: string[];
}

export interface Channel {
  id: string;
  serverId: string;
  name: string;
  type: 'TEXT' | 'VOICE';
  topic?: string | null;
  avatarUrl?: string | null;
  position?: number;
  isPrivate?: boolean;
  unreadCount?: number;
}

export interface ChannelPermissionOverride {
  id: string;
  channelId: string;
  roleId?: string | null;
  memberId?: string | null;
  allow: string[];
  deny: string[];
}

export interface NotificationPreference {
  id: string;
  serverId?: string | null;
  channelId?: string | null;
  muted: boolean;
  mentionOnly: boolean;
  desktopEnabled: boolean;
}

export interface AuditLogEntry {
  id: string;
  serverId: string;
  actorId: string;
  action: string;
  targetId?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
  actor?: Pick<User, 'id' | 'username' | 'displayName' | 'avatarUrl'>;
}

export interface Message {
  id: string;
  channelId: string;
  authorId: string;
  content: string;
  isEncrypted?: boolean;
  encryptedContent?: string;
  decryptionFailed?: boolean;
  createdAt: string;
  editedAt?: string | null;
  deletedAt?: string | null;
  author: Pick<User, 'id' | 'username' | 'displayName' | 'avatarUrl'>;
  attachments: MessageAttachment[];
  reactions: MessageReaction[];
  replyToMessage?: Message | null;
}

export interface MessageAttachment {
  id?: string;
  fileName: string;
  mimeType: string;
  byteSize: number;
  url: string;
}

export interface MessageReaction {
  emoji: string;
  count: number;
  me: boolean;
}

export interface FriendEntry {
  id: string;
  user: User;
  status: 'ACCEPTED';
}

export interface FriendRequestEntry {
  id: string;
  requesterId: string;
  receiverId: string;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'BLOCKED';
  requester?: User;
  receiver?: User;
}

export interface FriendsSummary {
  friends: FriendEntry[];
  pendingIncoming: FriendRequestEntry[];
  pendingOutgoing: FriendRequestEntry[];
  blocked: FriendRequestEntry[];
}

export interface DirectConversation {
  id: string;
  members: Array<{ user: User }>;
  messages: DirectMessage[];
  updatedAt?: string;
}

export interface DirectMessage {
  id: string;
  conversationId: string;
  authorId: string;
  content: string;
  editedAt?: string | null;
  deletedAt?: string | null;
  createdAt: string;
}

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
    throw new Error(error.message || 'Request failed');
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
    throw new Error(
      `${error.message || 'Upload failed'} (${file.name}, ${file.type || 'unknown'})`,
    );
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
      throw new Error(
        `${error.message || 'Chunk upload failed'} (${file.name}, ${file.type || 'unknown'})`,
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
