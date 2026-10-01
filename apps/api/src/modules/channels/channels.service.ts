import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { isE2eeEnabled } from '@/common/config/e2ee-feature-config';
import { LivekitService } from '@/modules/livekit/livekit.service';
import { Permission, PermissionsService } from '@/modules/permissions/permissions.service';
import { PrismaService } from '@/modules/prisma/prisma.service';
import { CallRegistryService } from '@/modules/realtime/call-registry.service';
import { RealtimePublisher } from '@/modules/realtime/realtime-publisher.service';
import { RealtimeViewEvictionService } from '@/modules/realtime/realtime-view-eviction.service';
import {
  RealtimeEvents,
  type Channel,
  type ChannelPermissionOverride,
} from '@discord-clone/shared';
import { ServersService } from '@/modules/servers/servers.service';
import { UploadsService } from '@/modules/uploads/uploads.service';
import { CreateChannelDto } from './dto/create-channel.dto';
import { UpdateChannelOverridesDto } from './dto/channel-overrides.dto';
import { ReorderChannelsDto } from './dto/reorder-channels.dto';
import { UpdateChannelDto } from './dto/update-channel.dto';

@Injectable()
export class ChannelsService {
  private readonly logger = new Logger(ChannelsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly servers: ServersService,
    private readonly permissions: PermissionsService,
    private readonly realtime: RealtimePublisher,
    private readonly viewEviction: RealtimeViewEvictionService,
    private readonly calls: CallRegistryService,
    private readonly livekit: LivekitService,
    private readonly uploads: UploadsService,
    private readonly config: ConfigService,
  ) {}

  /**
   * The feature flag is enforced here, not in the client: while E2EE is off nothing may mark a new
   * scope encrypted (docs/features/e2ee-key-management.md -> Risks, "Feature flag"). Already-
   * encrypted channels are untouched, so turning the flag off never strands their ciphertext.
   */
  private requireEncryptionEnabled(isEncrypted: boolean | undefined) {
    if (isEncrypted === true && !isE2eeEnabled(this.config)) {
      throw new BadRequestException('Encryption is not available');
    }
  }

  async createChannel(userId: string, serverId: string, dto: CreateChannelDto) {
    await this.permissions.requireServerPermission(userId, serverId, Permission.ManageChannels);
    this.requireEncryptionEnabled(dto.isEncrypted);
    const name = this.servers.normalizeChannelName(dto.name);
    if (dto.categoryId) await this.requireCategoryInServer(serverId, dto.categoryId);
    const channelCount = await this.prisma.channel.count({ where: { serverId } });
    const type = dto.type || 'TEXT';

    const channel = await this.prisma.channel.create({
      data: {
        serverId,
        name,
        type,
        topic: dto.topic,
        isAgeRestricted: dto.isAgeRestricted,
        isEncrypted: dto.isEncrypted,
        postGuidelines: type === 'FORUM' ? normalizeGuidelines(dto.postGuidelines) : undefined,
        categoryId: dto.categoryId,
        position: channelCount,
      },
    });
    await this.writeAuditLog(channel.serverId, userId, 'CHANNEL_CREATE', channel.id, {
      name: channel.name,
      type: channel.type,
      isAgeRestricted: channel.isAgeRestricted,
      isEncrypted: channel.isEncrypted,
    });
    return { channel };
  }

  async listChannels(userId: string, serverId: string): Promise<{ channels: Channel[] }> {
    await this.servers.requireMembership(userId, serverId);
    const channels = await this.prisma.channel.findMany({
      where: { serverId },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    });
    const visibleChannels = [];
    for (const channel of channels) {
      if (await this.permissions.hasChannelPermission(userId, channel.id, Permission.ViewChannel)) {
        visibleChannels.push(channel);
      }
    }
    return { channels: visibleChannels };
  }

