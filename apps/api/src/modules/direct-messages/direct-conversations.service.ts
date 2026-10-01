import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isE2eeEnabled } from '@/common/config/e2ee-feature-config';
import { countDirectUnread } from '@/modules/messages/unread-counts';
import { PrismaService } from '@/modules/prisma/prisma.service';
import { RealtimePublisher } from '@/modules/realtime/realtime-publisher.service';
import { directConversationInclude, requireConversationMembership } from './direct-message.format';
import { AddConversationMemberDto } from './dto/add-conversation-member.dto';
import { CreateGroupConversationDto, MAX_GROUP_MEMBERS } from './dto/create-group-conversation.dto';
import { UpdateConversationDto } from './dto/update-conversation.dto';

@Injectable()
export class DirectConversationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimePublisher,
    private readonly config: ConfigService,
  ) {}

  async createGroup(userId: string, dto: CreateGroupConversationDto) {
    if (dto.userIds.includes(userId)) {
      throw new BadRequestException('Do not include yourself in userIds');
    }
    await this.requireFriendsWithoutBlocks(userId, dto.userIds);

    const memberIds = [userId, ...dto.userIds];
    const conversation = await this.prisma.directConversation.create({
      data: {
        isGroup: true,
        name: dto.name?.trim() || null,
        ownerId: userId,
        // Every new conversation is encrypted; the column default stays false so conversations that
        // predate E2EE are not mislabelled (docs/features/e2ee-key-management.md Rules item 2).
        // Gated: while the feature flag is off a new conversation is created plaintext, so nothing
        // is marked encrypted that the rest of the feature cannot yet honour.
        isEncrypted: isE2eeEnabled(this.config),
        members: { create: memberIds.map((memberId) => ({ userId: memberId })) },
      },
      select: { id: true },
    });

    this.realtime.joinUsersToRoom(memberIds, this.realtime.conversationRoom(conversation.id));
    this.emitConversationUpdated(memberIds, conversation.id);
    return { conversation: await this.getConversationForUser(userId, conversation.id) };
  }

  /**
   * `PATCH /direct-conversations/:id`: a group rename and/or the one-way "enable encryption" switch
   * for a conversation that predates E2EE. Either field may be sent alone.
   */
  async update(userId: string, conversationId: string, dto: UpdateConversationDto) {
    if (dto.name === undefined && dto.isEncrypted === undefined) {
      throw new BadRequestException('Nothing to update');
    }
    if (dto.name !== undefined) {
      await this.rename(userId, conversationId, { name: dto.name });
    }
    if (dto.isEncrypted) {
      if (!isE2eeEnabled(this.config)) {
        throw new BadRequestException('Encryption is not available');
      }
      await this.enableEncryption(userId, conversationId);
    }
    return { conversation: await this.getConversationForUser(userId, conversationId) };
  }

  /**
   * Starts encryption for future messages only; earlier rows stay plaintext. Idempotent: an
   * already-encrypted conversation is left as it is, and the conditional update means two members
   * enabling at once change it once.
   */
  private async enableEncryption(userId: string, conversationId: string) {
    await requireConversationMembership(this.prisma, userId, conversationId);
    const { count } = await this.prisma.directConversation.updateMany({
      where: { id: conversationId, isEncrypted: false },
      data: { isEncrypted: true },
    });
    if (count) {
      this.emitConversationUpdated(await this.memberIds(conversationId), conversationId);
    }
  }

  private async rename(userId: string, conversationId: string, dto: { name: string }) {
    const conversation = await this.requireGroupMembership(
      userId,
      conversationId,
      'Only group conversations can be renamed',
    );
    await this.prisma.directConversation.update({
      where: { id: conversation.id },
      data: { name: dto.name.trim() || null },
    });

    this.emitConversationUpdated(await this.memberIds(conversationId), conversationId);
  }

  async addMember(userId: string, conversationId: string, dto: AddConversationMemberDto) {
    await this.requireGroupMembership(
      userId,
      conversationId,
      'Only group conversations can add members',
    );
    const memberIds = await this.memberIds(conversationId);
    if (memberIds.includes(dto.userId)) {
      return { conversation: await this.getConversationForUser(userId, conversationId) };
    }
    if (memberIds.length >= MAX_GROUP_MEMBERS) {
      throw new BadRequestException('Group is full');
    }
    await this.requireFriendsWithoutBlocks(userId, [dto.userId]);

    await this.prisma.directConversationMember.create({
      data: { conversationId, userId: dto.userId },
    });

    this.realtime.joinUsersToRoom([dto.userId], this.realtime.conversationRoom(conversationId));
    this.emitConversationUpdated([...memberIds, dto.userId], conversationId);
    return { conversation: await this.getConversationForUser(userId, conversationId) };
  }

  async removeMember(userId: string, conversationId: string, targetUserId: string) {
    const conversation = await this.requireGroupMembership(
      userId,
      conversationId,
      'Only group conversations can remove members',
    );
    if (targetUserId !== userId && conversation.ownerId !== userId) {
      throw new ForbiddenException('Only the group owner can remove members');
    }
    const target = await this.prisma.directConversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId: targetUserId } },
    });
    if (!target) throw new NotFoundException('Member not found');

    const remainingIds = await this.prisma.$transaction(async (tx) => {
      await tx.directConversationMember.delete({
        where: { conversationId_userId: { conversationId, userId: targetUserId } },
      });
      const remaining = await tx.directConversationMember.findMany({
        where: { conversationId },
        orderBy: { joinedAt: 'asc' },
        select: { userId: true },
      });
      if (!remaining.length) {
        await tx.directConversation.delete({ where: { id: conversationId } });
      } else {
        if (conversation.ownerId === targetUserId) {
          await tx.directConversation.update({
            where: { id: conversationId },
            data: { ownerId: remaining[0].userId },
          });
        }
        // Rotation on removal or voluntary leave (docs/features/e2ee-key-management.md Rules item 8),
        // in the same transaction so the member cannot leave without the rotation being recorded.
        await tx.directConversation.updateMany({
          where: { id: conversationId, isEncrypted: true },
          data: { encryptionKeyVersion: { increment: 1 } },
        });
      }
      return remaining.map((member) => member.userId);
    });

    this.realtime.removeUsersFromRooms(
      [targetUserId],
      [this.realtime.conversationRoom(conversationId)],
    );
    this.realtime.emitToRoom(this.realtime.userRoom(targetUserId), 'dm:conversation-removed', {
      conversationId,
    });
    this.emitConversationUpdated(remainingIds, conversationId);
    return { ok: true };
  }

  private async getConversationForUser(userId: string, conversationId: string) {
    const conversation = await this.prisma.directConversation.findUniqueOrThrow({
      where: { id: conversationId },
      include: directConversationInclude(userId),
    });
    const unreadCounts = await countDirectUnread(this.prisma, userId, [conversationId]);
    return { ...conversation, unreadCount: unreadCounts[conversationId] ?? 0 };
  }

  private async requireGroupMembership(
    userId: string,
    conversationId: string,
    notGroupMessage: string,
  ) {
    await requireConversationMembership(this.prisma, userId, conversationId);
    const conversation = await this.prisma.directConversation.findUniqueOrThrow({
      where: { id: conversationId },
      select: { id: true, isGroup: true, ownerId: true },
    });
    if (!conversation.isGroup) throw new BadRequestException(notGroupMessage);
    return conversation;
  }

  private async memberIds(conversationId: string) {
    const members = await this.prisma.directConversationMember.findMany({
      where: { conversationId },
      select: { userId: true },
    });
    return members.map((member) => member.userId);
  }

  /* Every target must be an accepted friend of the actor, with no block in either direction. */
  private async requireFriendsWithoutBlocks(userId: string, targetUserIds: string[]) {
    const [friendships, block] = await Promise.all([
      this.prisma.friendRequest.findMany({
        where: {
          status: 'ACCEPTED',
          OR: [
            { requesterId: userId, receiverId: { in: targetUserIds } },
            { receiverId: userId, requesterId: { in: targetUserIds } },
          ],
        },
        select: { requesterId: true, receiverId: true },
      }),
      this.prisma.userBlock.findFirst({
        where: {
          OR: [
            { blockerId: userId, blockedId: { in: targetUserIds } },
            { blockedId: userId, blockerId: { in: targetUserIds } },
          ],
        },
        select: { blockerId: true },
      }),
    ]);
    const friendIds = new Set(
      friendships.map((friendship) =>
        friendship.requesterId === userId ? friendship.receiverId : friendship.requesterId,
      ),
    );
    if (block || targetUserIds.some((targetUserId) => !friendIds.has(targetUserId))) {
      throw new ForbiddenException('You can only add friends to a group');
    }
  }

  private emitConversationUpdated(userIds: string[], conversationId: string) {
    this.realtime.emitToRooms(
      userIds.map((memberId) => this.realtime.userRoom(memberId)),
      'dm:conversation-updated',
      { conversationId },
    );
  }
}
