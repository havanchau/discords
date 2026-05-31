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
