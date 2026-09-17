import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest, type ServerTemplateSummary } from '@/api';
import { useAuthContext } from '@/contexts/appContexts';
import { queryKeys } from '@/query/queryKeys';

/**
 * Built-in starter templates plus the private templates of every server the viewer manages. Read by
 * the create-server picker and by the server settings section that saves templates.
 */
export function useServerTemplates(enabled = true) {
  const { auth } = useAuthContext();
  const queryClient = useQueryClient();
  const token = auth?.accessToken;
  const queryKey = queryKeys.serverTemplates(auth?.user.id ?? 'anonymous');

  const query = useQuery({
    queryKey,
    enabled: enabled && Boolean(token),
    queryFn: () =>
      apiRequest<{ templates: ServerTemplateSummary[] }>('/templates', {}, token).then(
        (data) => data.templates,
      ),
  });

  const createMutation = useMutation({
    mutationFn: ({ serverId, name }: { serverId: string; name: string }) =>
      apiRequest<{ template: ServerTemplateSummary }>(
        `/servers/${serverId}/templates`,
        { method: 'POST', body: JSON.stringify({ name }) },
        token,
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const deleteMutation = useMutation({
    mutationFn: (templateId: string) =>
      apiRequest<{ ok: true }>(`/templates/${templateId}`, { method: 'DELETE' }, token),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  return {
    templates: query.data ?? [],
    isLoading: query.isPending,
    error: query.error,
    createTemplate: createMutation.mutateAsync,
    isCreating: createMutation.isPending,
    deleteTemplate: deleteMutation.mutateAsync,
    deletingId: deleteMutation.isPending ? deleteMutation.variables : null,
  };
}
