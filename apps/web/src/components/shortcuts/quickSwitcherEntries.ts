import type { Channel, DirectConversation, ServerDetail, ServerSummary } from '@/api';
import {
  conversationDisplayName,
  conversationPartners,
} from '@/components/home/conversationDisplay';
import type { ChannelBadgeState } from '@/components/workspace/types';

export type QuickSwitcherEntry =
  | { kind: 'server'; key: string; label: string; serverId: string }
  | {
      kind: 'channel';
      key: string;
      label: string;
      channel: Channel;
      serverId: string;
      serverName: string;
      unread: number;
    }
  | {
      kind: 'conversation';
      key: string;
      label: string;
      conversation: DirectConversation;
      unread: number;
    };

/** Rendering every match would make a large account's list slow to scroll; typing narrows it. */
export const QUICK_SWITCHER_LIMIT = 50;

interface BuildEntriesOptions {
  viewerId: string;
  servers: ServerSummary[];
  server: ServerDetail | null;
  conversations: DirectConversation[];
  channelBadges: Record<string, ChannelBadgeState>;
}

/**
 * Everything the switcher can open, from data the client already holds. Both server payloads carry
 * only the channels the viewer may see (the API filters them), and voice channels are left out
 * because the sidebar gives them no select action. The open server comes first, then conversations,
 * then other servers' channels, then servers.
 */
export function buildQuickSwitcherEntries({
  viewerId,
  servers,
  server,
  conversations,
  channelBadges,
}: BuildEntriesOptions): QuickSwitcherEntry[] {
  const channelEntries = (source: ServerSummary): QuickSwitcherEntry[] =>
    source.channels
      .filter((channel) => channel.type !== 'VOICE')
      .map((channel) => ({
        kind: 'channel',
        key: `channel:${channel.id}`,
        label: channel.name,
        channel,
        serverId: source.id,
        serverName: source.name,
        unread: channelBadges[channel.id]?.count ?? 0,
      }));

  const conversationEntries: QuickSwitcherEntry[] = conversations
    // Same rule as the Home conversation list: a direct conversation whose partner is gone is hidden.
    .filter(
      (conversation) =>
        conversation.isGroup || conversationPartners(conversation, viewerId).length > 0,
    )
    .map((conversation) => ({
      kind: 'conversation',
      key: `conversation:${conversation.id}`,
      label: conversationDisplayName(conversation, viewerId),
      conversation,
      unread: conversation.unreadCount ?? 0,
    }));

  const otherServers = servers.filter((item) => item.id !== server?.id);

  return [
    ...(server ? channelEntries(server) : []),
    ...conversationEntries,
    ...otherServers.flatMap(channelEntries),
    ...servers.map(
      (item): QuickSwitcherEntry => ({
        kind: 'server',
        key: `server:${item.id}`,
        label: item.name,
        serverId: item.id,
      }),
    ),
  ];
}

/** Case-insensitive substring match; names that start with the query are listed first. */
export function filterQuickSwitcherEntries(
  entries: QuickSwitcherEntry[],
  query: string,
): QuickSwitcherEntry[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return entries.slice(0, QUICK_SWITCHER_LIMIT);
  const prefix: QuickSwitcherEntry[] = [];
  const contains: QuickSwitcherEntry[] = [];
  entries.forEach((entry) => {
    const label = entry.label.toLowerCase();
    if (label.startsWith(needle)) prefix.push(entry);
    else if (label.includes(needle)) contains.push(entry);
  });
  return [...prefix, ...contains].slice(0, QUICK_SWITCHER_LIMIT);
}
