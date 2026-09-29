import type { Prisma } from '@prisma/client';
import { deleteBotWithMemberships } from '@/modules/bots/bot-memberships';
import { DELETED_USER_DISPLAY_NAME } from './account-deletion.rules';

export interface AnonymizedAccount {
  /** Servers the account was a member of, for the realtime roster update. */
  serverIds: string[];
  /** Private export files to remove once the transaction has committed. */
  exportFileKeys: string[];
  /** Bots the account owned, deleted with it, and the servers each one left. */
  removedBots: Array<{ botId: string; botUserId: string; serverIds: string[] }>;
  /** The account's avatar/banner just before they were nulled, for post-commit orphan cleanup. */
  avatarUrl: string | null;
  bannerUrl: string | null;
  /** Pre-anonymization identity, for the `ACCOUNT_DELETION` platform audit snapshot. */
  username: string | null;
  displayName: string | null;
}

export type AnonymizationOutcome =
  | { status: 'ANONYMIZED'; account: AnonymizedAccount }
  | { status: 'OWNS_SERVERS' }
  | { status: 'NOT_DUE' };

/**
 * Anonymizes one account whose grace period has passed. Runs inside a single transaction: the
 * conditional `updateMany` on the user row is the claim, so a concurrent sweep on another instance
 * gets `NOT_DUE`, and a failure anywhere rolls the claim back for the next tick.
 *
 * The `User` row is kept because required relations without a cascade (message author, audit actor,
 * poll creator, ...) still point at it. What goes is everything that identifies the person or is
 * private to them; content other members see stays, attributed to "Deleted User".
 */
export async function anonymizeAccount(
  tx: Prisma.TransactionClient,
  userId: string,
  now: Date,
  unusablePasswordHash: string,
): Promise<AnonymizationOutcome> {
  // Re-checked here: ownership cannot be transferred in, but a server created just before the
  // request's sessions were revoked would otherwise be left with an anonymous owner.
  const ownedServers = await tx.server.count({ where: { ownerId: userId, deletedAt: null } });
  if (ownedServers > 0) return { status: 'OWNS_SERVERS' };

  // Read before the `updateMany` below nulls them, so the caller can clean up the files once this
  // transaction has committed (upload-ownership.md rule 6) — mirroring `exportFileKeys` below.
  const before = await tx.user.findUnique({
    where: { id: userId },
    select: { avatarUrl: true, bannerUrl: true, username: true, displayName: true },
  });

  const { count } = await tx.user.updateMany({
    where: { id: userId, deletionScheduledAt: { lte: now }, deletionCompletedAt: null },
    data: {
      email: `deleted-${userId}@deleted.invalid`,
      username: `deleted-${userId}`,
      displayName: DELETED_USER_DISPLAY_NAME,
      passwordHash: unusablePasswordHash,
      avatarUrl: null,
      bio: null,
      bannerUrl: null,
      pronouns: null,
      customStatusText: null,
      customStatusEmoji: null,
      customStatusExpiresAt: null,
      locale: null,
      status: 'OFFLINE',
      emailVerifiedAt: null,
      twoFactorSecret: null,
      twoFactorPendingSecret: null,
      twoFactorEnabledAt: null,
      twoFactorLastUsedStep: null,
      deletionCompletedAt: now,
    },
  });
  if (count === 0) return { status: 'NOT_DUE' };

  const memberships = await tx.serverMember.findMany({
    where: { userId },
    select: { serverId: true },
  });
  const exportJobs = await tx.exportJob.findMany({
    where: { userId, fileKey: { not: null } },
    select: { fileKey: true },
  });

  const removedBots = await deleteOwnedBots(tx, userId);
  await deletePrivateAccountRows(tx, userId);
  await leaveGroupConversations(tx, userId);
  await anonymizeNameSnapshots(tx, userId);

  return {
    status: 'ANONYMIZED',
    account: {
      serverIds: memberships.map((membership) => membership.serverId),
      exportFileKeys: exportJobs.flatMap((job) => (job.fileKey ? [job.fileKey] : [])),
      removedBots,
      avatarUrl: before?.avatarUrl ?? null,
      bannerUrl: before?.bannerUrl ?? null,
      username: before?.username ?? null,
      displayName: before?.displayName ?? null,
    },
  };
}

/**
 * A bot cannot outlive its owner: each one leaves its servers (audited as `BOT_REMOVE`) and its token
 * stops working. Its User row stays, like any author, so its messages keep their author. The bots have
 * been refused by the bot token guard since the deletion was requested.
 */
async function deleteOwnedBots(tx: Prisma.TransactionClient, userId: string) {
  const bots = await tx.bot.findMany({
    where: { ownerId: userId },
    select: { id: true, name: true, botUserId: true },
  });
  const removed: AnonymizedAccount['removedBots'] = [];
  for (const bot of bots) {
    removed.push({
      botId: bot.id,
      botUserId: bot.botUserId,
      serverIds: await deleteBotWithMemberships(tx, bot, userId),
    });
  }
  return removed;
}

