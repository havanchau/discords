import { FormEvent, useCallback, useMemo, useState } from 'react';
import { apiRequest, Channel, ServerDetail, ServerSummary } from '../api';
import { ChannelBadgeState } from '../components/WorkspaceSidebar';

interface UseWorkspaceNavigationProps {
  auth: { accessToken: string } | null;
  clearAuth: () => void;
  setWorkspaceError: (error: string | null) => void;
  setWorkspaceNotice: (notice: string | null) => void;
  setPendingAction: (action: string | null) => void;
  setActiveDialog: (dialog: any) => void;
  setChannelBadges: React.Dispatch<React.SetStateAction<Record<string, ChannelBadgeState>>>;
}

export function useWorkspaceNavigation({
  auth,
  clearAuth,
  setWorkspaceError,
  setWorkspaceNotice,
  setPendingAction,
  setActiveDialog,
  setChannelBadges,
}: UseWorkspaceNavigationProps) {
  const [servers, setServers] = useState<ServerSummary[]>([]);
  const [server, setServer] = useState<ServerDetail | null>(null);
  const [channel, setChannel] = useState<Channel | null>(null);
  const [isLoadingServers, setIsLoadingServers] = useState(false);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [channelQuery, setChannelQuery] = useState('');

  const loadServers = useCallback(
    async (token: string) => {
      setIsLoadingServers(true);
      setWorkspaceError(null);
      try {
        const data = await apiRequest<{ servers: ServerSummary[] }>('/servers', {}, token);
        setServers(data.servers);
        if (data.servers.length > 0 && !server) {
          const firstServer = await apiRequest<{ server: ServerDetail }>(
            `/servers/${data.servers[0].id}`,
            {},
            token,
          );
          setServer(firstServer.server);
          setChannel(firstServer.server.channels[0] ?? null);
        }
      } catch (err) {
        if (err instanceof Error && err.message.includes('401')) {
          clearAuth();
          return;
        }
        setWorkspaceError(err instanceof Error ? err.message : 'Cannot load servers');
      } finally {
        setIsLoadingServers(false);
      }
    },
    [clearAuth, server, setWorkspaceError],
  );

  const openServer = useCallback(
    async (serverId: string) => {
      if (!auth) return;
      setPendingAction(`server-${serverId}`);
      setWorkspaceError(null);
      try {
        const data = await apiRequest<{ server: ServerDetail }>(
          `/servers/${serverId}`,
          {},
          auth.accessToken,
        );
        setServer(data.server);
        setChannel(data.server.channels[0] ?? null);
      } catch (err) {
        setWorkspaceError(err instanceof Error ? err.message : 'Cannot open server');
      } finally {
        setPendingAction(null);
      }
    },
    [auth, setPendingAction, setWorkspaceError],
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
        setServer(data.server);
        setChannel(data.server.channels[0] ?? null);
        await loadServers(auth.accessToken);
        setActiveDialog(null);
        setWorkspaceNotice(`Joined ${data.server.name}`);
      } catch (err) {
        setWorkspaceError(err instanceof Error ? err.message : 'Invalid invite');
      } finally {
        setPendingAction(null);
      }
    },
    [auth, loadServers, setActiveDialog, setPendingAction, setWorkspaceError, setWorkspaceNotice],
  );

  const createServer = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!auth) return;
      const formData = new FormData(event.currentTarget);
      const name = String(formData.get('name') ?? '').trim();
      const description = String(formData.get('description') ?? '').trim();
      if (!name) return;
      setPendingAction('create-server');
      setWorkspaceError(null);
      try {
        const data = await apiRequest<{ server: ServerDetail }>(
          '/servers',
          { method: 'POST', body: JSON.stringify({ name, description }) },
          auth.accessToken,
        );
        setServer(data.server);
        setChannel(data.server.channels[0] ?? null);
        await loadServers(auth.accessToken);
        setActiveDialog(null);
        setWorkspaceNotice(`Created server ${data.server.name}`);
      } catch (err) {
        setWorkspaceError(err instanceof Error ? err.message : 'Cannot create server');
      } finally {
        setPendingAction(null);
      }
    },
    [auth, loadServers, setActiveDialog, setPendingAction, setWorkspaceError, setWorkspaceNotice],
  );

  const joinInvite = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      const code = String(formData.get('code') ?? '').trim();
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
      const name = String(formData.get('name') ?? '').trim();
      const type = (formData.get('type') ?? 'TEXT') as 'TEXT' | 'VOICE';
      if (!name) return;
      setPendingAction('create-channel');
      setWorkspaceError(null);
      try {
        const data = await apiRequest<{ channel: Channel }>(
          `/servers/${server.id}/channels`,
          { method: 'POST', body: JSON.stringify({ name, type }) },
          auth.accessToken,
        );
        setServer((current) =>
          current
            ? {
                ...current,
                channels: [...current.channels, data.channel],
              }
            : null,
        );
        setChannel(data.channel);
        setActiveDialog(null);
      } catch (err) {
        setWorkspaceError(err instanceof Error ? err.message : 'Cannot create channel');
      } finally {
        setPendingAction(null);
      }
    },
    [auth, server, setActiveDialog, setPendingAction, setWorkspaceError],
  );

  const textChannels = useMemo(
    () => server?.channels.filter((item) => item.type === 'TEXT') ?? [],
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
    setServers,
    server,
    setServer,
    channel,
    setChannel,
    isLoadingServers,
    inviteCode,
    setInviteCode,
    channelQuery,
    setChannelQuery,
    textChannels,
    visibleTextChannels,
    voiceChannels,
    visibleVoiceChannels,
    loadServers,
    openServer,
    joinServerByInvite,
    createServer,
    joinInvite,
    createChannel,
  };
}
