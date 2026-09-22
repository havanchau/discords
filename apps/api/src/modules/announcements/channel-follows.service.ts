import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { ChannelFollow, ChannelFollowEndpoint } from '@discord-clone/shared';
import { Permission, PermissionsService } from '@/modules/permissions/permissions.service';
import { PrismaService } from '@/modules/prisma/prisma.service';
import {
  generateWebhookToken,
  hashWebhookToken,
  webhookUserIdentity,
} from '@/modules/webhooks/webhook-token';
import { announcementChannelSelect, requireVisibleChannel } from './announcement-access';
import { CreateFollowDto } from './dto/create-follow.dto';

const endpointChannelSelect = {
  id: true,
  name: true,
  server: { select: { id: true, name: true } },
} as const;

const followSelect = {
  id: true,
  createdAt: true,
  channel: { select: endpointChannelSelect },
  sourceChannel: { select: endpointChannelSelect },
} satisfies Prisma.ServerWebhookSelect;

type FollowRow = Prisma.ServerWebhookGetPayload<{ select: typeof followSelect }>;
type EndpointChannel = FollowRow['channel'];

/** Channels a follow may deliver into: the ones members already post text in. */
const FOLLOW_TARGET_TYPES: ReadonlySet<string> = new Set(['TEXT', 'ANNOUNCEMENT']);

function toEndpoint(channel: EndpointChannel): ChannelFollowEndpoint {
  return {
    channelId: channel.id,
    channelName: channel.name,
    serverId: channel.server.id,
    serverName: channel.server.name,
  };
}

/** Null only for an ordinary webhook row, which the list queries already exclude. */
function toChannelFollow(row: FollowRow): ChannelFollow | null {
  if (!row.sourceChannel) return null;
  return {
    id: row.id,
    source: toEndpoint(row.sourceChannel),
    target: toEndpoint(row.channel),
    createdAt: row.createdAt,
  };
}

function toChannelFollows(rows: FollowRow[]): ChannelFollow[] {
  return rows.flatMap((row) => toChannelFollow(row) ?? []);
}

/**
 * Follows of ANNOUNCEMENT channels (docs/features/announcement-channels.md). A follow is a
 * `ServerWebhook` row on the target channel with `sourceChannelId` set: it owns a synthetic author
 * like any webhook, but its token is never returned, so it is only ever triggered by a publish. Every
 * query here filters `sourceChannelId: { not: null }`; `WebhooksService` filters the opposite way.
 *
 * Following needs MANAGE_CHANNELS on the target (whoever controls a channel controls what posts into
 * it) and read access to the source.
 */
