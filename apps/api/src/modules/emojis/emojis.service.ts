import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Permission, PermissionsService } from '../permissions/permissions.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimePublisher } from '../realtime/realtime-publisher.service';
import { CreateEmojiDto } from './dto/create-emoji.dto';

export const MAX_EMOJIS_PER_SERVER = 50;

const emojiSelect = {
  id: true,
  name: true,
  url: true,
  creatorId: true,
  createdAt: true,
} as const;

@Injectable()
export class EmojisService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
    private readonly realtime: RealtimePublisher,
  ) {}

  async list(userId: string, serverId: string) {
    await this.permissions.requireMembership(userId, serverId);
    const emojis = await this.prisma.serverEmoji.findMany({
      where: { serverId },
      select: emojiSelect,
      orderBy: { name: 'asc' },
    });
    return { emojis };
  }

  async create(userId: string, serverId: string, dto: CreateEmojiDto) {
    await this.permissions.requireServerPermission(userId, serverId, Permission.ManageServer);
    const count = await this.prisma.serverEmoji.count({ where: { serverId } });
    if (count >= MAX_EMOJIS_PER_SERVER) {
      throw new BadRequestException('Emoji limit reached');
    }

    let emoji;
    try {
      emoji = await this.prisma.serverEmoji.create({
        data: { serverId, name: dto.name, url: dto.url, creatorId: userId },
        select: emojiSelect,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Emoji name already exists');
      }
      throw error;
    }

    await this.writeAuditLog(serverId, userId, 'EMOJI_CREATE', emoji.id, { name: emoji.name });
    this.emitUpdated(serverId);
    return { emoji };
  }

  async remove(userId: string, serverId: string, emojiId: string) {
    await this.permissions.requireServerPermission(userId, serverId, Permission.ManageServer);
    const emoji = await this.prisma.serverEmoji.findFirst({ where: { id: emojiId, serverId } });
    if (!emoji) throw new NotFoundException('Emoji not found');

    await this.prisma.serverEmoji.delete({ where: { id: emoji.id } });
    await this.writeAuditLog(serverId, userId, 'EMOJI_DELETE', emoji.id, { name: emoji.name });
    this.emitUpdated(serverId);
    return { ok: true };
  }

  private emitUpdated(serverId: string) {
    this.realtime.emitToRoom(this.realtime.serverRoom(serverId), 'server:emojis-updated', {
      serverId,
    });
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
