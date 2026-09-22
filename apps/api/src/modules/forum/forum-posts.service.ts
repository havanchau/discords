import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ForumPostListResult, ForumPostView, Message } from '@discord-clone/shared';
import { ChannelsService } from '@/modules/channels/channels.service';
import { readVoiceMaxBytes, toAttachmentCreateData } from '@/modules/messages/message-attachments';
import { notificationAuthorName } from '@/modules/messages/message.format';
import { MessagesService } from '@/modules/messages/messages.service';
import { withoutViewerVotes } from '@/modules/polls/poll.format';
import { PrismaService } from '@/modules/prisma/prisma.service';
import { RealtimePublisher } from '@/modules/realtime/realtime-publisher.service';
import { RealtimeUnreadService } from '@/modules/realtime/realtime-unread.service';
import { CreateForumPostDto } from './dto/create-forum-post.dto';
import { ListForumPostsQueryDto } from './dto/list-forum-posts-query.dto';

const FORUM_POST_PAGE_SIZE = 25;

/**
 * Forum posts: a titled `Thread` rooted at a new top-level message. Creation passes the same gates
 * and AutoMod screening as any channel send; replies go through `MessagesService.createThreadMessage`.
 */
@Injectable()
export class ForumPostsService {
  private readonly voiceMaxBytes: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly channels: ChannelsService,
    private readonly messages: MessagesService,
    private readonly realtime: RealtimePublisher,
    private readonly unread: RealtimeUnreadService,
    config: ConfigService,
  ) {
    this.voiceMaxBytes = readVoiceMaxBytes(config);
  }

  /** Most recent activity first: a reply bumps `Thread.updatedAt`. */
  async listPosts(
    userId: string,
    channelId: string,
    query: ListForumPostsQueryDto,
  ): Promise<ForumPostListResult> {
    await this.channels.requireReadableForumChannel(userId, channelId);
    const threads = await this.prisma.thread.findMany({
      where: {
        channelId,
        title: { not: null },
        rootMessage: { deletedAt: null },
        ...(query.tagId ? { tags: { some: { tagId: query.tagId } } } : {}),
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: FORUM_POST_PAGE_SIZE + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      select: { id: true, rootMessageId: true },
    });
    const page = threads.slice(0, FORUM_POST_PAGE_SIZE);
    const roots = await this.messages.listThreadRoots(
      userId,
      page.map((thread) => thread.rootMessageId),
    );
    return {
      posts: toPostViews(roots),
      nextCursor:
        threads.length > FORUM_POST_PAGE_SIZE ? (page[page.length - 1]?.id ?? null) : null,
    };
  }

  async createPost(
    userId: string,
    channelId: string,
    dto: CreateForumPostDto,
  ): Promise<ForumPostView> {
    // View, send permission, timeout, rules screening and slowmode, exactly as a channel send.
    const channel = await this.messages.requireCanPostInForum(userId, channelId);
    const title = dto.title.trim();
    const content = dto.content.trim();
    const attachments = dto.attachments ?? [];
    const tagIds = [...new Set(dto.tagIds ?? [])];
    if (!title) {
      throw new BadRequestException('Forum post title is required');
    }
    if (!content && attachments.length === 0) {
      throw new ForbiddenException('Message content cannot be empty without attachments');
    }
    if (tagIds.length) {
      const known = await this.prisma.forumTag.count({ where: { channelId, id: { in: tagIds } } });
      if (known !== tagIds.length) throw new BadRequestException('Unknown forum tag');
    }
    // The title is screened with the body, so a rule cannot be dodged by writing it in the title.
    const autoModAlerts = await this.messages.enforceAutoMod({
      userId,
      serverId: channel.serverId,
      channelId,
      texts: [title, content],
    });

    const rootMessageId = await this.prisma.$transaction(async (tx) => {
      const root = await tx.message.create({
        data: {
          channelId,
          serverId: channel.serverId,
          authorId: userId,
          content,
          attachments: attachments.length
            ? { create: toAttachmentCreateData(attachments, this.voiceMaxBytes) }
            : undefined,
        },
        select: { id: true },
      });
      await tx.thread.create({
        data: {
          channelId,
          serverId: channel.serverId,
          rootMessageId: root.id,
          createdById: userId,
          title,
          participants: { create: { userId } },
          tags: tagIds.length ? { create: tagIds.map((tagId) => ({ tagId })) } : undefined,
        },
      });
      await tx.auditLog.create({
        data: {
          serverId: channel.serverId,
          actorId: userId,
          action: 'FORUM_POST_CREATE',
          targetId: root.id,
          metadata: { channelId, tagCount: tagIds.length },
        },
      });
      return root.id;
    });

    const [post] = toPostViews(await this.messages.listThreadRoots(userId, [rootMessageId]));
    if (!post) throw new NotFoundException('Thread root message not found');

    // Persist first, emit second.
    this.realtime.emitToRoom(this.realtime.channelRoom(channelId), 'forum:post-created', {
      thread: post.thread,
      rootMessage: withoutViewerVotes(post.rootMessage),
    });
    const recipients = await this.unread.listUnreadRecipients(post.rootMessage);
    recipients.forEach((recipient) => {
      this.realtime.emitToRoom(this.realtime.userRoom(recipient.userId), 'unread:updated', {
        channelId,
        count: 1,
        mentions: recipient.mentions,
      });
    });
    await this.messages.notifyMentionedUsers({
      authorId: userId,
      authorUsername: notificationAuthorName(post.rootMessage.author),
      serverId: channel.serverId,
      channelId,
      channelName: channel.name,
      isAgeRestricted: channel.isAgeRestricted,
      content,
    });
    await this.messages.postAutoModAlerts(autoModAlerts);
    return post;
  }
}

function toPostViews(roots: Message[]): ForumPostView[] {
  return roots.flatMap((rootMessage) =>
    rootMessage.thread ? [{ thread: rootMessage.thread, rootMessage }] : [],
  );
}
