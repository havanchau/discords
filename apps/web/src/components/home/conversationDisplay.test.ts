import type { DirectConversation, PublicUser } from '../../api';
import { conversationDisplayName, conversationPartners } from './conversationDisplay';

function user(id: string, displayName: string): PublicUser {
  return { id, username: id, displayName };
}

function conversation(overrides: Partial<DirectConversation>): DirectConversation {
  return { id: 'c1', members: [], messages: [], ...overrides };
}

describe('conversationPartners', () => {
  it('excludes the viewer when the payload includes them', () => {
    const partners = conversationPartners(
      conversation({ members: [{ user: user('me', 'Me') }, { user: user('u2', 'Bob') }] }),
      'me',
    );

    expect(partners.map((partner) => partner.id)).toEqual(['u2']);
  });
});

describe('conversationDisplayName', () => {
  it('uses the group name when set', () => {
    const name = conversationDisplayName(
      conversation({ isGroup: true, name: 'Weekend', members: [{ user: user('u2', 'Bob') }] }),
      'me',
    );

    expect(name).toBe('Weekend');
  });

  it('joins member names for an unnamed group', () => {
    const name = conversationDisplayName(
      conversation({
        isGroup: true,
        name: '  ',
        members: [{ user: user('u2', 'Bob') }, { user: user('u3', 'Cara') }],
      }),
      'me',
    );

    expect(name).toBe('Bob, Cara');
  });

  it('names a 1-1 conversation after the partner even if a name is stored', () => {
    const name = conversationDisplayName(
      conversation({ name: 'ignored', members: [{ user: user('u2', 'Bob') }] }),
      'me',
    );

    expect(name).toBe('Bob');
  });

  it('describes a group with no other members', () => {
    expect(conversationDisplayName(conversation({ isGroup: true }), 'me')).toBe('Empty group');
  });
});
