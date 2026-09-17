import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { apiDownload, apiRequest, type AuthState, type ExportJob } from '@/api';
import { useTranslation } from '@/i18n/LocaleProvider';
import { queryKeys } from '@/query/queryKeys';

interface ExportJobResult {
  job: ExportJob | null;
}

/** While a job is being prepared elsewhere (another tab or device), the status is polled. */
const PENDING_POLL_MS = 5_000;
/** Long enough for the browser to start the save before the object URL is released. */
const OBJECT_URL_RELEASE_MS = 10_000;

export function useAccountExport(auth: AuthState) {
  const t = useTranslation();
  const queryClient = useQueryClient();
  const queryKey = queryKeys.accountExport(auth.user.id);
  const [error, setError] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey,
    queryFn: () => apiRequest<ExportJobResult>('/users/me/export', {}, auth.accessToken),
    refetchInterval: (query) =>
      query.state.data?.job?.status === 'PENDING' ? PENDING_POLL_MS : false,
  });

  const requestMutation = useMutation({
    mutationFn: (password: string) =>
      apiRequest<{ jobId: string }>(
        '/users/me/export',
        { method: 'POST', body: JSON.stringify({ password }) },
        auth.accessToken,
      ),
  });

  /** Resolves true when a job was created; its outcome (ready or failed) comes from the status. */
  async function requestExport(password: string) {
    setError(null);
    try {
      const { jobId } = await requestMutation.mutateAsync(password);
      const result = await apiRequest<{ job: ExportJob }>(
        `/users/me/export/${jobId}`,
        {},
        auth.accessToken,
      );
      queryClient.setQueryData<ExportJobResult>(queryKey, { job: result.job });
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error.fallback.cannot-request-export'));
      return false;
    }
  }

  async function downloadExport(job: ExportJob) {
    if (!job.downloadUrl) return;
    setIsDownloading(true);
    setError(null);
    try {
      const blob = await apiDownload(job.downloadUrl, auth.accessToken);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `discords-export-${job.id}.json`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), OBJECT_URL_RELEASE_MS);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error.fallback.cannot-download-export'));
      // A 404 here means the link expired since the status was read.
      await queryClient.invalidateQueries({ queryKey });
    } finally {
      setIsDownloading(false);
    }
  }

  return {
    job: data?.job ?? null,
    isLoading,
    loadError: isError ? t('error.fallback.cannot-load-export-status') : null,
    error,
    isRequesting: requestMutation.isPending,
    isDownloading,
    requestExport,
    downloadExport,
  };
}
