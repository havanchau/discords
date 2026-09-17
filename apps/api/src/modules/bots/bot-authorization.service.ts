import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { BotAuthorizationServer, BotAuthorizationView } from '@discord-clone/shared';
import { Permission, PermissionsService } from '@/modules/permissions/permissions.service';
import { PrismaService } from '@/modules/prisma/prisma.service';
import { RealtimePublisher } from '@/modules/realtime/realtime-publisher.service';
import {
  canGrantRoles,
  granterMemberInclude,
  loadRoleGrantContext,
} from '@/modules/permissions/role-grant';
import { AuthorizeBotDto } from './dto/authorize-bot.dto';

const EVERYONE_ROLE_NAME = '@everyone';

/**
 * Adding a bot to a server and taking it out again. Both need `MANAGE_ROLES` in that server, since
 * choosing what a bot may do is the same trust as editing a role, and the installer can never grant
 * the bot a permission they do not hold themselves (`canGrantRoles`).
 */
@Injectable()
export class BotAuthorizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
    private readonly realtime: RealtimePublisher,
  ) {}

  /** The bot and every server where the caller may add it, with the roles they may grant there. */
  async getAuthorizationView(userId: string, botId: string): Promise<BotAuthorizationView> {
    const bot = await this.requireInstallableBot(botId);
    const members = await this.prisma.serverMember.findMany({
      where: { userId, server: { deletedAt: null } },
      include: { ...granterMemberInclude, server: { select: { id: true, name: true } } },
      orderBy: { joinedAt: 'asc' },
    });
    const installable = members.filter(
      (member) =>
        member.kind === 'OWNER' ||
        member.roles.some(({ role }) => role.permissions.includes(Permission.ManageRoles)),
    );

    const servers: BotAuthorizationServer[] = [];
    for (const member of installable) {
      const [context, roles, botMember, ban] = await Promise.all([
        loadRoleGrantContext(this.prisma, member),
        this.prisma.role.findMany({
          where: { serverId: member.serverId },
          orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
        }),
        this.prisma.serverMember.findUnique({
          where: { userId_serverId: { userId: bot.botUserId, serverId: member.serverId } },
          select: { id: true },
        }),
        this.prisma.serverBan.findUnique({
          where: { serverId_userId: { serverId: member.serverId, userId: bot.botUserId } },
          select: { id: true },
        }),
      ]);
      const everyone = roles.find((role) => role.name === EVERYONE_ROLE_NAME);
      servers.push({
        id: member.server.id,
        name: member.server.name,
        alreadyMember: Boolean(botMember),
        banned: Boolean(ban),
        grantableRoles: roles.filter((role) =>
          canGrantRoles(context, everyone ? [role, everyone] : [role]),
        ),
      });
    }

    return { bot: { id: bot.id, name: bot.name, avatarUrl: bot.avatarUrl }, servers };
  }

  async authorize(userId: string, botId: string, dto: AuthorizeBotDto) {
    const bot = await this.requireInstallableBot(botId);
    const server = await this.prisma.server.findFirst({
      where: { id: dto.serverId, deletedAt: null },
      select: { id: true },
    });
    if (!server) throw new NotFoundException('Server not found');
    const installer = await this.requireInstaller(userId, server.id);

    const [ban, existing, role, everyone] = await Promise.all([
      this.prisma.serverBan.findUnique({
        where: { serverId_userId: { serverId: server.id, userId: bot.botUserId } },
        select: { id: true },
      }),
      this.prisma.serverMember.findUnique({
        where: { userId_serverId: { userId: bot.botUserId, serverId: server.id } },
        select: { id: true },
      }),
      this.prisma.role.findFirst({ where: { id: dto.roleId, serverId: server.id } }),
      this.prisma.role.findUnique({
        where: { serverId_name: { serverId: server.id, name: EVERYONE_ROLE_NAME } },
      }),
    ]);
    if (ban) throw new ForbiddenException('This bot is banned from this server');
    if (existing) throw new ConflictException('Bot already in this server');
    if (!role) throw new NotFoundException('Role not found');

    const grantedRoles = everyone && everyone.id !== role.id ? [role, everyone] : [role];
    const context = await loadRoleGrantContext(this.prisma, installer);
    if (!canGrantRoles(context, grantedRoles)) {
      throw new ForbiddenException('Cannot grant a bot permissions you do not have');
    }

    try {
      const member = await this.prisma.$transaction(async (tx) => {
        const created = await tx.serverMember.create({
          data: { userId: bot.botUserId, serverId: server.id, kind: 'BOT' },
        });
        await tx.memberRole.createMany({
          data: grantedRoles.map((granted) => ({ memberId: created.id, roleId: granted.id })),
        });
        await tx.auditLog.create({
          data: {
            serverId: server.id,
            actorId: userId,
            action: 'BOT_AUTHORIZE',
            targetId: bot.id,
            metadata: { botId: bot.id, botName: bot.name, roleId: role.id },
          },
        });
        return created;
      });
      return { member };
    } catch (error) {
      // Two admins confirming at once: the unique (userId, serverId) key lets only one through.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Bot already in this server');
      }
      throw error;
    }
  }

  /** Same as kicking the bot, audited as a bot removal. */
  async removeFromServer(userId: string, serverId: string, botId: string) {
    await this.requireInstaller(userId, serverId);
    const bot = await this.prisma.bot.findUnique({
      where: { id: botId },
      select: { id: true, name: true, botUserId: true },
    });
    const member = bot
      ? await this.prisma.serverMember.findUnique({
          where: { userId_serverId: { userId: bot.botUserId, serverId } },
          select: { id: true },
        })
      : null;
    if (!bot || !member) throw new NotFoundException('Bot not found');

    await this.prisma.$transaction([
      this.prisma.serverMember.delete({ where: { id: member.id } }),
      this.prisma.auditLog.create({
        data: {
          serverId,
          actorId: userId,
          action: 'BOT_REMOVE',
          targetId: bot.id,
          metadata: { botId: bot.id, botName: bot.name },
        },
      }),
    ]);
    this.announceRemoval(bot.botUserId, [serverId]);
    return { ok: true };
  }

  /** Persist first, emit second: open member lists drop the bot. A bot holds no sockets to evict. */
  announceRemoval(botUserId: string, serverIds: string[]) {
    for (const serverId of serverIds) {
      this.realtime.emitToRoom(this.realtime.serverRoom(serverId), 'server:member-removed', {
        serverId,
        userId: botUserId,
        reason: 'KICK',
      });
    }
  }

  /** A bot whose owner is leaving (deletion requested) cannot be added anywhere. */
  private async requireInstallableBot(botId: string) {
    const bot = await this.prisma.bot.findFirst({
      where: { id: botId, owner: { deletionRequestedAt: null } },
      select: { id: true, name: true, avatarUrl: true, botUserId: true },
    });
    if (!bot) throw new NotFoundException('Bot not found');
    return bot;
  }

  private async requireInstaller(userId: string, serverId: string) {
    return this.permissions.requireServerPermission(userId, serverId, Permission.ManageRoles);
  }
}
