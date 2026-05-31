import { Message, MessageAttachment } from './api';

export const AUTH_KEY = 'discord-clone-auth';
export const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3000';
export const QUICK_REACTIONS = ['👍', '🔥', '😂', '❤️', '🎉'];
export const PERMISSION_OPTIONS = [
  { value: 'VIEW_CHANNEL', label: 'View channels' },
  { value: 'SEND_MESSAGES', label: 'Send messages' },
  { value: 'MANAGE_MESSAGES', label: 'Manage messages' },
  { value: 'MANAGE_CHANNELS', label: 'Manage channels' },
  { value: 'MANAGE_SERVER', label: 'Manage server' },
  { value: 'MANAGE_ROLES', label: 'Manage roles' },
  { value: 'KICK_MEMBERS', label: 'Kick members' },
  { value: 'BAN_MEMBERS', label: 'Ban members' },
  { value: 'CREATE_INVITE', label: 'Create invites' },
  { value: 'CONNECT_VOICE', label: 'Connect voice' },
  { value: 'SPEAK_VOICE', label: 'Speak voice' },
  { value: 'UPLOAD_FILES', label: 'Upload files' },
];

export type CallMode = 'voice' | 'video' | 'screen';

export interface CallParticipant {
  socketId: string;
  userId: string;
  username: string;
  displayName: string;
  mode: CallMode;
  isMuted: boolean;
  isCameraOff: boolean;
  isSharingScreen: boolean;
}

export interface ActiveCallSummary {
  channelId: string;
  mode: CallMode;
  participants: CallParticipant[];
  screenSharer?: CallParticipant;
}

export interface RemoteMedia extends CallParticipant {
  stream?: MediaStream;
}

export interface CallState {
  channelId: string;
  mode: CallMode;
  isMuted: boolean;
  isCameraOff: boolean;
  isSharingScreen: boolean;
}

export function initials(value: string) {
  return value
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

export function formatTime(value: string) {
  return new Intl.DateTimeFormat('en', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export function accentClass(indexOrValue: number | string) {
  const value =
    typeof indexOrValue === 'number'
      ? indexOrValue
      : [...indexOrValue].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return `accent-${Math.abs(value) % 6}`;
}

export function formatDate(value: string) {
  const date = new Date(value);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();

  if (isToday) return `Today at ${formatTime(value)}`;
  if (isYesterday) return `Yesterday at ${formatTime(value)}`;
  return (
    new Intl.DateTimeFormat('en', {
      month: '2-digit',
      day: '2-digit',
      year: 'numeric',
    }).format(date) +
    ' ' +
    formatTime(value)
  );
}

export function formatDayDivider(value: string) {
  const date = new Date(value);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === now.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return new Intl.DateTimeFormat('en', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

export function isSameMessageDay(left?: string, right?: string) {
  if (!left || !right) return false;
  return new Date(left).toDateString() === new Date(right).toDateString();
}

export function extractLinks(value: string) {
  return value.match(/https?:\/\/[^\s]+/gi) ?? [];
}

export function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export function attachmentKind(attachment: MessageAttachment) {
  if (attachment.mimeType.startsWith('image/')) return 'image';
  if (attachment.mimeType.startsWith('audio/')) return 'audio';
  if (attachment.mimeType.startsWith('video/')) return 'video';
  if (attachment.mimeType.includes('zip')) return 'archive';
  return 'file';
}

export function previewText(message: Message) {
  if (message.deletedAt) return 'Message deleted';
  if (message.content) return message.content.slice(0, 120);
  if (message.attachments?.length) return `Attachment: ${message.attachments[0].fileName}`;
  return 'Message';
}