/** Credentials, devices, per-user state and relationships: nothing another member reads as history. */
async function deletePrivateAccountRows(tx: Prisma.TransactionClient, userId: string) {
  await tx.session.deleteMany({ where: { userId } });
  await tx.oAuthAccount.deleteMany({ where: { userId } });
  await tx.oAuthLoginCode.deleteMany({ where: { userId } });
  await tx.passwordResetToken.deleteMany({ where: { userId } });
  await tx.emailVerificationToken.deleteMany({ where: { userId } });
  await tx.twoFactorRecoveryCode.deleteMany({ where: { userId } });
  await tx.pushSubscription.deleteMany({ where: { userId } });
  await tx.pushNotificationThrottle.deleteMany({ where: { userId } });
  await tx.notificationPreference.deleteMany({ where: { userId } });
  await tx.readState.deleteMany({ where: { userId } });
  await tx.directReadState.deleteMany({ where: { userId } });
  await tx.threadParticipant.deleteMany({ where: { userId } });
  await tx.serverEventInterest.deleteMany({ where: { userId } });
  // Other members' inbox items this account triggered embed its display name in `title`.
  await tx.notification.deleteMany({ where: { OR: [{ userId }, { actorId: userId }] } });
  await tx.friendRequest.deleteMany({
    where: { OR: [{ requesterId: userId }, { receiverId: userId }] },
  });
  await tx.userBlock.deleteMany({ where: { OR: [{ blockerId: userId }, { blockedId: userId }] } });
  // Notes about this account too: the identity they described no longer exists.
  await tx.userNote.deleteMany({ where: { OR: [{ authorId: userId }, { targetId: userId }] } });
  await tx.savedMessage.deleteMany({ where: { ownerId: userId } });
  // Also the rows failed at request time; none can send, since the author has no claimable rows.
  await tx.scheduledMessage.deleteMany({ where: { authorId: userId } });
  await tx.exportJob.deleteMany({ where: { userId } });
  // Stage rows cascade only on a User delete, and an anonymized user row is kept.
  await tx.stageSpeaker.deleteMany({ where: { userId } });
  await tx.stageSpeakRequest.deleteMany({ where: { userId } });
  // Only the author or a moderator on a filed report ever reads a revision, so the edit history is
  // private to the account; the live Message.content stays (docs/features/message-edit-history.md).
  await tx.messageRevision.deleteMany({ where: { message: { authorId: userId } } });
  // Leaves every server; MemberRole and member-scoped ChannelPermissionOverride rows cascade.
  await tx.serverMember.deleteMany({ where: { userId } });
}

/**
 * Leaves group conversations the same way `DirectConversationsService.removeMember` does: an empty
 * group is deleted, and an owned group passes to the longest-standing member. One-to-one
 * conversations keep their membership so the other participant keeps the history.
 */
async function leaveGroupConversations(tx: Prisma.TransactionClient, userId: string) {
  const groups = await tx.directConversationMember.findMany({
    where: { userId, conversation: { isGroup: true } },
    select: { conversationId: true, conversation: { select: { ownerId: true } } },
  });
  for (const { conversationId, conversation } of groups) {
    await tx.directConversationMember.delete({
      where: { conversationId_userId: { conversationId, userId } },
    });
    const next = await tx.directConversationMember.findFirst({
      where: { conversationId },
      orderBy: { joinedAt: 'asc' },
      select: { userId: true },
    });
    if (!next) {
      await tx.directConversation.delete({ where: { id: conversationId } });
    } else if (conversation.ownerId === userId) {
      await tx.directConversation.update({
        where: { id: conversationId },
        data: { ownerId: next.userId },
      });
    }
  }
}

/**
 * Copies of this account's display name taken at forward or save time. Forward snapshots store the
 * source message id, not its author, so they are matched through the source row; a forward whose
 * source row no longer exists cannot be matched and keeps the old name.
 */
async function anonymizeNameSnapshots(tx: Prisma.TransactionClient, userId: string) {
  await tx.savedMessage.updateMany({
    where: { snapshotAuthorId: userId },
    data: { snapshotAuthorName: DELETED_USER_DISPLAY_NAME },
  });
  await tx.$executeRaw`
    UPDATE "Message" SET "forwardOriginAuthorName" = ${DELETED_USER_DISPLAY_NAME}
    WHERE "forwardOriginAuthorName" IS NOT NULL
      AND (
        "forwardedFromMessageId" IN (SELECT "id" FROM "Message" WHERE "authorId" = ${userId})
        OR "forwardedFromDirectMessageId" IN (SELECT "id" FROM "DirectMessage" WHERE "authorId" = ${userId})
      )`;
  await tx.$executeRaw`
    UPDATE "DirectMessage" SET "forwardOriginAuthorName" = ${DELETED_USER_DISPLAY_NAME}
    WHERE "forwardOriginAuthorName" IS NOT NULL
      AND (
        "forwardedFromMessageId" IN (SELECT "id" FROM "Message" WHERE "authorId" = ${userId})
        OR "forwardedFromDirectMessageId" IN (SELECT "id" FROM "DirectMessage" WHERE "authorId" = ${userId})
      )`;
}
