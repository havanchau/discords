import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  MAX_STICKERS_PER_SERVER,
  RealtimeEvents,
  STICKER_MAX_BYTES,
  type ServerSticker,
} from '@discord-clone/shared';
import { Permission, PermissionsService } from '@/modules/permissions/permissions.service';
import { PrismaService } from '@/modules/prisma/prisma.service';
import { RealtimePublisher } from '@/modules/realtime/realtime-publisher.service';
import { SNIFFED_EXTENSIONS, sniffStickerImageType } from '@/modules/uploads/file-signature';
import { UploadsService } from '@/modules/uploads/uploads.service';
import { CreateStickerDto } from './dto/create-sticker.dto';

const stickerSelect = {
  id: true,
  name: true,
  url: true,
  mimeType: true,
  creatorId: true,
  createdAt: true,
} as const;

/** Server stickers: the same MANAGE_SERVER-gated, audited CRUD as custom emoji. */
@Injectable()
export class StickersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
    private readonly realtime: RealtimePublisher,
    private readonly uploads: UploadsService,
  ) {}

  async list(userId: string, serverId: string): Promise<{ stickers: ServerSticker[] }> {
    await this.permissions.requireMembership(userId, serverId);
    const stickers = await this.prisma.serverSticker.findMany({
      where: { serverId },
      select: stickerSelect,
      orderBy: { name: 'asc' },
    });
    return { stickers };
  }

  async create(
    userId: string,
    serverId: string,
    dto: CreateStickerDto,
    file: Express.Multer.File | undefined,
  ) {
    await this.permissions.requireServerPermission(userId, serverId, Permission.ManageServer);
    if (!file) throw new BadRequestException('File is required');
    // Size and type come from the received bytes; the client's MIME type and file name are ignored.
    if (file.buffer.length > STICKER_MAX_BYTES) {
      throw new BadRequestException('Sticker file is too large');
    }
    const mimeType = sniffStickerImageType(file.buffer);
    if (!mimeType) throw new BadRequestException('Sticker must be a PNG or WEBP image');

    const [count, existing] = await Promise.all([
      this.prisma.serverSticker.count({ where: { serverId } }),
      this.prisma.serverSticker.findUnique({
        where: { serverId_name: { serverId, name: dto.name } },
        select: { id: true },
      }),
    ]);
    if (count >= MAX_STICKERS_PER_SERVER) throw new BadRequestException('Sticker limit reached');
    // Checked before storing so a taken name does not leave an orphaned file behind.
    if (existing) throw new ConflictException('Sticker name already exists');

    const stored = await this.uploads.uploadBuffer({
      buffer: file.buffer,
      size: file.buffer.length,
      mimetype: mimeType,
      originalname: `${dto.name}${SNIFFED_EXTENSIONS[mimeType]}`,
    });

    let sticker;
    try {
      sticker = await this.prisma.$transaction(async (tx) => {
        const created = await tx.serverSticker.create({
          data: {
            serverId,
            name: dto.name,
            url: stored.url,
            mimeType,
            byteSize: stored.byteSize,
            creatorId: userId,
          },
          select: stickerSelect,
        });
        await tx.auditLog.create({
          data: auditEntry(serverId, userId, 'STICKER_CREATE', created.id, created.name),
        });
        return created;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Sticker name already exists');
      }
      throw error;
    }

    this.emitUpdated(serverId);
    return { sticker };
  }

  /** Sent messages keep their attachment row; its reference is nulled and renders a placeholder. */
  async remove(userId: string, serverId: string, stickerId: string) {
    await this.permissions.requireServerPermission(userId, serverId, Permission.ManageServer);
    const sticker = await this.prisma.serverSticker.findFirst({
      where: { id: stickerId, serverId },
      select: { id: true, name: true },
    });
    if (!sticker) throw new NotFoundException('Sticker not found');

    await this.prisma.$transaction([
      this.prisma.serverSticker.delete({ where: { id: sticker.id } }),
      this.prisma.auditLog.create({
        data: auditEntry(serverId, userId, 'STICKER_DELETE', sticker.id, sticker.name),
      }),
    ]);
    this.emitUpdated(serverId);
    return { ok: true };
  }

  private emitUpdated(serverId: string) {
    this.realtime.emitToRoom(
      this.realtime.serverRoom(serverId),
      RealtimeEvents.ServerStickersUpdated,
      { serverId },
    );
  }

}

function auditEntry(
  serverId: string,
  actorId: string,
  action: 'STICKER_CREATE' | 'STICKER_DELETE',
  targetId: string,
  name: string,
) {
  return { serverId, actorId, action, targetId, metadata: { name } };
}
