import type { AuthState } from '../api';
import type { HomePanelProps } from '../components/home/types';
import { useDirectMessageActions } from './useDirectMessageActions';
import { useDirectMessages } from './useDirectMessages';
import { useGroupConversations } from './useGroupConversations';

interface UseHomeWorkspaceOptions {
  auth: AuthState | null;
  pendingAction: string | null;
  setPendingAction: (action: string | null) => void;
  setWorkspaceError: (message: string | null) => void;
  setWorkspaceNotice: (message: string | null) => void;
}

/** Composes friends, direct messages, group DMs, and DM actions into the Home panel's props. */
export function useHomeWorkspace({
  auth,
  pendingAction,
  setPendingAction,
  setWorkspaceError,
  setWorkspaceNotice,
}: UseHomeWorkspaceOptions) {
  const directMessages = useDirectMessages({
    auth,
    setPendingAction,
    setWorkspaceError,
    setWorkspaceNotice,
  });

  const groups = useGroupConversations({
    auth,
    loadDirectConversations: directMessages.loadDirectConversations,
    openDirectConversation: directMessages.openDirectConversation,
    removeDirectConversation: directMessages.removeDirectConversation,
    setPendingAction,
    setWorkspaceError,
    setWorkspaceNotice,
  });

  const messageActions = useDirectMessageActions({
    auth,
    setDirectMessages: directMessages.setDirectMessages,
    setDirectConversations: directMessages.setDirectConversations,
    setWorkspaceError,
  });

  // The call section is added by AppShell, which owns the socket-bound call hooks.
  const homeProps: Omit<HomePanelProps, 'call'> | null = auth
    ? {
        home: {
          auth,
          friendsSummary: directMessages.friendsSummary,
          conversations: directMessages.directConversations,
          activeConversation: directMessages.activeConversation,
          directMessages: directMessages.directMessages,
          directMessageDraft: directMessages.directMessageDraft,
          replyingToDirectMessage: directMessages.replyingToDirectMessage,
          pinnedDirectMessages: messageActions.pinnedDirectMessages,
          isLoadingPins: messageActions.isLoadingPins,
          pinsError: messageActions.pinsError,
          pendingAction,
        },
        actions: {
          requestFriend: directMessages.requestFriend,
          respondFriendRequest: directMessages.respondFriendRequest,
          blockUser: directMessages.blockUser,
          unblockUser: directMessages.unblockUser,
          removeFriend: directMessages.removeFriend,
          removeFriendRequest: directMessages.removeFriendRequest,
          openDirectConversation: directMessages.openDirectConversation,
          startDirectConversation: directMessages.startDirectConversation,
          sendDirectMessage: directMessages.sendDirectMessage,
          setDirectMessageDraft: directMessages.setDirectMessageDraft,
          setReplyingToDirectMessage: directMessages.setReplyingToDirectMessage,
          editDirectMessage: messageActions.editDirectMessage,
          deleteDirectMessage: messageActions.deleteDirectMessage,
          toggleDirectReaction: messageActions.toggleDirectReaction,
          toggleDirectPin: messageActions.toggleDirectPin,
          loadDirectPins: messageActions.loadDirectPins,
          createGroupConversation: groups.createGroupConversation,
          renameGroupConversation: groups.renameGroupConversation,
          addGroupMember: groups.addGroupMember,
          removeGroupMember: groups.removeGroupMember,
        },
      }
    : null;

  return {
    ...directMessages,
    applyDirectMessageUpdate: messageActions.applyDirectMessageUpdate,
    homeProps,
  };
}
