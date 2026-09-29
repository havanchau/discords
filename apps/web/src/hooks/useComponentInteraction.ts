import { useCallback, useEffect, useState } from 'react';
import { RealtimeEvents } from '@discord-clone/shared';
import type {
  ComponentClickInput,
  InteractionTimeoutPayload,
  InvokeInteractionResult,
} from '@discord-clone/shared';
import { apiRequest, Message } from '@/api';
import { useAuthContext, useSocketContext } from '@/contexts/appContexts';
import { useTranslation } from '@/i18n/LocaleProvider';

interface PendingClick {
  messageId: string;
  channelId: string;
}

/**
 * Owns the click → wait → resolved/timeout lifecycle of a message component
 * (`bot-message-components.md` → Changes, steps 4-7), mirroring
 * `useSlashCommandInvocation.ts`'s waiting-state pattern. The bot's answer is either a
 * `message:updated` for the same message (`UPDATE_MESSAGE`) or an ordinary `message:created` in the
 * channel (`MESSAGE`, no per-click "answered" event exists) — the waiting state clears on whichever
 * arrives first, or on `interaction:timeout`.
 */
export function useComponentInteraction() {
  const { auth } = useAuthContext();
  const { socket } = useSocketContext();
  const t = useTranslation();
  const [pendingByToken, setPendingByToken] = useState<Record<string, PendingClick>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!socket) return;
    const dropTokensWhere = (predicate: (pending: PendingClick) => boolean) => {
      setPendingByToken((current) => {
        const remaining = Object.entries(current).filter(([, pending]) => !predicate(pending));
        return remaining.length === Object.keys(current).length
          ? current
          : Object.fromEntries(remaining);
      });
    };
    const handleTimeout = (payload: InteractionTimeoutPayload) => {
      setPendingByToken((current) => {
        if (!(payload.interactionToken in current)) return current;
        const next = { ...current };
        delete next[payload.interactionToken];
        return next;
      });
      setError(t('component.interaction.timeout'));
    };
    const handleMessageUpdated = (message: Message) => {
      dropTokensWhere((pending) => pending.messageId === message.id);
    };
    const handleMessageCreated = (message: Message) => {
      dropTokensWhere((pending) => pending.channelId === message.channelId);
    };
    socket.on(RealtimeEvents.InteractionTimeout, handleTimeout);
    socket.on(RealtimeEvents.MessageUpdated, handleMessageUpdated);
    socket.on(RealtimeEvents.MessageCreated, handleMessageCreated);
    return () => {
      socket.off(RealtimeEvents.InteractionTimeout, handleTimeout);
      socket.off(RealtimeEvents.MessageUpdated, handleMessageUpdated);
      socket.off(RealtimeEvents.MessageCreated, handleMessageCreated);
    };
  }, [socket, t]);

  const clickComponent = useCallback(
    async (message: Pick<Message, 'id' | 'channelId'>, customId: string, values?: string[]) => {
      if (!auth) return;
      setError(null);
      try {
        const body: ComponentClickInput = { customId, values };
        const result = await apiRequest<InvokeInteractionResult>(
          `/messages/${message.id}/component-interactions`,
          { method: 'POST', body: JSON.stringify(body) },
          auth.accessToken,
        );
        setPendingByToken((current) => ({
          ...current,
          [result.interactionToken]: { messageId: message.id, channelId: message.channelId },
        }));
      } catch (err) {
        setError(err instanceof Error ? err.message : t('component.interaction.error'));
      }
    },
    [auth, t],
  );

  const isWaiting = useCallback(
    (messageId: string) =>
      Object.values(pendingByToken).some((pending) => pending.messageId === messageId),
    [pendingByToken],
  );

  return { clickComponent, isWaiting, error };
}
