import { Dispatch, SetStateAction, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiRequest, AuthState, Channel, Message, ServerDetail, ServerSummary } from '@/api';
import type { ChatPanelEncryption } from '@/components/chat/types';
import { parseEncryptedMessage } from '@/e2ee';
import type { PatchServer, PatchServers } from '@/query/useWorkspaceStore';
import { memberHasServerPermission } from '@/utils/serverPermissions';
import { useTranslation } from '@/i18n/LocaleProvider';
import type { DeviceKeysState } from './useDeviceKeys';
import { useScopeKeys } from './useScopeKeys';

/** How often an open encrypted channel hands its key to new devices and retries locked messages. */
const MAINTENANCE_INTERVAL_MS = 20_000;

interface UseChannelEncryptionOptions {
  auth: AuthState | null;
  server: ServerDetail | null;
  servers: ServerSummary[];
  channel: Channel | null;
  messages: Message[];
  setMessages: Dispatch<SetStateAction<Message[]>>;
  deviceKeys: DeviceKeysState;
  patchServer: PatchServer;
  patchServers: PatchServers;
  setWorkspaceError: (message: string | null) => void;
  setWorkspaceNotice: (message: string | null) => void;
}

function isLockedLegacyMessage(message: Message) {
  return (
    Boolean(message.decryptionFailed) &&
    parseEncryptedMessage(message.encryptedContent ?? '')?.version === 'v1'
  );
}

