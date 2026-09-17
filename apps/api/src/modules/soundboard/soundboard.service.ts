import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  MAX_SOUNDBOARD_CLIPS_PER_SERVER,
  RealtimeEvents,
  SOUNDBOARD_CLIP_MAX_BYTES,
  type SoundboardClip,
} from '@discord-clone/shared';
import { Permission, PermissionsService } from '@/modules/permissions/permissions.service';
import { PrismaService } from '@/modules/prisma/prisma.service';
import { RealtimePublisher } from '@/modules/realtime/realtime-publisher.service';
import { SNIFFED_EXTENSIONS, sniffSoundboardAudioType } from '@/modules/uploads/file-signature';
import { UploadsService } from '@/modules/uploads/uploads.service';
import { CreateSoundboardClipDto } from './dto/create-soundboard-clip.dto';

const clipSelect = {
  id: true,
  name: true,
  url: true,
  mimeType: true,
  durationMs: true,
  creatorId: true,
  createdAt: true,
} as const;

/** Soundboard clips: the same MANAGE_SERVER-gated, audited CRUD as custom emoji and stickers. */
@Injectable()
export class SoundboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
    private readonly realtime: RealtimePublisher,
    private readonly uploads: UploadsService,
  ) {}

  async list(userId: string, serverId: string): Promise<{ clips: SoundboardClip[] }> {
    await this.permissions.requireMembership(userId, serverId);
    const clips = await this.prisma.soundboardClip.findMany({
      where: { serverId },
      select: clipSelect,
      orderBy: { name: 'asc' },
    });
    return { clips };
  }

  async create(
    userId: string,
    serverId: string,
    dto: CreateSoundboardClipDto,
    file: Express.Multer.File | undefined,
  ) {
    await this.permissions.requireServerPermission(userId, serverId, Permission.ManageServer);
    if (!file) throw new BadRequestException('File is required');
    // Size and type come from the received bytes; the client's MIME type and file name are ignored.
    if (file.buffer.length > SOUNDBOARD_CLIP_MAX_BYTES) {
      throw new BadRequestException('Soundboard clip file is too large');
    }
    const mimeType = sniffSoundboardAudioType(file.buffer);
    if (!mimeType) {
      throw new BadRequestException('Soundboard clip must be an MP3, OGG, WAV, WEBM or M4A file');
    }

    const [count, existing] = await Promise.all([
      this.prisma.soundboardClip.count({ where: { serverId } }),
      this.prisma.soundboardClip.findUnique({
        where: { serverId_name: { serverId, name: dto.name } },
        select: { id: true },
      }),
    ]);
    if (count >= MAX_SOUNDBOARD_CLIPS_PER_SERVER) {
      throw new BadRequestException('Soundboard limit reached');
    }
    // Checked before storing so a taken name does not leave an orphaned file behind.
    if (existing) throw new ConflictException('Soundboard clip name already exists');

    const stored = await this.uploads.uploadBuffer({
      buffer: file.buffer,
      size: file.buffer.length,
      mimetype: mimeType,
      originalname: `${dto.name}${SNIFFED_EXTENSIONS[mimeType]}`,
    });

    let clip;
    try {
      clip = await this.prisma.$transaction(async (tx) => {
        const created = await tx.soundboardClip.create({
          data: {
            serverId,
            name: dto.name,
            url: stored.url,
            mimeType,
            byteSize: stored.byteSize,
            durationMs: dto.durationMs,
            creatorId: userId,
          },
          select: clipSelect,
        });
        await tx.auditLog.create({
          data: auditEntry(serverId, userId, 'SOUNDBOARD_CLIP_CREATE', created.id, created.name),
        });
        return created;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Soundboard clip name already exists');
      }
      throw error;
    }

    this.emitUpdated(serverId);
    return { clip };
  }

  async remove(userId: string, serverId: string, clipId: string) {
    await this.permissions.requireServerPermission(userId, serverId, Permission.ManageServer);
    const clip = await this.prisma.soundboardClip.findFirst({
      where: { id: clipId, serverId },
      select: { id: true, name: true },
    });
    if (!clip) throw new NotFoundException('Soundboard clip not found');

    await this.prisma.$transaction([
      this.prisma.soundboardClip.delete({ where: { id: clip.id } }),
      this.prisma.auditLog.create({
        data: auditEntry(serverId, userId, 'SOUNDBOARD_CLIP_DELETE', clip.id, clip.name),
      }),
    ]);
    this.emitUpdated(serverId);
    return { ok: true };
  }

  private emitUpdated(serverId: string) {
    this.realtime.emitToRoom(
      this.realtime.serverRoom(serverId),
      RealtimeEvents.ServerSoundboardUpdated,
      { serverId },
    );
  }
}

function auditEntry(
  serverId: string,
  actorId: string,
  action: 'SOUNDBOARD_CLIP_CREATE' | 'SOUNDBOARD_CLIP_DELETE',
  targetId: string,
  name: string,
) {
  return { serverId, actorId, action, targetId, metadata: { name } };
}
