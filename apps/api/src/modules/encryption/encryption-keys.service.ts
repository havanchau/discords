import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { ChannelsService } from '@/modules/channels/channels.service';
import { requireConversationMembership } from '@/modules/direct-messages/direct-message.format';
import { PermissionsService } from '@/modules/permissions/permissions.service';
import { PrismaService } from '@/modules/prisma/prisma.service';
import {
  currentContentKeyId,
  E2EE_MAX_WRAPS_PER_UPLOAD,
  type PendingWrapsView,
  type UploadWrappedKeysResult,
  type WrappedKeyView,
} from '@discord-clone/shared';
import { UploadWrappedKeysDto } from './dto/upload-wrapped-keys.dto';
import { WrappedKeyQueryDto } from './dto/wrapped-key-query.dto';

/**
 * Which `EncryptedChannelKey` rows belong to the scope. A row has exactly one non-null scope column
 * (dual-nullable FK), so the same object filters reads and fills the column on inserts.
 */
type ScopeFilter = { channelId: string } | { conversationId: string };

interface KeyScope {
  filter: ScopeFilter;
  isEncrypted: boolean;
  /** `Channel.encryptionKeyVersion` / `DirectConversation.encryptionKeyVersion`. */
  keyVersion: number;
  /** Users whose devices are wrap targets: current members who can read it, never bots. */
  recipientUserIds(): Promise<string[]>;
}

@Injectable()
export class EncryptionKeysService {
  private readonly logger = new Logger(EncryptionKeysService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly channels: ChannelsService,
    private readonly permissions: PermissionsService,
  ) {}

  async uploadChannelKeys(userId: string, channelId: string, dto: UploadWrappedKeysDto) {
    return this.upload(await this.channelScope(userId, channelId), dto);
  }

  async uploadConversationKeys(userId: string, conversationId: string, dto: UploadWrappedKeysDto) {
    return this.upload(await this.conversationScope(userId, conversationId), dto);
  }

  async channelPendingWraps(userId: string, channelId: string) {
    return this.pendingWraps(userId, await this.channelScope(userId, channelId));
  }

  async conversationPendingWraps(userId: string, conversationId: string) {
    return this.pendingWraps(userId, await this.conversationScope(userId, conversationId));
  }

  async getChannelKey(userId: string, channelId: string, query: WrappedKeyQueryDto) {
    return this.getWrappedKey(userId, await this.channelScope(userId, channelId), query);
  }

  async getConversationKey(userId: string, conversationId: string, query: WrappedKeyQueryDto) {
    return this.getWrappedKey(userId, await this.conversationScope(userId, conversationId), query);
  }

  /**
   * The route-level check is the data-level check: `requireReadableChannel` is the same
   * `ViewChannel` + age-gate choke point every channel-content endpoint uses, so a non-member (or a
   * member removed since) never reaches a channel's keys.
   */
  private async channelScope(userId: string, channelId: string): Promise<KeyScope> {
    const channel = await this.channels.requireReadableChannel(userId, channelId);
    return {
      filter: { channelId: channel.id },
      isEncrypted: channel.isEncrypted,
      keyVersion: channel.encryptionKeyVersion,
      recipientUserIds: async () => {
        const members = await this.prisma.serverMember.findMany({
          where: { serverId: channel.serverId, kind: { not: 'BOT' } },
          include: { roles: { include: { role: true } } },
        });
        const viewers = await this.permissions.filterMembersWhoCanView(channel, members);
        return viewers.map((member) => member.userId);
      },
    };
  }

  private async conversationScope(userId: string, conversationId: string): Promise<KeyScope> {
    await requireConversationMembership(this.prisma, userId, conversationId);
    const conversation = await this.prisma.directConversation.findUniqueOrThrow({
      where: { id: conversationId },
      select: { id: true, isEncrypted: true, encryptionKeyVersion: true },
    });
    return {
      filter: { conversationId: conversation.id },
      isEncrypted: conversation.isEncrypted,
      keyVersion: conversation.encryptionKeyVersion,
      recipientUserIds: async () => {
        const members = await this.prisma.directConversationMember.findMany({
          where: { conversationId: conversation.id, user: { kind: 'HUMAN' } },
          select: { userId: true },
        });
        return members.map((member) => member.userId);
      },
    };
  }

