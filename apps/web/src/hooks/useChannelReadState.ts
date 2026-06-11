import type { Dispatch, SetStateAction } from 'react';
import { apiRequest, type AuthState } from '../api';
import type { ChannelBadgeState } from '../components/WorkspaceSidebar';

interface UseChannelReadStateOptions {
  auth: AuthState | null;
  setChannelBadges: Dispatch<SetStateAction<Record<string, ChannelBadgeState>>>;
}

export function useChannelReadState({ auth, setChannelBadges }: UseChannelReadStateOptions) {
  async function markChannelRead(channelId: string, messageId?: string) {
    if (!auth) return;
    try {
      await apiRequest(
        `/channels/${channelId}/read`,
        {
          method: 'POST',
          body: JSON.stringify({ messageId }),
        },
        auth.accessToken,
      );
      setChannelBadges((current) => {
        const next = { ...current };
        delete next[channelId];
        return next;
      });
    } catch {
      // Read state is a convenience feature; avoid blocking chat if it fails.
    }
  }

  return { markChannelRead };
}
