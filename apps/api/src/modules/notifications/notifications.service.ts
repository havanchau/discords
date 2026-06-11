import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimePublisher } from '../realtime/realtime-publisher.service';

const actorSelect = {
  id: true,
  username: true,
  displayName: true,
  avatarUrl: true,
} as const;

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimePublisher,
  ) {}

  async list(userId: string) {
    const [items, unreadCount] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where: { userId },
        include: { actor: { select: actorSelect } },
        orderBy: { createdAt: 'desc' },
        take: 30,
      }),
      this.prisma.notification.count({ where: { userId, readAt: null } }),
    ]);

    return { items, unreadCount };
  }

  async create(data: Prisma.NotificationUncheckedCreateInput) {
    const notification = await this.prisma.notification.create({
      data,
      include: { actor: { select: actorSelect } },
    });
    const unreadCount = await this.prisma.notification.count({
      where: { userId: data.userId, readAt: null },
    });

    this.realtime.emitToRoom(this.realtime.userRoom(data.userId), 'notification:created', {
      notification,
      unreadCount,
    });

    return notification;
  }

  async markRead(userId: string, notificationId: string) {
    const notification = await this.prisma.notification.findFirst({
      where: { id: notificationId, userId },
    });
    if (!notification) throw new NotFoundException('Notification not found');

    const updated = await this.prisma.notification.update({
      where: { id: notificationId },
      data: { readAt: notification.readAt ?? new Date() },
      include: { actor: { select: actorSelect } },
    });
    await this.emitUnreadCount(userId);
    return { notification: updated };
  }

  async markAllRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    await this.emitUnreadCount(userId);
    return { ok: true };
  }

  async emitUnreadCount(userId: string) {
    const unreadCount = await this.prisma.notification.count({ where: { userId, readAt: null } });
    this.realtime.emitToRoom(this.realtime.userRoom(userId), 'notification:unread', {
      unreadCount,
    });
  }
}
