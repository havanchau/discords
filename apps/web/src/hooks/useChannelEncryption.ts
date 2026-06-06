import { Dispatch, SetStateAction, useCallback, useEffect, useRef, useState } from 'react';
import { Channel, Message } from '../api';
import {
  decryptChannelMessage,
  deriveChannelKey,
  isEncryptedMessage,
} from '../e2ee';

interface UseChannelEncryptionOptions {
  channel: Channel | null;
  messages: Message[];
  setMessages: Dispatch<SetStateAction<Message[]>>;
  setWorkspaceError: (message: string | null) => void;
  setWorkspaceNotice: (message: string | null) => void;
}

export function useChannelEncryption({
  channel,
  messages,
  setMessages,
  setWorkspaceError,
  setWorkspaceNotice,
}: UseChannelEncryptionOptions) {
  const [channelKeys, setChannelKeys] = useState<Record<string, CryptoKey>>({});
  const channelKeysRef = useRef<Record<string, CryptoKey>>({});

  useEffect(() => {
    channelKeysRef.current = channelKeys;
  }, [channelKeys]);

  const clearChannelKeys = useCallback(() => {
    channelKeysRef.current = {};
    setChannelKeys({});
  }, []);

  async function configureChannelEncryption(passphrase: string) {
    if (!channel) return;
    const trimmedPassphrase = passphrase.trim();
    if (trimmedPassphrase.length < 8) {
      setWorkspaceError('Use at least 8 characters for the encryption passphrase.');
      return;
    }

    const key = await deriveChannelKey(channel.id, trimmedPassphrase);
    const nextKeys = { ...channelKeysRef.current, [channel.id]: key };
    channelKeysRef.current = nextKeys;
    setChannelKeys(nextKeys);
    setMessages(await Promise.all(messages.map((message) => decryptMessageForDisplay(message))));
    setWorkspaceNotice('End-to-end encryption enabled for this channel on this device.');
  }

  function clearChannelEncryption() {
    if (!channel) return;
    const nextKeys = { ...channelKeysRef.current };
    delete nextKeys[channel.id];
    channelKeysRef.current = nextKeys;
    setChannelKeys(nextKeys);
    setMessages((current) =>
      current.map((message) =>
        message.isEncrypted
          ? {
              ...message,
              content: 'Encrypted message',
              decryptionFailed: true,
            }
          : message,
      ),
    );
  }

  async function decryptMessagesForDisplay(nextMessages: Message[]) {
    return Promise.all(nextMessages.map((message) => decryptMessageForDisplay(message)));
  }

  async function decryptMessageForDisplay(message: Message): Promise<Message> {
    const encryptedContent = message.encryptedContent ?? message.content;
    const replyToMessage = message.replyToMessage
      ? await decryptMessageForDisplay(message.replyToMessage)
      : message.replyToMessage;

    if (!isEncryptedMessage(encryptedContent)) {
      return { ...message, replyToMessage };
    }

    const key = channelKeysRef.current[message.channelId];
    if (!key) {
      return {
        ...message,
        content: 'Encrypted message',
        encryptedContent,
        isEncrypted: true,
        decryptionFailed: true,
        replyToMessage,
      };
    }

    try {
      return {
        ...message,
        content: await decryptChannelMessage(key, encryptedContent),
        encryptedContent,
        isEncrypted: true,
        decryptionFailed: false,
        replyToMessage,
      };
    } catch {
      return {
        ...message,
        content: 'Encrypted message',
        encryptedContent,
        isEncrypted: true,
        decryptionFailed: true,
        replyToMessage,
      };
    }
  }

  return {
    channelKeys,
    channelKeysRef,
    clearChannelKeys,
    configureChannelEncryption,
    clearChannelEncryption,
    decryptMessagesForDisplay,
    decryptMessageForDisplay,
  };
}
