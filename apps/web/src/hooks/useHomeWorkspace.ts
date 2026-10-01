import type { AuthState } from '@/api';
import type { HomePanelProps } from '@/components/home/types';
import type { DeviceKeysState } from './useDeviceKeys';
import { useTranslation } from '@/i18n/LocaleProvider';
import { useDirectMessageActions } from './useDirectMessageActions';
import { useDirectMessages } from './useDirectMessages';
import { useGroupConversations } from './useGroupConversations';

interface UseHomeWorkspaceOptions {
  auth: AuthState | null;
  deviceKeys: DeviceKeysState;
  pendingAction: string | null;
  setPendingAction: (action: string | null) => void;
  setWorkspaceError: (message: string | null) => void;
  setWorkspaceNotice: (message: string | null) => void;
}

/** Composes friends, direct messages, group DMs, and DM actions into the Home panel's props. */
export function useHomeWorkspace({
  auth,
  deviceKeys,
  pendingAction,
  setPendingAction,
  setWorkspaceError,
  setWorkspaceNotice,
}: UseHomeWorkspaceOptions) {
  const t = useTranslation();
  const directMessages = useDirectMessages({
    auth,
    deviceKeys,
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

  // An edit is re-encrypted for the conversation the message belongs to; if that fails the edit
  // fails visibly instead of storing plaintext in an encrypted conversation.
  async function editDirectMessage(messageId: string, content: string) {
    try {
      const wireContent = await directMessages.encryptDirectMessageEdit(messageId, content);
      await messageActions.editDirectMessage(messageId, wireContent);
    } catch (err) {
      setWorkspaceError(err instanceof Error ? err.message : t('encryption.error.keyShareFailed'));
    }
  }

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
          closeDirectConversation: directMessages.closeDirectConversation,
          startDirectConversation: directMessages.startDirectConversation,
          sendDirectMessage: directMessages.sendDirectMessage,
          sendDirectVoiceMessage: directMessages.sendDirectVoiceMessage,
          reportComposerError: setWorkspaceError,
          setDirectMessageDraft: directMessages.setDirectMessageDraft,
          setReplyingToDirectMessage: directMessages.setReplyingToDirectMessage,
          editDirectMessage,
          deleteDirectMessage: messageActions.deleteDirectMessage,
          toggleDirectReaction: messageActions.toggleDirectReaction,
          toggleDirectPin: messageActions.toggleDirectPin,
          loadDirectPins: messageActions.loadDirectPins,
          updateDirectPoll: messageActions.updateDirectPoll,
          createGroupConversation: groups.createGroupConversation,
          renameGroupConversation: groups.renameGroupConversation,
          addGroupMember: groups.addGroupMember,
          removeGroupMember: groups.removeGroupMember,
          muteDirectConversation: directMessages.muteDirectConversation,
          unmuteDirectConversation: directMessages.unmuteDirectConversation,
        },
      }
    : null;

  return {
    ...directMessages,
    applyDirectMessageUpdate: messageActions.applyDirectMessageUpdate,
    homeProps,
  };
}
