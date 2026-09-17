import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AutoModRule, Prisma } from '@prisma/client';
import {
  AUTOMOD_MAX_ENABLED_RULES,
  AUTOMOD_MAX_RULES,
  type AutoModRuleView,
} from '@discord-clone/shared';
import { Permission, PermissionsService } from '@/modules/permissions/permissions.service';
import { PrismaService } from '@/modules/prisma/prisma.service';
import { AutoModScreeningService } from './automod-screening.service';
import { CreateAutoModRuleDto } from './dto/create-automod-rule.dto';
import { UpdateAutoModRuleDto } from './dto/update-automod-rule.dto';
import { compileSafeRegex } from './safe-regex';

type RuleFields = Required<Omit<CreateAutoModRuleDto, 'alertChannelId'>> & {
  alertChannelId: string | null;
  enabled: boolean;
};

// A hostname or a bare domain such as `example.com`; no scheme, path, port, or wildcard.
const DOMAIN_PATTERN = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/** Rule CRUD for server managers. Every write invalidates the evaluator's cache for the server. */
@Injectable()
export class AutoModService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
    private readonly screening: AutoModScreeningService,
  ) {}

  async list(userId: string, serverId: string): Promise<{ rules: AutoModRuleView[] }> {
    await this.permissions.requireServerPermission(userId, serverId, Permission.ManageServer);
    const rules = await this.prisma.autoModRule.findMany({
      where: { serverId },
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
      take: AUTOMOD_MAX_RULES,
    });
    return { rules: rules.map(formatRule) };
  }

  async create(userId: string, serverId: string, dto: CreateAutoModRuleDto) {
    await this.permissions.requireServerPermission(userId, serverId, Permission.ManageServer);
    const fields = await this.normalize(serverId, {
      ...dto,
      terms: dto.terms ?? [],
      pattern: dto.pattern ?? '',
      mentionLimit: dto.mentionLimit ?? 0,
      allowedDomains: dto.allowedDomains ?? [],
      alsoAllowMessage: dto.alsoAllowMessage ?? false,
      timeoutMinutes: dto.timeoutMinutes ?? 0,
      alertChannelId: dto.alertChannelId ?? null,
      exemptRoleIds: dto.exemptRoleIds ?? [],
      exemptChannelIds: dto.exemptChannelIds ?? [],
      enabled: true,
    });

    const [total, enabled, last] = await Promise.all([
      this.prisma.autoModRule.count({ where: { serverId } }),
      this.prisma.autoModRule.count({ where: { serverId, enabled: true } }),
      this.prisma.autoModRule.findFirst({
        where: { serverId },
        orderBy: { position: 'desc' },
        select: { position: true },
      }),
    ]);
    if (total >= AUTOMOD_MAX_RULES || enabled >= AUTOMOD_MAX_ENABLED_RULES) {
      throw new BadRequestException('AutoMod rule limit reached');
    }

    const rule = await this.prisma.autoModRule.create({
      data: { ...fields, serverId, createdById: userId, position: (last?.position ?? -1) + 1 },
    });
    await this.writeAuditLog(serverId, userId, 'AUTOMOD_RULE_CREATE', rule);
    this.screening.invalidate(serverId);
    return { rule: formatRule(rule) };
  }

  async update(userId: string, ruleId: string, dto: UpdateAutoModRuleDto) {
    const existing = await this.requireRule(userId, ruleId);
    const fields = await this.normalize(existing.serverId, {
      name: dto.name ?? existing.name,
      triggerType: dto.triggerType ?? existing.triggerType,
      terms: dto.terms ?? existing.terms,
      pattern: dto.pattern ?? existing.pattern ?? '',
      mentionLimit: dto.mentionLimit ?? existing.mentionLimit ?? 0,
      allowedDomains: dto.allowedDomains ?? existing.allowedDomains,
      action: dto.action ?? existing.action,
      alsoAllowMessage: dto.alsoAllowMessage ?? existing.alsoAllowMessage,
      timeoutMinutes: dto.timeoutMinutes ?? existing.timeoutMinutes ?? 0,
      alertChannelId:
        dto.alertChannelId === undefined ? existing.alertChannelId : dto.alertChannelId,
      exemptRoleIds: dto.exemptRoleIds ?? existing.exemptRoleIds,
      exemptChannelIds: dto.exemptChannelIds ?? existing.exemptChannelIds,
      enabled: dto.enabled ?? existing.enabled,
    });

    if (fields.enabled && !existing.enabled) {
      const enabled = await this.prisma.autoModRule.count({
        where: { serverId: existing.serverId, enabled: true },
      });
      if (enabled >= AUTOMOD_MAX_ENABLED_RULES) {
        throw new BadRequestException('AutoMod rule limit reached');
      }
    }

    const rule = await this.prisma.autoModRule.update({ where: { id: ruleId }, data: fields });
    await this.writeAuditLog(existing.serverId, userId, 'AUTOMOD_RULE_UPDATE', rule);
    this.screening.invalidate(existing.serverId);
    return { rule: formatRule(rule) };
  }

  async remove(userId: string, ruleId: string) {
    const existing = await this.requireRule(userId, ruleId);
    await this.prisma.autoModRule.delete({ where: { id: ruleId } });
    await this.writeAuditLog(existing.serverId, userId, 'AUTOMOD_RULE_DELETE', existing);
    this.screening.invalidate(existing.serverId);
    return { ok: true };
  }

  /** A rule of a server the caller cannot manage answers 404, not 403, so ids do not leak. */
  private async requireRule(userId: string, ruleId: string) {
    const rule = await this.prisma.autoModRule.findUnique({ where: { id: ruleId } });
    if (
      !rule ||
      !(await this.permissions.hasServerPermission(userId, rule.serverId, Permission.ManageServer))
    ) {
      throw new NotFoundException('AutoMod rule not found');
    }
    return rule;
  }

  /**
   * Checks the fields a trigger and an action need, and clears the ones they do not, so a stored
   * rule never carries a stale pattern or term list from an earlier trigger type.
   */
  private async normalize(serverId: string, input: RuleFields) {
    const name = input.name.trim();
    if (!name) throw new BadRequestException('AutoMod rule name cannot be empty');

    let terms: string[] = [];
    let pattern: string | null = null;
    let mentionLimit: number | null = null;
    let allowedDomains: string[] = [];
    switch (input.triggerType) {
      case 'KEYWORD':
        terms = [...new Set(input.terms.map((term) => term.trim().toLowerCase()).filter(Boolean))];
        if (!terms.length) throw new BadRequestException('Keyword rules need at least one term');
        break;
      case 'REGEX':
        pattern = input.pattern.trim();
        if (!pattern) throw new BadRequestException('Regex rules need a pattern');
        if (!compileSafeRegex(pattern)) throw new BadRequestException('Pattern is not supported');
        break;
      case 'MENTION_SPAM':
        if (!input.mentionLimit) {
          throw new BadRequestException('Mention spam rules need a mention limit');
        }
        mentionLimit = input.mentionLimit;
        break;
      case 'EXTERNAL_LINK':
        allowedDomains = [
          ...new Set(input.allowedDomains.map((domain) => domain.trim().toLowerCase())),
        ].filter(Boolean);
        if (allowedDomains.some((domain) => !DOMAIN_PATTERN.test(domain))) {
          throw new BadRequestException('Invalid allowed domain');
        }
        break;
      case 'INVITE_LINK':
        break;
    }

    const isTimeout = input.action === 'TIMEOUT_AUTHOR';
    if (isTimeout && !input.timeoutMinutes) {
      throw new BadRequestException('Timeout rules need a timeout duration');
    }
    const alsoAllowMessage = isTimeout && input.alsoAllowMessage;
    const needsAlertChannel = input.action === 'ALERT_ONLY' || alsoAllowMessage;
    if (needsAlertChannel && !input.alertChannelId) {
      throw new BadRequestException('This action needs an alert channel');
    }
    if (input.alertChannelId) await this.requireTextChannel(serverId, input.alertChannelId);

    const exemptRoleIds = [...new Set(input.exemptRoleIds)];
    const exemptChannelIds = [...new Set(input.exemptChannelIds)];
    await this.requireServerIds(serverId, exemptRoleIds, exemptChannelIds);

    return {
      name,
      triggerType: input.triggerType,
      terms,
      pattern,
      mentionLimit,
      allowedDomains,
      action: input.action,
      alsoAllowMessage,
      timeoutMinutes: isTimeout ? input.timeoutMinutes : null,
      alertChannelId: input.alertChannelId,
      exemptRoleIds,
      exemptChannelIds,
      enabled: input.enabled,
    } satisfies Prisma.AutoModRuleUncheckedUpdateInput;
  }

  private async requireTextChannel(serverId: string, channelId: string) {
    const channel = await this.prisma.channel.findFirst({
      where: { id: channelId, serverId, type: 'TEXT' },
      select: { id: true },
    });
    if (!channel) throw new NotFoundException('Channel not found');
  }

  private async requireServerIds(serverId: string, roleIds: string[], channelIds: string[]) {
    const [roles, channels] = await Promise.all([
      roleIds.length
        ? this.prisma.role.count({ where: { serverId, id: { in: roleIds } } })
        : Promise.resolve(0),
      channelIds.length
        ? this.prisma.channel.count({ where: { serverId, id: { in: channelIds } } })
        : Promise.resolve(0),
    ]);
    if (roles !== roleIds.length) throw new NotFoundException('Role not found');
    if (channels !== channelIds.length) throw new NotFoundException('Channel not found');
  }

  private async writeAuditLog(
    serverId: string,
    actorId: string,
    action: string,
    rule: AutoModRule,
  ) {
    await this.prisma.auditLog.create({
      data: {
        serverId,
        actorId,
        action,
        targetId: rule.id,
        metadata: { name: rule.name, triggerType: rule.triggerType, action: rule.action },
      },
    });
  }
}

function formatRule(rule: AutoModRule): AutoModRuleView {
  return {
    id: rule.id,
    serverId: rule.serverId,
    name: rule.name,
    triggerType: rule.triggerType,
    terms: rule.terms,
    pattern: rule.pattern,
    mentionLimit: rule.mentionLimit,
    allowedDomains: rule.allowedDomains,
    action: rule.action,
    alsoAllowMessage: rule.alsoAllowMessage,
    timeoutMinutes: rule.timeoutMinutes,
    alertChannelId: rule.alertChannelId,
    exemptRoleIds: rule.exemptRoleIds,
    exemptChannelIds: rule.exemptChannelIds,
    position: rule.position,
    enabled: rule.enabled,
    createdAt: rule.createdAt,
    updatedAt: rule.updatedAt,
  };
}
