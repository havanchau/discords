import type { DirectConversation, PublicUser } from '@/api';

/** Other members of a conversation; payloads may or may not include the viewer. */
export function conversationPartners(
  conversation: DirectConversation,
  viewerId: string,
): PublicUser[] {
  return conversation.members
    .map((member) => member.user)
    .filter((user): user is PublicUser => Boolean(user) && user.id !== viewerId);
}

export function conversationDisplayName(conversation: DirectConversation, viewerId: string) {
  const name = conversation.name?.trim();
  if (conversation.isGroup && name) return name;
  const partners = conversationPartners(conversation, viewerId);
  if (!partners.length) return conversation.isGroup ? 'Empty group' : 'Unknown user';
  return partners.map((partner) => partner.displayName).join(', ');
}
