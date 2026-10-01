import { Dispatch, FormEvent, SetStateAction, useMemo } from 'react';
import type { Socket } from 'socket.io-client';
import {
  apiRequest,
  AuthState,
  Channel,
  Message,
  ServerDetail,
  uploadMessageAttachments,
} from '@/api';
import type { VoiceAttachmentMetadata } from '@discord-clone/shared';
import type { Translate } from '@/i18n/LocaleProvider';
import { executeSlashCommand } from '@/utils/executeSlashCommand';
import { memberHasServerPermission } from '@/utils/serverPermissions';
import { toBotSlashCommandDefinition } from '@/utils/slashCommands';
import { useChannelMessageActions } from './useChannelMessageActions';
import { usePublishMessage } from './usePublishMessage';
import type { usePersistentDraft } from './usePersistentDrafts';
import { useSlashCommandInvocation } from './useSlashCommandInvocation';

interface UseMessageComposerActionsOptions {
  auth: AuthState | null;
  channel: Channel | null;
  server: ServerDetail | null;
  socket: Socket | null;
  messages: Message[];
  encryptForChannel: (channelId: string, plaintext: string) => Promise<string>;
  channelDraft: ReturnType<typeof usePersistentDraft>;
  selectedFiles: File[];
  setSelectedFiles: Dispatch<SetStateAction<File[]>>;
  replyingToMessage: Message | null;
  setReplyingToMessage: (message: Message | null) => void;
  decryptMessageForDisplay: (message: Message) => Promise<Message>;
  setMessages: Dispatch<SetStateAction<Message[]>>;
  setPendingAction: (action: string | null) => void;
  setWorkspaceError: (error: string | null) => void;
  setWorkspaceNotice: (notice: string | null) => void;
  markMessageSent: (channelId: string) => void;
  openServer: (
    serverId: string,
    token?: string,
    preferredChannelId?: string | null,
  ) => Promise<void>;
  editingMessageId: string | null;
  editingDraft: string;
  setEditingMessageId: (messageId: string | null) => void;
  setEditingDraft: (draft: string) => void;
  openThread: (message: Message) => Promise<void>;
  togglePinnedMessage: (message: Message) => Promise<void>;
  t: Translate;
}

