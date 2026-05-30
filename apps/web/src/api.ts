const API_URL = import.meta.env.VITE_API_URL || '/api';

export interface AuthState {
  accessToken: string;
  refreshToken: string;
  user: User;
}

export interface User {
  id: string;
  email: string;
  username: string;
  displayName: string;
  avatarUrl?: string | null;
  status?: string;
}

export interface ServerSummary {
  id: string;
  name: string;
  description?: string | null;
  channels: Channel[];
}

export interface ServerDetail extends ServerSummary {
  members: Array<{ id: string; user: User; kind: string }>;
}

export interface Channel {
  id: string;
  serverId: string;
  name: string;
  type: 'TEXT' | 'VOICE';
  topic?: string | null;
}

export interface Message {
  id: string;
  channelId: string;
  authorId: string;
  content: string;
  createdAt: string;
  editedAt?: string | null;
  deletedAt?: string | null;
  author: Pick<User, 'id' | 'username' | 'displayName' | 'avatarUrl'>;
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
  token?: string | null
): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers
    }
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(error.message || 'Request failed');
  }

  return response.json();
}
