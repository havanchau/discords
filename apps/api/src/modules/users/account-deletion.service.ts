import { BadRequestException, ConflictException, Injectable, Logger } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import type { AccountDeletedPayload, AccountDeletionScheduledResult } from '@discord-clone/shared';
import { RedisFixedWindowLimiter } from '@/common/redis-fixed-window-limiter';
import { TwoFactorService } from '@/modules/auth/two-factor.service';
import { PlatformAuditService } from '@/modules/platform/platform-audit.service';
import { PrismaService } from '@/modules/prisma/prisma.service';
import { RealtimePublisher } from '@/modules/realtime/realtime-publisher.service';
import { PrivateFileStorageService } from '@/modules/uploads/private-file-storage.service';
import { UploadsService } from '@/modules/uploads/uploads.service';
import { anonymizeAccount } from './account-anonymization';
import {
  ACCOUNT_ANONYMIZATION_TIMEOUT_MS,
  ACCOUNT_DELETION_CANCEL_LIMIT,
  ACCOUNT_DELETION_CANCEL_WINDOW_MS,
  ACCOUNT_DELETION_GRACE_MS,
  ACCOUNT_DELETION_REQUEST_LIMIT,
  ACCOUNT_DELETION_REQUEST_WINDOW_MS,
} from './account-deletion.rules';
import type { CancelAccountDeletionDto, DeleteAccountDto } from './dto/delete-account.dto';

@Injectable()
export class AccountDeletionService {
  private readonly logger = new Logger(AccountDeletionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly twoFactor: TwoFactorService,
    private readonly realtime: RealtimePublisher,
    private readonly storage: PrivateFileStorageService,
    private readonly limiter: RedisFixedWindowLimiter,
    private readonly uploads: UploadsService,
    private readonly platformAudit: PlatformAuditService,
  ) {}

  /** Per account, counted in Redis so the ceiling holds across API instances. */
  hitRequestLimit(userId: string) {
    return this.limiter.hit(
      `account-deletion:${userId}`,
      ACCOUNT_DELETION_REQUEST_LIMIT,
      ACCOUNT_DELETION_REQUEST_WINDOW_MS,
    );
  }

  /**
   * Per email address, not per user id: an unknown address is counted the same way, so the limit
   * does not reveal which addresses have an account.
   */
  hitCancelLimit(email: string) {
    return this.limiter.hit(
      `account-deletion-cancel:${email.trim().toLowerCase()}`,
      ACCOUNT_DELETION_CANCEL_LIMIT,
      ACCOUNT_DELETION_CANCEL_WINDOW_MS,
    );
  }