  /**
   * Replaces the server's *entire* channel order in one transaction (docs/features/channel-reorder.md).
   * The client's raw `position` values are ignored as the write source: dense positions `0..n-1` are
   * recomputed per category from the submitted array order, so a client sending gapped or duplicate
   * positions cannot corrupt storage. Two moderators reordering concurrently each run one transaction —
   * whichever commits second wins outright ("last write commits"), and both clients converge on the
   * same final state via the `channels:reordered` event below (no partial interleave within either
   * request, since a transaction is all-or-nothing).
   */
  async reorderChannels(
    userId: string,
    serverId: string,
    dto: ReorderChannelsDto,
  ): Promise<{ channels: Channel[] }> {
    await this.permissions.requireServerPermission(userId, serverId, Permission.ManageChannels);

    const existing = await this.prisma.channel.findMany({
      where: { serverId },
      select: { id: true },
    });
    const existingIds = new Set(existing.map((item) => item.id));
    const payloadIds = dto.channels.map((entry) => entry.id);
    if (new Set(payloadIds).size !== payloadIds.length) {
      throw new BadRequestException('Duplicate channel id in reorder payload');
    }
    const payloadIdSet = new Set(payloadIds);
    const isExactSet =
      payloadIdSet.size === existingIds.size &&
      [...payloadIdSet].every((id) => existingIds.has(id));
    if (!isExactSet) {
      throw new BadRequestException(
        "Reorder payload must include exactly the server's current channels",
      );
    }

    const categoryIds = new Set(
      dto.channels
        .map((entry) => entry.categoryId)
        .filter((categoryId): categoryId is string => categoryId !== null),
    );
    for (const categoryId of categoryIds) {
      await this.requireCategoryInServer(serverId, categoryId);
    }

    // Dense positions per category (including `null`/uncategorized), assigned 0, 1, 2, … in the
    // order each category's entries appear in the submitted array (Position scheme).
    const nextPositionByCategory = new Map<string | null, number>();
    const updates = dto.channels.map((entry) => {
      const position = nextPositionByCategory.get(entry.categoryId) ?? 0;
      nextPositionByCategory.set(entry.categoryId, position + 1);
      return { id: entry.id, categoryId: entry.categoryId, position };
    });

    await this.prisma.$transaction(
      updates.map((update) =>
        this.prisma.channel.update({
          where: { id: update.id },
          data: { categoryId: update.categoryId, position: update.position },
        }),
      ),
    );

    await this.writeAuditLog(serverId, userId, 'CHANNELS_REORDER', undefined, {
      count: updates.length,
    });
    this.realtime.emitToRoom(this.realtime.serverRoom(serverId), RealtimeEvents.ChannelsReordered, {
      serverId,
    });

    return this.listChannels(userId, serverId);
  }

  async getChannel(userId: string, channelId: string): Promise<{ channel: Channel }> {
    const channel = await this.prisma.channel.findUnique({ where: { id: channelId } });
    if (!channel) {
      throw new NotFoundException('Channel not found');
    }
    await this.servers.requireMembership(userId, channel.serverId);
    await this.permissions.requireChannelPermission(userId, channel.id, Permission.ViewChannel);
    return { channel };
  }

