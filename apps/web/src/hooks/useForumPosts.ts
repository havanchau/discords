import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { RealtimeEvents } from '@discord-clone/shared';
import {
  apiRequest,
  CreateForumPostInput,
  ForumPost,
  ForumPostListResult,
  Message,
  ThreadMessageResult,
  uploadMessageAttachments,
} from '@/api';
import { useAuthContext, useSocketContext } from '@/contexts/appContexts';
import { queryKeys } from '@/query/queryKeys';

export interface NewForumPost {
  title: string;
  tagIds: string[];
  content: string;
  files: File[];
}

/**
 * A forum channel's posts, most recent activity first. Realtime events only invalidate the list:
 * the order depends on activity the event does not fully describe, and the refetch is one page.
 */
export function useForumPosts(channelId: string, tagId: string | null) {
  const { auth } = useAuthContext();
  const { socket } = useSocketContext();
  const queryClient = useQueryClient();
  const token = auth?.accessToken;

  const query = useInfiniteQuery({
    queryKey: queryKeys.forumPosts(channelId, tagId),
    enabled: Boolean(token),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams();
      if (pageParam) params.set('cursor', pageParam);
      if (tagId) params.set('tagId', tagId);
      const search = params.toString();
      return apiRequest<ForumPostListResult>(
        `/channels/${channelId}/forum-posts${search ? `?${search}` : ''}`,
        {},
        token,
      );
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });

  useEffect(() => {
    if (!socket) return;
    const refresh = (eventChannelId: string | undefined) => {
      if (eventChannelId !== channelId) return;
      void queryClient.invalidateQueries({ queryKey: queryKeys.forumPostsOf(channelId) });
    };
    const handlePostCreated = (payload: ForumPost) => refresh(payload.thread.channelId);
    const handleReply = (payload: ThreadMessageResult) => refresh(payload.rootMessage.channelId);
    const handleMessageChanged = (message: Message) => refresh(message.channelId);
    socket.on(RealtimeEvents.ForumPostCreated, handlePostCreated);
    socket.on(RealtimeEvents.ThreadMessageCreated, handleReply);
    socket.on(RealtimeEvents.MessageUpdated, handleMessageChanged);
    socket.on(RealtimeEvents.MessageDeleted, handleMessageChanged);
    socket.on(RealtimeEvents.ThreadMessageDeleted, handleMessageChanged);
    return () => {
      socket.off(RealtimeEvents.ForumPostCreated, handlePostCreated);
      socket.off(RealtimeEvents.ThreadMessageCreated, handleReply);
      socket.off(RealtimeEvents.MessageUpdated, handleMessageChanged);
      socket.off(RealtimeEvents.MessageDeleted, handleMessageChanged);
      socket.off(RealtimeEvents.ThreadMessageDeleted, handleMessageChanged);
    };
  }, [channelId, queryClient, socket]);

  const createMutation = useMutation({
    mutationFn: async (post: NewForumPost) => {
      if (!token) throw new Error('Not signed in');
      const attachments = await uploadMessageAttachments(post.files, token);
      const input: CreateForumPostInput = {
        title: post.title,
        tagIds: post.tagIds,
        content: post.content,
        attachments,
      };
      return apiRequest<ForumPost>(
        `/channels/${channelId}/forum-posts`,
        { method: 'POST', body: JSON.stringify(input) },
        token,
      );
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.forumPostsOf(channelId) }),
  });

  return {
    posts: query.data?.pages.flatMap((page) => page.posts) ?? [],
    isLoading: query.isPending,
    error: query.error,
    hasMore: query.hasNextPage,
    isLoadingMore: query.isFetchingNextPage,
    loadMore: query.fetchNextPage,
    createPost: createMutation.mutateAsync,
    isCreating: createMutation.isPending,
  };
}
