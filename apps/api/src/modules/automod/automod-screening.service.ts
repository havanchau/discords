import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { I18nService } from '@/common/i18n/i18n.service';
import { PrismaService } from '@/modules/prisma/prisma.service';
import { RealtimePublisher } from '@/modules/realtime/realtime-publisher.service';
import { notificationAuthorName } from '@/modules/messages/message.format';
import { setMemberTimeout } from '@/modules/servers/member-timeout';
import {
  blocksMessage,
  CompiledAutoModRule,
  isEncryptedContent,
  ruleMatches,
} from './automod-rules';
import { compileSafeRegex } from './safe-regex';

/**
 * How long one instance trusts its copy of a server's rules. A rule change is applied at once on the
 * instance that handled it (`invalidate`) and within this window on every other instance.
 */
const RULE_CACHE_TTL_MS = 15_000;
/** Bounds memory; the oldest entry is dropped first. */
const RULE_CACHE_MAX_SERVERS = 2_000;
const ALERT_EXCERPT_MAX_LENGTH = 500;

export interface AutoModScreenInput {
  userId: string;
  serverId: string;
  /** The channel the message is (or will be) in; a thread reply uses its parent channel. */
  channelId: string;
  /** Every piece of text the message would carry; empty values are ignored. */
  texts: Array<string | null | undefined>;
  /**
   * Set for a webhook post, whose author has no member row: it has no roles to exempt it, cannot be
   * timed out (a timeout rule still fires, is audited and alerts), and alerts name it by this name.
   */
  webhookAuthorName?: string;
}

/** A message to post into a rule's alert channel, as the server owner. */
export interface AutoModAlert {
  serverId: string;
  channelId: string;
  authorId: string;
  content: string;
}

export interface AutoModVerdict {
  /** Name of the rule that blocks the message, or null when it may be stored. */
  blockedBy: string | null;
  alerts: AutoModAlert[];
}

interface CachedServerRules {
  expiresAt: number;
  ownerId: string;
  ownerLocale: string | null;
  rules: CompiledAutoModRule[];
}

const PASS: AutoModVerdict = { blockedBy: null, alerts: [] };