@Injectable()
export class ChannelFollowsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
  ) {}

  /** Following the same pair again returns the existing follow with `created: false`. */
  async follow(
    userId: string,
    sourceChannelId: string,
    dto: CreateFollowDto,
  ): Promise<{ follow: ChannelFollow; created: boolean }> {
    const source = await requireVisibleChannel(
      this.prisma,
      this.permissions,
      userId,
      sourceChannelId,
    );
    if (source.type !== 'ANNOUNCEMENT') {
      throw new BadRequestException('Only announcement channels can be followed');
    }
    if (dto.targetChannelId === source.id) {
      throw new BadRequestException('A channel cannot follow itself');
    }
    const target = await this.requireManageableTarget(userId, dto.targetChannelId);
    if (!FOLLOW_TARGET_TYPES.has(target.type)) {
      throw new BadRequestException('Announcements can only be followed into a text channel');
    }
    // Copies carry the source's content, so they may not land where unconfirmed members can read.
    if (source.isAgeRestricted && !target.isAgeRestricted) {
      throw new BadRequestException(
        'An age-restricted channel can only be followed into an age-restricted channel',
      );
    }

    const existing = await this.prisma.serverWebhook.findFirst({
      where: { sourceChannelId: source.id, channelId: target.id },
      select: followSelect,
    });
    const existingFollow = existing ? toChannelFollow(existing) : null;
    if (existingFollow) return { follow: existingFollow, created: false };

    // The follow is named after the source server, as copies are credited to it.
    const name = source.server.name;
    const avatarUrl = source.server.avatarUrl;
    const identity = await webhookUserIdentity();
    const created = await this.prisma.$transaction(async (tx) => {
      const author = await tx.user.create({
        data: { ...identity, kind: 'WEBHOOK', displayName: name, avatarUrl },
        select: { id: true },
      });
      const row = await tx.serverWebhook.create({
        data: {
          serverId: target.serverId,
          channelId: target.id,
          sourceChannelId: source.id,
          creatorId: userId,
          webhookUserId: author.id,
          name,
          avatarUrl,
          // NOT NULL column; the token is discarded here, so nothing can ever present it.
          tokenHash: hashWebhookToken(generateWebhookToken()),
        },
        select: { id: true, createdAt: true },
      });
      await tx.auditLog.create({
        data: {
          serverId: target.serverId,
          actorId: userId,
          action: 'CHANNEL_FOLLOW_CREATE',
          targetId: row.id,
          metadata: { sourceChannelId: source.id, targetChannelId: target.id },
        },
      });
      return row;
    });

    return {
      follow: {
        id: created.id,
        source: toEndpoint(source),
        target: toEndpoint(target),
        createdAt: created.createdAt,
      },
      created: true,
    };
  }

  /**
   * Followers of a source channel. The list names other servers, so it is moderator-facing: the
   * caller must hold MANAGE_MESSAGES on the source, the same bar as publishing.
   */
  async listFollowers(userId: string, sourceChannelId: string) {
    const source = await requireVisibleChannel(
      this.prisma,
      this.permissions,
      userId,
      sourceChannelId,
    );
    await this.permissions.requireChannelPermission(userId, source.id, Permission.ManageMessages);
    const rows = await this.prisma.serverWebhook.findMany({
      where: { sourceChannelId: source.id, server: { deletedAt: null } },
      select: followSelect,
      orderBy: { createdAt: 'asc' },
    });
    return { followers: toChannelFollows(rows) };
  }

  /** Channels a target channel follows, for whoever manages the target (where unfollow is done). */
  async listFollowedChannels(userId: string, targetChannelId: string) {
    const target = await this.requireManageableTarget(userId, targetChannelId);
    const rows = await this.prisma.serverWebhook.findMany({
      where: { channelId: target.id, sourceChannelId: { not: null } },
      select: followSelect,
      orderBy: { createdAt: 'asc' },
    });
    return { follows: toChannelFollows(rows) };
  }

  /** Same permission as following: MANAGE_CHANNELS on the target channel the copies go to. */
  async unfollow(userId: string, sourceChannelId: string, followId: string) {
    const row = await this.prisma.serverWebhook.findUnique({
      where: { id: followId },
      select: { id: true, serverId: true, channelId: true, sourceChannelId: true },
    });
    if (!row) throw new NotFoundException('Follow not found');
    await this.permissions.requireChannelPermission(
      userId,
      row.channelId,
      Permission.ManageChannels,
    );
    if (!row.sourceChannelId) {
      throw new BadRequestException('Webhook is not a channel follow');
    }
    if (row.sourceChannelId !== sourceChannelId) throw new NotFoundException('Follow not found');

    await this.prisma.$transaction([
      this.prisma.serverWebhook.delete({ where: { id: row.id } }),
      this.prisma.auditLog.create({
        data: {
          serverId: row.serverId,
          actorId: userId,
          action: 'CHANNEL_FOLLOW_DELETE',
          targetId: row.id,
          metadata: { sourceChannelId: row.sourceChannelId, targetChannelId: row.channelId },
        },
      }),
    ]);
    return { ok: true };
  }

  /** A channel of a live server the caller can manage; a missing one reads as not found. */
  private async requireManageableTarget(userId: string, channelId: string) {
    const channel = await this.prisma.channel.findFirst({
      where: { id: channelId, server: { deletedAt: null } },
      select: announcementChannelSelect,
    });
    if (!channel) throw new NotFoundException('Channel not found');
    await this.permissions.requireChannelPermission(userId, channel.id, Permission.ManageChannels);
    return channel;
  }
}
