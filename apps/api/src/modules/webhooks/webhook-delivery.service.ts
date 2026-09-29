import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { messageInclude, formatMessage } from '@/modules/messages/message.format';
import { MessagesService } from '@/modules/messages/messages.service';
import { PrismaService } from '@/modules/prisma/prisma.service';
import { RealtimePublisher } from '@/modules/realtime/realtime-publisher.service';
import { RealtimeUnreadService } from '@/modules/realtime/realtime-unread.service';
import { ExecuteWebhookDto } from './dto/execute-webhook.dto';
import { webhookTokenMatches } from './webhook-token';

export interface AuthenticatedWebhook {
  id: string;
  name: string;
  webhookUserId: string;
  channel: {
    id: string;
    name: string;
    type: string;
    serverId: string;
    isAgeRestricted: boolean;
    isPrivate: boolean;
  };
}

/**
 * Posts a message through a webhook URL. The author is the webhook's synthetic user, which is not a
 * server member, so the member send gates do not apply: channel view/send permission, timeout,
 * onboarding and slowmode are all keyed on a member. What does apply is the channel type (TEXT only)
 * and AutoMod. Holding the token is the authorization; the per-webhook rate limit is the throttle.
 */
@Injectable()
export class WebhookDeliveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly messages: MessagesService,
    private readonly unread: RealtimeUnreadService,
    private readonly realtime: RealtimePublisher,
  ) {}

  /**
   * An unknown id, a wrong token and a webhook of a deleted server are the same 404, so a caller
   * cannot tell which part of the URL was wrong.
   */
  async authenticate(webhookId: string, token: string): Promise<AuthenticatedWebhook> {
    const webhook = await this.prisma.serverWebhook.findUnique({
      where: { id: webhookId },
      select: {
        id: true,
        name: true,
        tokenHash: true,
        sourceChannelId: true,
        webhookUserId: true,
        server: { select: { deletedAt: true } },
        channel: {
          select: {
            id: true,
            name: true,
            type: true,
            serverId: true,
            isAgeRestricted: true,
            isPrivate: true,
          },
        },
      },
    });
    // Hash the token even when the id is unknown, so response time does not reveal valid ids.
    const tokenMatches = webhookTokenMatches(token, webhook?.tokenHash ?? '');
    // A follow row's token was never issued, but it is refused outright rather than by hash alone.
    if (!webhook || !tokenMatches || webhook.sourceChannelId || webhook.server.deletedAt) {
      throw new NotFoundException('Not found');
    }
    return {
      id: webhook.id,
      name: webhook.name,
      webhookUserId: webhook.webhookUserId,
      channel: webhook.channel,
    };
  }

  async post(webhook: AuthenticatedWebhook, dto: ExecuteWebhookDto) {
    const { channel } = webhook;
    // The channel type can have changed since the webhook was created.
    if (channel.type !== 'TEXT') {
      throw new BadRequestException('Webhooks can only post in text channels');
    }
    const content = dto.content.trim();
    if (!content) throw new BadRequestException('Webhook message content cannot be empty');
    const authorNameOverride = dto.username?.trim() || null;
    const authorAvatarOverride = dto.avatarUrl ?? null;
    const authorName = authorNameOverride ?? webhook.name;

    // A webhook's synthetic author has no ServerMember row, so this always throws 403 for a webhook
    // message containing @everyone/@here/a role — fails closed, same as any other server permission
    // check on a non-member (docs/features/everyone-here-and-role-mentions.md, Rules item 4).
    await this.messages.requireMentionPermission(webhook.webhookUserId, channel.serverId, content);
    // A BLOCK rule throws a 400 here, before anything is stored.
    const autoModAlerts = await this.messages.enforceAutoMod({
      userId: webhook.webhookUserId,
      serverId: channel.serverId,
      channelId: channel.id,
      texts: [content],
      webhookAuthorName: authorName,
    });

    const stored = await this.prisma.message.create({
      data: {
        channelId: channel.id,
        serverId: channel.serverId,
        authorId: webhook.webhookUserId,
        content,
        authorNameOverride,
        authorAvatarOverride,
      },
      include: messageInclude,
    });
    const message = formatMessage(stored, webhook.webhookUserId);

    // Persist first, emit second, exactly as a REST forward does (`ForwardingService.deliver`).
    this.realtime.emitToRoom(this.realtime.channelRoom(channel.id), 'message:created', message);
    const recipients = await this.unread.listUnreadRecipients(message);
    recipients.forEach((recipient) => {
      this.realtime.emitToRoom(this.realtime.userRoom(recipient.userId), 'unread:updated', {
        channelId: channel.id,
        count: 1,
        mentions: recipient.mentions,
      });
    });
    await this.messages.notifyMentionedUsers({
      authorId: webhook.webhookUserId,
      authorUsername: authorName,
      serverId: channel.serverId,
      channelId: channel.id,
      channelName: channel.name,
      isAgeRestricted: channel.isAgeRestricted,
      isPrivate: channel.isPrivate,
      content,
    });
    await this.messages.postAutoModAlerts(autoModAlerts);

    return { messageId: message.id };
  }
}