@Injectable()
export class AutoModScreeningService {
  private readonly logger = new Logger(AutoModScreeningService.name);
  private readonly cache = new Map<string, CachedServerRules>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimePublisher,
    private readonly i18n: I18nService,
  ) {}

  invalidate(serverId: string) {
    this.cache.delete(serverId);
  }

  /**
   * Evaluates a send or edit against the server's enabled rules in position order. Every fired rule
   * is audited and applies its timeout here; the caller throws when `blockedBy` is set and posts the
   * alerts. Evaluation stops at the first blocking rule.
   *
   * E2EE ciphertext cannot be evaluated, and any member can produce it with any passphrase, so it is
   * refused outright while a rule applies to this author in this channel. A server without enabled
   * rules, an exempt channel and an exempt role keep encrypted messages working.
   */
  async screen(input: AutoModScreenInput): Promise<AutoModVerdict> {
    const hasEncrypted = input.texts.some(
      (text) => Boolean(text) && isEncryptedContent(text ?? ''),
    );
    const texts = input.texts.filter(
      (text): text is string => Boolean(text?.trim()) && !isEncryptedContent(text ?? ''),
    );
    if (!texts.length && !hasEncrypted) return PASS;

    const server = await this.loadRules(input.serverId);
    const rules = server.rules.filter((rule) => !rule.exemptChannelIds.includes(input.channelId));
    if (!rules.length) return PASS;

    const member =
      input.webhookAuthorName === undefined
        ? await this.prisma.serverMember.findUnique({
            where: { userId_serverId: { userId: input.userId, serverId: input.serverId } },
            select: {
              id: true,
              kind: true,
              timeoutUntil: true,
              roles: { select: { roleId: true } },
              user: { select: { username: true, displayName: true, kind: true } },
            },
          })
        : null;
    // Every member send path has already required membership; nothing to evaluate against otherwise.
    if (!member && input.webhookAuthorName === undefined) return PASS;
    const roleIds = new Set(member?.roles.map((role) => role.roleId));
    const applicable = rules.filter(
      (rule) => !rule.exemptRoleIds.some((roleId) => roleIds.has(roleId)),
    );
    if (hasEncrypted && applicable.length) {
      throw new BadRequestException('Encrypted messages are blocked while AutoMod is enabled');
    }

    const fired: CompiledAutoModRule[] = [];
    let blocking: CompiledAutoModRule | null = null;
    for (const rule of applicable) {
      if (!texts.some((text) => ruleMatches(rule, text))) continue;
      fired.push(rule);
      if (blocksMessage(rule)) {
        blocking = rule;
        break;
      }
    }
    if (!fired.length) return PASS;

    const timeoutUntil = member ? await this.applyTimeout(input.serverId, member, fired) : null;
    await this.prisma.auditLog.createMany({
      data: fired.map((rule) => ({
        serverId: input.serverId,
        actorId: input.userId,
        action: 'AUTOMOD_RULE_TRIGGERED',
        targetId: rule.id,
        metadata: {
          ruleId: rule.id,
          ruleName: rule.name,
          authorId: input.userId,
          channelId: input.channelId,
          action: rule.action,
          blocked: rule === blocking,
          ...(rule.action === 'TIMEOUT_AUTHOR' && timeoutUntil
            ? { timeoutUntil: timeoutUntil.toISOString() }
            : {}),
        },
      })),
    });

    return {
      blockedBy: blocking?.name ?? null,
      alerts: await this.buildAlerts(
        input,
        server,
        (member ? notificationAuthorName(member.user) : undefined) ??
          input.webhookAuthorName ??
          input.userId,
        fired,
        blocking,
        texts,
      ),
    };
  }

  /** The longest duration among the fired timeout rules; never the owner, never shortens a timeout. */
  private async applyTimeout(
    serverId: string,
    member: { id: string; kind: string; timeoutUntil: Date | null },
    fired: CompiledAutoModRule[],
  ) {
    const minutes = Math.max(
      0,
      ...fired
        .filter((rule) => rule.action === 'TIMEOUT_AUTHOR')
        .map((rule) => rule.timeoutMinutes ?? 0),
    );
    if (minutes === 0 || member.kind === 'OWNER') return null;
    const until = new Date(Date.now() + minutes * 60_000);
    if (member.timeoutUntil && member.timeoutUntil >= until) return member.timeoutUntil;
    await setMemberTimeout(this.prisma, this.realtime, serverId, member.id, until);
    return until;
  }

  private async buildAlerts(
    input: AutoModScreenInput,
    server: CachedServerRules,
    authorUsername: string,
    fired: CompiledAutoModRule[],
    blocking: CompiledAutoModRule | null,
    texts: string[],
  ): Promise<AutoModAlert[]> {
    if (!fired.some((rule) => rule.alertChannelId)) return [];

    const channel = await this.prisma.channel.findUnique({
      where: { id: input.channelId },
      select: { name: true },
    });
    const locale = this.i18n.resolveUserLocale(server.ownerLocale);
    const excerpt = truncate(texts.join('\n'), ALERT_EXCERPT_MAX_LENGTH);
    return fired.flatMap((rule) =>
      rule.alertChannelId
        ? [
            {
              serverId: input.serverId,
              channelId: rule.alertChannelId,
              authorId: server.ownerId,
              content: this.i18n.t(
                locale,
                rule === blocking ? 'automod.alert.blocked' : 'automod.alert.flagged',
                {
                  rule: rule.name,
                  author: authorUsername,
                  channel: channel?.name ?? input.channelId,
                  content: excerpt,
                },
              ),
            },
          ]
        : [],
    );
  }

  /** One query per server per TTL window per instance, never one per rule or per message. */
  private async loadRules(serverId: string): Promise<CachedServerRules> {
    const now = Date.now();
    const cached = this.cache.get(serverId);
    if (cached && cached.expiresAt > now) return cached;

    const server = await this.prisma.server.findUnique({
      where: { id: serverId },
      select: {
        ownerId: true,
        owner: { select: { locale: true } },
        autoModRules: { where: { enabled: true }, orderBy: [{ position: 'asc' }, { id: 'asc' }] },
      },
    });
    const entry: CachedServerRules = {
      expiresAt: now + RULE_CACHE_TTL_MS,
      ownerId: server?.ownerId ?? '',
      ownerLocale: server?.owner.locale ?? null,
      rules: (server?.autoModRules ?? []).flatMap((rule) => {
        const regex = rule.pattern !== null ? compileSafeRegex(rule.pattern) : null;
        // Patterns are validated on save, so this only happens if RE2 support changed underneath.
        if (rule.triggerType === 'REGEX' && !regex) {
          this.logger.warn(`AutoMod rule ${rule.id} has a pattern RE2 cannot compile; skipped`);
          return [];
        }
        return [
          {
            id: rule.id,
            name: rule.name,
            triggerType: rule.triggerType,
            terms: rule.terms.map((term) => term.toLowerCase()),
            regex,
            mentionLimit: rule.mentionLimit,
            allowedDomains: rule.allowedDomains,
            action: rule.action,
            alsoAllowMessage: rule.alsoAllowMessage,
            timeoutMinutes: rule.timeoutMinutes,
            alertChannelId: rule.alertChannelId,
            exemptRoleIds: rule.exemptRoleIds,
            exemptChannelIds: rule.exemptChannelIds,
          },
        ];
      }),
    };

    this.cache.delete(serverId);
    if (this.cache.size >= RULE_CACHE_MAX_SERVERS) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    this.cache.set(serverId, entry);
    return entry;
  }
}

function truncate(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}
