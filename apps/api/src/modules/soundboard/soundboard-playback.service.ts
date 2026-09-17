import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { SoundboardPlayPayload } from '@discord-clone/shared';
import { PermissionsService } from '@/modules/permissions/permissions.service';
import { PrismaService } from '@/modules/prisma/prisma.service';

/** Socket bodies skip the validation pipe, so the play command is narrowed here. */
export function parseSoundboardPlay(body: unknown): SoundboardPlayPayload {
  if (typeof body !== 'object' || body === null) {
    throw new BadRequestException('Invalid soundboard request');
  }
  const { channelId, clipId } = body as Record<string, unknown>;
  if (
    typeof channelId !== 'string' ||
    typeof clipId !== 'string' ||
    channelId.length === 0 ||
    channelId.length > 80 ||
    clipId.length === 0 ||
    clipId.length > 64
  ) {
    throw new BadRequestException('Invalid soundboard request');
  }
  return { channelId, clipId };
}

/**
 * Server-side checks for `soundboard:play` beyond what the gateway checks against the call registry
 * (a server voice call, and this socket is a participant in it).
 */
@Injectable()
export class SoundboardPlaybackService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
  ) {}

  /** Re-checked on every play: membership, timeout and rules screening can change mid-call. */
  async authorizePlay(userId: string, { channelId, clipId }: SoundboardPlayPayload) {
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
      select: { serverId: true },
    });
    if (!channel) throw new NotFoundException('Channel not found');
    await this.permissions.requireMembership(userId, channel.serverId);
    await this.permissions.requireNotTimedOut(userId, channel.serverId);
    await this.permissions.requireOnboardingAccepted(userId, channel.serverId);

    const clip = await this.prisma.soundboardClip.findFirst({
      where: { id: clipId, serverId: channel.serverId },
      select: { id: true, name: true, url: true },
    });
    if (!clip) throw new NotFoundException('Soundboard clip not found');
    return { channelId, clipId: clip.id, name: clip.name, url: clip.url };
  }
}