/** Sends channel text/attachment/sticker messages over the socket (with an HTTP fallback), and slash commands. */
export function useMessageComposerActions({
  auth,
  channel,
  server,
  socket,
  messages,
  encryptForChannel,
  channelDraft,
  selectedFiles,
  setSelectedFiles,
  replyingToMessage,
  setReplyingToMessage,
  decryptMessageForDisplay,
  setMessages,
  setPendingAction,
  setWorkspaceError,
  setWorkspaceNotice,
  markMessageSent,
  openServer,
  editingMessageId,
  editingDraft,
  setEditingMessageId,
  setEditingDraft,
  openThread,
  togglePinnedMessage,
  t,
}: UseMessageComposerActionsOptions) {
  const { invokeBotCommand, waitingLabel } = useSlashCommandInvocation({
    auth,
    socket,
    setWorkspaceError,
    t,
  });

  // Server-level approximation for the suggestion list; the API applies channel overrides and is the
  // authoritative gate (same pattern as `canManageMessages` below).
  const botCommands = useMemo(() => {
    if (!auth || !server) return [];
    const canUseCommands =
      memberHasServerPermission(server, auth.user.id, 'VIEW_CHANNEL') &&
      memberHasServerPermission(server, auth.user.id, 'SEND_MESSAGES');
    if (!canUseCommands) return [];
    return server.slashCommands.map(toBotSlashCommandDefinition);
  }, [auth, server]);

  const pendingInteractionLabel = waitingLabel(channel?.id ?? null);

  async function sendChatMessage(
    content: string,
    files: File[],
    voice?: VoiceAttachmentMetadata | null,
    stickerId?: string,
  ) {
    if (!auth || !channel) return false;
    if (!content && files.length === 0 && !stickerId) return;
    setPendingAction('send-message');
    setWorkspaceError(null);
    try {
      // Encrypt first: a failure must not leave freshly uploaded attachments behind, and it must
      // fail the send instead of falling back to plaintext.
      const messageContent = await encryptForChannel(channel.id, content);
      const attachments = await uploadMessageAttachments(files, auth.accessToken, voice);
      const payload = {
        channelId: channel.id,
        content: messageContent,
        attachments,
        replyToMessageId: replyingToMessage?.id,
        stickerId,
      };
      socket?.emit('typing:stop', { channelId: channel.id });
      if (socket?.connected) {
        const acknowledged = await new Promise<boolean>((resolve) => {
          socket
            .timeout(5000)
            .emit(
              'message:create',
              payload,
              async (err: Error | null, result?: { message?: Message; error?: string }) => {
                if (err || !result?.message) {
                  setWorkspaceError(result?.error ?? 'Message was not acknowledged. Try again.');
                  resolve(false);
                  return;
                }
                markMessageSent(channel.id);
                const displayMessage = await decryptMessageForDisplay(result.message);
                setMessages((current) =>
                  current.some((item) => item.id === displayMessage.id)
                    ? current
                    : [...current, displayMessage],
                );
                resolve(true);
              },
            );
        });
        return acknowledged;
      }
      const result = await apiRequest<{ message: Message }>(
        `/channels/${channel.id}/messages`,
        {
          method: 'POST',
          body: JSON.stringify({
            content: messageContent,
            attachments,
            replyToMessageId: replyingToMessage?.id,
            stickerId,
          }),
        },
        auth.accessToken,
      );
      const displayMessage = await decryptMessageForDisplay(result.message);
      setMessages((current) => [...current, displayMessage]);
      markMessageSent(channel.id);
      return true;
    } catch (err) {
      setWorkspaceError(
        err instanceof Error ? err.message : t('error.fallback.cannot-send-message'),
      );
      return false;
    } finally {
      setPendingAction(null);
    }
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!auth) return;
    let content = channelDraft.value.trim();
    const files = selectedFiles;
    if (!content && files.length === 0) return;
    const commandResult = await executeSlashCommand({
      content,
      isChannelEncrypted: Boolean(channel?.isEncrypted),
      auth,
      server,
      channel,
      openServer,
      clearDraft: channelDraft.clear,
      addMessage: (message) =>
        setMessages((current) =>
          current.some((item) => item.id === message.id) ? current : [...current, message],
        ),
      setWorkspaceError,
      setWorkspaceNotice,
      invokeBotCommand,
      t,
    });
    if (commandResult.handled) return;
    content = commandResult.content;
    const sent = await sendChatMessage(content, files);
    if (!sent) return;
    channelDraft.clear();
    setSelectedFiles([]);
    setReplyingToMessage(null);
  }

  const canManageMessages = Boolean(
    auth && memberHasServerPermission(server, auth.user.id, 'MANAGE_MESSAGES'),
  );
  const publishMessage = usePublishMessage({
    auth,
    decryptMessageForDisplay,
    setMessages,
    setWorkspaceError,
    setWorkspaceNotice,
    t,
  });
  const messageActions = useChannelMessageActions({
    auth,
    socket,
    channel,
    messages,
    encryptForChannel,
    decryptMessageForDisplay,
    setMessages,
    editingMessageId,
    editingDraft,
    setEditingMessageId,
    setEditingDraft,
    setReplyingToMessage,
    openThread,
    togglePinnedMessage,
    canManageMessages,
    // Server-level approximation, like `canManageMessages`; the API checks the channel.
    canPublish: canManageMessages && channel?.type === 'ANNOUNCEMENT',
    publishMessage,
  });

  return { sendChatMessage, sendMessage, messageActions, botCommands, pendingInteractionLabel };
}
