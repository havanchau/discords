import { apiRequest, AuthState, DirectConversation } from '../api';
import { useTranslation } from '../i18n/LocaleProvider';

interface UseGroupConversationsOptions {
  auth: AuthState | null;
  loadDirectConversations: (token?: string) => Promise<void>;
  openDirectConversation: (conversation: DirectConversation) => Promise<void>;
  removeDirectConversation: (conversationId: string) => void;
  setPendingAction: (action: string | null) => void;
  setWorkspaceError: (message: string | null) => void;
  setWorkspaceNotice: (message: string | null) => void;
}

export function useGroupConversations({
  auth,
  loadDirectConversations,
  openDirectConversation,
  removeDirectConversation,
  setPendingAction,
  setWorkspaceError,
  setWorkspaceNotice,
}: UseGroupConversationsOptions) {
  const t = useTranslation();
  async function runGroupAction<T>(
    pendingKey: string,
    request: (token: string) => Promise<T>,
    fallbackError: string,
  ): Promise<T | null> {
    if (!auth) return null;
    setPendingAction(pendingKey);
    setWorkspaceError(null);
    try {
      const result = await request(auth.accessToken);
      await loadDirectConversations(auth.accessToken);
      return result;
    } catch (err) {
      setWorkspaceError(err instanceof Error ? err.message : fallbackError);
      return null;
    } finally {
      setPendingAction(null);
    }
  }

  async function createGroupConversation(userIds: string[], name: string) {
    const result = await runGroupAction(
      'group-create',
      (token) =>
        apiRequest<{ conversation: DirectConversation }>(
          '/direct-conversations',
          { method: 'POST', body: JSON.stringify({ userIds, name: name.trim() || undefined }) },
          token,
        ),
      'Cannot create group',
    );
    if (!result) return false;
    await openDirectConversation(result.conversation);
    return true;
  }

  async function renameGroupConversation(conversationId: string, name: string) {
    const result = await runGroupAction(
      `group-rename-${conversationId}`,
      (token) =>
        apiRequest(
          `/direct-conversations/${conversationId}`,
          { method: 'PATCH', body: JSON.stringify({ name }) },
          token,
        ),
      'Cannot rename group',
    );
    return Boolean(result);
  }

  async function addGroupMember(conversationId: string, userId: string) {
    await runGroupAction(
      `group-add-${userId}`,
      (token) =>
        apiRequest(
          `/direct-conversations/${conversationId}/members`,
          { method: 'POST', body: JSON.stringify({ userId }) },
          token,
        ),
      'Cannot add member',
    );
  }

  async function removeGroupMember(conversationId: string, userId: string) {
    const isLeaving = userId === auth?.user.id;
    const result = await runGroupAction(
      `group-remove-${userId}`,
      (token) =>
        apiRequest(
          `/direct-conversations/${conversationId}/members/${userId}`,
          { method: 'DELETE' },
          token,
        ),
      isLeaving ? 'Cannot leave group' : 'Cannot remove member',
    );
    if (result && isLeaving) {
      // Do not rely on the realtime event alone; the socket may be disconnected.
      removeDirectConversation(conversationId);
      setWorkspaceNotice(t('notice.leftGroup'));
    }
  }

  return {
    createGroupConversation,
    renameGroupConversation,
    addGroupMember,
    removeGroupMember,
  };
}
