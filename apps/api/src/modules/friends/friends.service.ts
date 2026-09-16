import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@/modules/prisma/prisma.service';
import type { FriendsSummary } from '@discord-clone/shared';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import { RealtimePublisher } from '@/modules/realtime/realtime-publisher.service';
import { CreateFriendRequestDto } from './dto/create-friend-request.dto';
import { RespondFriendRequestDto } from './dto/respond-friend-request.dto';
import { findBlockBetween } from './user-blocks';

@Injectable()
export class FriendsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimePublisher,
  ) {}

  async list(userId: string): Promise<FriendsSummary> {
    const [requests, blocks] = await Promise.all([
      this.prisma.friendRequest.findMany({
        where: {
          OR: [{ requesterId: userId }, { receiverId: userId }],
        },
        include: {
          requester: { select: this.userSelect },
          receiver: { select: this.userSelect },
        },
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.userBlock.findMany({
        where: { blockerId: userId },
        include: { blocked: { select: this.userSelect } },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      friends: requests
        .filter((request) => request.status === 'ACCEPTED')
        .map((request) => ({
          id: request.id,
          user: request.requesterId === userId ? request.receiver : request.requester,
          // The filter above already restricted this list; the enum type does not narrow with it.
          status: 'ACCEPTED' as const,
        })),
      pendingIncoming: requests.filter(
        (request) => request.status === 'PENDING' && request.receiverId === userId,
      ),
      pendingOutgoing: requests.filter(
        (request) => request.status === 'PENDING' && request.requesterId === userId,
      ),
      blocked: blocks.map((block) => ({ user: block.blocked, createdAt: block.createdAt })),
    };
  }

  async request(userId: string, dto: CreateFriendRequestDto) {
    const query = dto.usernameOrEmail.trim();
    const [target, requester] = await Promise.all([
      this.prisma.user.findFirst({
        where: {
          OR: [{ username: query }, { email: query.toLowerCase() }],
        },
        select: this.userSelect,
      }),
      this.prisma.user.findUnique({ where: { id: userId }, select: this.userSelect }),
    ]);

    if (!target) throw new NotFoundException('User not found');
    if (target.id === userId) throw new BadRequestException('Cannot add yourself');
    if (await findBlockBetween(this.prisma, userId, target.id)) {
      throw new ForbiddenException('You cannot send a friend request to this user');
    }

    const existing = await this.prisma.friendRequest.findFirst({
      where: {
        OR: [
          { requesterId: userId, receiverId: target.id },
          { requesterId: target.id, receiverId: userId },
        ],
      },
      include: {
        requester: { select: this.userSelect },
        receiver: { select: this.userSelect },
      },
    });

    if (existing) {
      return { request: existing };
    }

    const request = await this.prisma.friendRequest.create({
      data: { requesterId: userId, receiverId: target.id },
      include: {
        requester: { select: this.userSelect },
        receiver: { select: this.userSelect },
      },
    });

    this.realtime.emitToRoom(this.realtime.userRoom(target.id), 'friend:request', {
      request,
    });
    await this.notifications.create({
      userId: target.id,
      actorId: userId,
      type: 'FRIEND_REQUEST',
      title: 'New friend request',
      body: `${requester?.displayName ?? 'Someone'} sent you a friend request.`,
    });

    return { request };
  }

  async respond(userId: string, requestId: string, dto: RespondFriendRequestDto) {
    const request = await this.prisma.friendRequest.findUnique({ where: { id: requestId } });
    if (!request) throw new NotFoundException('Friend request not found');

    const isReceiver = request.receiverId === userId;
    const isRequester = request.requesterId === userId;
    if (!isReceiver && !isRequester) throw new ForbiddenException('Cannot update this request');

    // Kept for API compatibility: blocking through a request blocks its other party.
    if (dto.status === 'BLOCKED') {
      const otherUserId = isReceiver ? request.requesterId : request.receiverId;
      return this.block(userId, otherUserId);
    }

    if (!isReceiver) {
      throw new ForbiddenException('Only the receiver can accept or reject this request');
    }
    if (
      dto.status === 'ACCEPTED' &&
      (await findBlockBetween(this.prisma, request.requesterId, request.receiverId))
    ) {
      throw new ForbiddenException('You cannot accept this friend request');
    }

    const updated = await this.prisma.friendRequest.update({
      where: { id: requestId },
      data: { status: dto.status },
      include: {
        requester: { select: this.userSelect },
        receiver: { select: this.userSelect },
      },
    });

    this.realtime.emitToRooms(
      [this.realtime.userRoom(updated.requesterId), this.realtime.userRoom(updated.receiverId)],
      'friend:updated',
      { request: updated },
    );

    const recipientId = userId === updated.requesterId ? updated.receiverId : updated.requesterId;
    const actor = userId === updated.requesterId ? updated.requester : updated.receiver;
    await this.notifications.create({
      userId: recipientId,
      actorId: userId,
      type: 'FRIEND_UPDATED',
      title: 'Friend request updated',
      body: `${actor.displayName} marked your friend request as ${updated.status.toLowerCase()}.`,
    });

    return { request: updated };
  }

  async remove(userId: string, requestId: string) {
    const request = await this.prisma.friendRequest.findUnique({
      where: { id: requestId },
      include: {
        requester: { select: this.userSelect },
        receiver: { select: this.userSelect },
      },
    });
    if (!request) throw new NotFoundException('Friend request not found');
    if (request.requesterId !== userId && request.receiverId !== userId) {
      throw new ForbiddenException('Cannot remove this friend relationship');
    }

    await this.prisma.friendRequest.delete({ where: { id: requestId } });

    this.realtime.emitToRooms(
      [this.realtime.userRoom(request.requesterId), this.realtime.userRoom(request.receiverId)],
      'friend:updated',
      { request: { ...request, status: 'REJECTED' } },
    );

    return { ok: true };
  }

  async block(userId: string, targetUserId: string) {
    if (targetUserId === userId) throw new BadRequestException('Cannot block yourself');
    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: this.userSelect,
    });
    if (!target) throw new NotFoundException('User not found');

    const [, block] = await this.prisma.$transaction([
      this.prisma.friendRequest.deleteMany({
        where: {
          OR: [
            { requesterId: userId, receiverId: targetUserId },
            { requesterId: targetUserId, receiverId: userId },
          ],
        },
      }),
      this.prisma.userBlock.upsert({
        where: { blockerId_blockedId: { blockerId: userId, blockedId: targetUserId } },
        create: { blockerId: userId, blockedId: targetUserId },
        update: {},
      }),
    ]);

    // No block details in the payload: the blocked user only learns their friend list changed.
    this.realtime.emitToRooms(
      [this.realtime.userRoom(userId), this.realtime.userRoom(targetUserId)],
      'friend:updated',
      {},
    );

    return { block: { user: target, createdAt: block.createdAt } };
  }

  async unblock(userId: string, targetUserId: string) {
    await this.prisma.userBlock.deleteMany({
      where: { blockerId: userId, blockedId: targetUserId },
    });
    this.realtime.emitToRoom(this.realtime.userRoom(userId), 'friend:updated', {});
    return { ok: true };
  }

  async startDm(userId: string, friendUserId: string) {
    const friendship = await this.prisma.friendRequest.findFirst({
      where: {
        status: 'ACCEPTED',
        OR: [
          { requesterId: userId, receiverId: friendUserId },
          { requesterId: friendUserId, receiverId: userId },
        ],
      },
    });

    if (!friendship) throw new ForbiddenException('You can only DM accepted friends');
    if (await findBlockBetween(this.prisma, userId, friendUserId)) {
      throw new ForbiddenException('You cannot message this user');
    }

    const existing = await this.prisma.directConversation.findFirst({
      where: {
        isGroup: false,
        AND: [{ members: { some: { userId } } }, { members: { some: { userId: friendUserId } } }],
      },
      include: this.conversationInclude,
    });
    if (existing) return { conversation: existing };

    const conversation = await this.prisma.directConversation.create({
      data: {
        members: {
          create: [{ userId }, { userId: friendUserId }],
        },
      },
      include: this.conversationInclude,
    });
    // Already-connected sockets only join conversation rooms on connect, so move them explicitly.
    this.realtime.joinUsersToRoom(
      [userId, friendUserId],
      this.realtime.conversationRoom(conversation.id),
    );
    return { conversation };
  }

  private get userSelect() {
    return {
      id: true,
      username: true,
      displayName: true,
      avatarUrl: true,
      bio: true,
      status: true,
    } as const;
  }

  private get conversationInclude() {
    return {
      members: { include: { user: { select: this.userSelect } } },
      messages: { orderBy: { createdAt: 'desc' as const }, take: 1 },
      readStates: true,
    };
  }
}
