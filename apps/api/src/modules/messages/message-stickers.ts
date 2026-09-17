import { NotFoundException } from '@nestjs/common';
import { STICKER_ATTACHMENT_KIND } from '@discord-clone/shared';
import type { PrismaService } from '@/modules/prisma/prisma.service';
import type { StoredAttachment } from './message-attachments';

/** The attachment row a sticker becomes. Built only on the server, never from request attachments. */
export interface StickerAttachmentData {
  fileName: string;
  mimeType: string;
  byteSize: number;
  url: string;
  kind: typeof STICKER_ATTACHMENT_KIND;
  stickerId: string | null;
}

/**
 * Resolves a send request's `stickerId` against the destination's server. A sticker of another server
 * is reported as not found, so it can neither be used nor probed from outside that server. The socket
 * send path skips the DTO pipe, so the id's type is checked here too.
 */
export async function resolveStickerAttachment(
  prisma: PrismaService,
  stickerId: unknown,
  serverId: string,
): Promise<StickerAttachmentData | null> {
  if (stickerId === undefined || stickerId === null) return null;
  if (typeof stickerId !== 'string' || stickerId.length > 64) {
    throw new NotFoundException('Sticker not found');
  }
  const sticker = await prisma.serverSticker.findFirst({
    where: { id: stickerId, serverId },
    select: { id: true, name: true, url: true, mimeType: true, byteSize: true },
  });
  if (!sticker) throw new NotFoundException('Sticker not found');
  return {
    fileName: sticker.name,
    mimeType: sticker.mimeType,
    byteSize: sticker.byteSize,
    url: sticker.url,
    kind: STICKER_ATTACHMENT_KIND,
    stickerId: sticker.id,
  };
}

export function isStickerAttachment(attachment: Pick<StoredAttachment, 'kind'>) {
  return attachment.kind === STICKER_ATTACHMENT_KIND;
}

/**
 * A forwarded sticker is a snapshot of the source row: it keeps the source sticker reference, so it
 * shows while that sticker exists and becomes the placeholder once it is deleted. It does not make the
 * sticker available in the destination's picker or to `stickerId` sends there.
 */
export function carriedStickerAttachment(attachment: StoredAttachment): StickerAttachmentData {
  return {
    fileName: attachment.fileName,
    mimeType: attachment.mimeType,
    byteSize: attachment.byteSize,
    url: attachment.url,
    kind: STICKER_ATTACHMENT_KIND,
    stickerId: attachment.stickerId,
  };
}
