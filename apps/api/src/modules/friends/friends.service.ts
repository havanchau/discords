import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimePublisher } from '../realtime/realtime-publisher.service';
import { CreateFriendRequestDto } from './dto/create-friend-request.dto';
import { RespondFriendRequestDto } from './dto/respond-friend-request.dto';

@Injectable()
export class FriendsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimePublisher,
  ) {}

  async list(userId: string) {
    const requests = await this.prisma.friendRequest.findMany({
      where: {
        OR: [{ requesterId: userId }, { receiverId: userId }],
      },
      include: {
        requester: { select: this.userSelect },
        receiver: { select: this.userSelect },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return {
      friends: requests
        .filter((request) => request.status === 'ACCEPTED')
        .map((request) => ({
          id: request.id,
          user: request.requesterId === userId ? request.receiver : request.requester,
          status: request.status,
        })),
      pendingIncoming: requests.filter(
        (request) => request.status === 'PENDING' && request.receiverId === userId,
      ),
      pendingOutgoing: requests.filter(
        (request) => request.status === 'PENDING' && request.requesterId === userId,
      ),
      blocked: requests.filter((request) => request.status === 'BLOCKED'),
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
      if (existing.status === 'BLOCKED') {
        throw new ForbiddenException('Friend request is blocked');
      }
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
    if (dto.status !== 'BLOCKED' && !isReceiver) {
      throw new ForbiddenException('Only the receiver can accept or reject this request');
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

    const existing = await this.prisma.directConversation.findFirst({
      where: {
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
    return { conversation };
  }

  private get userSelect() {
    return {
      id: true,
      email: true,
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
