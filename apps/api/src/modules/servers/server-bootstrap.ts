import type { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import type { SelfAssignQuestion } from '@discord-clone/shared';
import { isSelfAssignableRole, toStoredQuestions } from './server-onboarding.rules';
import { EVERYONE_ROLE_NAME, type TemplateSnapshot } from './server-template.rules';

export const DEFAULT_MEMBER_PERMISSIONS = [
  'VIEW_CHANNEL',
  'SEND_MESSAGES',
  'CREATE_INVITE',
  'CONNECT_VOICE',
  'SPEAK_VOICE',
  'UPLOAD_FILES',
];

/** What a server created from scratch gets: `@everyone` with the defaults and one `general` channel. */
export const EMPTY_SERVER_SNAPSHOT: TemplateSnapshot = {
  roles: [],
  categories: [],
  channels: [],
  overrides: [],
  onboarding: null,
};

const FALLBACK_CHANNEL_NAME = 'general';

/**
 * Creates a server owned by `ownerId` and replays a snapshot into it, inside the caller's transaction.
 * The owner membership, the `@everyone` role and its grant, and at least one TEXT channel
 * (RULE.md) are guaranteed whatever the snapshot holds. The snapshot must already have been read
 * through `readTemplateSnapshot`, so names are unique and every index points at an entry.
 * Members, messages, invites, bans, emoji, stickers, soundboard clips and AutoMod rules are never part
 * of a snapshot.
 */
export async function createServerFromSnapshot(
  tx: Prisma.TransactionClient,
  ownerId: string,
  input: { name: string; description?: string | null },
  snapshot: TemplateSnapshot,
) {
  const onboarding = snapshot.onboarding;
  const server = await tx.server.create({
    data: {
      name: input.name,
      description: input.description,
      ownerId,
      onboardingEnabled: onboarding?.enabled ?? false,
      rulesText: onboarding?.rulesText ?? null,
    },
  });

  // `@everyone` is always position 0, whatever position the template stored for it.
  const everyone = snapshot.roles.find((role) => role.name === EVERYONE_ROLE_NAME);
  const roleRows = [
    {
      serverId: server.id,
      name: EVERYONE_ROLE_NAME,
      color: null,
      position: 0,
      permissions: everyone?.permissions ?? DEFAULT_MEMBER_PERMISSIONS,
    },
    ...snapshot.roles
      .filter((role) => role.name !== EVERYONE_ROLE_NAME)
      .map((role) => ({ ...role, serverId: server.id })),
  ];
  const roles = await tx.role.createManyAndReturn({
    data: roleRows,
    select: { id: true, name: true, permissions: true },
  });
  // Role names are unique per server, so the name identifies the created row.
  const rolesByName = new Map(roles.map((role) => [role.name, role]));
  const roleAt = (index: number) => rolesByName.get(snapshot.roles[index]?.name ?? '');
  const everyoneRole = rolesByName.get(EVERYONE_ROLE_NAME);

  const ownerMember = await tx.serverMember.create({
    data: { userId: ownerId, serverId: server.id, kind: 'OWNER' },
  });
  if (everyoneRole) {
    await tx.memberRole.create({ data: { memberId: ownerMember.id, roleId: everyoneRole.id } });
  }

  const categoryIds: string[] = [];
  for (const category of snapshot.categories) {
    const created = await tx.channelCategory.create({
      data: { serverId: server.id, name: category.name, position: category.position },
      select: { id: true },
    });
    categoryIds.push(created.id);
  }

  const channelRows = snapshot.channels.map((channel) => ({
    serverId: server.id,
    name: channel.name,
    type: channel.type,
    topic: channel.topic,
    categoryId:
      channel.categoryIndex === null ? null : (categoryIds[channel.categoryIndex] ?? null),
    position: channel.position,
    isPrivate: channel.isPrivate,
    slowmodeSeconds: channel.slowmodeSeconds,
    postGuidelines: channel.type === 'FORUM' ? channel.postGuidelines : null,
  }));
  if (!channelRows.some((row) => row.type === 'TEXT')) {
    channelRows.push({
      serverId: server.id,
      name: availableChannelName(channelRows.map((row) => row.name)),
      type: 'TEXT',
      topic: null,
      categoryId: null,
      position: channelRows.length,
      isPrivate: false,
      slowmodeSeconds: 0,
      postGuidelines: null,
    });
  }
  const channels = await tx.channel.createManyAndReturn({
    data: channelRows,
    select: { id: true, name: true },
  });
  // Channel names are unique per server as well.
  const channelIdsByName = new Map(channels.map((channel) => [channel.name, channel.id]));
  const channelIdAt = (index: number) => channelIdsByName.get(snapshot.channels[index]?.name ?? '');

  const forumTags = snapshot.channels.flatMap((channel) => {
    const channelId = channel.type === 'FORUM' ? channelIdsByName.get(channel.name) : undefined;
    return channelId
      ? channel.forumTags.map((name, position) => ({ channelId, name, position }))
      : [];
  });
  if (forumTags.length) await tx.forumTag.createMany({ data: forumTags });

  const overrides = snapshot.overrides.flatMap((override) => {
    const channelId = channelIdAt(override.channelIndex);
    const roleId = override.roleIndex === null ? undefined : roleAt(override.roleIndex)?.id;
    if (!channelId || (!override.memberSelf && !roleId)) return [];
    return [
      {
        channelId,
        roleId: override.memberSelf ? null : roleId,
        memberId: override.memberSelf ? ownerMember.id : null,
        allow: override.allow,
        deny: override.deny,
      },
    ];
  });
  if (overrides.length) await tx.channelPermissionOverride.createMany({ data: overrides });

  const questions = (onboarding?.questions ?? []).flatMap((question): SelfAssignQuestion[] => {
    // A role that carries moderation rights is never offered, the same rule settings apply.
    const roleIds = question.roleIndexes.flatMap((index) => {
      const role = roleAt(index);
      return role && isSelfAssignableRole(role) ? [role.id] : [];
    });
    return roleIds.length
      ? [{ id: randomUUID(), prompt: question.prompt, roleIds, multiSelect: question.multiSelect }]
      : [];
  });
  if (questions.length) {
    await tx.server.update({
      where: { id: server.id },
      data: { selfAssignQuestions: toStoredQuestions(questions) },
    });
  }

  return server;
}

function availableChannelName(taken: string[]) {
  const names = new Set(taken);
  let candidate = FALLBACK_CHANNEL_NAME;
  for (let suffix = 2; names.has(candidate); suffix += 1) {
    candidate = `${FALLBACK_CHANNEL_NAME}-${suffix}`;
  }
  return candidate;
}
