import { BadRequestException, Injectable } from '@nestjs/common';
import {
  RealtimeEvents,
  type AcceptServerOnboardingResult,
  type ServerOnboardingView,
} from '@discord-clone/shared';
import { Permission, PermissionsService } from '@/modules/permissions/permissions.service';
import { PrismaService } from '@/modules/prisma/prisma.service';
import { RealtimePublisher } from '@/modules/realtime/realtime-publisher.service';
import { AcceptOnboardingDto } from './dto/accept-onboarding.dto';
import { UpdateOnboardingDto } from './dto/update-onboarding.dto';
import {
  normalizeQuestions,
  offeredQuestions,
  OnboardingRole,
  readStoredQuestions,
  toStoredQuestions,
  validateRoleSelection,
} from './server-onboarding.rules';

/**
 * Rules screening config and acceptance. Enforcement lives in
 * `PermissionsService.requireOnboardingAccepted`; this service only reads, writes and accepts.
 */
@Injectable()
export class ServerOnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
    private readonly realtime: RealtimePublisher,
  ) {}

  async getOnboarding(userId: string, serverId: string): Promise<ServerOnboardingView> {
    const member = await this.permissions.requireMembership(userId, serverId);
    const config = await this.loadConfig(serverId);
    return formatView(config, member.onboardingAcceptedAt !== null);
  }

  async updateOnboarding(
    userId: string,
    serverId: string,
    dto: UpdateOnboardingDto,
  ): Promise<ServerOnboardingView> {
    const member = await this.permissions.requireServerPermission(
      userId,
      serverId,
      Permission.ManageServer,
    );
    const config = await this.loadConfig(serverId);
    const roles = roleMap(config.roles);

    const rulesText = (dto.rulesText ?? config.rulesText ?? '').trim();
    if (dto.enabled && !rulesText) {
      throw new BadRequestException('Rules text is required to turn on screening');
    }

    const currentQuestions = offeredQuestions(
      readStoredQuestions(config.selfAssignQuestions),
      roles,
    );
    const questions = dto.selfAssignQuestions
      ? normalizeQuestions(dto.selfAssignQuestions, roles)
      : currentQuestions;

    // Offering a role is a way of granting it, so adding a role to the offer also needs MANAGE_ROLES.
    // Keeping or removing roles someone else offered does not, so a MANAGE_SERVER holder can still
    // edit the rules text or toggle screening.
    const alreadyOffered = new Set(currentQuestions.flatMap((question) => question.roleIds));
    if (questions.some((question) => question.roleIds.some((id) => !alreadyOffered.has(id)))) {
      await this.permissions.requireServerPermission(userId, serverId, Permission.ManageRoles);
    }

    const [updated] = await this.prisma.$transaction([
      this.prisma.server.update({
        where: { id: serverId },
        data: {
          onboardingEnabled: dto.enabled,
          rulesText: rulesText || null,
          selfAssignQuestions: toStoredQuestions(questions),
        },
        select: configSelect,
      }),
      this.prisma.auditLog.create({
        data: {
          serverId,
          actorId: userId,
          action: 'SERVER_ONBOARDING_UPDATE',
          targetId: serverId,
          metadata: { onboardingEnabled: dto.enabled },
        },
      }),
    ]);
    // Persist first, emit second. Open tabs refetch the server detail, so a member who has not
    // accepted sees the rules gate instead of 403 refusals, and turning screening off lifts it.
    this.realtime.emitToRoom(
      this.realtime.serverRoom(serverId),
      RealtimeEvents.ServerOnboardingUpdated,
      { serverId },
    );
    return formatView(updated, member.onboardingAcceptedAt !== null);
  }

  async acceptOnboarding(
    userId: string,
    serverId: string,
    dto: AcceptOnboardingDto,
  ): Promise<AcceptServerOnboardingResult> {
    const member = await this.permissions.requireMembership(userId, serverId);
    const config = await this.loadConfig(serverId);
    if (!config.onboardingEnabled) {
      throw new BadRequestException('Rules screening is not enabled');
    }

    const questions = offeredQuestions(
      readStoredQuestions(config.selfAssignQuestions),
      roleMap(config.roles),
    );
    const roleIds = [...new Set(dto.roleIds ?? [])];
    validateRoleSelection(questions, roleIds);

    const heldRoleIds = new Set(member.roles.map(({ roleId }) => roleId));
    const grantedRoleIds = await this.prisma.$transaction(async (tx) => {
      // The conditional update makes acceptance one-shot: a repeat or a concurrent second request
      // matches no row and grants nothing, so self-assignment is not reopened after onboarding.
      const { count } = await tx.serverMember.updateMany({
        where: { id: member.id, onboardingAcceptedAt: null },
        data: { onboardingAcceptedAt: new Date() },
      });
      if (count === 0 || !roleIds.length) return [];
      await tx.memberRole.createMany({
        data: roleIds.map((roleId) => ({ memberId: member.id, roleId })),
        skipDuplicates: true,
      });
      return roleIds.filter((roleId) => !heldRoleIds.has(roleId));
    });

    return { ok: true, grantedRoleIds };
  }

  private loadConfig(serverId: string) {
    return this.prisma.server.findFirstOrThrow({
      where: { id: serverId, deletedAt: null },
      select: configSelect,
    });
  }
}

const configSelect = {
  onboardingEnabled: true,
  rulesText: true,
  selfAssignQuestions: true,
  roles: { select: { id: true, name: true, permissions: true } },
} as const;

type OnboardingConfig = {
  onboardingEnabled: boolean;
  rulesText: string | null;
  selfAssignQuestions: Parameters<typeof readStoredQuestions>[0];
  roles: OnboardingRole[];
};

function roleMap(roles: OnboardingRole[]) {
  return new Map(roles.map((role) => [role.id, role]));
}

function formatView(config: OnboardingConfig, accepted: boolean): ServerOnboardingView {
  return {
    enabled: config.onboardingEnabled,
    rulesText: config.rulesText,
    selfAssignQuestions: offeredQuestions(
      readStoredQuestions(config.selfAssignQuestions),
      roleMap(config.roles),
    ),
    accepted,
  };
}