  /**
   * Idempotent insert keyed on `(scope, keyId, deviceKeyId)`. `skipDuplicates` is `ON CONFLICT DO
   * NOTHING`, so it holds under a concurrent identical upload and for both of the table's two
   * composite uniques (one per scope, because PostgreSQL treats NULLs as distinct). Rows are never
   * updated or deleted here: a reconnecting device still needs old-`keyId` wraps for history.
   */
  private async upload(
    scope: KeyScope,
    dto: UploadWrappedKeysDto,
  ): Promise<UploadWrappedKeysResult> {
    if (!scope.isEncrypted) throw new BadRequestException('Encryption is not enabled');
    // A key cannot be generated for a rotation the server has not recorded yet; older versions are
    // allowed because a device re-wraps a historical key for a sibling.
    if (dto.version > scope.keyVersion) throw new BadRequestException('Invalid key version');

    const wrapByDevice = new Map<string, string>();
    for (const wrap of dto.wraps) {
      if (!wrapByDevice.has(wrap.deviceKeyId)) wrapByDevice.set(wrap.deviceKeyId, wrap.wrappedKey);
    }
    const deviceKeyIds = [...wrapByDevice.keys()];

    const recipientUserIds = await scope.recipientUserIds();
    const validTargets = await this.prisma.deviceKey.count({
      where: { id: { in: deviceKeyIds }, revokedAt: null, userId: { in: recipientUserIds } },
    });
    // Unknown, revoked, someone-else's-scope and bot devices are all the same refusal: every target
    // must be a live device of a current member.
    if (validTargets !== deviceKeyIds.length) throw new BadRequestException('Invalid wrap target');

    const { count } = await this.prisma.encryptedChannelKey.createMany({
      data: deviceKeyIds.map((deviceKeyId) => ({
        ...scope.filter,
        keyId: dto.keyId,
        version: dto.version,
        deviceKeyId,
        wrappedKey: wrapByDevice.get(deviceKeyId) ?? '',
      })),
      skipDuplicates: true,
    });
    const alreadyPresent = dto.wraps.length - count;
    this.logger.log(
      `Wrapped keys uploaded for ${JSON.stringify(scope.filter)}: accepted ${count}, already present ${alreadyPresent}`,
    );
    return { accepted: count, alreadyPresent };
  }

  /**
   * "Current" is the highest version that has any wrap, and within it the lowest `keyId` — the
   * client-side convergence rule (`currentContentKeyId`), applied here so the server and every
   * client name the same key. A caller that holds that key sees every member device still missing it
   * (capped to one upload's worth); one that does not only sees its own devices, since it has
   * nothing to wrap with.
   */
  private async pendingWraps(userId: string, scope: KeyScope): Promise<PendingWrapsView> {
    const latest = await this.prisma.encryptedChannelKey.aggregate({
      where: scope.filter,
      _max: { version: true },
    });
    const version = latest._max.version;
    if (version === null) return { keyId: null, version: scope.keyVersion, missing: [] };

    const keysAtVersion = await this.prisma.encryptedChannelKey.findMany({
      where: { ...scope.filter, version },
      select: { keyId: true },
      distinct: ['keyId'],
    });
    const keyId = currentContentKeyId(keysAtVersion.map((row) => row.keyId));
    if (keyId === null) return { keyId: null, version: scope.keyVersion, missing: [] };

    const callerHoldsKey =
      (await this.prisma.encryptedChannelKey.count({
        where: { ...scope.filter, keyId, deviceKey: { userId, revokedAt: null } },
      })) > 0;
    const targetUserIds = callerHoldsKey ? await scope.recipientUserIds() : [userId];

    const devices = await this.prisma.deviceKey.findMany({
      where: {
        userId: { in: targetUserIds },
        revokedAt: null,
        wrappedKeys: { none: { ...scope.filter, keyId } },
      },
      select: { id: true, publicKey: true, userId: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: E2EE_MAX_WRAPS_PER_UPLOAD,
    });
    return {
      keyId,
      version,
      missing: devices.map((device) => ({
        deviceKeyId: device.id,
        publicKey: device.publicKey,
        userId: device.userId,
      })),
    };
  }

  private async getWrappedKey(
    userId: string,
    scope: KeyScope,
    query: WrappedKeyQueryDto,
  ): Promise<WrappedKeyView> {
    if (query.deviceId) {
      const device = await this.prisma.deviceKey.findUnique({
        where: { userId_deviceId: { userId, deviceId: query.deviceId } },
        select: { id: true },
      });
      if (!device) throw new ForbiddenException('Device does not belong to this account');
      const wrap = await this.prisma.encryptedChannelKey.findFirst({
        where: { ...scope.filter, keyId: query.keyId, deviceKeyId: device.id },
        select: { wrappedKey: true },
      });
      return { keyId: query.keyId, wrappedKey: wrap?.wrappedKey ?? null };
    }

    const wraps = await this.prisma.encryptedChannelKey.findMany({
      where: { ...scope.filter, keyId: query.keyId, deviceKey: { userId } },
      select: { wrappedKey: true },
      take: 2,
    });
    // One wrap per device: with several the caller must say which device is asking.
    if (wraps.length > 1) throw new BadRequestException('A device id is required');
    return { keyId: query.keyId, wrappedKey: wraps[0]?.wrappedKey ?? null };
  }
}
