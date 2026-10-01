import { ConflictException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { PermissionsService } from '@/modules/permissions/permissions.service';
import { PrismaService } from '@/modules/prisma/prisma.service';
import type { DevicePendingWrapsView, DeviceKeyView } from '@discord-clone/shared';
import { RegisterDeviceKeyDto } from './dto/register-device-key.dto';
import { assertP256SpkiPublicKey, toDeviceKeyView } from './device-key.format';

/** A user's own device list; far beyond any real number of browsers, it only bounds the query. */
const MAX_LISTED_DEVICES = 200;
/**
 * Newest `(scope, keyId)` pairs first. The account-wide pending list is bounded by the account's own
 * scopes times their rotations; the cap only stops a pathological account from returning all of it.
 */
const MAX_PENDING_PAIRS = 1000;

@Injectable()
export class DeviceKeysService {
  private readonly logger = new Logger(DeviceKeysService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
  ) {}

  /**
   * Registers a device, or replaces its public key when the same `deviceId` registers again. A
   * revoked device stays revoked: "log out this device" must not be undone by the device itself.
   * Wraps made for a replaced public key are useless (they are addressed to the old key) and would
   * make `pending-wraps` believe the device is covered, so they are removed in the same transaction.
   */
  async register(userId: string, dto: RegisterDeviceKeyDto): Promise<{ deviceKey: DeviceKeyView }> {
    assertP256SpkiPublicKey(dto.publicKey);
    const label = dto.label?.trim() || null;

    const deviceKey = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.deviceKey.findUnique({
        where: { userId_deviceId: { userId, deviceId: dto.deviceId } },
      });
      if (!existing) {
        // upsert, not create: two concurrent first registrations must not turn one into a 500.
        return tx.deviceKey.upsert({
          where: { userId_deviceId: { userId, deviceId: dto.deviceId } },
          create: { userId, deviceId: dto.deviceId, publicKey: dto.publicKey, label },
          update: { label },
        });
      }
      if (existing.revokedAt) {
        throw new ConflictException('Device key has been revoked');
      }
      if (existing.publicKey !== dto.publicKey) {
        await tx.encryptedChannelKey.deleteMany({ where: { deviceKeyId: existing.id } });
      }
      return tx.deviceKey.update({
        where: { id: existing.id },
        data: { publicKey: dto.publicKey, label },
      });
    });

    this.logger.log(`Device key registered for user ${userId}, device ${deviceKey.id}`);
    return { deviceKey: toDeviceKeyView(deviceKey) };
  }

  async list(userId: string): Promise<{ devices: DeviceKeyView[] }> {
    const devices = await this.prisma.deviceKey.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      take: MAX_LISTED_DEVICES,
    });
    return { devices: devices.map(toDeviceKeyView) };
  }

  /** Idempotent: revoking an already-revoked or unknown device is the same `{ ok: true }`. */
  async revoke(userId: string, deviceId: string) {
    const { count } = await this.prisma.deviceKey.updateMany({
      where: { userId, deviceId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (count) this.logger.log(`Device key revoked for user ${userId}, device ${deviceId}`);
    return { ok: true };
  }

  /**
   * Every `(scope, keyId)` pair some other non-revoked device of this account holds a wrap for and
   * `deviceId` does not, in scopes the caller can still read. Pairs only — the sibling device that
   * holds the key is what uploads the wrap (Rules item 5), so no key material is returned.
   */
  async pendingWraps(userId: string, deviceId: string): Promise<DevicePendingWrapsView> {
    const device = await this.prisma.deviceKey.findUnique({
      where: { userId_deviceId: { userId, deviceId } },
      select: { id: true, revokedAt: true },
    });
    if (!device) throw new ForbiddenException('Device does not belong to this account');
    if (device.revokedAt) return { pending: [] };

    const [siblingWraps, ownWraps] = await Promise.all([
      this.prisma.encryptedChannelKey.findMany({
        where: { deviceKey: { userId, revokedAt: null, id: { not: device.id } } },
        select: { channelId: true, conversationId: true, keyId: true, version: true },
        distinct: ['channelId', 'conversationId', 'keyId'],
        orderBy: { createdAt: 'desc' },
        take: MAX_PENDING_PAIRS,
      }),
      this.prisma.encryptedChannelKey.findMany({
        where: { deviceKeyId: device.id },
        select: { channelId: true, conversationId: true, keyId: true },
      }),
    ]);

    const pairKey = (pair: {
      channelId: string | null;
      conversationId: string | null;
      keyId: string;
    }) => `${pair.channelId ?? ''}|${pair.conversationId ?? ''}|${pair.keyId}`;
    const held = new Set(ownWraps.map(pairKey));
    const missing = siblingWraps.filter((pair) => !held.has(pairKey(pair)));
    if (!missing.length) return { pending: [] };

    const readable = await this.readableScopes(userId, missing);
    return {
      pending: missing.filter((pair) =>
        pair.channelId
          ? readable.channelIds.has(pair.channelId)
          : readable.conversationIds.has(pair.conversationId ?? ''),
      ),
    };
  }

  /** Scopes the caller can still read — a removed member must not be told to wait for a key. */
  private async readableScopes(
    userId: string,
    pairs: Array<{ channelId: string | null; conversationId: string | null }>,
  ) {
    const channelIds = [
      ...new Set(pairs.flatMap((pair) => (pair.channelId ? [pair.channelId] : []))),
    ];
    const conversationIds = [
      ...new Set(pairs.flatMap((pair) => (pair.conversationId ? [pair.conversationId] : []))),
    ];
    const [channels, memberships] = await Promise.all([
      this.prisma.channel.findMany({
        where: { id: { in: channelIds } },
        select: { id: true, serverId: true, isPrivate: true },
      }),
      this.prisma.directConversationMember.findMany({
        where: { userId, conversationId: { in: conversationIds } },
        select: { conversationId: true },
      }),
    ]);
    const viewable = await this.permissions.filterViewableChannels(userId, channels);
    return {
      channelIds: new Set(viewable.map((channel) => channel.id)),
      conversationIds: new Set(memberships.map((membership) => membership.conversationId)),
    };
  }
}
