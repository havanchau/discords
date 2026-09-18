import { useEffect, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { RealtimeEvents } from '@discord-clone/shared';
import type { InteractionTimeoutPayload, InvokeInteractionResult } from '@discord-clone/shared';
import { apiRequest, AuthState, Message } from '@/api';
import type { Translate } from '@/i18n/LocaleProvider';

interface PendingInteraction {
  channelId: string;
  commandName: string;
}

interface UseSlashCommandInvocationOptions {
  auth: AuthState | null;
  socket: Socket | null;
  setWorkspaceError: (message: string | null) => void;
  t: Translate;
}

/**
 * Owns the invoke → wait → timeout lifecycle of a server-registered bot slash command
 * (`bot-gateway-and-slash-commands.md` → Invocation flow). The bot's actual answer is a normal
 * `message:created` broadcast in the channel (there is no separate "answered" event), so the waiting
 * placeholder clears on the next message in that channel, or on `interaction:timeout`.
 */
export function useSlashCommandInvocation({
  auth,
  socket,
  setWorkspaceError,
  t,
}: UseSlashCommandInvocationOptions) {
  const [pendingByToken, setPendingByToken] = useState<Record<string, PendingInteraction>>({});

  useEffect(() => {
    if (!socket) return;
    const handleTimeout = (payload: InteractionTimeoutPayload) => {
      setPendingByToken((current) => {
        if (!(payload.interactionToken in current)) return current;
        const next = { ...current };
        delete next[payload.interactionToken];
        return next;
      });
      setWorkspaceError(t('slash.interaction.timeout'));
    };
    socket.on(RealtimeEvents.InteractionTimeout, handleTimeout);
    return () => {
      socket.off(RealtimeEvents.InteractionTimeout, handleTimeout);
    };
  }, [socket, setWorkspaceError, t]);

  useEffect(() => {
    if (!socket) return;
    const handleMessageCreated = (message: Message) => {
      setPendingByToken((current) => {
        const remaining = Object.entries(current).filter(
          ([, pending]) => pending.channelId !== message.channelId,
        );
        return remaining.length === Object.keys(current).length
          ? current
          : Object.fromEntries(remaining);
      });
    };
    socket.on(RealtimeEvents.MessageCreated, handleMessageCreated);
    return () => {
      socket.off(RealtimeEvents.MessageCreated, handleMessageCreated);
    };
  }, [socket]);

  async function invokeBotCommand(params: {
    channelId: string;
    commandId: string;
    commandName: string;
    args: string;
  }): Promise<boolean> {
    if (!auth) return false;
    try {
      const result = await apiRequest<InvokeInteractionResult>(
        `/channels/${params.channelId}/interactions`,
        {
          method: 'POST',
          body: JSON.stringify({ commandId: params.commandId, args: params.args }),
        },
        auth.accessToken,
      );
      setPendingByToken((current) => ({
        ...current,
        [result.interactionToken]: { channelId: params.channelId, commandName: params.commandName },
      }));
      return true;
    } catch (err) {
      setWorkspaceError(err instanceof Error ? err.message : t('slash.interaction.error'));
      return false;
    }
  }

  function waitingLabel(channelId: string | null): string | null {
    if (!channelId) return null;
    const pending = Object.values(pendingByToken).find((entry) => entry.channelId === channelId);
    return pending ? t('slash.interaction.waiting', { command: pending.commandName }) : null;
  }

  return { invokeBotCommand, waitingLabel };
}
