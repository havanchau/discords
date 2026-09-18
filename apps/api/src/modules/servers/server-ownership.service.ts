import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { RealtimeEvents } from '@discord-clone/shared';
import { TwoFactorService } from '@/modules/auth/two-factor.service';
import { syncBotGatewayOnRemoval } from '@/modules/bots/bot-gateway-sync';
import { LivekitService } from '@/modules/livekit/livekit.service';
import { PermissionsService } from '@/modules/permissions/permissions.service';
import { PrismaService } from '@/modules/prisma/prisma.service';
import { CallRegistryService } from '@/modules/realtime/call-registry.service';
import { RealtimePublisher } from '@/modules/realtime/realtime-publisher.service';
import { UploadsService } from '@/modules/uploads/uploads.service';
import { DeleteServerDto, TransferServerDto } from './dto/server-ownership.dto';
import { ServersService } from './servers.service';

/** Owner-only transfer and delete (`server-ownership-lifecycle.md`). */
@Injectable()
export class ServerOwnershipService {
  private readonly logger = new Logger(ServerOwnershipService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
    private readonly twoFactor: TwoFactorService,
    private readonly realtime: RealtimePublisher,
    private readonly calls: CallRegistryService,
    private readonly livekit: LivekitService,
    private readonly uploads: UploadsService,
    private readonly servers: ServersService,
  ) {}

  async transferOwnership(userId: string, serverId: string, dto: TransferServerDto) {
    await this.requireOwner(userId, serverId, 'Only the owner can transfer this server');
    if (dto.userId === userId) throw new BadRequestException('You already own this server');
    const target = await this.prisma.serverMember.findUnique({
      where: { userId_serverId: { userId: dto.userId, serverId } },
      select: { id: true, user: { select: { kind: true, username: true } } },
    });
    if (!target) throw new NotFoundException('Member not found');
    if (target.user.kind !== 'HUMAN') {
      throw new BadRequestException('Cannot transfer ownership to a bot or webhook');
    }
    // Checked last, so a refused target does not spend a one-time code.
    await this.twoFactor.verifyReauthentication(userId, dto.password, dto.code, {
      requireSecondFactor: true,
    });

    await this.prisma.$transaction(async (tx) => {
      // Conditional on the caller still owning it, so two concurrent transfers cannot both win.
      const { count } = await tx.server.updateMany({
        where: { id: serverId, ownerId: userId },
        data: { ownerId: dto.userId },
      });
      if (count === 0) throw new ForbiddenException('Only the owner can transfer this server');
      await tx.serverMember.update({ where: { id: target.id }, data: { kind: 'OWNER' } });
      await tx.serverMember.update({
        where: { userId_serverId: { userId, serverId } },
        data: { kind: 'MEMBER' },
      });
      await tx.auditLog.create({
        data: {
          serverId,
          actorId: userId,
          action: 'SERVER_OWNERSHIP_TRANSFER',
          targetId: target.id,
          metadata: { fromUserId: userId, toUserId: dto.userId, toUsername: target.user.username },
        },
      });
    });

    this.realtime.emitToRoom(
      this.realtime.serverRoom(serverId),
      RealtimeEvents.ServerOwnershipTransferred,
      { serverId, fromUserId: userId, toUserId: dto.userId },
    );
    return this.servers.getServerForUser(userId, serverId);
  }

  async deleteServer(userId: string, serverId: string, dto: DeleteServerDto) {
    await this.requireOwner(userId, serverId, 'Only the owner can delete this server');
    await this.twoFactor.verifyReauthentication(userId, dto.password, dto.code, {
      requireSecondFactor: true,
    });

    // Read before the cascade removes them: who to tell, which rooms and calls to close, and which
    // stored files the server alone owns. Emoji URLs are client-chosen, like avatars, so their files
    // are left alone, as deleting one emoji already does.
    const [server, members, channels, stickers, clips] = await Promise.all([
      this.prisma.server.findUniqueOrThrow({
        where: { id: serverId },
        select: { avatarUrl: true },
      }),
      this.prisma.serverMember.findMany({
        where: { serverId },
        select: { userId: true, avatarUrl: true, user: { select: { kind: true } } },
      }),
      this.prisma.channel.findMany({ where: { serverId }, select: { id: true } }),
      this.prisma.serverSticker.findMany({
        where: { serverId },
        select: { url: true, mimeType: true },
      }),
      this.prisma.soundboardClip.findMany({
        where: { serverId },
        select: { url: true, mimeType: true },
      }),
    ]);

    // Conditional on ownership, so a transfer racing this delete cannot be deleted from under it.
    const { count } = await this.prisma.server.deleteMany({
      where: { id: serverId, ownerId: userId },
    });
    if (count === 0) throw new NotFoundException('Server not found');
    // The server's own audit log went with the cascade; this line is the only trace left (open
    // question 40).
    this.logger.warn(`Server ${serverId} deleted by its owner ${userId}`);

    const memberUserIds = members.map((member) => member.userId);
    const channelIds = channels.map((channel) => channel.id);
    const serverRooms = [
      this.realtime.serverRoom(serverId),
      ...channelIds.map((channelId) => this.realtime.channelRoom(channelId)),
    ];
    this.realtime.emitToRooms(
      [
        this.realtime.serverRoom(serverId),
        ...memberUserIds.map((memberUserId) => this.realtime.userRoom(memberUserId)),
      ],
      RealtimeEvents.ServerDeleted,
      { serverId },
    );
    this.realtime.removeUsersFromRooms(memberUserIds, serverRooms);
    await Promise.all(
      members
        .filter((member) => member.user.kind === 'BOT')
        .map((member) =>
          syncBotGatewayOnRemoval(this.prisma, this.realtime, member.userId, serverId),
        ),
    );
    await this.endCalls(channelIds);
    await Promise.all(
      [...stickers, ...clips].map((file) =>
        this.uploads.removeStoredFileQuietly(file.url, file.mimeType),
      ),
    );
    // Server and per-server avatars may share a URL with another row, so only an orphan goes.
    const avatarUrls = new Set(
      [server.avatarUrl, ...members.map((member) => member.avatarUrl)].filter(
        (url): url is string => Boolean(url),
      ),
    );
    for (const url of avatarUrls) {
      await this.uploads.deleteUploadIfUnreferenced(url);
    }
    return { ok: true };
  }

  private async requireOwner(userId: string, serverId: string, message: string) {
    const member = await this.permissions.requireMembership(userId, serverId);
    if (member.kind !== 'OWNER') throw new ForbiddenException(message);
  }

  /** Like kick/ban's `endCalls`, for every participant at once: nobody stays in a deleted call. */
  private async endCalls(channelIds: string[]) {
    await this.calls.endCalls(channelIds);
    if (this.livekit.transport !== 'livekit') return;
    try {
      await this.livekit.deleteRooms(channelIds);
    } catch (error) {
      // The server is already gone and every join is refused; log so an operator can act.
      this.logger.error(
        `Could not close the LiveKit rooms of deleted server: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
