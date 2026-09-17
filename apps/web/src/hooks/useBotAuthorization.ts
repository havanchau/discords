import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest, AuthorizeBotInput, BotAuthorization } from '@/api';
import { useAuthContext } from '@/contexts/appContexts';
import { queryKeys } from '@/query/queryKeys';

const AUTHORIZE_PATH = /^\/bots\/([^/]+)\/authorize\/?$/;

/** The bot id and optional preselected server from an authorize link, or null on any other page. */
export function readBotAuthorizeLink() {
  const match = AUTHORIZE_PATH.exec(window.location.pathname);
  if (!match) return null;
  return {
    botId: decodeURIComponent(match[1]),
    serverId: new URLSearchParams(window.location.search).get('serverId'),
  };
}

/** Leaves the authorize link, so a reload does not reopen the dialog. */
export function clearBotAuthorizeLink() {
  window.history.replaceState({}, '', '/');
}

/**
 * The authorize dialog's data: which servers the viewer may add the bot to and the roles they may
 * grant there. The API applies the same rules again on confirm.
 */
export function useBotAuthorization(botId: string | null) {
  const { auth } = useAuthContext();
  const queryClient = useQueryClient();
  const token = auth?.accessToken;
  const userId = auth?.user.id ?? 'none';

  const query = useQuery({
    queryKey: queryKeys.botAuthorization(userId, botId ?? 'none'),
    enabled: Boolean(token && botId),
    queryFn: () => apiRequest<BotAuthorization>(`/bots/${botId}/authorize`, {}, token),
  });

  const authorizeMutation = useMutation({
    mutationFn: (input: AuthorizeBotInput) =>
      apiRequest(
        `/bots/${botId}/authorize`,
        { method: 'POST', body: JSON.stringify(input) },
        token,
      ),
    onSuccess: (_result, input) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.serverDetail(input.serverId) }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.botAuthorization(userId, botId ?? 'none'),
        }),
      ]),
  });

  return {
    authorization: query.data ?? null,
    isLoading: query.isPending && Boolean(token && botId),
    error: query.error,
    authorize: authorizeMutation.mutateAsync,
    isAuthorizing: authorizeMutation.isPending,
  };
}
