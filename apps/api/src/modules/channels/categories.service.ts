import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Permission, PermissionsService } from '@/modules/permissions/permissions.service';
import { PrismaService } from '@/modules/prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
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
