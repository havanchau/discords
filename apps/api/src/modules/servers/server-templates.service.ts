import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { SERVER_TEMPLATE_MAX_PER_SERVER, type ServerTemplateSummary } from '@discord-clone/shared';
import { Permission, PermissionsService } from '@/modules/permissions/permissions.service';
import { PrismaService } from '@/modules/prisma/prisma.service';
import { CreateServerDto } from './dto/create-server.dto';
import { CreateServerTemplateDto } from './dto/create-server-template.dto';
import { createServerFromSnapshot } from './server-bootstrap';
import { readStoredQuestions } from './server-onboarding.rules';
import { BUILT_IN_SERVER_TEMPLATES, findBuiltInTemplate } from './server-template-builtins';
import {
  exceedsTemplateLimits,
  readTemplateSnapshot,
  toTemplateColumns,
  type TemplateSnapshot,
} from './server-template.rules';
import { ServersService } from './servers.service';

// A template replay issues a handful of batched writes plus one insert per category (at most 25).
const REPLAY_TRANSACTION_TIMEOUT_MS = 15_000;
const MAX_LISTED_PRIVATE_TEMPLATES = 50;

/**
 * Slice A of docs/features/server-templates-and-discovery.md. A private template is usable by whoever
 * can MANAGE_SERVER on its source server; a template whose source server is gone is unusable.
 */
