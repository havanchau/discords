import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest, ForumTagView, UpdateForumTagsInput } from '@/api';
import { useAuthContext } from '@/contexts/appContexts';
import { queryKeys } from '@/query/queryKeys';

const noTags: ForumTagView[] = [];

/** A forum channel's tag set, shared by the post list, the new-post form and channel settings. */
export function useForumTags(channelId: string | null) {
  const { auth } = useAuthContext();
  const queryClient = useQueryClient();
  const token = auth?.accessToken;
  const queryKey = queryKeys.forumTags(channelId ?? 'none');

  const query = useQuery({
    queryKey,
    enabled: Boolean(token && channelId),
    queryFn: () =>
      apiRequest<{ tags: ForumTagView[] }>(`/channels/${channelId}/forum-tags`, {}, token),
  });

  const replaceMutation = useMutation({
    mutationFn: (input: UpdateForumTagsInput) =>
      apiRequest<{ tags: ForumTagView[] }>(
        `/channels/${channelId}/forum-tags`,
        { method: 'PUT', body: JSON.stringify(input) },
        token,
      ),
    onSuccess: (result) => {
      queryClient.setQueryData(queryKey, result);
      // Renamed or deleted tags change how existing posts render.
      if (channelId) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.forumPostsOf(channelId) });
      }
    },
  });

  return {
    tags: query.data?.tags ?? noTags,
    isLoading: query.isPending && Boolean(channelId),
    error: query.error,
    replaceTags: replaceMutation.mutateAsync,
    isSaving: replaceMutation.isPending,
  };
}
