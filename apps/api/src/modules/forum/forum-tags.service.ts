import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { ForumTagView } from '@discord-clone/shared';
import { ChannelsService } from '@/modules/channels/channels.service';
import { Permission, PermissionsService } from '@/modules/permissions/permissions.service';
import { PrismaService } from '@/modules/prisma/prisma.service';
import { UpdateForumTagsDto } from './dto/update-forum-tags.dto';

/** A FORUM channel's tag set: readable by anyone who can view the channel, replaced by managers. */
@Injectable()
export class ForumTagsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly channels: ChannelsService,
    private readonly permissions: PermissionsService,
  ) {}

  async listTags(userId: string, channelId: string): Promise<{ tags: ForumTagView[] }> {
    await this.channels.requireReadableForumChannel(userId, channelId);
    return { tags: await this.readTags(channelId) };
  }

  /**
   * Replaces the whole set. An entry with an id renames and reorders that tag, so posts keep it; an
   * entry without one creates a tag; a stored tag left out is deleted and drops off every post.
   */
  async replaceTags(userId: string, channelId: string, dto: UpdateForumTagsDto) {
    const channel = await this.channels.requireReadableForumChannel(userId, channelId);
    await this.permissions.requireServerPermission(
      userId,
      channel.serverId,
      Permission.ManageChannels,
    );

    const entries = dto.tags.map((tag, position) => ({
      id: tag.id,
      name: tag.name.trim(),
      position,
    }));
    const lowerNames = entries.map((entry) => entry.name.toLowerCase());
    if (new Set(lowerNames).size !== lowerNames.length) {
      throw new BadRequestException('Forum tag names must be unique');
    }
    const keptIds = entries.flatMap((entry) => (entry.id ? [entry.id] : []));
    const knownCount = keptIds.length
      ? await this.prisma.forumTag.count({ where: { channelId, id: { in: keptIds } } })
      : 0;
    // A repeated id counts once, so it is refused here too.
    if (knownCount !== keptIds.length) {
      throw new NotFoundException('Forum tag not found');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.forumTag.deleteMany({ where: { channelId, id: { notIn: keptIds } } });
      // Swapping two names would collide with the unique (channelId, name) index mid-way, so kept
      // tags first take a placeholder longer than any name the DTO accepts.
      for (const id of keptIds) {
        await tx.forumTag.update({ where: { id }, data: { name: `renaming:${id}` } });
      }
      for (const entry of entries) {
        const data = { name: entry.name, position: entry.position };
        if (entry.id) {
          await tx.forumTag.update({ where: { id: entry.id }, data });
        } else {
          await tx.forumTag.create({ data: { ...data, channelId } });
        }
      }
      await tx.auditLog.create({
        data: {
          serverId: channel.serverId,
          actorId: userId,
          action: 'FORUM_TAGS_UPDATE',
          targetId: channelId,
          metadata: { count: entries.length },
        },
      });
    });

    return { tags: await this.readTags(channelId) };
  }

  private readTags(channelId: string) {
    return this.prisma.forumTag.findMany({
      where: { channelId },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, name: true },
    });
  }
}
