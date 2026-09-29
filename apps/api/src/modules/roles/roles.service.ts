import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { RealtimeEvents, ROLE_ICON_MAX_BYTES, type Role } from '@discord-clone/shared';
import { Permission, PermissionsService } from '@/modules/permissions/permissions.service';
import { canGrantRoles, loadRoleGrantContext } from '@/modules/permissions/role-grant';
import { PrismaService } from '@/modules/prisma/prisma.service';
import { RealtimePublisher } from '@/modules/realtime/realtime-publisher.service';
import { RealtimeViewEvictionService } from '@/modules/realtime/realtime-view-eviction.service';
import { SNIFFED_EXTENSIONS, sniffStickerImageType } from '@/modules/uploads/file-signature';
import { UploadsService } from '@/modules/uploads/uploads.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
    private readonly realtime: RealtimePublisher,
    private readonly viewEviction: RealtimeViewEvictionService,
    private readonly uploads: UploadsService,
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
    this.emitRolesUpdated(serverId);
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
        isHoisted: dto.isHoisted,
        isMentionable: dto.isMentionable,
      },
    });
    await this.writeAuditLog(existing.serverId, userId, 'ROLE_UPDATE', role.id, {
      name: role.name,
      permissions: role.permissions,
    });
    // A permissions change is the only field here that can remove a holder's `VIEW_CHANNEL`
    // (docs/features/channel-view-eviction.md).
    if (dto.permissions !== undefined) {
      await this.viewEviction.evictServerForRole(existing.serverId, roleId);
    }
    this.emitRolesUpdated(existing.serverId);
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
    // Captured before the delete: `MemberRole.role` cascades on delete (servers.prisma:158-165), so
    // querying "who holds roleId" after the delete would find nobody — see channel-view-eviction.md,
    // Deviations.
    const holders = await this.prisma.serverMember.findMany({
      where: { serverId: existing.serverId, roles: { some: { roleId } } },
      select: { userId: true },
    });
    await this.prisma.role.delete({ where: { id: roleId } });
    await this.writeAuditLog(existing.serverId, userId, 'ROLE_DELETE', roleId, {
      name: existing.name,
    });
    // Per captured holder, not `evictServerForRole`: the role's `ChannelPermissionOverride` rows and
    // `MemberRole` join rows have already cascade-deleted by this point, so each holder's current
    // roles (reloaded fresh, without the deleted role) is the only source of truth left
    // (docs/features/channel-view-eviction.md, Deviations).
    await Promise.all(
      holders.map((holder) => this.viewEviction.evictMember(existing.serverId, holder.userId)),
    );
    // Best-effort, after the row is gone — mirrors StickersService.remove's cleanup order.
    if (existing.iconUrl) {
      await this.uploads.removeStoredFileQuietly(existing.iconUrl, existing.iconMimeType ?? '');
    }
    this.emitRolesUpdated(existing.serverId);
    return { ok: true };
  }

  /** `POST /roles/:roleId/icon` — same sniff/size/uploadBuffer path as stickers/soundboard. */
  async uploadIcon(userId: string, roleId: string, file: Express.Multer.File | undefined) {
    const existing = await this.findMutableRole(roleId);
    const granter = await this.permissions.requireServerPermission(
      userId,
      existing.serverId,
      Permission.ManageRoles,
    );
    await this.requireCanGrant(granter, [existing]);
    if (!file) throw new BadRequestException('File is required');
    if (file.buffer.length > ROLE_ICON_MAX_BYTES) {
      throw new BadRequestException('Role icon is too large');
    }
    const mimeType = sniffStickerImageType(file.buffer);
    if (!mimeType) throw new BadRequestException('Role icon must be a PNG or WEBP image');

    const stored = await this.uploads.uploadBuffer({
      buffer: file.buffer,
      size: file.buffer.length,
      mimetype: mimeType,
      originalname: `${existing.id}${SNIFFED_EXTENSIONS[mimeType]}`,
    });

    const role = await this.prisma.role.update({
      where: { id: roleId },
      data: { iconUrl: stored.url, iconMimeType: mimeType },
    });
    await this.writeAuditLog(existing.serverId, userId, 'ROLE_UPDATE', role.id, {
      name: role.name,
    });
    // Commit first, then delete the previous file — same order as replacing a sticker.
    if (existing.iconUrl) {
      await this.uploads.removeStoredFileQuietly(existing.iconUrl, existing.iconMimeType ?? '');
    }
    this.emitRolesUpdated(existing.serverId);
    return { role };
  }

  /** `DELETE /roles/:roleId/icon` — no-op-safe if the role has no icon. */
  async removeIcon(userId: string, roleId: string) {
    const existing = await this.findMutableRole(roleId);
    const granter = await this.permissions.requireServerPermission(
      userId,
      existing.serverId,
      Permission.ManageRoles,
    );
    await this.requireCanGrant(granter, [existing]);

    const role = await this.prisma.role.update({
      where: { id: roleId },
      data: { iconUrl: null, iconMimeType: null },
    });
    if (existing.iconUrl) {
      await this.uploads.removeStoredFileQuietly(existing.iconUrl, existing.iconMimeType ?? '');
    }
    this.emitRolesUpdated(existing.serverId);
    return { role };
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
    // The added role can itself carry a channel override with `deny: ['VIEW_CHANNEL']`, so gaining a
    // role can remove access the member already had (docs/features/channel-view-eviction.md).
    await this.viewEviction.evictMember(serverId, member.userId);
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

    // Looked up, not required to exist: `memberRole.deleteMany` below is already a no-op-safe
    // blind delete for an unknown `memberId` (unchanged), so a missing member here only means there
    // is nobody to evict, not a 404 (docs/features/channel-view-eviction.md).
    const member = await this.prisma.serverMember.findUnique({
      where: { id: memberId },
      select: { userId: true },
    });
    await this.prisma.memberRole.deleteMany({ where: { memberId, roleId } });
    await this.writeAuditLog(serverId, userId, 'MEMBER_ROLE_REMOVE', memberId, { roleId });
    // The removed role may have been the member's only source of `VIEW_CHANNEL`
    // (docs/features/channel-view-eviction.md).
    if (member) {
      await this.viewEviction.evictMember(serverId, member.userId);
    }
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

  private emitRolesUpdated(serverId: string) {
    this.realtime.emitToRoom(this.realtime.serverRoom(serverId), RealtimeEvents.RolesUpdated, {
      serverId,
    });
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
