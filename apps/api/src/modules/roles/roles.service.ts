import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Permission, PermissionsService } from '@/modules/permissions/permissions.service';
import { canGrantRoles, loadRoleGrantContext } from '@/modules/permissions/role-grant';
import { PrismaService } from '@/modules/prisma/prisma.service';
import type { Role } from '@discord-clone/shared';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
  ) {}

  async listRoles(userId: string, serverId: string): Promise<{ roles: Role[] }> {
    await this.permissions.requireMembership(userId, serverId);
    const roles = await this.prisma.role.findMany({
      where: { serverId },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    });
    return { roles };
  }

  async createRole(userId: string, serverId: string, dto: CreateRoleDto) {
    const granter = await this.permissions.requireServerPermission(
      userId,
      serverId,
      Permission.ManageRoles,
    );
    // A new role has no channel overrides yet, so only its server-level permissions are checked.
    await this.requireCanGrant(granter, [{ id: '', permissions: dto.permissions }]);
    const position = await this.prisma.role.count({ where: { serverId } });
    const role = await this.prisma.role.create({
      data: {
        serverId,
        name: dto.name.trim(),
        color: dto.color,
        permissions: dto.permissions,
        position,
      },
    });
    await this.writeAuditLog(serverId, userId, 'ROLE_CREATE', role.id, {
      name: role.name,
      permissions: role.permissions,
    });
    return { role };
  }

  async updateRole(userId: string, roleId: string, dto: UpdateRoleDto) {
    const existing = await this.findMutableRole(roleId);
    const granter = await this.permissions.requireServerPermission(
      userId,
      existing.serverId,
      Permission.ManageRoles,
    );
    // Both the role as it is and as it would become, so a role above the caller stays untouchable.
    await this.requireCanGrant(granter, [
      existing,
      { id: existing.id, permissions: dto.permissions ?? existing.permissions },
    ]);
    const role = await this.prisma.role.update({
      where: { id: roleId },
      data: {
        name: dto.name?.trim(),
        color: dto.color,
        permissions: dto.permissions,
      },
    });
    await this.writeAuditLog(existing.serverId, userId, 'ROLE_UPDATE', role.id, {
      name: role.name,
      permissions: role.permissions,
    });
    return { role };
  }

  async deleteRole(userId: string, roleId: string) {
    const existing = await this.findMutableRole(roleId);
    const granter = await this.permissions.requireServerPermission(
      userId,
      existing.serverId,
      Permission.ManageRoles,
    );
    await this.requireCanGrant(granter, [existing]);
    await this.prisma.role.delete({ where: { id: roleId } });
    await this.writeAuditLog(existing.serverId, userId, 'ROLE_DELETE', roleId, {
      name: existing.name,
    });
    return { ok: true };
  }

  async addMemberRole(userId: string, serverId: string, memberId: string, roleId: string) {
    const granter = await this.permissions.requireServerPermission(
      userId,
      serverId,
      Permission.ManageRoles,
    );
    const [member, role] = await Promise.all([
      this.prisma.serverMember.findFirst({ where: { id: memberId, serverId } }),
      this.prisma.role.findFirst({ where: { id: roleId, serverId } }),
    ]);

    if (!member || !role) {
      throw new NotFoundException('Member or role not found');
    }
    await this.requireCanGrant(granter, [role]);

    await this.prisma.memberRole.upsert({
      where: { memberId_roleId: { memberId, roleId } },
      create: { memberId, roleId },
      update: {},
    });
    await this.writeAuditLog(serverId, userId, 'MEMBER_ROLE_ADD', memberId, { roleId });
    return { ok: true };
  }

  async removeMemberRole(userId: string, serverId: string, memberId: string, roleId: string) {
    const granter = await this.permissions.requireServerPermission(
      userId,
      serverId,
      Permission.ManageRoles,
    );
    const role = await this.prisma.role.findFirst({ where: { id: roleId, serverId } });
    if (!role) {
      throw new NotFoundException('Role not found');
    }
    if (role.name === '@everyone') {
      throw new ForbiddenException('Cannot remove @everyone role');
    }
    await this.requireCanGrant(granter, [role]);

    await this.prisma.memberRole.deleteMany({ where: { memberId, roleId } });
    await this.writeAuditLog(serverId, userId, 'MEMBER_ROLE_REMOVE', memberId, { roleId });
    return { ok: true };
  }

  /**
   * Managing a role is granting what it allows: a MANAGE_ROLES holder may create, edit, delete, add
   * or remove only roles whose permissions (server-level and channel overrides) they hold themselves.
   * The same rule as adding a bot (`canGrantRoles`); the owner may manage every role.
   */
  private async requireCanGrant(
    granter: Awaited<ReturnType<PermissionsService['requireServerPermission']>>,
    roles: Array<{ id: string; permissions: string[] }>,
  ) {
    if (granter.kind === 'OWNER') return;
    const context = await loadRoleGrantContext(this.prisma, granter);
    if (!canGrantRoles(context, roles)) {
      throw new ForbiddenException('Cannot manage a role with permissions you do not have');
    }
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
