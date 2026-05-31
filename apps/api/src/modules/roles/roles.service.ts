import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Permission, PermissionsService } from '../permissions/permissions.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService
  ) {}

  async listRoles(userId: string, serverId: string) {
    await this.permissions.requireMembership(userId, serverId);
    const roles = await this.prisma.role.findMany({
      where: { serverId },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }]
    });
    return { roles };
  }

  async createRole(userId: string, serverId: string, dto: CreateRoleDto) {
    await this.permissions.requireServerPermission(userId, serverId, Permission.ManageRoles);
    const position = await this.prisma.role.count({ where: { serverId } });
    const role = await this.prisma.role.create({
      data: {
        serverId,
        name: dto.name.trim(),
        color: dto.color,
        permissions: dto.permissions,
        position
      }
    });
    await this.writeAuditLog(serverId, userId, 'ROLE_CREATE', role.id, {
      name: role.name,
      permissions: role.permissions,
    });
    return { role };
  }

  async updateRole(userId: string, roleId: string, dto: UpdateRoleDto) {
    const existing = await this.findMutableRole(roleId);
    await this.permissions.requireServerPermission(userId, existing.serverId, Permission.ManageRoles);
    const role = await this.prisma.role.update({
      where: { id: roleId },
      data: {
        name: dto.name?.trim(),
        color: dto.color,
        permissions: dto.permissions
      }
    });
    await this.writeAuditLog(existing.serverId, userId, 'ROLE_UPDATE', role.id, {
      name: role.name,
      permissions: role.permissions,
    });
    return { role };
  }

  async deleteRole(userId: string, roleId: string) {
    const existing = await this.findMutableRole(roleId);
    await this.permissions.requireServerPermission(userId, existing.serverId, Permission.ManageRoles);
    await this.prisma.role.delete({ where: { id: roleId } });
    await this.writeAuditLog(existing.serverId, userId, 'ROLE_DELETE', roleId, {
      name: existing.name,
    });
    return { ok: true };
  }

  async addMemberRole(userId: string, serverId: string, memberId: string, roleId: string) {
    await this.permissions.requireServerPermission(userId, serverId, Permission.ManageRoles);
    const [member, role] = await Promise.all([
      this.prisma.serverMember.findFirst({ where: { id: memberId, serverId } }),
      this.prisma.role.findFirst({ where: { id: roleId, serverId } })
    ]);

    if (!member || !role) {
      throw new NotFoundException('Member or role not found');
    }

    await this.prisma.memberRole.upsert({
      where: { memberId_roleId: { memberId, roleId } },
      create: { memberId, roleId },
      update: {}
    });
    await this.writeAuditLog(serverId, userId, 'MEMBER_ROLE_ADD', memberId, { roleId });
    return { ok: true };
  }

  async removeMemberRole(userId: string, serverId: string, memberId: string, roleId: string) {
    await this.permissions.requireServerPermission(userId, serverId, Permission.ManageRoles);
    const role = await this.prisma.role.findFirst({ where: { id: roleId, serverId } });
    if (!role) {
      throw new NotFoundException('Role not found');
    }
    if (role.name === '@everyone') {
      throw new ForbiddenException('Cannot remove @everyone role');
    }

    await this.prisma.memberRole.deleteMany({ where: { memberId, roleId } });
    await this.writeAuditLog(serverId, userId, 'MEMBER_ROLE_REMOVE', memberId, { roleId });
    return { ok: true };
  }

  private async findMutableRole(roleId: string) {
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role) {
      throw new NotFoundException('Role not found');
    }
    if (role.name === '@everyone') {
      throw new ForbiddenException('Cannot mutate @everyone role');
    }
    return role;
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
