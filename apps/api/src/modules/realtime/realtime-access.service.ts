import { Injectable, UnauthorizedException } from '@nestjs/common';
import { Permission, PermissionsService } from '../permissions/permissions.service';
import { PrismaService } from '../prisma/prisma.service';
import { DmCallsService, parseDmCallKey } from './dm-calls.service';

/**
 * The authorization queries the socket layer needs. They live here rather than in a gateway so the
 * rule is stated once and a gateway stays a transport: read the event, authorize, delegate, emit.
 */
@Injectable()
export class RealtimeAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
    private readonly dmCalls: DmCallsService,
  ) {}

  /** Returns the channel once the user is allowed to view it. */
  async requireViewableChannel(userId: string, channelId: string) {
    const channel = await this.prisma.channel.findUniqueOrThrow({ where: { id: channelId } });
    const canView = await this.permissions.hasChannelPermission(
      userId,
      channel.id,
      Permission.ViewChannel,
    );
    if (!canView) {
      throw new UnauthorizedException('Not a channel member');
    }
    return channel;
  }

  /** Server membership only — used where the channel-level check already happened on join. */
  async requireChannelMember(userId: string, channelId: string) {
    const channel = await this.prisma.channel.findUniqueOrThrow({ where: { id: channelId } });
    const member = await this.prisma.serverMember.findUnique({
      where: { userId_serverId: { userId, serverId: channel.serverId } },
    });
    if (!member) {
      throw new UnauthorizedException('Not a channel member');
    }
    return channel;
  }

  async requireConversationMember(userId: string, conversationId: string) {
    const membership = await this.prisma.directConversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });
    if (!membership) {
      throw new UnauthorizedException('Not a conversation member');
    }
    return membership;
  }

  async listConversationIds(userId: string) {
    const memberships = await this.prisma.directConversationMember.findMany({
      where: { userId },
      select: { conversationId: true },
    });
    return memberships.map((membership) => membership.conversationId);
  }

  async listServerIds(userId: string) {
    const memberships = await this.prisma.serverMember.findMany({
      where: { userId },
      select: { serverId: true },
    });
    return memberships.map((membership) => membership.serverId);
  }

  /** Authorizes a call id (channel id or `dm:<conversationId>`) and returns the joiner's names. */
  async authorizeCallJoin(userId: string, callId: string) {
    const dmConversationId = parseDmCallKey(callId);
    if (dmConversationId) {
      await this.dmCalls.authorizeCall(userId, dmConversationId);
    } else {
      await this.requireChannelMember(userId, callId);
    }
    return this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { username: true, displayName: true },
    });
  }

  async getTypingIdentity(userId: string) {
    const profile = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { displayName: true, username: true },
    });
    return profile?.displayName ?? profile?.username ?? 'Someone';
  }
}
