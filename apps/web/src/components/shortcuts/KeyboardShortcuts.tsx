import { useMemo, useState } from 'react';
import type { Channel, DirectConversation } from '@/api';
import { conversationPartners } from '@/components/home/conversationDisplay';
import type { ChannelBadgeState } from '@/components/workspace/types';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { navigableChannels, stepItem, type NavigationDirection } from '@/utils/shortcutNavigation';
import { QuickSwitcher } from './QuickSwitcher';
import { buildQuickSwitcherEntries, type QuickSwitcherEntry } from './quickSwitcherEntries';
import { ShortcutCheatSheet } from './ShortcutCheatSheet';

export interface KeyboardShortcutsProps {
  viewerId: string;
  /** The channel sidebar's list: permission-filtered by the API and narrowed by the sidebar filter. */
  visibleTextChannels: Channel[];
  channelBadges: Record<string, ChannelBadgeState>;
  activeConversation: DirectConversation | null;
  openHome: () => void;
  openDirectConversation: (conversation: DirectConversation) => Promise<void>;
  markChannelRead: (channelId: string) => Promise<void>;
  markDirectConversationRead: (conversationId: string) => Promise<void>;
}

/**
 * Global shortcuts (see `SHORTCUTS`) and the two dialogs they open. Mounted once, in `AppShell`.
 *
 * In a server, channel steps follow the sidebar; on Home they follow the conversation list. Every
 * target is something the sidebar or Home list would let the user click, so no shortcut reaches a
 * channel the viewer cannot see, and a server behind rules screening still shows its `RulesGate`.
 */
export function KeyboardShortcuts({
  viewerId,
  visibleTextChannels,
  channelBadges,
  activeConversation,
  openHome,
  openDirectConversation,
  markChannelRead,
  markDirectConversationRead,
}: KeyboardShortcutsProps) {
  const { servers, directConversations, server, channel, openServer, selectChannel } =
    useWorkspace();
  const [isSwitcherOpen, setIsSwitcherOpen] = useState(false);
  const [isCheatSheetOpen, setIsCheatSheetOpen] = useState(false);

  const channels = useMemo(
    () => navigableChannels(visibleTextChannels, server?.categories ?? []),
    [visibleTextChannels, server?.categories],
  );
  const conversations = useMemo(
    () =>
      directConversations.filter(
        (conversation) =>
          conversation.isGroup || conversationPartners(conversation, viewerId).length > 0,
      ),
    [directConversations, viewerId],
  );
  const switcherEntries = useMemo(
    () =>
      isSwitcherOpen
        ? buildQuickSwitcherEntries({
            viewerId,
            servers,
            server,
            conversations: directConversations,
            channelBadges,
          })
        : [],
    [isSwitcherOpen, viewerId, servers, server, directConversations, channelBadges],
  );

  function step(direction: NavigationDirection, unreadOnly: boolean) {
    if (server) {
      const target = stepItem(channels, channel?.id ?? null, direction, (item) =>
        unreadOnly ? hasUnreadBadge(channelBadges[item.id]) : true,
      );
      if (!target) return false;
      selectChannel(target);
      return true;
    }
    const target = stepItem(conversations, activeConversation?.id ?? null, direction, (item) =>
      unreadOnly ? Boolean(item.unreadCount) : true,
    );
    if (!target) return false;
    void openDirectConversation(target);
    return true;
  }

  function markRead() {
    if (server) {
      // Behind rules screening the API refuses reads, so there is nothing to mark.
      if (!channel || server.needsOnboarding) return false;
      void markChannelRead(channel.id);
      return true;
    }
    if (!activeConversation) return false;
    void markDirectConversationRead(activeConversation.id);
    return true;
  }

  function selectEntry(entry: QuickSwitcherEntry) {
    setIsSwitcherOpen(false);
    if (entry.kind === 'server') {
      void openServer(entry.serverId);
      return;
    }
    if (entry.kind === 'conversation') {
      openHome();
      void openDirectConversation(entry.conversation);
      return;
    }
    // Switching servers keeps the chosen channel id: the store only resets it when the loaded server
    // does not contain it.
    if (entry.serverId !== server?.id) void openServer(entry.serverId);
    selectChannel(entry.channel);
  }

  useKeyboardShortcuts({
    quickSwitcher: () => {
      setIsCheatSheetOpen(false);
      setIsSwitcherOpen((open) => !open);
      return true;
    },
    cheatSheet: () => {
      setIsSwitcherOpen(false);
      setIsCheatSheetOpen((open) => !open);
      return true;
    },
    previousChannel: () => step('previous', false),
    nextChannel: () => step('next', false),
    previousUnread: () => step('previous', true),
    nextUnread: () => step('next', true),
    markRead,
  });

  return (
    <>
      <QuickSwitcher
        open={isSwitcherOpen}
        onOpenChange={setIsSwitcherOpen}
        entries={switcherEntries}
        onSelect={selectEntry}
      />
      <ShortcutCheatSheet open={isCheatSheetOpen} onOpenChange={setIsCheatSheetOpen} />
    </>
  );
}

function hasUnreadBadge(badge: ChannelBadgeState | undefined) {
  return Boolean(badge && (badge.count > 0 || badge.mentions > 0));
}
