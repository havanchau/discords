import { Message, MessageAttachment } from './api';

export const AUTH_KEY = 'discord-clone-auth';
export const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3000';
export const QUICK_REACTIONS = ['👍', '🔥', '😂', '❤️', '🎉'];
// Labels live in the locale catalogs under `permission.<VALUE>`; this list is the order and the set.
export const PERMISSION_VALUES = [
  'VIEW_CHANNEL',
  'SEND_MESSAGES',
  'MANAGE_MESSAGES',
  'MANAGE_CHANNELS',
  'MANAGE_SERVER',
  'MANAGE_ROLES',
  'KICK_MEMBERS',
  'BAN_MEMBERS',
  'CREATE_INVITE',
  'CONNECT_VOICE',
  'SPEAK_VOICE',
  'UPLOAD_FILES',
] as const;

export type PermissionValue = (typeof PERMISSION_VALUES)[number];

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
  /** Channel id, or `dm:<conversationId>` for a direct message call. */
  channelId: string;
  label: string;
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

export function accentClass(indexOrValue: number | string) {
  const value =
    typeof indexOrValue === 'number'
      ? indexOrValue
      : [...indexOrValue].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return `accent-${Math.abs(value) % 6}`;
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
