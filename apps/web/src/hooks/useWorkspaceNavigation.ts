import { FormEvent, useCallback, useMemo, useState } from 'react';
import { apiRequest, AuthState, Channel, ChannelCategory, ServerDetail } from '@/api';
import { ActiveDialog } from '@/components/chat/types';
import type { ChannelCreateType } from '@/components/workspace/types';
import { useTranslation } from '@/i18n/LocaleProvider';
import { useWorkspaceStore } from '@/query/useWorkspaceStore';
import { formText } from '@/utils/formText';

interface UseWorkspaceNavigationProps {
  auth: AuthState | null;
  clearAuth: () => void;
  setWorkspaceError: (error: string | null) => void;
  setWorkspaceNotice: (notice: string | null) => void;
  setPendingAction: (action: string | null) => void;
  setActiveDialog: (dialog: ActiveDialog) => void;
}

export function useWorkspaceNavigation({
  auth,
  clearAuth,
  setWorkspaceError,
  setWorkspaceNotice,
  setPendingAction,
  setActiveDialog,
}: UseWorkspaceNavigationProps) {
  const t = useTranslation();
  const [inviteCode] = useState<string | null>(null);
  const [channelQuery, setChannelQuery] = useState('');

  const reportLoadError = useCallback(
    (message: string) => {
      setWorkspaceError(message || t('error.fallback.cannot-load-servers'));
    },
    [setWorkspaceError, t],
  );

  const store = useWorkspaceStore({
    token: auth?.accessToken,
    userId: auth?.user.id,
    onUnauthorized: clearAuth,
    onError: reportLoadError,
  });
  const {
    servers,
    server,
    channel,
    isLoadingServers,
    openServer: openServerById,
    openHome,
    selectChannel,
    patchServer,
    patchServers,
    seedServerDetail,
    refreshServers,
  } = store;

  const openServer = useCallback(
    (serverId: string) => {
      openServerById(serverId);
      return Promise.resolve();
    },
    [openServerById],
  );

  const joinServerByInvite = useCallback(
    async (code: string) => {
      if (!auth) return;
      setPendingAction('join-server');
      setWorkspaceError(null);
      try {
        const data = await apiRequest<{ server: ServerDetail }>(
          `/servers/invites/${code}/join`,
          { method: 'POST' },
          auth.accessToken,
        );
        seedServerDetail(data.server);
        await refreshServers();
        setActiveDialog(null);
        setWorkspaceNotice(`Joined ${data.server.name}`);
      } catch (err) {
        setWorkspaceError(err instanceof Error ? err.message : t('error.fallback.invalid-invite'));
      } finally {
        setPendingAction(null);
      }
    },
    [
      auth,
      refreshServers,
      seedServerDetail,
      setActiveDialog,
      setPendingAction,
      setWorkspaceError,
      setWorkspaceNotice,
      t,
    ],
  );

  const createServer = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!auth) return;
      const formData = new FormData(event.currentTarget);
      const name = formText(formData, 'name').trim();
      const description = formText(formData, 'description').trim();
      // A template replays its structure into the new server; the response is the same `{ server }`.
      const templateId = formText(formData, 'templateId');
      if (!name) return;
      setPendingAction('create-server');
      setWorkspaceError(null);
      try {
        const data = await apiRequest<{ server: ServerDetail }>(
          templateId ? `/servers/from-template/${encodeURIComponent(templateId)}` : '/servers',
          { method: 'POST', body: JSON.stringify({ name, description }) },
          auth.accessToken,
        );
        seedServerDetail(data.server);
        await refreshServers();
        setActiveDialog(null);
        setWorkspaceNotice(`Created server ${data.server.name}`);
      } catch (err) {
        setWorkspaceError(
          err instanceof Error ? err.message : t('error.fallback.cannot-create-server'),
        );
      } finally {
        setPendingAction(null);
      }
    },
    [
      auth,
      refreshServers,
      seedServerDetail,
      setActiveDialog,
      setPendingAction,
      setWorkspaceError,
      setWorkspaceNotice,
      t,
    ],
  );

  const joinInvite = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      const code = formText(formData, 'code').trim();
      if (!code) return;
      await joinServerByInvite(code);
    },
    [joinServerByInvite],
  );

  const createChannel = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!auth || !server) return;
      const formData = new FormData(event.currentTarget);
      const name = formText(formData, 'name').trim();
      const type = (formData.get('type') ?? 'TEXT') as ChannelCreateType;
      const categoryId = formText(formData, 'categoryId') || undefined;
      if (!name) return;
      setPendingAction('create-channel');
      setWorkspaceError(null);
      try {
        const data = await apiRequest<{ channel: Channel }>(
          `/servers/${server.id}/channels`,
          { method: 'POST', body: JSON.stringify({ name, type, categoryId }) },
          auth.accessToken,
        );
        patchServer((current) => ({
          ...current,
          channels: [...current.channels, data.channel],
        }));
        selectChannel(data.channel);
        setActiveDialog(null);
      } catch (err) {
        setWorkspaceError(
          err instanceof Error ? err.message : t('error.fallback.cannot-create-channel'),
        );
      } finally {
        setPendingAction(null);
      }
    },
    [
      auth,
      server,
      patchServer,
      selectChannel,
      setActiveDialog,
      setPendingAction,
      setWorkspaceError,
      t,
    ],
  );

  const createCategory = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!auth || !server) return false;
      const name = formText(new FormData(event.currentTarget), 'name').trim();
      if (!name) return false;
      setPendingAction('create-category');
      setWorkspaceError(null);
      try {
        const data = await apiRequest<{ category: ChannelCategory }>(
          `/servers/${server.id}/categories`,
          { method: 'POST', body: JSON.stringify({ name }) },
          auth.accessToken,
        );
        patchServer((current) =>
          current.id === data.category.serverId
            ? { ...current, categories: [...(current.categories ?? []), data.category] }
            : current,
        );
        return true;
      } catch (err) {
        setWorkspaceError(
          err instanceof Error ? err.message : t('error.fallback.cannot-create-category'),
        );
        return false;
      } finally {
        setPendingAction(null);
      }
    },
    [auth, server, patchServer, setPendingAction, setWorkspaceError, t],
  );

  const updateCategory = useCallback(
    async (categoryId: string, changes: { name: string; position: number }) => {
      if (!auth) return false;
      setPendingAction(`category-${categoryId}`);
      setWorkspaceError(null);
      try {
        const data = await apiRequest<{ category: ChannelCategory }>(
          `/categories/${categoryId}`,
          { method: 'PATCH', body: JSON.stringify(changes) },
          auth.accessToken,
        );
        patchServer((current) => ({
          ...current,
          categories: (current.categories ?? []).map((category) =>
            category.id === categoryId ? data.category : category,
          ),
        }));
        return true;
      } catch (err) {
        setWorkspaceError(
          err instanceof Error ? err.message : t('error.fallback.cannot-update-category'),
        );
        return false;
      } finally {
        setPendingAction(null);
      }
    },
    [auth, patchServer, setPendingAction, setWorkspaceError, t],
  );

  const deleteCategory = useCallback(
    async (categoryId: string) => {
      if (!auth) return false;
      setPendingAction(`category-${categoryId}`);
      setWorkspaceError(null);
      try {
        await apiRequest(`/categories/${categoryId}`, { method: 'DELETE' }, auth.accessToken);
        patchServer((current) => ({
          ...current,
          categories: (current.categories ?? []).filter((category) => category.id !== categoryId),
          channels: current.channels.map((item) =>
            item.categoryId === categoryId ? { ...item, categoryId: null } : item,
          ),
        }));
        return true;
      } catch (err) {
        setWorkspaceError(
          err instanceof Error ? err.message : t('error.fallback.cannot-delete-category'),
        );
        return false;
      } finally {
        setPendingAction(null);
      }
    },
    [auth, patchServer, setPendingAction, setWorkspaceError, t],
  );

  const textChannels = useMemo(
    // Forum channels are listed with text channels; only voice channels have their own group.
    () => server?.channels.filter((item) => item.type !== 'VOICE') ?? [],
    [server],
  );

  const visibleTextChannels = useMemo(() => {
    const query = channelQuery.trim().toLowerCase();
    if (!query) return textChannels;
    return textChannels.filter((item) => item.name.toLowerCase().includes(query));
  }, [channelQuery, textChannels]);

  const voiceChannels = useMemo(
    () => server?.channels.filter((item) => item.type === 'VOICE') ?? [],
    [server],
  );

  const visibleVoiceChannels = useMemo(() => {
    const query = channelQuery.trim().toLowerCase();
    if (!query) return voiceChannels;
    return voiceChannels.filter((item) => item.name.toLowerCase().includes(query));
  }, [channelQuery, voiceChannels]);

  return {
    servers,
    server,
    channel,
    isLoadingServers,
    openHome,
    selectChannel,
    patchServer,
    patchServers,
    seedServerDetail,
    inviteCode,
    channelQuery,
    setChannelQuery,
    textChannels,
    visibleTextChannels,
    voiceChannels,
    visibleVoiceChannels,
    openServer,
    joinServerByInvite,
    createServer,
    joinInvite,
    createChannel,
    createCategory,
    updateCategory,
    deleteCategory,
  };
}
