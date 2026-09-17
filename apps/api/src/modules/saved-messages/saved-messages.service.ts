import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, SavedMessage } from '@prisma/client';
import type { SavedMessageView } from '@discord-clone/shared';
import { Permission, PermissionsService } from '@/modules/permissions/permissions.service';
import { PrismaService } from '@/modules/prisma/prisma.service';
import { CreateSavedMessageDto } from './dto/create-saved-message.dto';
import { validateRemindAt } from './saved-message-reminder';

const LIST_LIMIT = 100;

/** The snapshot fields of a message, read from either source table. */
interface MessageSnapshot {
  id: string;
  channelId: string | null;
  conversationId: string | null;
  serverId: string | null;
  content: string;
  authorId: string;
  authorName: string;
}

@Injectable()
export class SavedMessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
  ) {}

  async save(userId: string, dto: CreateSavedMessageDto) {
    const remindAt = dto.remindAt ? new Date(dto.remindAt) : null;
    if (remindAt) {
      const error = validateRemindAt(remindAt, new Date());
      if (error) throw new BadRequestException(error);
    }

    const where = {
      ownerId_sourceType_originalMessageId: {
        ownerId: userId,
        sourceType: dto.sourceType,
        originalMessageId: dto.messageId,
      },
    };
    const existing = await this.prisma.savedMessage.findUnique({ where });
    if (existing) {
      // Saving again still requires read access, so the endpoint never confirms a lost message.
      await this.readSnapshot(userId, dto);
      return { created: false, savedMessage: await this.reschedule(userId, existing, remindAt) };
    }

    const snapshot = await this.readSnapshot(userId, dto);
    try {
      const created = await this.prisma.savedMessage.create({
        data: {
          ownerId: userId,
          sourceType: dto.sourceType,
          channelId: snapshot.channelId,
          conversationId: snapshot.conversationId,
          serverId: snapshot.serverId,
          originalMessageId: snapshot.id,
          snapshotContent: snapshot.content,
          snapshotAuthorId: snapshot.authorId,
          snapshotAuthorName: snapshot.authorName,
          remindAt,
        },
      });
      return { created: true, savedMessage: await this.toView(userId, created) };
    } catch (error) {
      // A concurrent save of the same message won the unique index; answer as the idempotent path.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const raced = await this.prisma.savedMessage.findUnique({ where });
        if (raced) {
          return { created: false, savedMessage: await this.reschedule(userId, raced, remindAt) };
        }
      }
      throw error;
    }
  }

  async list(userId: string): Promise<{ savedMessages: SavedMessageView[] }> {
    const rows = await this.prisma.savedMessage.findMany({
      where: { ownerId: userId },
      orderBy: { createdAt: 'desc' },
      take: LIST_LIMIT,
    });
    return { savedMessages: await this.toViews(userId, rows) };
  }

  async remove(userId: string, savedMessageId: string) {
    // Scoped to the owner, so another user's id reads as not found rather than forbidden.
    const { count } = await this.prisma.savedMessage.deleteMany({
      where: { id: savedMessageId, ownerId: userId },
    });
    if (count === 0) throw new NotFoundException('Saved message not found');
    return { ok: true };
  }

  /** Replaces a pending reminder; a delivered one cannot be rescheduled. */
  private async reschedule(userId: string, saved: SavedMessage, remindAt: Date | null) {
    if (!remindAt) return this.toView(userId, saved);
    if (saved.remindedAt) throw new ConflictException('Reminder was already sent');

    // Conditional on remindedAt so a sweep claiming the row meanwhile wins instead of being undone.
    const { count } = await this.prisma.savedMessage.updateMany({
      where: { id: saved.id, remindedAt: null },
      data: { remindAt },
    });
    if (count === 0) throw new ConflictException('Reminder was already sent');
    return this.toView(userId, { ...saved, remindAt });
  }

  /** Reads the live message the caller may save; any failure is "Message not found". */
  private async readSnapshot(userId: string, dto: CreateSavedMessageDto): Promise<MessageSnapshot> {
    if (dto.sourceType === 'CHANNEL') {
      const message = await this.prisma.message.findUnique({
        where: { id: dto.messageId },
        select: {
          id: true,
          channelId: true,
          serverId: true,
          content: true,
          authorId: true,
          deletedAt: true,
          authorNameOverride: true,
          author: { select: { displayName: true } },
        },
      });
      // Same check as ChannelsService.requireReadableChannel, answered as 404 instead of 403.
      const canRead =
        message &&
        !message.deletedAt &&
        (await this.permissions.hasChannelPermission(
          userId,
          message.channelId,
          Permission.ViewChannel,
        ));
      if (!message || !canRead) throw new NotFoundException('Message not found');
      return {
        id: message.id,
        channelId: message.channelId,
        conversationId: null,
        serverId: message.serverId,
        content: message.content,
        authorId: message.authorId,
        // A webhook post is saved under the name it was posted with.
        authorName: message.authorNameOverride ?? message.author.displayName,
      };
    }

    const message = await this.prisma.directMessage.findFirst({
      where: {
        id: dto.messageId,
        deletedAt: null,
        conversation: { members: { some: { userId } } },
      },
      select: {
        id: true,
        conversationId: true,
        content: true,
        authorId: true,
        author: { select: { displayName: true } },
      },
    });
    if (!message) throw new NotFoundException('Message not found');
    return {
      id: message.id,
      channelId: null,
      conversationId: message.conversationId,
      serverId: null,
      content: message.content,
      authorId: message.authorId,
      authorName: message.author.displayName,
    };
  }

  private async toView(userId: string, row: SavedMessage) {
    const [view] = await this.toViews(userId, [row]);
    return view;
  }

  /** Access is recomputed per read: membership and permissions change after the save. */
  private async toViews(userId: string, rows: SavedMessage[]): Promise<SavedMessageView[]> {
    if (!rows.length) return [];

    const channelIds = unique(rows.map((row) => row.channelId));
    const conversationIds = unique(rows.map((row) => row.conversationId));
    const channelMessageIds = rows
      .filter((row) => row.sourceType === 'CHANNEL')
      .map((row) => row.originalMessageId);
    const directMessageIds = rows
      .filter((row) => row.sourceType === 'DIRECT')
      .map((row) => row.originalMessageId);

    const [readableChannelIds, memberships, liveMessages, liveDirectMessages, channels, authors] =
      await Promise.all([
        this.readableChannelIds(userId, channelIds),
        this.prisma.directConversationMember.findMany({
          where: { userId, conversationId: { in: conversationIds } },
          select: { conversationId: true },
        }),
        this.prisma.message.findMany({
          where: { id: { in: channelMessageIds }, deletedAt: null },
          select: { id: true },
        }),
        this.prisma.directMessage.findMany({
          where: { id: { in: directMessageIds }, deletedAt: null },
          select: { id: true },
        }),
        this.prisma.channel.findMany({
          where: { id: { in: channelIds } },
          select: { id: true, name: true, server: { select: { name: true } } },
        }),
        this.prisma.user.findMany({
          where: { id: { in: unique(rows.map((row) => row.snapshotAuthorId)) } },
          select: { id: true, avatarUrl: true },
        }),
      ]);

    const memberOf = new Set(memberships.map((item) => item.conversationId));
    const liveIds = new Set([...liveMessages, ...liveDirectMessages].map((item) => item.id));
    const channelsById = new Map(channels.map((channel) => [channel.id, channel]));
    const avatarsById = new Map(authors.map((author) => [author.id, author.avatarUrl]));

    return rows.map((row) => {
      const canReadSource =
        row.sourceType === 'CHANNEL'
          ? Boolean(row.channelId && readableChannelIds.has(row.channelId))
          : Boolean(row.conversationId && memberOf.has(row.conversationId));
      const isAccessible = canReadSource && liveIds.has(row.originalMessageId);
      const channel = isAccessible && row.channelId ? channelsById.get(row.channelId) : undefined;

      return {
        id: row.id,
        sourceType: row.sourceType,
        snapshotContent: row.snapshotContent,
        snapshotAuthor: {
          id: row.snapshotAuthorId,
          displayName: row.snapshotAuthorName,
          avatarUrl: avatarsById.get(row.snapshotAuthorId) ?? null,
        },
        channelId: row.channelId,
        conversationId: row.conversationId,
        serverId: row.serverId,
        originalMessageId: row.originalMessageId,
        channelName: channel?.name ?? null,
        serverName: channel?.server.name ?? null,
        remindAt: row.remindAt,
        remindedAt: row.remindedAt,
        isAccessible,
        createdAt: row.createdAt,
      };
    });
  }

  private async readableChannelIds(userId: string, channelIds: string[]) {
    const results = await Promise.all(
      channelIds.map(async (channelId) => ({
        channelId,
        canRead: await this.permissions.hasChannelPermission(
          userId,
          channelId,
          Permission.ViewChannel,
        ),
      })),
    );
    return new Set(results.filter((item) => item.canRead).map((item) => item.channelId));
  }
}

function unique(values: Array<string | null>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}
