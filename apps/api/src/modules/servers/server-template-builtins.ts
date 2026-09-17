import type { BuiltInServerTemplateId } from '@discord-clone/shared';
import { DEFAULT_MEMBER_PERMISSIONS } from './server-bootstrap';
import {
  EVERYONE_ROLE_NAME,
  type TemplateChannel,
  type TemplateSnapshot,
} from './server-template.rules';

/*
 * Starter templates authored by the team (open question 17: no user-submitted public templates in
 * v1). They live in code rather than as seeded rows, so they are type-checked against today's enums
 * and still pass through `readTemplateSnapshot` before replay like any stored template.
 * Names are the English fallback; the client shows `template.builtin.<id>.name`.
 */

interface BuiltInTemplate {
  id: BuiltInServerTemplateId;
  name: string;
  snapshot: TemplateSnapshot;
}

const MODERATOR_PERMISSIONS = [
  ...DEFAULT_MEMBER_PERMISSIONS,
  'MANAGE_MESSAGES',
  'KICK_MEMBERS',
  'MUTE_MEMBERS',
  'MENTION_EVERYONE',
];

function channel(
  fields: Pick<TemplateChannel, 'name' | 'type' | 'position'> & Partial<TemplateChannel>,
): TemplateChannel {
  return {
    topic: null,
    categoryIndex: null,
    isPrivate: false,
    slowmodeSeconds: 0,
    postGuidelines: null,
    forumTags: [],
    ...fields,
  };
}

/** Members can read but not post: `@everyone` (role index 0) loses SEND_MESSAGES. */
function readOnly(channelIndex: number) {
  return { channelIndex, roleIndex: 0, memberSelf: false, allow: [], deny: ['SEND_MESSAGES'] };
}

const gaming: BuiltInTemplate = {
  id: 'gaming',
  name: 'Gaming',
  snapshot: {
    roles: [
      {
        name: EVERYONE_ROLE_NAME,
        color: null,
        permissions: DEFAULT_MEMBER_PERMISSIONS,
        position: 0,
      },
      { name: 'Moderator', color: '#3ba55c', permissions: MODERATOR_PERMISSIONS, position: 2 },
      { name: 'Looking for group', color: '#5865f2', permissions: [], position: 1 },
    ],
    categories: [
      { name: 'Information', position: 0 },
      { name: 'Text channels', position: 1 },
      { name: 'Voice channels', position: 2 },
    ],
    channels: [
      channel({ name: 'welcome', type: 'TEXT', position: 0, categoryIndex: 0 }),
      channel({ name: 'announcements', type: 'TEXT', position: 1, categoryIndex: 0 }),
      channel({ name: 'general', type: 'TEXT', position: 2, categoryIndex: 1 }),
      channel({ name: 'clips', type: 'TEXT', position: 3, categoryIndex: 1, slowmodeSeconds: 30 }),
      channel({
        name: 'looking-for-group',
        type: 'FORUM',
        position: 4,
        categoryIndex: 1,
        postGuidelines: 'Say what you play, your platform, and when you are online.',
        forumTags: ['PC', 'Console', 'Mobile'],
      }),
      channel({ name: 'moderators', type: 'TEXT', position: 5, categoryIndex: 1, isPrivate: true }),
      channel({ name: 'lobby', type: 'VOICE', position: 6, categoryIndex: 2 }),
      channel({ name: 'squad', type: 'VOICE', position: 7, categoryIndex: 2 }),
    ],
    overrides: [
      readOnly(0),
      readOnly(1),
      {
        channelIndex: 5,
        roleIndex: 1,
        memberSelf: false,
        allow: ['VIEW_CHANNEL', 'SEND_MESSAGES'],
        deny: [],
      },
    ],
    onboarding: {
      enabled: false,
      rulesText:
        'Be respectful. No cheating, spam, or sharing other people’s personal information.',
      questions: [
        { prompt: 'Want to be pinged for group games?', roleIndexes: [2], multiSelect: false },
      ],
    },
  },
};

const studyGroup: BuiltInTemplate = {
  id: 'study-group',
  name: 'Study group',
  snapshot: {
    roles: [
      {
        name: EVERYONE_ROLE_NAME,
        color: null,
        permissions: DEFAULT_MEMBER_PERMISSIONS,
        position: 0,
      },
      { name: 'Tutor', color: '#faa61a', permissions: MODERATOR_PERMISSIONS, position: 1 },
    ],
    categories: [
      { name: 'Information', position: 0 },
      { name: 'Study', position: 1 },
      { name: 'Voice rooms', position: 2 },
    ],
    channels: [
      channel({ name: 'rules', type: 'TEXT', position: 0, categoryIndex: 0 }),
      channel({ name: 'resources', type: 'TEXT', position: 1, categoryIndex: 0 }),
      channel({ name: 'general', type: 'TEXT', position: 2, categoryIndex: 1 }),
      channel({
        name: 'homework-help',
        type: 'FORUM',
        position: 3,
        categoryIndex: 1,
        postGuidelines: 'One question per post. Show what you have tried so far.',
        forumTags: ['Math', 'Science', 'Languages', 'Other'],
      }),
      channel({ name: 'study-room', type: 'VOICE', position: 4, categoryIndex: 2 }),
      channel({ name: 'quiet-room', type: 'VOICE', position: 5, categoryIndex: 2 }),
    ],
    overrides: [readOnly(0)],
    onboarding: null,
  },
};

const friends: BuiltInTemplate = {
  id: 'friends',
  name: 'Friends',
  snapshot: {
    roles: [
      {
        name: EVERYONE_ROLE_NAME,
        color: null,
        permissions: DEFAULT_MEMBER_PERMISSIONS,
        position: 0,
      },
    ],
    categories: [],
    channels: [
      channel({ name: 'general', type: 'TEXT', position: 0 }),
      channel({ name: 'memes', type: 'TEXT', position: 1 }),
      channel({ name: 'plans', type: 'TEXT', position: 2 }),
      channel({ name: 'hangout', type: 'VOICE', position: 3 }),
    ],
    overrides: [],
    onboarding: null,
  },
};

export const BUILT_IN_SERVER_TEMPLATES: readonly BuiltInTemplate[] = [gaming, studyGroup, friends];

export function findBuiltInTemplate(id: string) {
  return BUILT_IN_SERVER_TEMPLATES.find((template) => template.id === id) ?? null;
}
