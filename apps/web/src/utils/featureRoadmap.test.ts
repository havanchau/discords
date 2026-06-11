import { describe, expect, it } from 'vitest';
import { buildMediaCollections, categorizeAttachment } from './mediaCollections';
import { buildMemberPermissionPreview, buildRolePermissionPreview } from './permissionPreview';
import { getSlashCommandSuggestions, parseSlashCommand } from './slashCommands';
import { removeVoiceParticipant, upsertVoiceParticipant } from './voicePresence';
import type { Message, Role, ServerDetail } from '../api';

const author = { id: 'u1', username: 'ada', displayName: 'Ada', avatarUrl: null };

function message(partial: Partial<Message>): Message {
  return {
    id: 'm1',
    channelId: 'c1',
    authorId: 'u1',
    content: '',
    createdAt: '2026-06-11T00:00:00.000Z',
    author,
    attachments: [],
    reactions: [],
    ...partial,
  };
}

describe('media collections', () => {
  it('categorizes attachments and extracts links', () => {
    expect(categorizeAttachment({ fileName: 'cat.png', mimeType: 'image/png', byteSize: 10, url: '/cat.png' })).toBe('image');
    expect(categorizeAttachment({ fileName: 'clip.mp4', mimeType: 'video/mp4', byteSize: 10, url: '/clip.mp4' })).toBe('video');
    expect(categorizeAttachment({ fileName: 'song.ogg', mimeType: 'audio/ogg', byteSize: 10, url: '/song.ogg' })).toBe('audio');

    const collections = buildMediaCollections([
      message({
        content: 'see https://example.com/path',
        attachments: [
          { id: 'a1', fileName: 'cat.png', mimeType: 'image/png', byteSize: 10, url: '/cat.png' },
          { id: 'a2', fileName: 'doc.pdf', mimeType: 'application/pdf', byteSize: 20, url: '/doc.pdf' },
        ],
      }),
    ]);

    expect(collections.media).toHaveLength(1);
    expect(collections.files).toHaveLength(1);
    expect(collections.links[0]?.hostname).toBe('example.com');
  });
});

describe('permission preview', () => {
  const channels = [{ id: 'c1', serverId: 's1', name: 'general', type: 'TEXT' as const }];

  it('aggregates role and owner member permissions', () => {
    const role: Role = { id: 'r1', name: 'Mod', color: null, permissions: ['VIEW_CHANNEL', 'MANAGE_MESSAGES'] };
    expect(buildRolePermissionPreview(role, channels)[0]?.canView).toBe(true);

    const member = {
      id: 'm1',
      kind: 'OWNER',
      user: { id: 'u1', email: 'a@example.com', username: 'ada', displayName: 'Ada' },
      roles: [{ role }],
    } satisfies ServerDetail['members'][number];
    expect(buildMemberPermissionPreview(member, channels)[0]?.actions.every((item) => item.allowed)).toBe(true);
  });
});

describe('slash commands', () => {
  it('parses commands and ranks autocomplete', () => {
    expect(parseSlashCommand('/me waves')).toMatchObject({ name: 'me', args: 'waves' });
    expect(parseSlashCommand('/missing')).toMatchObject({ error: 'Unknown command /missing.' });
    expect(getSlashCommandSuggestions('/i').map((command) => command.name)).toEqual(['invite']);
  });
});

describe('voice presence reducers', () => {
  it('keeps occupied channel summaries stable', () => {
    const participant = {
      socketId: 'socket-1',
      userId: 'u1',
      username: 'ada',
      displayName: 'Ada',
      mode: 'voice' as const,
      isMuted: false,
      isCameraOff: true,
      isSharingScreen: false,
    };
    const calls = upsertVoiceParticipant({}, 'c1', participant);
    expect(calls.c1?.participants).toHaveLength(1);
    expect(removeVoiceParticipant(calls, 'c1', 'socket-1').c1).toBeUndefined();
  });
});
