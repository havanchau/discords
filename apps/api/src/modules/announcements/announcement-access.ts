import { NotFoundException } from '@nestjs/common';
import { Permission, PermissionsService } from '@/modules/permissions/permissions.service';
import { PrismaService } from '@/modules/prisma/prisma.service';

export const announcementChannelSelect = {
  id: true,
  name: true,
  type: true,
  serverId: true,
  isAgeRestricted: true,
  server: { select: { id: true, name: true, avatarUrl: true } },
} as const;

/**
 * A channel of a live server the caller may read, or `404 <notFoundMessage>`: a channel the caller
 * cannot view reads exactly like one that does not exist. The age gate applies after that, as in
 * `ChannelsService.requireReadableChannel`, so an unconfirmed user can neither follow an
 * age-restricted channel nor publish from it.
 */
export async function requireVisibleChannel(
  prisma: PrismaService,
  permissions: PermissionsService,
  userId: string,
  channelId: string,
  notFoundMessage = 'Channel not found',
) {
  const channel = await prisma.channel.findFirst({
    where: { id: channelId, server: { deletedAt: null } },
    select: announcementChannelSelect,
  });
  if (
    !channel ||
    !(await permissions.hasChannelPermission(userId, channel.id, Permission.ViewChannel))
  ) {
    throw new NotFoundException(notFoundMessage);
  }
  await permissions.requireAgeConfirmed(userId, channel.id);
  return channel;
}