  async updateChannel(userId: string, channelId: string, dto: UpdateChannelDto) {
    const existing = await this.prisma.channel.findUnique({ where: { id: channelId } });
    if (!existing) {
      throw new NotFoundException('Channel not found');
    }
    await this.permissions.requireServerPermission(
      userId,
      existing.serverId,
      Permission.ManageChannels,
    );
    this.requireEncryptionEnabled(dto.isEncrypted);
    if (dto.categoryId) await this.requireCategoryInServer(existing.serverId, dto.categoryId);
    if (dto.postGuidelines !== undefined && existing.type !== 'FORUM') {
      throw new BadRequestException('Channel is not a forum channel');
    }
    const channel = await this.prisma.channel.update({
      where: { id: channelId },
      data: {
        name: dto.name ? this.servers.normalizeChannelName(dto.name) : undefined,
        topic: dto.topic,
        avatarUrl: dto.avatarUrl,
        isPrivate: dto.isPrivate,
        isAgeRestricted: dto.isAgeRestricted,
        isEncrypted: dto.isEncrypted,
        position: dto.position,
        slowmodeSeconds: dto.slowmodeSeconds,
        categoryId: dto.categoryId,
        postGuidelines: normalizeGuidelines(dto.postGuidelines),
      },
    });
    await this.writeAuditLog(channel.serverId, userId, 'CHANNEL_UPDATE', channel.id, {
      name: channel.name,
      isPrivate: channel.isPrivate,
      isAgeRestricted: channel.isAgeRestricted,
      isEncrypted: channel.isEncrypted,
      position: channel.position,
      slowmodeSeconds: channel.slowmodeSeconds,
      categoryId: channel.categoryId,
    });
    if (channel.isAgeRestricted && !existing.isAgeRestricted) {
      await this.evictUnconfirmedMembers(channel.serverId, channel.id);
    }
    // `isPrivate` is the only field here that can remove `VIEW_CHANNEL` (docs/features/channel-view-eviction.md).
    if (dto.isPrivate !== undefined) {
      await this.viewEviction.evictChannel(channel.id);
    }
    // Persist first, evict second, emit third, so a refetching client can no
    // longer re-join a room it should now be refused. The payload carries ids only: open tabs
    // refetch the server detail, which re-applies the channel visibility filter server-side.
    this.realtime.emitToRoom(
      this.realtime.serverRoom(channel.serverId),
      RealtimeEvents.ChannelUpdated,
      { serverId: channel.serverId, channelId: channel.id },
    );
    return { channel };
  }

  /**
   * Hard delete: every row the schema already cascades from `Channel` (messages, threads, pins,
   * overrides, read state, decisions, stage rows, follow rows, …) goes with it in one statement —
   * no application code re-implements what the FK cascades already do
   * (docs/features/channel-delete.md Current behavior).
   */
  async deleteChannel(userId: string, channelId: string) {
    const channel = await this.prisma.channel.findUnique({ where: { id: channelId } });
    if (!channel) {
      throw new NotFoundException('Channel not found');
    }
    await this.permissions.requireServerPermission(
      userId,
      channel.serverId,
      Permission.ManageChannels,
    );

    // Read before the cascade removes them: who to evict from the channel's room
    // (server-ownership.service.ts's "read before the cascade" ordering).
    const members = await this.prisma.serverMember.findMany({
      where: { serverId: channel.serverId },
      select: { userId: true },
    });

    await this.endCall(channelId);
    await this.prisma.channel.delete({ where: { id: channelId } });
    await this.writeAuditLog(channel.serverId, userId, 'CHANNEL_DELETE', channelId, {
      name: channel.name,
      type: channel.type,
    });

    // Evict, then emit: a client cannot re-join a room for a channel that no longer exists.
    this.realtime.removeUsersFromRooms(
      members.map((member) => member.userId),
      [this.realtime.channelRoom(channelId)],
    );
    this.realtime.emitToRoom(
      this.realtime.serverRoom(channel.serverId),
      RealtimeEvents.ChannelDeleted,
      {
        serverId: channel.serverId,
        channelId,
      },
    );

    if (channel.avatarUrl) {
      await this.uploads.deleteUploadIfUnreferenced(channel.avatarUrl);
    }
    return { ok: true };
  }

