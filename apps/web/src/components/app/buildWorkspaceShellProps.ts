import type { FormEvent, RefObject } from 'react';
import type { AuthState, Channel, DirectConversation, ServerDetail, ServerSummary } from '@/api';
import type { ActiveCallSummary, CallState, RemoteMedia } from '@/helpers';
import type { ChannelBadgeState } from '@/components/WorkspaceSidebar';
import type { ServerEventsState } from '@/hooks/useServerEvents';
import type { OutgoingDirectCall } from '@/hooks/useDirectCall';
import type { HomePanelProps } from '@/components/home/types';
import type { WorkspaceSidebarProps } from '@/components/workspace/types';
import type { MemberSidebarProps } from '@/components/MemberSidebar';
import type { SelectChannel } from '@/query/useWorkspaceStore';
import type { SavedMessagesPanel } from '@/components/saved/SavedMessagesPanel';
import type { IncomingCallDialog } from '@/components/home/IncomingCallDialog';
import type { ComponentProps } from 'react';
import { assetUrl } from '@/api';
import type { useSettingsActions } from '@/hooks/useSettingsActions';
import type { ChannelOrderEntry } from '@/hooks/useWorkspaceNavigation';

interface BuildWorkspaceShellPropsOptions {
  auth: AuthState;
  servers: ServerSummary[];
  server: ServerDetail | null;
  channel: Channel | null;
  visibleTextChannels: Channel[];
  visibleVoiceChannels: Channel[];
  channelQuery: string;
  inviteCode: string | null;
  isLoadingServers: boolean;
  pendingAction: string | null;
  activeCalls: Record<string, ActiveCallSummary>;
  channelBadges: Record<string, ChannelBadgeState>;
  settingsActions: Pick<
    ReturnType<typeof useSettingsActions>,
    | 'profileAvatarInputRef'
    | 'updateProfileAvatar'
    | 'createInviteFromSettings'
    | 'notificationPreferences'
    | 'updateNotificationPreference'
  >;
  serverEvents: ServerEventsState;
  openHome: () => void;
  openServer: (serverId: string) => Promise<void>;
  createServer: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  joinInvite: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  createChannel: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  reorderChannels: (entries: ChannelOrderEntry[]) => Promise<boolean>;
  createCategory: (event: FormEvent<HTMLFormElement>) => Promise<boolean>;
  updateCategory: (categoryId: string, changes: { name: string }) => Promise<boolean>;
  deleteCategory: (categoryId: string) => Promise<boolean>;
  reorderCategories: (orderedCategoryIds: string[]) => Promise<boolean>;
  logout: () => void;
  selectChannel: SelectChannel;
  setChannelQuery: (query: string) => void;
  setActiveDialog: WorkspaceSidebarProps['actions']['setActiveDialog'];
  setSelectedMemberId: (memberId: string | null) => void;
  startDirectConversation: (userId: string) => Promise<void>;
  sendFriendRequest: (usernameOrEmail: string) => Promise<void>;
  homeProps: Omit<HomePanelProps, 'call'>;
  callState: CallState | null;
  remoteMedia: RemoteMedia[];
  localVideoRef: RefObject<HTMLVideoElement | null>;
  outgoingCall: OutgoingDirectCall | null;
  startDirectCall: HomePanelProps['call']['startDirectCall'];
  toggleMute: () => void;
  toggleCamera: () => void;
  endDirectCall: () => void;
  isSavedMessagesOpen: boolean;
  setIsSavedMessagesOpen: (open: boolean) => void;
  incomingCall: ComponentProps<typeof IncomingCallDialog>['incomingCall'];
  conversationLabel: (conversationId: string, fallback: string) => string;
  acceptIncomingCall: ComponentProps<typeof IncomingCallDialog>['onAccept'];
  declineIncomingCall: ComponentProps<typeof IncomingCallDialog>['onDecline'];
}

