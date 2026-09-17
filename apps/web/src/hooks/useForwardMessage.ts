import { useMutation } from '@tanstack/react-query';
import { apiRequest, DirectMessage, ForwardMessageInput, Message } from '@/api';
import { useAuthContext } from '@/contexts/appContexts';

export type ForwardSourceType = 'CHANNEL' | 'DIRECT';

/**
 * Forwards one message. The created copy reaches every open view through the normal
 * `message:created` / `dm:created` events, so nothing is written into a cache here.
 */
export function useForwardMessage(sourceType: ForwardSourceType, messageId: string) {
  const { auth } = useAuthContext();
  const token = auth?.accessToken;
  const path =
    sourceType === 'CHANNEL'
      ? `/messages/${messageId}/forward`
      : `/direct-messages/${messageId}/forward`;

  return useMutation({
    mutationFn: (input: ForwardMessageInput) =>
      apiRequest<{ message: Message | DirectMessage }>(
        path,
        { method: 'POST', body: JSON.stringify(input) },
        token,
      ),
  });
}
