import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PublishMessageResult } from '@discord-clone/shared';
import {
  carriedForwardSnapshot,
  forwardColumnsSelect,
  ForwardSnapshot,
} from '@/common/forward-snapshot';
import {
  readVoiceMaxBytes,
  StoredAttachment,
  storedAttachmentSelect,
  toAttachmentCreateData,
  toAttachmentInput,
} from '@/modules/messages/message-attachments';
import { formatMessage, messageInclude } from '@/modules/messages/message.format';
import { carriedStickerAttachment, isStickerAttachment } from '@/modules/messages/message-stickers';
import { MessagesService } from '@/modules/messages/messages.service';
import { Permission, PermissionsService } from '@/modules/permissions/permissions.service';
import { withoutViewerVotes } from '@/modules/polls/poll.format';
import { PrismaService } from '@/modules/prisma/prisma.service';
import { RealtimePublisher } from '@/modules/realtime/realtime-publisher.service';
import { RealtimeUnreadService } from '@/modules/realtime/realtime-unread.service';
import { requireVisibleChannel } from './announcement-access';

/** Above this many followers a publish still goes through, but operators see a warning. */
const FOLLOWER_WARN_THRESHOLD = 50;

const followerSelect = {
  id: true,
  name: true,
  avatarUrl: true,
  webhookUserId: true,
  channel: { select: { id: true, serverId: true, isAgeRestricted: true } },
} as const;

interface Follower {
  id: string;
  name: string;
  avatarUrl: string | null;
  webhookUserId: string;
  channel: { id: string; serverId: string; isAgeRestricted: boolean };
}

/** What every copy carries: the source message as it was at publish time. */
interface PublishSnapshot {
  content: string;
  attachments: StoredAttachment[];
  forward: ForwardSnapshot | null;
}

/**
 * Publishing (crossposting) one ANNOUNCEMENT channel message to every channel following it
 * (docs/features/announcement-channels.md). Each copy is delivered the way a webhook post is
 * (`WebhookDeliveryService.post`): authored by the follow's synthetic user, screened by the target
 * server's AutoMod, persisted, then broadcast. The follow existing is the authorization, so no member
 * send gate of the target applies. A copy is marked `isCrosspost` and can never be published, which
 * is what makes any follow graph loop-free.
 */
