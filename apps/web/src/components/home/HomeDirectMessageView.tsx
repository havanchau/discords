import { useState } from 'react';
import { MessageSquare, Phone, Users, Video } from 'lucide-react';
import type { AuthState, DirectConversation, DirectMessage, FriendEntry } from '@/api';
import { directCallId } from '@/hooks/useDirectCall';
import { useTranslation } from '@/i18n/LocaleProvider';
import { cn } from '@/utils/cn';
import { CallStage } from '@/components/chat/CallStage';
import {
  Button,
  IconButton,
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
  Tooltip,
} from '@/components/ui';
import { DirectMessageComposer } from './DirectMessageComposer';
import type { DirectMessageRowActions } from './DirectMessageRow';
import { DirectMessageTimeline, jumpToDirectMessage } from './DirectMessageTimeline';
import { DirectPinnedMessages } from './DirectPinnedMessages';
import { conversationDisplayName, conversationPartners } from './conversationDisplay';
import { GroupConversationMenu } from './GroupConversationMenu';
import { UserAvatar } from './UserAvatar';
import { ProfileCard } from '@/components/profile/ProfileCard';
import type { HomeDirectCall, HomePanelActions, HomePanelState } from './types';
import styles from './HomePanel.module.css';

type HomeDirectMessageViewProps = {
  auth: AuthState;
  activeConversation: DirectConversation | null;
  directMessages: DirectMessage[];
  directMessageDraft: string;
  pendingAction: string | null;
  pins: Pick<HomePanelState, 'pinnedDirectMessages' | 'isLoadingPins' | 'pinsError'>;
  friends: FriendEntry[];
  replyingTo: DirectMessage | null;
  actions: Pick<
    HomePanelActions,
    | 'sendDirectMessage'
    | 'sendDirectVoiceMessage'
    | 'reportComposerError'
    | 'setDirectMessageDraft'
    | 'setReplyingToDirectMessage'
    | 'editDirectMessage'
    | 'deleteDirectMessage'
    | 'toggleDirectReaction'
    | 'toggleDirectPin'
    | 'loadDirectPins'
    | 'updateDirectPoll'
    | 'renameGroupConversation'
    | 'addGroupMember'
    | 'removeGroupMember'
  >;
  call: HomeDirectCall;
  onSendDirectMessage: HomePanelActions['sendDirectMessage'];
};

