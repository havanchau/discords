import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  WEBHOOK_MAX_PER_CHANNEL,
  type ChannelWebhook,
  type CreateWebhookResult,
  type WebhookSecret,
} from '@discord-clone/shared';
import { Permission, PermissionsService } from '@/modules/permissions/permissions.service';
import { PrismaService } from '@/modules/prisma/prisma.service';
import { CreateWebhookDto } from './dto/create-webhook.dto';
import {
  generateWebhookToken,
  hashWebhookToken,
  webhookPath,
  webhookUserIdentity,
} from './webhook-token';

const webhookSelect = {
  id: true,
  channelId: true,
  name: true,
  avatarUrl: true,
  createdAt: true,
} satisfies Prisma.ServerWebhookSelect;

/**
 * Webhook management for one channel. Gated by MANAGE_CHANNELS on that channel: whoever controls a
 * channel already controls what is posted into it. The plaintext token leaves this service only in
 * the create and regenerate responses.
 */
@Injectable()
export class WebhooksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
  ) {}

  async list(
    userId: string,
    serverId: string,
    channelId: string,
  ): Promise<{ webhooks: ChannelWebhook[] }> {
    await this.requireManageableChannel(userId, serverId, channelId);
    // A follow row (`sourceChannelId` set) is managed by the announcements module, not listed here.
    const webhooks = await this.prisma.serverWebhook.findMany({
      where: { channelId, sourceChannelId: null },
      select: webhookSelect,
      orderBy: { createdAt: 'asc' },
    });
    return { webhooks };
  }

  async create(
    userId: string,
    serverId: string,
    channelId: string,
    dto: CreateWebhookDto,
  ): Promise<CreateWebhookResult> {
    const channel = await this.requireManageableChannel(userId, serverId, channelId);
    if (channel.type !== 'TEXT') {
      throw new BadRequestException('Webhooks can only post in text channels');
    }
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('Webhook name cannot be empty');
    const count = await this.prisma.serverWebhook.count({
      where: { channelId, sourceChannelId: null },
    });
    if (count >= WEBHOOK_MAX_PER_CHANNEL) {
      throw new BadRequestException('Webhook limit reached');
    }

    const token = generateWebhookToken();
    const identity = await webhookUserIdentity();
    const avatarUrl = dto.avatarUrl ?? null;
    const webhook = await this.prisma.$transaction(async (tx) => {
      const author = await tx.user.create({
        data: { ...identity, kind: 'WEBHOOK', displayName: name, avatarUrl },
        select: { id: true },
      });
      const created = await tx.serverWebhook.create({
        data: {
          serverId,
          channelId,
          creatorId: userId,
          webhookUserId: author.id,
          name,
          avatarUrl,
          tokenHash: hashWebhookToken(token),
        },
        select: webhookSelect,
      });
      await tx.auditLog.create({
        data: {
          serverId,
          actorId: userId,
          action: 'WEBHOOK_CREATE',
          targetId: created.id,
          metadata: { name, channelId },
        },
      });
      return created;
    });

    return { webhook, path: webhookPath(webhook.id, token) };
  }

  /** The old token stops matching as soon as the new hash is stored; there is no overlap window. */
  async regenerate(
    userId: string,
    serverId: string,
    channelId: string,
    webhookId: string,
  ): Promise<WebhookSecret> {
    await this.requireManageableChannel(userId, serverId, channelId);
    const webhook = await this.requireWebhook(channelId, webhookId);
    const token = generateWebhookToken();
    await this.prisma.$transaction([
      this.prisma.serverWebhook.update({
        where: { id: webhook.id },
        data: { tokenHash: hashWebhookToken(token) },
      }),
      this.prisma.auditLog.create({
        data: {
          serverId,
          actorId: userId,
          action: 'WEBHOOK_REGENERATE',
          targetId: webhook.id,
          metadata: { webhookId: webhook.id },
        },
      }),
    ]);
    return { path: webhookPath(webhook.id, token) };
  }

  /**
   * Revokes the URL at once. The synthetic author row stays, so messages already posted keep the
   * name and avatar they were posted with.
   */
  async remove(userId: string, serverId: string, channelId: string, webhookId: string) {
    await this.requireManageableChannel(userId, serverId, channelId);
    const webhook = await this.requireWebhook(channelId, webhookId);
    await this.prisma.$transaction([
      this.prisma.serverWebhook.delete({ where: { id: webhook.id } }),
      this.prisma.auditLog.create({
        data: {
          serverId,
          actorId: userId,
          action: 'WEBHOOK_DELETE',
          targetId: webhook.id,
          metadata: { webhookId: webhook.id, name: webhook.name },
        },
      }),
    ]);
    return { ok: true };
  }

  /** A channel of this server that the caller can manage; any mismatch reads as not found. */
  private async requireManageableChannel(userId: string, serverId: string, channelId: string) {
    const channel = await this.prisma.channel.findFirst({
      where: { id: channelId, serverId, server: { deletedAt: null } },
      select: { id: true, type: true },
    });
    if (!channel) throw new NotFoundException('Channel not found');
    await this.permissions.requireChannelPermission(userId, channel.id, Permission.ManageChannels);
    return channel;
  }

  /** Ordinary webhooks only: a follow row must never be given a working token or deleted here. */
  private async requireWebhook(channelId: string, webhookId: string) {
    const webhook = await this.prisma.serverWebhook.findFirst({
      where: { id: webhookId, channelId, sourceChannelId: null },
      select: { id: true, name: true },
    });
    if (!webhook) throw new NotFoundException('Webhook not found');
    return webhook;
  }
}