@Injectable()
export class PublishService {
  private readonly logger = new Logger(PublishService.name);
  private readonly voiceMaxBytes: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
    private readonly messages: MessagesService,
    private readonly unread: RealtimeUnreadService,
    private readonly realtime: RealtimePublisher,
    config: ConfigService,
  ) {
    this.voiceMaxBytes = readVoiceMaxBytes(config);
  }

  async publish(userId: string, messageId: string): Promise<PublishMessageResult> {
    const source = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: {
        id: true,
        channelId: true,
        serverId: true,
        content: true,
        threadId: true,
        deletedAt: true,
        publishedAt: true,
        isCrosspost: true,
        attachments: { select: storedAttachmentSelect, orderBy: { createdAt: 'asc' } },
        ...forwardColumnsSelect,
      },
    });
    if (!source) throw new NotFoundException('Message not found');
    const channel = await requireVisibleChannel(
      this.prisma,
      this.permissions,
      userId,
      source.channelId,
      'Message not found',
    );
    if (source.deletedAt) throw new NotFoundException('Message not found');
    // Checked before the channel type: a copy delivered into another announcement channel must be
    // refused for being a copy, whatever channel it landed in.
    if (source.isCrosspost) {
      throw new BadRequestException('A crossposted message cannot be published');
    }
    if (channel.type !== 'ANNOUNCEMENT') {
      throw new BadRequestException('Only announcement channel messages can be published');
    }
    await this.permissions.requireChannelPermission(userId, channel.id, Permission.ManageMessages);
    if (source.threadId) throw new BadRequestException('Thread replies cannot be published');

    // Claims the publish atomically, so two concurrent requests cannot both fan out.
    const claimed = await this.prisma.message.updateMany({
      where: { id: source.id, publishedAt: null },
      data: { publishedAt: new Date() },
    });
    if (claimed.count === 0) throw new BadRequestException('Message already published');

    const followers = await this.prisma.serverWebhook.findMany({
      where: { sourceChannelId: channel.id, server: { deletedAt: null } },
      select: followerSelect,
      orderBy: { createdAt: 'asc' },
    });
    if (followers.length > FOLLOWER_WARN_THRESHOLD) {
      this.logger.warn(
        `Channel ${channel.id} publishes message ${source.id} to ${followers.length} followers`,
      );
    }

    const snapshot: PublishSnapshot = {
      content: source.content,
      attachments: source.attachments,
      forward: carriedForwardSnapshot(source),
    };
    let followerCount = 0;
    for (const follower of followers) {
      if (await this.deliverSafely(follower, snapshot, channel.isAgeRestricted)) followerCount += 1;
    }

    await this.prisma.auditLog.create({
      data: {
        serverId: channel.serverId,
        actorId: userId,
        action: 'MESSAGE_PUBLISH',
        targetId: source.id,
        metadata: { messageId: source.id, followerCount },
      },
    });

    const published = await this.prisma.message.findUniqueOrThrow({
      where: { id: source.id },
      include: messageInclude,
    });
    // Persist first, emit second: every open view of the source channel shows the Published mark.
    this.realtime.emitToRoom(
      this.realtime.channelRoom(channel.id),
      'message:updated',
      withoutViewerVotes(formatMessage(published, userId)),
    );
    return { message: formatMessage(published, userId), followerCount };
  }

  /**
   * One follower's delivery. The source is already marked published, so a failure here must not stop
   * the remaining followers or undo the publish: it is logged (ids only, never content) and the copy
   * is not counted.
   */
  private async deliverSafely(
    follower: Follower,
    snapshot: PublishSnapshot,
    isSourceAgeRestricted: boolean,
  ) {
    // Following refuses this pairing, but the target's flag can have been cleared since.
    if (isSourceAgeRestricted && !follower.channel.isAgeRestricted) {
      this.logger.warn(`Skipped follow ${follower.id}: target is no longer age-restricted`);
      return false;
    }
    try {
      await this.deliver(follower, snapshot);
      return true;
    } catch (error) {
      if (error instanceof BadRequestException) {
        // The target server's AutoMod blocked the copy; its alerts are already posted there.
        this.logger.warn(`Follow ${follower.id} refused the copy: ${error.message}`);
      } else {
        this.logger.error(
          `Delivery to follow ${follower.id} failed`,
          error instanceof Error ? error.stack : String(error),
        );
      }
      return false;
    }
  }

  private async deliver(follower: Follower, snapshot: PublishSnapshot) {
    const { channel } = follower;
    // A BLOCK rule throws a 400 here, before anything is stored.
    const autoModAlerts = await this.messages.enforceAutoMod({
      userId: follower.webhookUserId,
      serverId: channel.serverId,
      channelId: channel.id,
      texts: [snapshot.content, snapshot.forward?.forwardOriginContent],
      webhookAuthorName: follower.name,
    });

    // New rows pointing at the same stored files, exactly as a forward copies them.
    const attachments = [
      ...toAttachmentCreateData(
        snapshot.attachments
          .filter((attachment) => !isStickerAttachment(attachment))
          .map(toAttachmentInput),
        this.voiceMaxBytes,
      ),
      ...snapshot.attachments.filter(isStickerAttachment).map(carriedStickerAttachment),
    ];
    const stored = await this.prisma.message.create({
      data: {
        channelId: channel.id,
        serverId: channel.serverId,
        authorId: follower.webhookUserId,
        content: snapshot.content,
        authorNameOverride: follower.name,
        authorAvatarOverride: follower.avatarUrl,
        isCrosspost: true,
        ...snapshot.forward,
        attachments: attachments.length ? { create: attachments } : undefined,
      },
      include: messageInclude,
    });
    const message = formatMessage(stored, follower.webhookUserId);

    // No request socket delivers this, so the broadcast is explicit, as for a webhook post. Mention
    // pushes are not sent: a name mentioned in the source server may be a different person here.
    this.realtime.emitToRoom(this.realtime.channelRoom(channel.id), 'message:created', message);
    await this.unread.emitUpdated(message);
    await this.messages.postAutoModAlerts(autoModAlerts);
  }
}
