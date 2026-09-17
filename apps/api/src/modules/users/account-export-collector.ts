import type { PrismaService } from '@/modules/prisma/prisma.service';
import { ACCOUNT_EXPORT_LIST_LIMIT, ACCOUNT_EXPORT_MESSAGE_LIMIT } from './account-deletion.rules';

const attachmentSelect = {
  fileName: true,
  mimeType: true,
  byteSize: true,
  url: true,
  kind: true,
} as const;

/** A bounded list, flagged when the ceiling cut it short. */
function bounded<T>(rows: T[], limit: number) {
  return rows.length > limit
    ? { items: rows.slice(0, limit), truncated: true }
    : { items: rows, truncated: false };
}

/** The other side of a relationship is named by its public identity only. */
const publicUserSelect = { username: true, displayName: true } as const;

/**
 * Collects the owner's own data for `POST /users/me/export`.
 *
 * Only rows the owner wrote or owns are included. Never included: password hash, 2FA secrets and
 * recovery codes, session and refresh tokens, OAuth provider ids, push subscription keys, other
 * people's message content (direct-message replies, forwarded snapshots, saved snapshots of someone
 * else's message), reports filed against the owner, and who reported them.
 */
export async function collectAccountExport(prisma: PrismaService, userId: string, now: Date) {
  const [profile, linkedAccounts, memberships, messages, directMessages] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        username: true,
        displayName: true,
        avatarUrl: true,
        bio: true,
        bannerUrl: true,
        pronouns: true,
        customStatusText: true,
        customStatusEmoji: true,
        locale: true,
        emailVerifiedAt: true,
        twoFactorEnabledAt: true,
        createdAt: true,
      },
    }),
    prisma.oAuthAccount.findMany({
      where: { userId },
      select: { provider: true, createdAt: true },
    }),
    prisma.serverMember.findMany({
      where: { userId },
      take: ACCOUNT_EXPORT_LIST_LIMIT + 1,
      select: {
        serverId: true,
        nickname: true,
        joinedAt: true,
        onboardingAcceptedAt: true,
        server: { select: { name: true } },
        roles: { select: { role: { select: { name: true } } } },
      },
    }),
    prisma.message.findMany({
      where: { authorId: userId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      take: ACCOUNT_EXPORT_MESSAGE_LIMIT + 1,
      select: {
        id: true,
        serverId: true,
        channelId: true,
        threadId: true,
        replyToMessageId: true,
        content: true,
        forwardOriginAuthorName: true,
        createdAt: true,
        editedAt: true,
        channel: { select: { name: true, server: { select: { name: true } } } },
        threadRoot: { select: { title: true } },
        attachments: { select: attachmentSelect },
      },
    }),
    prisma.directMessage.findMany({
      where: { authorId: userId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      take: ACCOUNT_EXPORT_MESSAGE_LIMIT + 1,
      select: {
        id: true,
        conversationId: true,
        replyToMessageId: true,
        content: true,
        forwardOriginAuthorName: true,
        createdAt: true,
        editedAt: true,
        attachments: { select: attachmentSelect },
      },
    }),
  ]);

  const [friendRequests, blocks, savedMessages, scheduledMessages] = await Promise.all([
    prisma.friendRequest.findMany({
      where: { OR: [{ requesterId: userId }, { receiverId: userId }] },
      take: ACCOUNT_EXPORT_LIST_LIMIT + 1,
      select: {
        requesterId: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        requester: { select: publicUserSelect },
        receiver: { select: publicUserSelect },
      },
    }),
    prisma.userBlock.findMany({
      where: { blockerId: userId },
      take: ACCOUNT_EXPORT_LIST_LIMIT + 1,
      select: { createdAt: true, blocked: { select: publicUserSelect } },
    }),
    prisma.savedMessage.findMany({
      where: { ownerId: userId },
      take: ACCOUNT_EXPORT_LIST_LIMIT + 1,
      select: {
        sourceType: true,
        serverId: true,
        channelId: true,
        conversationId: true,
        originalMessageId: true,
        snapshotAuthorId: true,
        snapshotContent: true,
        remindAt: true,
        createdAt: true,
      },
    }),
    prisma.scheduledMessage.findMany({
      where: { authorId: userId },
      take: ACCOUNT_EXPORT_LIST_LIMIT + 1,
      select: {
        channelId: true,
        conversationId: true,
        content: true,
        sendAt: true,
        status: true,
        failureReason: true,
        createdAt: true,
      },
    }),
  ]);

  const [polls, pollVotes, reportsFiled, notificationPreferences, pushDevices] = await Promise.all([
    prisma.poll.findMany({
      where: { creatorId: userId },
      take: ACCOUNT_EXPORT_LIST_LIMIT + 1,
      select: {
        id: true,
        messageId: true,
        directMessageId: true,
        question: true,
        allowMultiple: true,
        expiresAt: true,
        closedAt: true,
        createdAt: true,
        options: { orderBy: { position: 'asc' }, select: { label: true } },
      },
    }),
    prisma.pollVote.findMany({
      where: { userId },
      take: ACCOUNT_EXPORT_LIST_LIMIT + 1,
      select: { pollId: true, createdAt: true, option: { select: { label: true } } },
    }),
    prisma.messageReport.findMany({
      where: { reporterId: userId },
      take: ACCOUNT_EXPORT_LIST_LIMIT + 1,
      select: {
        serverId: true,
        targetType: true,
        messageId: true,
        reason: true,
        details: true,
        status: true,
        createdAt: true,
      },
    }),
    prisma.notificationPreference.findMany({
      where: { userId },
      take: ACCOUNT_EXPORT_LIST_LIMIT + 1,
      select: {
        serverId: true,
        channelId: true,
        muted: true,
        mentionOnly: true,
        desktopEnabled: true,
      },
    }),
    prisma.pushSubscription.findMany({
      where: { userId },
      take: ACCOUNT_EXPORT_LIST_LIMIT + 1,
      select: { deviceName: true, createdAt: true },
    }),
  ]);
  // The token hash is never selected; the owner regenerates a token rather than recovering one.
  const bots = await prisma.bot.findMany({
    where: { ownerId: userId },
    take: ACCOUNT_EXPORT_LIST_LIMIT + 1,
    select: {
      id: true,
      name: true,
      avatarUrl: true,
      createdAt: true,
      botUser: {
        select: {
          username: true,
          memberships: { select: { serverId: true, server: { select: { name: true } } } },
        },
      },
    },
  });

  // Server assets the owner uploaded. The server keeps them after the account is deleted.
  const assetSelect = {
    name: true,
    url: true,
    createdAt: true,
    serverId: true,
    server: { select: { name: true } },
  } as const;
  const [createdStickers, createdSoundboardClips] = await Promise.all([
    prisma.serverSticker.findMany({
      where: { creatorId: userId },
      take: ACCOUNT_EXPORT_LIST_LIMIT + 1,
      select: assetSelect,
    }),
    prisma.soundboardClip.findMany({
      where: { creatorId: userId },
      take: ACCOUNT_EXPORT_LIST_LIMIT + 1,
      select: { ...assetSelect, durationMs: true },
    }),
  ]);

  const { twoFactorEnabledAt, ...profileFields } = profile;

  return {
    format: 'discords-account-export',
    version: 1,
    generatedAt: now,
    profile: { ...profileFields, twoFactorEnabled: twoFactorEnabledAt !== null },
    linkedAccounts,
    memberships: bounded(
      memberships.map((membership) => ({
        serverId: membership.serverId,
        serverName: membership.server.name,
        nickname: membership.nickname,
        joinedAt: membership.joinedAt,
        rulesAcceptedAt: membership.onboardingAcceptedAt,
        roles: membership.roles.map((memberRole) => memberRole.role.name),
      })),
      ACCOUNT_EXPORT_LIST_LIMIT,
    ),
    // A forward's snapshot is someone else's words; only the fact that it was a forward is kept.
    messages: bounded(
      messages.map(({ channel, forwardOriginAuthorName, threadRoot, ...message }) => ({
        ...message,
        channelName: channel.name,
        serverName: channel.server.name,
        forumPostTitle: threadRoot?.title ?? null,
        isForward: forwardOriginAuthorName !== null,
      })),
      ACCOUNT_EXPORT_MESSAGE_LIMIT,
    ),
    directMessages: bounded(
      directMessages.map(({ forwardOriginAuthorName, ...message }) => ({
        ...message,
        isForward: forwardOriginAuthorName !== null,
      })),
      ACCOUNT_EXPORT_MESSAGE_LIMIT,
    ),
    friends: bounded(
      friendRequests.map((request) => {
        const sent = request.requesterId === userId;
        return {
          direction: sent ? 'SENT' : 'RECEIVED',
          user: sent ? request.receiver : request.requester,
          status: request.status,
          createdAt: request.createdAt,
          updatedAt: request.updatedAt,
        };
      }),
      ACCOUNT_EXPORT_LIST_LIMIT,
    ),
    blockedUsers: bounded(
      blocks.map((block) => ({ user: block.blocked, blockedAt: block.createdAt })),
      ACCOUNT_EXPORT_LIST_LIMIT,
    ),
    // The bookmark is the owner's; the snapshot text is included only when the owner wrote it.
    savedMessages: bounded(
      savedMessages.map(({ snapshotAuthorId, snapshotContent, ...saved }) => ({
        ...saved,
        snapshotContent: snapshotAuthorId === userId ? snapshotContent : null,
      })),
      ACCOUNT_EXPORT_LIST_LIMIT,
    ),
    scheduledMessages: bounded(scheduledMessages, ACCOUNT_EXPORT_LIST_LIMIT),
    polls: bounded(
      polls.map((poll) => ({ ...poll, options: poll.options.map((option) => option.label) })),
      ACCOUNT_EXPORT_LIST_LIMIT,
    ),
    pollVotes: bounded(
      pollVotes.map((vote) => ({
        pollId: vote.pollId,
        option: vote.option.label,
        createdAt: vote.createdAt,
      })),
      ACCOUNT_EXPORT_LIST_LIMIT,
    ),
    reportsFiled: bounded(reportsFiled, ACCOUNT_EXPORT_LIST_LIMIT),
    notificationPreferences: bounded(notificationPreferences, ACCOUNT_EXPORT_LIST_LIMIT),
    pushDevices: bounded(pushDevices, ACCOUNT_EXPORT_LIST_LIMIT),
    bots: bounded(
      bots.map(({ botUser, ...bot }) => ({
        ...bot,
        username: botUser.username,
        servers: botUser.memberships.map((membership) => ({
          serverId: membership.serverId,
          serverName: membership.server.name,
        })),
      })),
      ACCOUNT_EXPORT_LIST_LIMIT,
    ),
    createdStickers: bounded(
      createdStickers.map(({ server, ...sticker }) => ({ ...sticker, serverName: server.name })),
      ACCOUNT_EXPORT_LIST_LIMIT,
    ),
    createdSoundboardClips: bounded(
      createdSoundboardClips.map(({ server, ...clip }) => ({ ...clip, serverName: server.name })),
      ACCOUNT_EXPORT_LIST_LIMIT,
    ),
  };
}