@Injectable()
export class ServerTemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
    private readonly servers: ServersService,
  ) {}

  async createTemplate(
    userId: string,
    serverId: string,
    dto: CreateServerTemplateDto,
  ): Promise<{ template: ServerTemplateSummary }> {
    const member = await this.permissions.requireServerPermission(
      userId,
      serverId,
      Permission.ManageServer,
    );
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('Template name cannot be empty');

    const existing = await this.prisma.serverTemplate.count({
      where: { sourceServerId: serverId },
    });
    if (existing >= SERVER_TEMPLATE_MAX_PER_SERVER) {
      throw new BadRequestException('Template limit reached for this server');
    }

    const snapshot = await this.snapshotServer(serverId, member.id);
    const template = await this.prisma.$transaction(async (tx) => {
      const created = await tx.serverTemplate.create({
        data: { sourceServerId: serverId, creatorId: userId, name, ...toTemplateColumns(snapshot) },
      });
      await tx.auditLog.create({
        data: {
          serverId,
          actorId: userId,
          action: 'SERVER_TEMPLATE_CREATE',
          targetId: created.id,
          metadata: { name },
        },
      });
      return created;
    });
    return { template: summarize(template, snapshot) };
  }

  async listTemplates(userId: string): Promise<{ templates: ServerTemplateSummary[] }> {
    const builtIns = BUILT_IN_SERVER_TEMPLATES.map((template) =>
      summarize(
        { id: template.id, name: template.name, sourceServerId: null, createdAt: null },
        template.snapshot,
        template.id,
      ),
    );
    const manageableServerIds = await this.manageableServerIds(userId);
    const rows = manageableServerIds.length
      ? await this.prisma.serverTemplate.findMany({
          where: { sourceServerId: { in: manageableServerIds } },
          orderBy: { createdAt: 'desc' },
          take: MAX_LISTED_PRIVATE_TEMPLATES,
        })
      : [];
    const privates = rows.map((row) => summarize(row, readTemplateSnapshot(row)));
    return { templates: [...builtIns, ...privates] };
  }

  async createServerFromTemplate(userId: string, templateId: string, dto: CreateServerDto) {
    const snapshot = await this.requireUsableSnapshot(userId, templateId);
    const server = await this.prisma.$transaction(
      async (tx) => {
        const created = await createServerFromSnapshot(
          tx,
          userId,
          { name: dto.name.trim(), description: dto.description?.trim() },
          snapshot,
        );
        await tx.auditLog.create({
          data: {
            serverId: created.id,
            actorId: userId,
            action: 'SERVER_CREATE_FROM_TEMPLATE',
            targetId: created.id,
            metadata: { templateId },
          },
        });
        return created;
      },
      { timeout: REPLAY_TRANSACTION_TIMEOUT_MS },
    );
    return this.servers.getServerForUser(userId, server.id);
  }

  async deleteTemplate(userId: string, templateId: string) {
    const template = await this.prisma.serverTemplate.findUnique({
      where: { id: templateId },
      select: { id: true, name: true, sourceServerId: true },
    });
    const sourceServerId = template?.sourceServerId;
    if (!template || !sourceServerId) throw new NotFoundException('Template not found');
    if (
      !(await this.permissions.hasServerPermission(userId, sourceServerId, Permission.ManageServer))
    ) {
      throw new NotFoundException('Template not found');
    }
    await this.prisma.$transaction([
      this.prisma.serverTemplate.delete({ where: { id: template.id } }),
      this.prisma.auditLog.create({
        data: {
          serverId: sourceServerId,
          actorId: userId,
          action: 'SERVER_TEMPLATE_DELETE',
          targetId: template.id,
          metadata: { name: template.name },
        },
      }),
    ]);
    return { ok: true as const };
  }

  /** Anything the caller may not use reads as not found, so template ids cannot be probed. */
  private async requireUsableSnapshot(userId: string, templateId: string) {
    const builtIn = findBuiltInTemplate(templateId);
    if (builtIn) return readTemplateSnapshot(toTemplateColumns(builtIn.snapshot));

    const template = await this.prisma.serverTemplate.findUnique({
      where: { id: templateId },
      include: { sourceServer: { select: { deletedAt: true } } },
    });
    const sourceServerId = template?.sourceServerId;
    if (!template || !sourceServerId || !template.sourceServer || template.sourceServer.deletedAt) {
      throw new NotFoundException('Template not found');
    }
    if (
      !(await this.permissions.hasServerPermission(userId, sourceServerId, Permission.ManageServer))
    ) {
      throw new NotFoundException('Template not found');
    }
    return readTemplateSnapshot(template);
  }

  private async manageableServerIds(userId: string) {
    const memberships = await this.prisma.serverMember.findMany({
      where: { userId, server: { deletedAt: null } },
      select: {
        serverId: true,
        kind: true,
        roles: { select: { role: { select: { permissions: true } } } },
      },
    });
    return memberships
      .filter(
        (member) =>
          member.kind === 'OWNER' ||
          member.roles.some(({ role }) => role.permissions.includes(Permission.ManageServer)),
      )
      .map((member) => member.serverId);
  }

  /**
   * The server's structure as a snapshot. Only the snapshotting member's own channel overrides are
   * kept (as `memberSelf`); overrides for other members name people and are dropped.
   */
  private async snapshotServer(serverId: string, memberId: string): Promise<TemplateSnapshot> {
    const server = await this.prisma.server.findFirst({
      where: { id: serverId, deletedAt: null },
      select: {
        onboardingEnabled: true,
        rulesText: true,
        selfAssignQuestions: true,
        roles: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] },
        channelCategories: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] },
        channels: {
          orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
          include: {
            forumTags: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] },
            permissionOverrides: {
              where: { OR: [{ roleId: { not: null } }, { memberId }] },
              orderBy: { createdAt: 'asc' },
            },
          },
        },
      },
    });
    if (!server) throw new NotFoundException('Server not found');

    const overrideCount = server.channels.reduce(
      (total, channel) => total + channel.permissionOverrides.length,
      0,
    );
    if (
      exceedsTemplateLimits({
        roles: server.roles.length,
        categories: server.channelCategories.length,
        channels: server.channels.length,
        overrides: overrideCount,
      })
    ) {
      throw new BadRequestException('Server is too large to save as a template');
    }

    const roleIndex = new Map(server.roles.map((role, index) => [role.id, index]));
    const categoryIndex = new Map(
      server.channelCategories.map((category, index) => [category.id, index]),
    );
    const questions = readStoredQuestions(server.selfAssignQuestions);

    return readTemplateSnapshot(
      toTemplateColumns({
        roles: server.roles.map((role) => ({
          name: role.name,
          color: role.color,
          permissions: role.permissions,
          position: role.position,
        })),
        categories: server.channelCategories.map((category) => ({
          name: category.name,
          position: category.position,
        })),
        channels: server.channels.map((channel) => ({
          name: channel.name,
          type: channel.type,
          topic: channel.topic,
          categoryIndex: channel.categoryId
            ? (categoryIndex.get(channel.categoryId) ?? null)
            : null,
          position: channel.position,
          isPrivate: channel.isPrivate,
          slowmodeSeconds: channel.slowmodeSeconds,
          postGuidelines: channel.postGuidelines,
          forumTags: channel.forumTags.map((tag) => tag.name),
        })),
        overrides: server.channels.flatMap((channel, channelIndex) =>
          channel.permissionOverrides.map((override) => ({
            channelIndex,
            roleIndex: override.roleId ? (roleIndex.get(override.roleId) ?? null) : null,
            memberSelf: override.memberId === memberId,
            allow: override.allow,
            deny: override.deny,
          })),
        ),
        onboarding: {
          enabled: server.onboardingEnabled,
          rulesText: server.rulesText,
          questions: questions.map((question) => ({
            prompt: question.prompt,
            roleIndexes: question.roleIds.flatMap((id) => {
              const index = roleIndex.get(id);
              return index === undefined ? [] : [index];
            }),
            multiSelect: question.multiSelect,
          })),
        },
      }),
    );
  }
}

function summarize(
  template: { id: string; name: string; sourceServerId: string | null; createdAt: Date | null },
  snapshot: TemplateSnapshot,
  builtInId: ServerTemplateSummary['builtInId'] = null,
): ServerTemplateSummary {
  return {
    id: template.id,
    name: template.name,
    builtInId,
    sourceServerId: template.sourceServerId,
    roleCount: snapshot.roles.length,
    categoryCount: snapshot.categories.length,
    channelCount: snapshot.channels.length,
    createdAt: template.createdAt,
  };
}
