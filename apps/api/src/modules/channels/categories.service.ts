import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { RealtimeEvents, type ChannelCategory } from '@discord-clone/shared';
import { Permission, PermissionsService } from '@/modules/permissions/permissions.service';
import { PrismaService } from '@/modules/prisma/prisma.service';
import { RealtimePublisher } from '@/modules/realtime/realtime-publisher.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { ReorderCategoriesDto } from './dto/reorder-categories.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
    private readonly realtime: RealtimePublisher,
  ) {}

  async createCategory(userId: string, serverId: string, dto: CreateCategoryDto) {
    await this.permissions.requireServerPermission(userId, serverId, Permission.ManageChannels);
    const name = this.normalizeName(dto.name);
    const position = await this.prisma.channelCategory.count({ where: { serverId } });
    const category = await this.prisma.channelCategory.create({
      data: { serverId, name, position },
    });
    await this.writeAuditLog(serverId, userId, 'CATEGORY_CREATE', category.id, {
      name: category.name,
      position: category.position,
    });
    return { category };
  }

  async updateCategory(userId: string, categoryId: string, dto: UpdateCategoryDto) {
    const existing = await this.requireCategory(categoryId);
    await this.permissions.requireServerPermission(
      userId,
      existing.serverId,
      Permission.ManageChannels,
    );
    const category = await this.prisma.channelCategory.update({
      where: { id: categoryId },
      data: {
        name: dto.name === undefined ? undefined : this.normalizeName(dto.name),
        position: dto.position,
      },
    });
    await this.writeAuditLog(existing.serverId, userId, 'CATEGORY_UPDATE', category.id, {
      name: category.name,
      position: category.position,
    });
    return { category };
  }

  /**
   * Replaces the server's *entire* category order in one transaction (docs/features/channel-reorder.md).
   * Order in the submitted array *is* the order — categories have no parent to move between, unlike
   * channels. This is also the first realtime event `CategoriesService` ever emits: category
   * renames/other-field updates still do not broadcast (pre-existing gap, out of scope here).
   */
  async reorderCategories(
    userId: string,
    serverId: string,
    dto: ReorderCategoriesDto,
  ): Promise<{ categories: ChannelCategory[] }> {
    await this.permissions.requireServerPermission(userId, serverId, Permission.ManageChannels);

    const existing = await this.prisma.channelCategory.findMany({
      where: { serverId },
      select: { id: true },
    });
    const existingIds = new Set(existing.map((item) => item.id));
    const payloadIds = dto.categories.map((entry) => entry.id);
    if (new Set(payloadIds).size !== payloadIds.length) {
      throw new BadRequestException('Duplicate category id in reorder payload');
    }
    const payloadIdSet = new Set(payloadIds);
    const isExactSet =
      payloadIdSet.size === existingIds.size &&
      [...payloadIdSet].every((id) => existingIds.has(id));
    if (!isExactSet) {
      throw new BadRequestException(
        "Reorder payload must include exactly the server's current categories",
      );
    }

    await this.prisma.$transaction(
      dto.categories.map((entry, position) =>
        this.prisma.channelCategory.update({
          where: { id: entry.id },
          data: { position },
        }),
      ),
    );

    await this.writeAuditLog(serverId, userId, 'CATEGORIES_REORDER', undefined, {
      count: dto.categories.length,
    });
    this.realtime.emitToRoom(
      this.realtime.serverRoom(serverId),
      RealtimeEvents.CategoriesReordered,
      { serverId },
    );

    return {
      categories: await this.prisma.channelCategory.findMany({
        where: { serverId },
        orderBy: { position: 'asc' },
      }),
    };
  }

  async deleteCategory(userId: string, categoryId: string) {
    const existing = await this.requireCategory(categoryId);
    await this.permissions.requireServerPermission(
      userId,
      existing.serverId,
      Permission.ManageChannels,
    );
    // The foreign key sets channels.categoryId to NULL, so channels become uncategorized.
    await this.prisma.channelCategory.delete({ where: { id: categoryId } });
    await this.writeAuditLog(existing.serverId, userId, 'CATEGORY_DELETE', categoryId, {
      name: existing.name,
      position: existing.position,
    });
    return { ok: true };
  }

  private async requireCategory(categoryId: string) {
    const category = await this.prisma.channelCategory.findUnique({ where: { id: categoryId } });
    if (!category) throw new NotFoundException('Category not found');
    return category;
  }

  private normalizeName(name: string) {
    const trimmed = name.trim();
    if (!trimmed) throw new BadRequestException('Category name cannot be empty');
    return trimmed;
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
