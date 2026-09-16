import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Permission, PermissionsService } from '@/modules/permissions/permissions.service';
import { PrismaService } from '@/modules/prisma/prisma.service';
import type { ServerEventView } from '@discord-clone/shared';
import { RealtimePublisher } from '@/modules/realtime/realtime-publisher.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { activeEventCutoffs, eventStatus, validateEventTimes } from './event-status';

const MAX_LISTED_EVENTS = 50;

function eventInclude(userId: string) {
  return {
    creator: { select: { id: true, displayName: true, avatarUrl: true } },
    channel: { select: { id: true, serverId: true, isPrivate: true } },
    interests: { where: { userId }, select: { userId: true }, take: 1 },
    _count: { select: { interests: true } },
  } satisfies Prisma.ServerEventInclude;
}

type EventWithDetails = Prisma.ServerEventGetPayload<{ include: ReturnType<typeof eventInclude> }>;

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
    private readonly realtime: RealtimePublisher,
  ) {}

  async list(userId: string, serverId: string): Promise<{ events: ServerEventView[] }> {
    await this.permissions.requireMembership(userId, serverId);
    const now = new Date();
    const { endAtAfter, openEndedStartAfter } = activeEventCutoffs(now);
    const events = await this.prisma.serverEvent.findMany({
      where: {
        serverId,
        cancelledAt: null,
        OR: [{ endAt: { gt: endAtAfter } }, { endAt: null, startAt: { gt: openEndedStartAfter } }],
      },
      include: eventInclude(userId),
      orderBy: { startAt: 'asc' },
      take: MAX_LISTED_EVENTS,
    });

    // Events tied to a channel the viewer cannot see are hidden, like the channel itself.
    const eventChannels = events.flatMap((event) => (event.channel ? [event.channel] : []));
    const viewableChannelIds = new Set(
      (await this.permissions.filterViewableChannels(userId, eventChannels)).map(
        (channel) => channel.id,
      ),
    );
    return {
      events: events
        .filter((event) => !event.channelId || viewableChannelIds.has(event.channelId))
        .map((event) => this.toView(event, now)),
    };
  }

  async create(userId: string, serverId: string, dto: CreateEventDto) {
    await this.permissions.requireServerPermission(userId, serverId, Permission.ManageServer);
    const startAt = new Date(dto.startAt);
    const endAt = dto.endAt ? new Date(dto.endAt) : null;
    this.assertTimes(startAt, endAt, true);
    if (dto.channelId) await this.requireChannelInServer(serverId, dto.channelId);

    const event = await this.prisma.serverEvent.create({
      data: {
        serverId,
        creatorId: userId,
        channelId: dto.channelId,
        name: this.normalizeName(dto.name),
        description: dto.description?.trim() || null,
        location: dto.location?.trim() || null,
        startAt,
        endAt,
      },
      include: eventInclude(userId),
    });
    await this.afterChange(serverId, userId, 'EVENT_CREATE', event);
    return { event: this.toView(event, new Date()) };
  }

  async update(userId: string, eventId: string, dto: UpdateEventDto) {
    const existing = await this.requireEvent(eventId);
    await this.permissions.requireServerPermission(
      userId,
      existing.serverId,
      Permission.ManageServer,
    );
    if (existing.cancelledAt) throw new BadRequestException('Cancelled events cannot be edited');

    const startAt = dto.startAt ? new Date(dto.startAt) : existing.startAt;
    const endAt = dto.endAt === undefined ? existing.endAt : dto.endAt ? new Date(dto.endAt) : null;
    this.assertTimes(startAt, endAt, dto.startAt !== undefined);
    if (dto.channelId) await this.requireChannelInServer(existing.serverId, dto.channelId);

    const event = await this.prisma.serverEvent.update({
      where: { id: eventId },
      data: {
        name: dto.name === undefined ? undefined : this.normalizeName(dto.name),
        description: dto.description === undefined ? undefined : dto.description?.trim() || null,
        location: dto.location === undefined ? undefined : dto.location?.trim() || null,
        channelId: dto.channelId,
        startAt,
        endAt,
      },
      include: eventInclude(userId),
    });
    await this.afterChange(existing.serverId, userId, 'EVENT_UPDATE', event);
    return { event: this.toView(event, new Date()) };
  }

  async cancel(userId: string, eventId: string) {
    const existing = await this.requireEvent(eventId);
    await this.permissions.requireServerPermission(
      userId,
      existing.serverId,
      Permission.ManageServer,
    );
    if (!existing.cancelledAt) {
      await this.prisma.serverEvent.update({
        where: { id: eventId },
        data: { cancelledAt: new Date() },
      });
      await this.afterChange(existing.serverId, userId, 'EVENT_CANCEL', existing);
    }
    return { ok: true };
  }

  async setInterest(userId: string, eventId: string, interested: boolean) {
    const event = await this.requireEvent(eventId);
    await this.permissions.requireMembership(userId, event.serverId);
    if (event.channelId) {
      await this.permissions.requireChannelPermission(
        userId,
        event.channelId,
        Permission.ViewChannel,
      );
    }
    if (event.cancelledAt) throw new BadRequestException('This event was cancelled');

    if (interested) {
      await this.prisma.serverEventInterest.upsert({
        where: { eventId_userId: { eventId, userId } },
        create: { eventId, userId },
        update: {},
      });
    } else {
      await this.prisma.serverEventInterest.deleteMany({ where: { eventId, userId } });
    }
    const interestedCount = await this.prisma.serverEventInterest.count({ where: { eventId } });
    this.emitUpdated(event.serverId);
    return { interested, interestedCount };
  }

  private toView(event: EventWithDetails, now: Date) {
    return {
      id: event.id,
      serverId: event.serverId,
      channelId: event.channelId,
      name: event.name,
      description: event.description,
      location: event.location,
      startAt: event.startAt,
      endAt: event.endAt,
      status: eventStatus(event, now),
      creator: event.creator,
      interestedCount: event._count.interests,
      interested: event.interests.length > 0,
    };
  }

  private normalizeName(name: string) {
    const trimmed = name.trim();
    if (!trimmed) throw new BadRequestException('Event name cannot be empty');
    return trimmed;
  }

  private assertTimes(startAt: Date, endAt: Date | null, checkStart: boolean) {
    const message = validateEventTimes(startAt, endAt, new Date(), checkStart);
    if (message) throw new BadRequestException(message);
  }

  private async requireEvent(eventId: string) {
    const event = await this.prisma.serverEvent.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundException('Event not found');
    return event;
  }

  private async requireChannelInServer(serverId: string, channelId: string) {
    const channel = await this.prisma.channel.findFirst({
      where: { id: channelId, serverId },
      select: { id: true },
    });
    if (!channel) throw new NotFoundException('Channel not found');
  }

  private async afterChange(
    serverId: string,
    actorId: string,
    action: string,
    event: { id: string; name: string; startAt: Date },
  ) {
    await this.prisma.auditLog.create({
      data: {
        serverId,
        actorId,
        action,
        targetId: event.id,
        metadata: { name: event.name, startAt: event.startAt.toISOString() },
      },
    });
    this.emitUpdated(serverId);
  }

  private emitUpdated(serverId: string) {
    this.realtime.emitToRoom(this.realtime.serverRoom(serverId), 'server:events-updated', {
      serverId,
    });
  }
}