export function HomeDirectMessageView({
  auth,
  activeConversation,
  directMessages,
  directMessageDraft,
  pendingAction,
  pins,
  friends,
  replyingTo,
  actions,
  call,
  onSendDirectMessage,
}: HomeDirectMessageViewProps) {
  const t = useTranslation();
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const partners = activeConversation ? conversationPartners(activeConversation, auth.user.id) : [];
  const dmPartner = partners[0];
  const isGroup = Boolean(activeConversation?.isGroup);
  const title = activeConversation ? conversationDisplayName(activeConversation, auth.user.id) : '';
  const callId = activeConversation ? directCallId(activeConversation.id) : null;
  const isInThisCall = Boolean(callId && call.state?.channelId === callId);
  const activeCall = callId ? (call.activeCalls[callId] ?? null) : null;
  const isRinging = Boolean(
    activeConversation && call.outgoingCall?.conversationId === activeConversation.id,
  );

  const rowActions: DirectMessageRowActions = {
    onReply: actions.setReplyingToDirectMessage,
    onEdit: actions.editDirectMessage,
    onDelete: actions.deleteDirectMessage,
    onReact: actions.toggleDirectReaction,
    onTogglePin: actions.toggleDirectPin,
    onPollUpdate: actions.updateDirectPoll,
    onJumpToMessage: jumpToDirectMessage,
  };

  const replyingToName = replyingTo
    ? replyingTo.authorId === auth.user.id
      ? auth.user.displayName
      : (replyingTo.author?.displayName ?? null)
    : null;

  return (
    <main
      className={cn(styles.chat, !activeConversation && styles.chatEmpty)}
      aria-label={t('dm.threadLabel')}
    >
      {activeConversation && (isGroup || dmPartner) ? (
        <>
          <header className={styles.chatHeader}>
            {isGroup || !dmPartner ? (
              <span className={styles.groupAvatar} aria-hidden="true">
                <Users size={16} />
              </span>
            ) : (
              <PopoverRoot open={isProfileOpen} onOpenChange={setIsProfileOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className={styles.headerAvatarButton}
                    aria-label={t('members.viewProfile', { name: dmPartner.displayName })}
                  >
                    <UserAvatar user={dmPartner} />
                  </button>
                </PopoverTrigger>
                <PopoverContent side="bottom" align="start">
                  <ProfileCard
                    accessToken={auth.accessToken}
                    userId={dmPartner.id}
                    viewerId={auth.user.id}
                    isOpen={isProfileOpen}
                  />
                </PopoverContent>
              </PopoverRoot>
            )}
            <span className={styles.headerText}>
              <strong className={styles.headerName}>{title}</strong>
              <span className={styles.headerHandle}>
                {isGroup
                  ? t('dm.header.memberCount', { count: partners.length + 1 })
                  : `@${dmPartner?.username}`}
              </span>
            </span>
            <span className={styles.headerActions}>
              {(['voice', 'video'] as const).map((mode) => {
                const label =
                  mode === 'voice'
                    ? t('chatHeader.startVoiceCall')
                    : t('chatHeader.startVideoCall');
                const Icon = mode === 'voice' ? Phone : Video;
                return (
                  <Tooltip key={mode} content={label}>
                    <IconButton
                      label={label}
                      disabled={Boolean(call.state)}
                      data-testid={`dm-${mode}-call-button`}
                      onClick={() => void call.startDirectCall(activeConversation.id, mode, title)}
                    >
                      <Icon size={18} aria-hidden="true" />
                    </IconButton>
                  </Tooltip>
                );
              })}
              {isGroup ? (
                <GroupConversationMenu
                  conversation={activeConversation}
                  viewer={auth.user}
                  partners={partners}
                  friends={friends}
                  pendingAction={pendingAction}
                  onRename={actions.renameGroupConversation}
                  onAddMember={actions.addGroupMember}
                  onRemoveMember={actions.removeGroupMember}
                />
              ) : null}
              <DirectPinnedMessages
                pinnedMessages={pins.pinnedDirectMessages}
                isLoading={pins.isLoadingPins}
                error={pins.pinsError}
                onOpen={() => void actions.loadDirectPins(activeConversation.id)}
                onJumpToMessage={jumpToDirectMessage}
              />
            </span>
          </header>
          {isRinging ? (
            <div className={styles.ringingBanner} role="status">
              <span>{t('dm.calling', { name: title })}</span>
              <Button type="button" size="sm" variant="danger" onClick={call.end}>
                {t('common.cancel')}
              </Button>
            </div>
          ) : null}
          {isInThisCall || (activeCall && !call.state) ? (
            <CallStage
              // Direct messages are not server-scoped, so there are no per-server identities.
              session={{ auth, channel: null, memberIdentities: {} }}
              contextLabel={title}
              call={{
                state: isInThisCall ? call.state : null,
                active: activeCall,
                remoteMedia: isInThisCall ? call.remoteMedia : [],
                localVideoRef: call.localVideoRef,
                start: (mode) =>
                  call.startDirectCall(
                    activeConversation.id,
                    mode === 'video' ? 'video' : 'voice',
                    title,
                  ),
                toggleMute: call.toggleMute,
                toggleCamera: call.toggleCamera,
                end: call.end,
              }}
            />
          ) : null}
          <DirectMessageTimeline
            auth={auth}
            emptyStateName={title}
            members={partners}
            directMessages={directMessages}
            actions={rowActions}
          />
          <DirectMessageComposer
            // Keyed so files picked in one conversation are never sent to another.
            key={activeConversation.id}
            placeholderName={isGroup ? title : `@${dmPartner?.username}`}
            draft={directMessageDraft}
            pendingAction={pendingAction}
            replyingTo={replyingTo}
            replyingToName={replyingToName}
            onCancelReply={() => actions.setReplyingToDirectMessage(null)}
            onSendDirectMessage={onSendDirectMessage}
            onSendVoiceMessage={actions.sendDirectVoiceMessage}
            onComposerError={actions.reportComposerError}
            conversationId={activeConversation.id}
            onDraftChange={actions.setDirectMessageDraft}
          />
        </>
      ) : (
        <div className={styles.statePanel}>
          <MessageSquare size={28} aria-hidden="true" />
          <strong className={styles.statePanelTitle}>{t('dm.emptyTitle')}</strong>
          <span className={styles.statePanelCopy}>{t('dm.emptyCopy')}</span>
        </div>
      )}
    </main>
  );
}