  async requestDeletion(
    userId: string,
    dto: DeleteAccountDto,
  ): Promise<AccountDeletionScheduledResult> {
    // Ownership first, so a blocked request does not spend a one-time code.
    await this.assertNoOwnedServers(userId);
    await this.twoFactor.verifyReauthentication(userId, dto.password, dto.code, {
      requireSecondFactor: true,
    });

    const now = new Date();
    const scheduledAt = new Date(now.getTime() + ACCOUNT_DELETION_GRACE_MS);
    const revokedSessionIds = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.user.updateMany({
        where: { id: userId, deletionRequestedAt: null },
        data: { deletionRequestedAt: now, deletionScheduledAt: scheduledAt },
      });
      if (count === 0) throw new ConflictException('Account deletion is already scheduled');

      // Nothing is posted in the name of an account that asked to be deleted, cancelled or not.
      await tx.scheduledMessage.updateMany({
        where: { authorId: userId, status: 'PENDING' },
        data: { status: 'FAILED', failureReason: 'ACCOUNT_DELETION' },
      });
      // Includes the caller's own session: the response still goes out, the token stops working.
      const sessions = await tx.session.findMany({
        where: { userId, revokedAt: null },
        select: { id: true },
      });
      await tx.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now },
      });
      return sessions.map((session) => session.id);
    });
    await this.realtime.disconnectSessions(userId, revokedSessionIds);
    this.logger.log(`Account deletion scheduled for user ${userId}`);
    return { ok: true, scheduledAt };
  }

  /**
   * Public: the account has no session left. The password is the proof, plus the authenticator or
   * recovery code when two-factor authentication is enabled, so a leaked password alone cannot tell
   * an attacker it is correct. An unknown email, a wrong password and a wrong code get the same error.
   */
  async cancelDeletion(dto: CancelAccountDeletionDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
      select: { id: true, deletionRequestedAt: true },
    });
    if (!user) throw new BadRequestException('Invalid password or code');
    await this.twoFactor.verifyReauthentication(user.id, dto.password, dto.code, {
      requireSecondFactor: true,
    });
    if (!user.deletionRequestedAt) {
      throw new ConflictException('Account is not scheduled for deletion');
    }

    const { count } = await this.prisma.user.updateMany({
      where: { id: user.id, deletionCompletedAt: null, deletionScheduledAt: { gt: new Date() } },
      data: { deletionRequestedAt: null, deletionScheduledAt: null },
    });
    if (count === 0) throw new ConflictException('Deletion already completed');
    this.logger.log(`Account deletion cancelled for user ${user.id}`);
    return { ok: true };
  }

  /** Called by the sweep for one due account; persist first, then emit, then remove files. */
  async completeDeletion(userId: string, now: Date) {
    // Hashed before the transaction: bcrypt is slow and must not hold the connection.
    const unusablePasswordHash = await bcrypt.hash(randomBytes(32).toString('base64url'), 12);
    const outcome = await this.prisma.$transaction(
      (tx) => anonymizeAccount(tx, userId, now, unusablePasswordHash),
      { timeout: ACCOUNT_ANONYMIZATION_TIMEOUT_MS },
    );

    if (outcome.status === 'OWNS_SERVERS') {
      this.logger.warn(`Account deletion for user ${userId} is blocked: the account owns a server`);
      return;
    }
    if (outcome.status === 'NOT_DUE') return;

    // The first persisted record of an account deletion at all — until now this event only ever
    // reached the application logger (docs/features/platform-audit-log.md). Anonymization already
    // committed above; a failure here means a missing audit row, not a silently-failed deletion
    // (docs/features/platform-audit-log.md Risks & rollback).
    try {
      await this.platformAudit.record('ACCOUNT_DELETION', {
        actorId: userId,
        actorUsername: outcome.account.username ?? undefined,
        actorDisplayName: outcome.account.displayName ?? undefined,
        targetType: 'USER',
        targetId: userId,
        targetName: outcome.account.displayName ?? undefined,
      });
    } catch (error) {
      this.logger.error(
        `Could not write the platform audit row for deleted account ${userId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    const payload: AccountDeletedPayload = { userId };
    this.realtime.emitToRooms(
      [
        ...outcome.account.serverIds.map((serverId) => this.realtime.serverRoom(serverId)),
        this.realtime.userRoom(userId),
      ],
      'user:account-deleted',
      payload,
    );
    // Open member lists drop the account's bots too; they left every server in the same transaction.
    for (const bot of outcome.account.removedBots) {
      for (const serverId of bot.serverIds) {
        this.realtime.emitToRoom(this.realtime.serverRoom(serverId), 'server:member-removed', {
          serverId,
          userId: bot.botUserId,
          reason: 'KICK',
        });
      }
      // The Bot row is already gone (deleted in the same transaction), so the gateway socket is
      // disconnected directly by id rather than through a lookup that would now miss.
      this.realtime.disconnectBotSocket(bot.botId);
    }
    await Promise.all(outcome.account.exportFileKeys.map((key) => this.storage.removeQuietly(key)));
    // De-duplicated: an account whose avatar and banner were the same upload is checked once, not
    // attempted twice (upload-ownership.md edge cases).
    const orphanCandidates = new Set(
      [outcome.account.avatarUrl, outcome.account.bannerUrl].filter(
        (url): url is string => url !== null,
      ),
    );
    await Promise.all(
      [...orphanCandidates].map((url) => this.uploads.deleteUploadIfUnreferenced(url)),
    );
    this.logger.log(`Account deletion completed for user ${userId}`);
  }

  private async assertNoOwnedServers(userId: string) {
    const owned = await this.prisma.server.count({ where: { ownerId: userId, deletedAt: null } });
    if (owned > 0) {
      throw new ConflictException(
        'Transfer ownership or delete each server you own before deleting your account',
      );
    }
  }
}
