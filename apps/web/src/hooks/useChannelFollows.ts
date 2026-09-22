import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest, ChannelFollow, CreateChannelFollowInput } from '@/api';
import { useAuthContext } from '@/contexts/appContexts';
import { queryKeys } from '@/query/queryKeys';

const noFollows: ChannelFollow[] = [];

/**
 * Who follows an ANNOUNCEMENT channel (source side). The API requires MANAGE_MESSAGES on it, so the
 * caller only enables this where that is expected.
 */
export function useChannelFollowers(channelId: string) {
  const { auth } = useAuthContext();
  const token = auth?.accessToken;
  const query = useQuery({
    queryKey: queryKeys.channelFollowers(channelId),
    enabled: Boolean(token),
    queryFn: () =>
      apiRequest<{ followers: ChannelFollow[] }>(`/channels/${channelId}/followers`, {}, token),
  });
  return {
    followers: query.data?.followers ?? noFollows,
    isLoading: query.isPending && Boolean(token),
    error: query.error,
  };
}

/** Announcement channels a channel follows (target side), with unfollow; needs MANAGE_CHANNELS. */
export function useFollowedChannels(channelId: string) {
  const { auth } = useAuthContext();
  const queryClient = useQueryClient();
  const token = auth?.accessToken;
  const queryKey = queryKeys.channelFollowedChannels(channelId);

  const query = useQuery({
    queryKey,
    enabled: Boolean(token),
    queryFn: () =>
      apiRequest<{ follows: ChannelFollow[] }>(
        `/channels/${channelId}/followed-channels`,
        {},
        token,
      ),
  });

  const unfollowMutation = useMutation({
    mutationFn: (follow: ChannelFollow) =>
      apiRequest(
        `/channels/${follow.source.channelId}/followers/${follow.id}`,
        { method: 'DELETE' },
        token,
      ),
    onSuccess: (_result, follow) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.channelFollowers(follow.source.channelId),
        }),
      ]),
  });

  return {
    follows: query.data?.follows ?? noFollows,
    isLoading: query.isPending && Boolean(token),
    error: query.error,
    unfollow: unfollowMutation.mutateAsync,
    isBusy: unfollowMutation.isPending,
  };
}

/** Follows an ANNOUNCEMENT channel into a target channel; repeating a pair returns the same follow. */
export function useFollowChannel(sourceChannelId: string) {
  const { auth } = useAuthContext();
  const queryClient = useQueryClient();
  const token = auth?.accessToken;

  return useMutation({
    mutationFn: (input: CreateChannelFollowInput) =>
      apiRequest<{ follow: ChannelFollow }>(
        `/channels/${sourceChannelId}/followers`,
        { method: 'POST', body: JSON.stringify(input) },
        token,
      ),
    onSuccess: (_result, input) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.channelFollowers(sourceChannelId) }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.channelFollowedChannels(input.targetChannelId),
        }),
      ]),
  });
}
