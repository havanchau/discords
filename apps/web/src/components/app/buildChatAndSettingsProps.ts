import type { RefObject } from 'react';
import type { AuthState, Channel, Message, NotificationItem, ServerDetail } from '@/api';
import type { ActiveCallSummary, CallState, RemoteMedia } from '@/helpers';
import type { ComposerRestriction } from '@/hooks/useComposerRestrictions';
import type { SoundboardPlayback } from '@/hooks/useSoundboardPlayback';
import type { useServerEmojis } from '@/hooks/useServerEmojis';
import type { useServerModeration } from '@/hooks/useServerModeration';
import type { useSettingsActions } from '@/hooks/useSettingsActions';
import type { MemberIdentity } from '@/utils/memberIdentity';
import type { ParsedMessageSearch } from '@/utils/messageSearch';
import type {
  ActiveDialog,
  ActivePanel,
  ChannelMessageActions,
  ChatPanelComposer,
  ChatPanelThread,
} from '@/components/chat/types';
import type { ChatPanelProps } from '@/components/ChatPanel';
import type { SettingsModalProps, UiTheme } from '@/components/settings/types';
import type { CallMode } from '@/helpers';
import type { StartCallOptions } from '@/hooks/useChannelCall';

type ChatSettingsActions = Omit<
  ReturnType<typeof useSettingsActions>,
  'loadNotificationPreferences' | 'hydratePersistentChannelBadges'
>;

interface BuildChatAndSettingsPropsOptions {
  auth: AuthState;
  channel: Channel | null;
  server: ServerDetail | null;
  memberIdentities: Record<string, MemberIdentity>;
  selectedMember: ServerDetail['members'][number] | null;
  messages: Message[];
  visibleMessages: Message[];
  isLoadingMessages: boolean;
  isLoadingMoreMessages: boolean;
  messageCursor: string | null;
  firstUnreadMessageId: string | null;
  typingUsers: Array<{ userId: string; displayName: string }>;
  pinnedMessages: Message[];
  pinnedMessageIds: Record<string, string[]>;
  notifications: NotificationItem[];
  notificationUnreadCount: number;
  isLoadingNotifications: boolean;
  searchQuery: string;
  parsedSearch: ParsedMessageSearch;
  loadMoreMessages: () => Promise<void>;
  workspaceError: string | null;
  workspaceNotice: string | null;
  setWorkspaceError: (value: string | null) => void;
  setWorkspaceNotice: (value: string | null) => void;
  activePanel: ActivePanel;
  activeDialog: ActiveDialog;
  setActivePanel: ChatPanelProps['panels']['setActivePanel'];
  setActiveDialog: (dialog: ActiveDialog) => void;
  setSearchQuery: (value: string) => void;
  loadNotifications: () => Promise<void>;
  markNotificationRead: (notificationId: string) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
  openMobileNav: () => void;
  isChannelEncrypted: boolean;
  configureChannelEncryption: (passphrase: string) => Promise<void>;
  clearChannelEncryption: () => void;
  callState: CallState | null;
  activeCalls: Record<string, ActiveCallSummary>;
  remoteMedia: RemoteMedia[];
  localVideoRef: RefObject<HTMLVideoElement | null>;
  startCall: (mode: CallMode, options?: StartCallOptions) => Promise<boolean>;
  toggleMute: () => void;
  toggleCamera: () => void;
  endDirectCall: () => void;
  soundboard: SoundboardPlayback;
  messageActions: ChannelMessageActions;
  startDirectConversation: (userId: string) => Promise<void>;
  sendFriendRequest: (usernameOrEmail: string) => Promise<void>;
  composerRestriction: ComposerRestriction;
  replyingToMessage: Message | null;
  setReplyingToMessage: (message: Message | null) => void;
  selectedFiles: File[];
  setSelectedFiles: (files: File[]) => void;
  isRecordingVoice: boolean;
  pendingAction: string | null;
  channelDraftValue: string;
  setChannelDraft: (value: string) => void;
  clearChannelDraft: () => void;
  fileInputRef: RefObject<HTMLInputElement | null>;
  sendMessage: ChatPanelComposer['sendMessage'];
  botCommands: ChatPanelComposer['botCommands'];
  pendingInteractionLabel: ChatPanelComposer['pendingInteractionLabel'];
  sendChatMessage: (
    content: string,
    files: File[],
    voice?: null,
    stickerId?: string,
  ) => Promise<boolean | undefined>;
  startVoiceRecording: () => Promise<void>;
  stopVoiceRecording: () => void;
  removeSelectedFile: (index: number) => void;
  selectFiles: ChatPanelComposer['selectFiles'];
  handleComposerInput: () => void;
  threadPanel: ChatPanelThread;
  markChannelRead: (channelId: string, lastMessageId?: string) => Promise<void> | void;
  moderation: ReturnType<typeof useServerModeration>;
  serverEmojis: ReturnType<typeof useServerEmojis>;
  settingsActions: ChatSettingsActions;
  uiTheme: UiTheme;
  setUiTheme: (theme: UiTheme) => void;
  logout: () => void;
  setSelectedMemberId: (memberId: string | null) => void;
}

