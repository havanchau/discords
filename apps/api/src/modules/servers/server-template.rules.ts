import type { ChannelType, Prisma } from '@prisma/client';
import {
  FORUM_MAX_TAGS,
  FORUM_POST_GUIDELINES_MAX_LENGTH,
  FORUM_TAG_NAME_MAX_LENGTH,
  ONBOARDING_MAX_QUESTIONS,
  ONBOARDING_MAX_ROLES_PER_QUESTION,
  ONBOARDING_PROMPT_MAX_LENGTH,
  ONBOARDING_RULES_MAX_LENGTH,
  ownerPermissions,
  SERVER_TEMPLATE_MAX_CATEGORIES,
  SERVER_TEMPLATE_MAX_CHANNELS,
  SERVER_TEMPLATE_MAX_OVERRIDES,
  SERVER_TEMPLATE_MAX_ROLES,
} from '@discord-clone/shared';
import { slugifyChannelName } from '@/common/slugify';
import { SLOWMODE_OPTIONS_SECONDS } from '@/modules/messages/slowmode';

/*
 * A template references its own entries by array index, because the ids of the server it will create
 * do not exist yet. Every read goes through `readTemplateSnapshot`, which drops what no longer fits
 * today's enums and limits and re-points the indexes, so replay never trusts stored JSON.
 */

export const EVERYONE_ROLE_NAME = '@everyone';

export interface TemplateRole {
  name: string;
  color: string | null;
  permissions: string[];
  position: number;
}

export interface TemplateCategory {
  name: string;
  position: number;
}

export interface TemplateChannel {
  name: string;
  type: ChannelType;
  topic: string | null;
  categoryIndex: number | null;
  position: number;
  isPrivate: boolean;
  slowmodeSeconds: number;
  /** FORUM only. */
  postGuidelines: string | null;
  /** FORUM only; tag names in display order. */
  forumTags: string[];
}

export interface TemplateOverride {
  channelIndex: number;
  /** Null when the override targets the creator (`memberSelf`). */
  roleIndex: number | null;
  memberSelf: boolean;
  allow: string[];
  deny: string[];
}

export interface TemplateQuestion {
  prompt: string;
  roleIndexes: number[];
  multiSelect: boolean;
}

export interface TemplateOnboarding {
  enabled: boolean;
  rulesText: string | null;
  questions: TemplateQuestion[];
}

export interface TemplateSnapshot {
  roles: TemplateRole[];
  categories: TemplateCategory[];
  channels: TemplateChannel[];
  overrides: TemplateOverride[];
  onboarding: TemplateOnboarding | null;
}

/** Stored JSON columns, or the output of `toTemplateColumns`; every field is narrowed on read. */
export interface StoredTemplateColumns {
  roles: unknown;
  categories: unknown;
  channels: unknown;
  overrides: unknown;
  onboarding?: unknown;
}

const ROLE_NAME_MAX_LENGTH = 50;
const ROLE_COLOR_MAX_LENGTH = 24;
const CATEGORY_NAME_MAX_LENGTH = 80;
const CHANNEL_TOPIC_MAX_LENGTH = 250;
const channelTypes: readonly ChannelType[] = ['TEXT', 'VOICE', 'FORUM', 'STAGE'];
const knownPermissions: ReadonlySet<string> = new Set(ownerPermissions);
const slowmodeOptions: ReadonlySet<number> = new Set(SLOWMODE_OPTIONS_SECONDS);

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asObjects(value: unknown): JsonObject[] {
  return Array.isArray(value) ? value.filter(isObject) : [];
}

function channelType(value: unknown): ChannelType | null {
  return channelTypes.find((type) => type === value) ?? null;
}

function text(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function integer(value: unknown, fallback = 0) {
  return typeof value === 'number' && Number.isInteger(value) ? value : fallback;
}

function permissionList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value.filter(
        (item): item is string => typeof item === 'string' && knownPermissions.has(item),
      ),
    ),
  ];
}

/** Maps a stored index to the entry's index after invalid entries were dropped. */
function remap(indexes: Map<number, number>, value: unknown) {
  return typeof value === 'number' ? (indexes.get(value) ?? null) : null;
}

