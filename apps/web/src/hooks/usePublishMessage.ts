import { Dispatch, SetStateAction, useCallback } from 'react';
import { apiRequest, AuthState, Message, PublishMessageResult } from '@/api';
import type { Translate } from '@/i18n/LocaleProvider';

interface UsePublishMessageOptions {
  auth: AuthState | null;
  decryptMessageForDisplay: (message: Message) => Promise<Message>;
  setMessages: Dispatch<SetStateAction<Message[]>>;
  setWorkspaceError: (error: string | null) => void;
  setWorkspaceNotice: (notice: string | null) => void;
  t: Translate;
}

/**
 * Publishes an ANNOUNCEMENT channel message to every following channel. Other open views get the
 * Published mark through `message:updated`; this view applies the response right away, so the mark
 * shows even without a live socket. Failures surface as the workspace error.
 */
export function usePublishMessage({
  auth,
  decryptMessageForDisplay,
  setMessages,
  setWorkspaceError,
  setWorkspaceNotice,
  t,
}: UsePublishMessageOptions) {
  return useCallback(
    async (messageId: string) => {
      if (!auth) return;
      setWorkspaceError(null);
      try {
        const result = await apiRequest<PublishMessageResult>(
          `/messages/${messageId}/publish`,
          { method: 'POST' },
          auth.accessToken,
        );
        const displayMessage = await decryptMessageForDisplay(result.message);
        setMessages((current) =>
          current.map((message) => (message.id === messageId ? displayMessage : message)),
        );
        setWorkspaceNotice(t('announcement.publish.done', { count: result.followerCount }));
      } catch (err) {
        setWorkspaceError(
          err instanceof Error ? err.message : t('error.fallback.cannot-publish-message'),
        );
      }
    },
    [auth, decryptMessageForDisplay, setMessages, setWorkspaceError, setWorkspaceNotice, t],
  );
}
