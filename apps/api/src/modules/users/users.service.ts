import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateNotificationPreferenceDto } from './dto/update-notification-preference.dto';
import { UpdateMeDto } from './dto/update-me.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getMe(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        username: true,
        displayName: true,
        avatarUrl: true,
        bio: true,
        status: true,
        createdAt: true
      }
    });
    return { user };
  }

  async updateMe(userId: string, dto: UpdateMeDto) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: dto,
      select: {
        id: true,
        email: true,
        username: true,
        displayName: true,
        avatarUrl: true,
        bio: true,
        status: true,
        updatedAt: true
      }
    });
    return { user };
  }

  async listNotificationPreferences(userId: string) {
    const preferences = await this.prisma.notificationPreference.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
    });
    return { preferences };
  }

  async updateNotificationPreference(userId: string, dto: UpdateNotificationPreferenceDto) {
    const existing = await this.prisma.notificationPreference.findFirst({
      where: {
        userId,
        serverId: dto.serverId ?? null,
        channelId: dto.channelId ?? null,
      },
    });

    const data = {
      userId,
      serverId: dto.serverId,
      channelId: dto.channelId,
      muted: dto.muted ?? false,
      mentionOnly: dto.mentionOnly ?? false,
      desktopEnabled: dto.desktopEnabled ?? false,
    };

    const preference = existing
      ? await this.prisma.notificationPreference.update({
          where: { id: existing.id },
          data,
        })
      : await this.prisma.notificationPreference.create({ data });

    return { preference };
  }
}