const NO_PINNED_MESSAGE_IDS: string[] = [];

/**
 * Assembles the `chat` and `settings` props of `<AuthenticatedWorkspace>` from state and handlers
 * already computed in `AppShell`.
 */
export function buildChatAndSettingsProps({
  auth,
  channel,
  server,
  memberIdentities,
  selectedMember,
  messages,
  visibleMessages,
  isLoadingMessages,
  isLoadingMoreMessages,
  messageCursor,
  firstUnreadMessageId,
  typingUsers,
  pinnedMessages,
  pinnedMessageIds,
  notifications,
  notificationUnreadCount,
  isLoadingNotifications,
  searchQuery,
  parsedSearch,
  loadMoreMessages,
  workspaceError,
  workspaceNotice,
  setWorkspaceError,
  setWorkspaceNotice,
  activePanel,
  activeDialog,
  setActivePanel,
  setActiveDialog,
  setSearchQuery,
  loadNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  openMobileNav,
  isChannelEncrypted,
  configureChannelEncryption,
  clearChannelEncryption,
  callState,
  activeCalls,
  remoteMedia,
  localVideoRef,
  startCall,
  toggleMute,
  toggleCamera,
  endDirectCall,
  soundboard,
  messageActions,
  startDirectConversation,
  sendFriendRequest,
  composerRestriction,
  replyingToMessage,
  setReplyingToMessage,
  selectedFiles,
  setSelectedFiles,
  isRecordingVoice,
  pendingAction,
  channelDraftValue,
  setChannelDraft,
  clearChannelDraft,
  fileInputRef,
  sendMessage,
  botCommands,
  pendingInteractionLabel,
  sendChatMessage,
  startVoiceRecording,
  stopVoiceRecording,
  removeSelectedFile,
  selectFiles,
  handleComposerInput,
  threadPanel,
  markChannelRead,
  moderation,
  serverEmojis,
  settingsActions,
  uiTheme,
  setUiTheme,
  logout,
  setSelectedMemberId,
}: BuildChatAndSettingsPropsOptions): {
  chat: ChatPanelProps;
  settings: SettingsModalProps;
} {
  return {
    chat: {
      session: { auth, channel, memberIdentities },
      messages: {
        all: messages,
        visible: visibleMessages,
        isLoading: isLoadingMessages,
        isLoadingMore: isLoadingMoreMessages,
        hasMore: Boolean(messageCursor),
        firstUnreadMessageId,
        typingUsers,
        pinned: pinnedMessages,
        mediaSource: messages,
        pinnedIds: channel
          ? (pinnedMessageIds[channel.id] ?? NO_PINNED_MESSAGE_IDS)
          : NO_PINNED_MESSAGE_IDS,
        notifications,
        notificationUnreadCount,
        isLoadingNotifications,
        searchQuery,
        parsedSearch,
        loadMore: loadMoreMessages,
        markRead: (lastMessageId?: string) => {
          if (channel) void markChannelRead(channel.id, lastMessageId);
        },
      },
      alerts: {
        error: workspaceError,
        notice: workspaceNotice,
        setError: setWorkspaceError,
        setNotice: setWorkspaceNotice,
      },
      panels: {
        activePanel,
        activeDialog,
        setActivePanel,
        setActiveDialog,
        setSearchQuery,
        loadNotifications,
        markNotificationRead,
        markAllNotificationsRead,
        openMobileNav,
      },
      encryption: {
        isChannelEncrypted,
        configure: (passphrase: string) => configureChannelEncryption(passphrase),
        clear: () => clearChannelEncryption(),
      },
      call: {
        state: callState,
        active: channel ? (activeCalls[channel.id] ?? null) : null,
        remoteMedia,
        localVideoRef,
        start: startCall,
        toggleMute,
        toggleCamera,
        end: endDirectCall,
        soundboard,
      },
      messageActions: {
        ...messageActions,
        startDirectConversation: (userId: string) => void startDirectConversation(userId),
        sendFriendRequest: (usernameOrEmail: string) => void sendFriendRequest(usernameOrEmail),
      },
      composer: {
        restriction: composerRestriction,
        replyingToMessage,
        selectedFiles,
        isRecordingVoice,
        pendingAction,
        draft: channelDraftValue,
        fileInputRef,
        sendMessage,
        botCommands,
        pendingInteractionLabel,
        sendSticker: async (stickerId: string) => {
          if (await sendChatMessage('', [], null, stickerId)) setReplyingToMessage(null);
        },
        clearAfterSchedule: () => {
          clearChannelDraft();
          setSelectedFiles([]);
          setReplyingToMessage(null);
        },
        setDraft: setChannelDraft,
        startVoiceRecording,
        stopVoiceRecording,
        removeSelectedFile,
        selectFiles,
        handleInput: handleComposerInput,
      },
      thread: threadPanel,
      channelAvatar: {
        inputRef: settingsActions.channelAvatarInputRef,
        update: settingsActions.updateChannelAvatar,
      },
    },
    settings: {
      dialog: {
        activeDialog,
        setActiveDialog,
      },
      data: {
        auth,
        server,
        channel,
        selectedMember,
        channelOverrides: settingsActions.channelOverrides,
        auditLogs: settingsActions.auditLogs,
        auditLogsError: settingsActions.auditLogsError,
        invites: settingsActions.invites,
        notificationPreferences: settingsActions.notificationPreferences,
        pendingAction,
        bans: moderation.bans,
        isLoadingBans: moderation.isLoadingBans,
        bansError: moderation.bansError,
        emojis: serverEmojis.emojis,
        isLoadingEmojis: serverEmojis.isLoading,
        emojisError: serverEmojis.error,
      },
      refs: {
        profileAvatarInputRef: settingsActions.profileAvatarInputRef,
        profileBannerInputRef: settingsActions.profileBannerInputRef,
        channelAvatarInputRef: settingsActions.channelAvatarInputRef,
      },
      theme: {
        uiTheme,
      },
      actions: {
        setUiTheme,
        signOut: logout,
        createInviteFromSettings: settingsActions.createInviteFromSettings,
        revokeInvite: settingsActions.revokeInvite,
        updateProfile: settingsActions.updateProfile,
        updateProfileBanner: settingsActions.updateProfileBanner,
        updateServerProfile: settingsActions.updateServerProfile,
        updateServerProfileAvatar: settingsActions.updateServerProfileAvatar,
        updateNotificationPreference: settingsActions.updateNotificationPreference,
        updateServerSettings: settingsActions.updateServerSettings,
        updateChannelSettings: settingsActions.updateChannelSettings,
        toggleChannelRoleOverride: settingsActions.toggleChannelRoleOverride,
        toggleChannelMemberOverride: settingsActions.toggleChannelMemberOverride,
        createRole: settingsActions.createRole,
        toggleRolePermission: settingsActions.toggleRolePermission,
        deleteRole: settingsActions.deleteRole,
        toggleMemberRole: settingsActions.toggleMemberRole,
        removeMember: settingsActions.removeMember,
        loadBans: moderation.loadBans,
        banMember: moderation.banMember,
        unbanUser: moderation.unbanUser,
        timeoutMember: moderation.timeoutMember,
        leaveServer: moderation.leaveServer,
        transferOwnership: moderation.transferOwnership,
        deleteServer: moderation.deleteServer,
        createEmoji: serverEmojis.createEmoji,
        deleteEmoji: serverEmojis.deleteEmoji,
        openMemberRoleEditor: (memberId: string) => {
          setSelectedMemberId(memberId);
          setActiveDialog('member-roles');
        },
      },
    },
  };
}