  /** Like `ServerOwnershipService`'s `endCalls`, for a single channel: nobody stays in a deleted call. */
  private async endCall(channelId: string) {
    await this.calls.endCalls([channelId]);
    if (this.livekit.transport !== 'livekit') return;
    try {
      await this.livekit.deleteRooms([channelId]);
    } catch (error) {
      // The channel is already gone and every join is refused; log so an operator can act.
      this.logger.error(
        `Could not close the LiveKit room of deleted channel ${channelId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  async listPermissionOverrides(
    userId: string,
    channelId: string,
  ): Promise<{ overrides: ChannelPermissionOverride[] }> {
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
      include: { permissionOverrides: true },
    });
    if (!channel) {
      throw new NotFoundException('Channel not found');
    }
    await this.permissions.requireServerPermission(
      userId,
      channel.serverId,
      Permission.ManageChannels,
    );
    return { overrides: channel.permissionOverrides };
  }

  async updatePermissionOverrides(
    userId: string,
    channelId: string,
    dto: UpdateChannelOverridesDto,
  ) {
    const channel = await this.prisma.channel.findUnique({ where: { id: channelId } });
    if (!channel) {
      throw new NotFoundException('Channel not found');
    }
    await this.permissions.requireServerPermission(
      userId,
      channel.serverId,
      Permission.ManageChannels,
    );

    const overrides = dto.overrides.filter((override) => override.roleId || override.memberId);
    await this.prisma.$transaction([
      this.prisma.channelPermissionOverride.deleteMany({ where: { channelId } }),
      ...overrides.map((override) =>
        this.prisma.channelPermissionOverride.create({
          data: {
            channelId,
            roleId: override.roleId,
            memberId: override.memberId,
            allow: override.allow,
            deny: override.deny,
          },
        }),
      ),
    ]);
    await this.writeAuditLog(channel.serverId, userId, 'CHANNEL_OVERRIDES_UPDATE', channel.id, {
      count: overrides.length,
    });
    // This endpoint's only purpose is changing overrides, so there is no cheaper condition to gate
    // eviction on (docs/features/channel-view-eviction.md).
    await this.viewEviction.evictChannel(channelId);
    return this.listPermissionOverrides(userId, channelId);
  }

  async requireReadableChannel(userId: string, channelId: string) {
    const channel = await this.prisma.channel.findUnique({ where: { id: channelId } });
    if (!channel) {
      throw new NotFoundException('Channel not found');
    }
    await this.permissions.requireChannelPermission(userId, channel.id, Permission.ViewChannel);
    await this.permissions.requireAgeConfirmed(userId, channel.id);
    return channel;
  }

  /** A readable channel that must be a FORUM channel (forum posts and tags). */
  async requireReadableForumChannel(userId: string, channelId: string) {
    const channel = await this.requireReadableChannel(userId, channelId);
    if (channel.type !== 'FORUM') {
      throw new BadRequestException('Channel is not a forum channel');
    }
    return channel;
  }

  /** A readable channel that must be a DECISION channel (decision proposals). */
  async requireReadableDecisionChannel(userId: string, channelId: string) {
    const channel = await this.requireReadableChannel(userId, channelId);
    if (channel.type !== 'DECISION') {
      throw new BadRequestException('Channel is not a decision channel');
    }
    return channel;
  }

  /**
   * Persist first, emit second: once a channel becomes age-restricted, sockets of members who never
   * confirmed stop receiving its live events, as `channel:join` would now refuse them. Bots are exempt
   * from the gate (and never sit in `userRoom`), so they are left alone.
   */
  private async evictUnconfirmedMembers(serverId: string, channelId: string) {
    const members = await this.prisma.serverMember.findMany({
      where: { serverId, kind: { not: 'BOT' }, user: { ageConfirmedAt: null } },
      select: { userId: true },
    });
    this.realtime.removeUsersFromRooms(
      members.map((member) => member.userId),
      [this.realtime.channelRoom(channelId)],
    );
  }

  private async requireCategoryInServer(serverId: string, categoryId: string) {
    const category = await this.prisma.channelCategory.findFirst({
      where: { id: categoryId, serverId },
      select: { id: true },
    });
    if (!category) throw new NotFoundException('Category not found');
  }

  private async writeAuditLog(
    serverId: string,
    actorId: string,
    action: string,
    targetId?: string,
    metadata?: Record<string, unknown>,
  ) {
    await this.prisma.auditLog.create({
      data: { serverId, actorId, action, targetId, metadata: metadata as Prisma.InputJsonValue },
    });
  }
}

/** Undefined keeps the stored value; blank text clears it. */
function normalizeGuidelines(value: string | undefined) {
  if (value === undefined) return undefined;
  return value.trim() || null;
}