export function readTemplateSnapshot(columns: StoredTemplateColumns): TemplateSnapshot {
  const roleIndexes = new Map<number, number>();
  const roles: TemplateRole[] = [];
  const roleNames = new Set<string>();
  asObjects(columns.roles).forEach((item, index) => {
    const name = text(item.name, ROLE_NAME_MAX_LENGTH);
    if (!name || roleNames.has(name) || roles.length >= SERVER_TEMPLATE_MAX_ROLES) return;
    roleNames.add(name);
    roleIndexes.set(index, roles.length);
    roles.push({
      name,
      color: text(item.color, ROLE_COLOR_MAX_LENGTH),
      permissions: permissionList(item.permissions),
      position: integer(item.position),
    });
  });

  const categoryIndexes = new Map<number, number>();
  const categories: TemplateCategory[] = [];
  asObjects(columns.categories).forEach((item, index) => {
    const name = text(item.name, CATEGORY_NAME_MAX_LENGTH);
    if (!name || categories.length >= SERVER_TEMPLATE_MAX_CATEGORIES) return;
    categoryIndexes.set(index, categories.length);
    categories.push({ name, position: integer(item.position) });
  });

  const channelIndexes = new Map<number, number>();
  const channels: TemplateChannel[] = [];
  const channelNames = new Set<string>();
  asObjects(columns.channels).forEach((item, index) => {
    const name = typeof item.name === 'string' ? slugifyChannelName(item.name) : '';
    const type = channelType(item.type);
    if (!name || !type || channelNames.has(name)) return;
    if (channels.length >= SERVER_TEMPLATE_MAX_CHANNELS) return;
    channelNames.add(name);
    channelIndexes.set(index, channels.length);
    const isForum = type === 'FORUM';
    const slowmode = integer(item.slowmodeSeconds);
    channels.push({
      name,
      type,
      topic: text(item.topic, CHANNEL_TOPIC_MAX_LENGTH),
      categoryIndex: remap(categoryIndexes, item.categoryIndex),
      position: integer(item.position),
      isPrivate: item.isPrivate === true,
      slowmodeSeconds: slowmodeOptions.has(slowmode) ? slowmode : 0,
      postGuidelines: isForum ? text(item.postGuidelines, FORUM_POST_GUIDELINES_MAX_LENGTH) : null,
      forumTags: isForum ? forumTagNames(item.forumTags) : [],
    });
  });

  const overrides: TemplateOverride[] = [];
  for (const item of asObjects(columns.overrides)) {
    if (overrides.length >= SERVER_TEMPLATE_MAX_OVERRIDES) break;
    const channelIndex = remap(channelIndexes, item.channelIndex);
    const memberSelf = item.memberSelf === true;
    const roleIndex = memberSelf ? null : remap(roleIndexes, item.roleIndex);
    if (channelIndex === null || (!memberSelf && roleIndex === null)) continue;
    overrides.push({
      channelIndex,
      roleIndex,
      memberSelf,
      allow: permissionList(item.allow),
      deny: permissionList(item.deny),
    });
  }

  return {
    roles,
    categories,
    channels,
    overrides,
    onboarding: readOnboarding(columns.onboarding, roleIndexes),
  };
}

function forumTagNames(value: unknown) {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const names: string[] = [];
  for (const item of value) {
    const name = text(item, FORUM_TAG_NAME_MAX_LENGTH);
    if (!name || seen.has(name.toLowerCase()) || names.length >= FORUM_MAX_TAGS) continue;
    seen.add(name.toLowerCase());
    names.push(name);
  }
  return names;
}

function readOnboarding(value: unknown, roleIndexes: Map<number, number>) {
  if (!isObject(value)) return null;
  const item = value;
  const rulesText = text(item.rulesText, ONBOARDING_RULES_MAX_LENGTH);
  const questions: TemplateQuestion[] = [];
  for (const question of asObjects(item.questions)) {
    if (questions.length >= ONBOARDING_MAX_QUESTIONS) break;
    const prompt = text(question.prompt, ONBOARDING_PROMPT_MAX_LENGTH);
    const indexes = Array.isArray(question.roleIndexes) ? question.roleIndexes : [];
    const roleIndexList = [
      ...new Set(
        indexes
          .map((index) => remap(roleIndexes, index))
          .filter((index): index is number => index !== null),
      ),
    ].slice(0, ONBOARDING_MAX_ROLES_PER_QUESTION);
    if (!prompt || !roleIndexList.length) continue;
    questions.push({
      prompt,
      roleIndexes: roleIndexList,
      multiSelect: question.multiSelect === true,
    });
  }
  // Screening without rules text cannot be turned on through settings either.
  return { enabled: item.enabled === true && rulesText !== null, rulesText, questions };
}

/** The JSON columns written for a snapshot; the inverse of `readTemplateSnapshot`. */
export function toTemplateColumns(snapshot: TemplateSnapshot) {
  const roles: Prisma.InputJsonArray = snapshot.roles.map((role) => ({
    name: role.name,
    color: role.color,
    permissions: role.permissions,
    position: role.position,
  }));
  const categories: Prisma.InputJsonArray = snapshot.categories.map((category) => ({
    name: category.name,
    position: category.position,
  }));
  const channels: Prisma.InputJsonArray = snapshot.channels.map((channel) => ({
    name: channel.name,
    type: channel.type,
    topic: channel.topic,
    categoryIndex: channel.categoryIndex,
    position: channel.position,
    isPrivate: channel.isPrivate,
    slowmodeSeconds: channel.slowmodeSeconds,
    postGuidelines: channel.postGuidelines,
    forumTags: channel.forumTags,
  }));
  const overrides: Prisma.InputJsonArray = snapshot.overrides.map((override) => ({
    channelIndex: override.channelIndex,
    roleIndex: override.roleIndex,
    memberSelf: override.memberSelf,
    allow: override.allow,
    deny: override.deny,
  }));
  const onboarding: Prisma.InputJsonObject | undefined = snapshot.onboarding
    ? {
        enabled: snapshot.onboarding.enabled,
        rulesText: snapshot.onboarding.rulesText,
        questions: snapshot.onboarding.questions.map((question) => ({
          prompt: question.prompt,
          roleIndexes: question.roleIndexes,
          multiSelect: question.multiSelect,
        })),
      }
    : undefined;
  return { roles, categories, channels, overrides, onboarding };
}

/** Whether a server's live structure exceeds what a template may hold. */
export function exceedsTemplateLimits(counts: {
  roles: number;
  categories: number;
  channels: number;
  overrides: number;
}) {
  return (
    counts.roles > SERVER_TEMPLATE_MAX_ROLES ||
    counts.categories > SERVER_TEMPLATE_MAX_CATEGORIES ||
    counts.channels > SERVER_TEMPLATE_MAX_CHANNELS ||
    counts.overrides > SERVER_TEMPLATE_MAX_OVERRIDES
  );
}
