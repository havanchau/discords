import type { Message, MessageAttachment } from '../api';

export type MediaCollectionTab = 'media' | 'files' | 'links';

export interface MediaCollectionItem {
  id: string;
  messageId: string;
  channelId: string;
  author: Message['author'];
  createdAt: string;
  attachment?: MessageAttachment;
  url?: string;
  hostname?: string;
  category: 'image' | 'video' | 'audio' | 'file' | 'link';
}

const URL_PATTERN = /https?:\/\/[^\s<>()]+/gi;

export function categorizeAttachment(attachment: MessageAttachment): MediaCollectionItem['category'] {
  if (attachment.mimeType.startsWith('image/')) return 'image';
  if (attachment.mimeType.startsWith('video/')) return 'video';
  if (attachment.mimeType.startsWith('audio/')) return 'audio';
  return 'file';
}

export function buildMediaCollections(messages: Message[]) {
  const media: MediaCollectionItem[] = [];
  const files: MediaCollectionItem[] = [];
  const links: MediaCollectionItem[] = [];

  for (const message of messages) {
    for (const attachment of message.attachments) {
      const category = categorizeAttachment(attachment);
      const item: MediaCollectionItem = {
        id: attachment.id ?? `${message.id}:${attachment.url}`,
        messageId: message.id,
        channelId: message.channelId,
        author: message.author,
        createdAt: message.createdAt,
        attachment,
        category,
      };
      if (category === 'image' || category === 'video') {
        media.push(item);
      } else {
        files.push(item);
      }
    }

    const urls = message.content.match(URL_PATTERN) ?? [];
    for (const rawUrl of urls) {
      const cleanedUrl = rawUrl.replace(/[),.]+$/, '');
      links.push({
        id: `${message.id}:${cleanedUrl}`,
        messageId: message.id,
        channelId: message.channelId,
        author: message.author,
        createdAt: message.createdAt,
        url: cleanedUrl,
        hostname: getHostname(cleanedUrl),
        category: 'link',
      });
    }
  }

  return { media, files, links };
}

function getHostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