export function useChannelEncryption({
  auth,
  server,
  servers,
  channel,
  messages,
  setMessages,
  deviceKeys,
  patchServer,
  patchServers,
  setWorkspaceError,
  setWorkspaceNotice,
}: UseChannelEncryptionOptions) {
  const t = useTranslation();
  const scopeKeys = useScopeKeys({ auth, deviceKeys, onError: setWorkspaceError });
  const { decryptContent, encryptContent, ensureKey, shareCurrentKey, keyEpoch, reset } = scopeKeys;
  const [isUpdating, setIsUpdating] = useState(false);

  const messagesRef = useRef(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Looks a channel up across everything loaded, so a send never has to guess its encryption.
  const findChannel = useCallback(
    (channelId: string) =>
      channel?.id === channelId
        ? channel
        : (server?.channels.find((item) => item.id === channelId) ??
          servers.flatMap((item) => item.channels).find((item) => item.id === channelId)),
    [channel, server, servers],
  );
  const findChannelRef = useRef(findChannel);
  useEffect(() => {
    findChannelRef.current = findChannel;
  }, [findChannel]);

  const isChannelEncrypted = useCallback(
    (channelId: string) => Boolean(findChannel(channelId)?.isEncrypted),
    [findChannel],
  );

  function patchChannel(next: Channel) {
    const replace = (channels: Channel[]) =>
      channels.map((item) => (item.id === next.id ? next : item));
    patchServer((current) => ({ ...current, channels: replace(current.channels) }));
    patchServers((current) =>
      current.map((item) => ({ ...item, channels: replace(item.channels) })),
    );
  }

  const channelId = channel?.id ?? null;
  const isEncrypted = Boolean(channel?.isEncrypted);
  const keyVersion = channel?.encryptionKeyVersion ?? 0;

  // Stable identity (reads keys through the key store) so memoized message actions and rows do not
  // re-create on every render.
  const decryptMessageForDisplay = useCallback(
    async function decrypt(message: Message): Promise<Message> {
      const encryptedContent = message.encryptedContent ?? message.content;
      const replyToMessage = message.replyToMessage
        ? await decrypt(message.replyToMessage)
        : message.replyToMessage;

      const result = await decryptContent(
        { kind: 'channel', id: message.channelId },
        encryptedContent,
      );
      if (result.status === 'plain') return { ...message, replyToMessage };
      if (result.status === 'locked') {
        return {
          ...message,
          content: 'Encrypted message',
          encryptedContent,
          isEncrypted: true,
          decryptionFailed: true,
          replyToMessage,
        };
      }
      return {
        ...message,
        content: result.content,
        encryptedContent,
        isEncrypted: true,
        decryptionFailed: false,
        replyToMessage,
      };
    },
    [decryptContent],
  );

  const decryptMessagesForDisplay = useCallback(
    (nextMessages: Message[]) =>
      Promise.all(nextMessages.map((message) => decryptMessageForDisplay(message))),
    [decryptMessageForDisplay],
  );

  /** Opens messages that were locked when they loaded, once their key has arrived. */
  const reopenLockedMessages = useCallback(async () => {
    const locked = messagesRef.current.filter((message) => message.decryptionFailed);
    if (!locked.length) return;
    const reopened = await Promise.all(locked.map((message) => decryptMessageForDisplay(message)));
    const opened = new Map(
      reopened
        .filter((message) => !message.decryptionFailed)
        .map((message) => [message.id, message]),
    );
    if (!opened.size) return;
    // Skip any message edited while this ran: its newer ciphertext must not be overwritten.
    setMessages((current) =>
      current.map((message) => {
        const next = opened.get(message.id);
        return next && next.encryptedContent === message.encryptedContent ? next : message;
      }),
    );
  }, [decryptMessageForDisplay, setMessages]);

  useEffect(() => {
    void reopenLockedMessages();
  }, [keyEpoch, deviceKeys.identity, reopenLockedMessages]);

  useEffect(() => {
    if (!channelId || !isEncrypted || !deviceKeys.identity) return;
    const scope = { kind: 'channel' as const, id: channelId, isEncrypted, version: keyVersion };
    const maintain = async () => {
      try {
        await shareCurrentKey(scope);
        await reopenLockedMessages();
      } catch (err) {
        setWorkspaceError(
          err instanceof Error ? err.message : t('encryption.error.keyShareFailed'),
        );
      }
    };
    void maintain();
    const timer = window.setInterval(() => void maintain(), MAINTENANCE_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [
    channelId,
    isEncrypted,
    keyVersion,
    deviceKeys.identity,
    shareCurrentKey,
    reopenLockedMessages,
    setWorkspaceError,
    t,
  ]);

  /** Plaintext in, wire format out; throws (so the send fails) rather than ever sending plaintext. */
  const encryptForChannel = useCallback(
    async (targetChannelId: string, plaintext: string) => {
      if (plaintext === '') return plaintext;
      const target = findChannelRef.current(targetChannelId);
      if (!target) throw new Error(t('encryption.error.unknownChannel'));
      return encryptContent(
        {
          kind: 'channel',
          id: target.id,
          isEncrypted: Boolean(target.isEncrypted),
          version: target.encryptionKeyVersion ?? 0,
        },
        plaintext,
      );
    },
    [encryptContent, t],
  );

  async function setEncryption(enabled: boolean) {
    if (!auth || !channel) return;
    setIsUpdating(true);
    setWorkspaceError(null);
    try {
      // The flag must be on before the first wrap upload: the server refuses wraps for a scope that
      // is not encrypted.
      const result = await apiRequest<{ channel: Channel }>(
        `/channels/${channel.id}`,
        { method: 'PATCH', body: JSON.stringify({ isEncrypted: enabled }) },
        auth.accessToken,
      );
      patchChannel(result.channel);
      if (!enabled) {
        setWorkspaceNotice(t('encryption.disabledNotice'));
        return;
      }
      await ensureKey({
        kind: 'channel',
        id: result.channel.id,
        isEncrypted: true,
        version: result.channel.encryptionKeyVersion ?? 0,
      });
      setWorkspaceNotice(t('encryption.enabledNotice'));
    } catch (err) {
      setWorkspaceError(err instanceof Error ? err.message : t('encryption.error.keyShareFailed'));
    } finally {
      setIsUpdating(false);
    }
  }

  async function unlockLegacyMessages(passphrase: string) {
    if (!channel) return;
    try {
      await scopeKeys.unlockLegacy(channel.id, passphrase.trim());
      const locked = messagesRef.current.filter(isLockedLegacyMessage);
      const reopened = await Promise.all(
        locked.map((message) => decryptMessageForDisplay(message)),
      );
      // With older messages loaded, a passphrase that opens none of them is the wrong one.
      if (reopened.length && reopened.every((message) => message.decryptionFailed)) {
        scopeKeys.forgetLegacy(channel.id);
        setWorkspaceError(t('encryption.legacy.wrongPassphrase'));
        return;
      }
      const opened = new Map(reopened.map((message) => [message.id, message]));
      setMessages((current) => current.map((message) => opened.get(message.id) ?? message));
      setWorkspaceNotice(t('encryption.legacy.unlockedNotice'));
    } catch (err) {
      setWorkspaceError(
        err instanceof Error ? err.message : t('encryption.legacy.wrongPassphrase'),
      );
    }
  }

  const hasLockedLegacyMessages = useMemo(() => messages.some(isLockedLegacyMessage), [messages]);
  const isWaitingForKey =
    isEncrypted &&
    (deviceKeys.pendingWraps.some((pending) => pending.channelId === channelId) ||
      messages.some((message) => message.decryptionFailed && !isLockedLegacyMessage(message)));

  const panel: ChatPanelEncryption = {
    isChannelEncrypted: isEncrypted,
    canManageEncryption: Boolean(
      auth && memberHasServerPermission(server, auth.user.id, 'MANAGE_CHANNELS'),
    ),
    deviceStatus: deviceKeys.status,
    deviceError: deviceKeys.error,
    isWaitingForKey,
    hasLockedLegacyMessages,
    isUpdating,
    setEncryption,
    unlockLegacyMessages,
  };

  return {
    panel,
    isChannelEncrypted,
    clearChannelKeys: reset,
    encryptForChannel,
    decryptMessagesForDisplay,
    decryptMessageForDisplay,
  };
}