/**
 * Assembles the `workspace`, `members`, `home`, `savedMessages` and `incomingCall` props of
 * `<AuthenticatedWorkspace>` from state and handlers already computed in `AppShell`.
 */
export function buildWorkspaceShellProps({
  auth,
  servers,
  server,
  channel,
  visibleTextChannels,
  visibleVoiceChannels,
  channelQuery,
  inviteCode,
  isLoadingServers,
  pendingAction,
  activeCalls,
  channelBadges,
  settingsActions,
  serverEvents,
  openHome,
  openServer,
  createServer,
  joinInvite,
  createChannel,
  reorderChannels,
  createCategory,
  updateCategory,
  deleteCategory,
  reorderCategories,
  logout,
  selectChannel,
  setChannelQuery,
  setActiveDialog,
  setSelectedMemberId,
  startDirectConversation,
  sendFriendRequest,
  homeProps,
  callState,
  remoteMedia,
  localVideoRef,
  outgoingCall,
  startDirectCall,
  toggleMute,
  toggleCamera,
  endDirectCall,
  isSavedMessagesOpen,
  setIsSavedMessagesOpen,
  incomingCall,
  conversationLabel,
  acceptIncomingCall,
  declineIncomingCall,
}: BuildWorkspaceShellPropsOptions): {
  workspace: WorkspaceSidebarProps;
  members: MemberSidebarProps;
  home: HomePanelProps;
  savedMessages: ComponentProps<typeof SavedMessagesPanel>;
  incomingCall: ComponentProps<typeof IncomingCallDialog>;
} {
  return {
    workspace: {
      workspace: {
        auth,
        servers,
        server,
        channel,
        visibleTextChannels,
        visibleVoiceChannels,
        channelQuery,
        inviteCode,
        isLoadingServers,
        pendingAction,
        activeCalls,
        channelBadges,
        notificationPreferences: settingsActions.notificationPreferences,
      },
      profileAvatarInputRef: settingsActions.profileAvatarInputRef,
      serverEvents,
      actions: {
        openHome,
        openServer,
        createServer,
        joinInvite,
        createChannel,
        reorderChannels,
        createCategory,
        updateCategory,
        deleteCategory,
        reorderCategories,
        createInvite: async () => {
          await settingsActions.createInviteFromSettings();
        },
        updateProfileAvatar: settingsActions.updateProfileAvatar,
        logout,
        selectChannel,
        setChannelQuery,
        setActiveDialog,
        updateNotificationPreference: settingsActions.updateNotificationPreference,
      },
    },
    members: {
      assetUrl,
      accessToken: auth.accessToken,
      viewerId: auth.user.id,
      onManageMember: (memberId) => {
        setSelectedMemberId(memberId);
        setActiveDialog('member-roles');
      },
      onDirectMessage: (userId) => {
        void startDirectConversation(userId);
      },
      onAddFriend: (usernameOrEmail) => {
        void sendFriendRequest(usernameOrEmail);
      },
      server,
    },
    home: {
      ...homeProps,
      call: {
        state: callState,
        activeCalls,
        remoteMedia,
        localVideoRef,
        outgoingCall,
        startDirectCall,
        toggleMute,
        toggleCamera,
        end: endDirectCall,
      },
    },
    savedMessages: {
      open: isSavedMessagesOpen,
      onOpenChange: setIsSavedMessagesOpen,
      conversations: homeProps.home.conversations,
      onOpenChannel: (serverId: string, channelId: string) => {
        void openServer(serverId);
        selectChannel(channelId);
      },
      onOpenConversation: (conversation: DirectConversation) => {
        openHome();
        void homeProps.actions.openDirectConversation(conversation);
      },
    },
    incomingCall: {
      incomingCall,
      conversationLabel: incomingCall
        ? conversationLabel(incomingCall.conversationId, incomingCall.caller.displayName)
        : null,
      onAccept: acceptIncomingCall,
      onDecline: declineIncomingCall,
    },
  };
}
