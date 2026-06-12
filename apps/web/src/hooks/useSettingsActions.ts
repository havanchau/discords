import {
  ChangeEvent,
  Dispatch,
  FormEvent,
  SetStateAction,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  apiRequest,
  AuthState,
  AuditLogEntry,
  Channel,
  ChannelPermissionOverride,
  Invite,
  NotificationPreference,
  Role,
  ServerDetail,
  ServerSummary,
  uploadFile,
} from '../api';
import { ChannelBadgeState } from '../components/WorkspaceSidebar';
import { UiTheme } from '../contexts/appContexts';
import { disablePushNotifications, enablePushNotifications } from '../utils/pushNotifications';

interface UseSettingsActionsOptions {
  auth: AuthState | null;
  server: ServerDetail | null;
  channel: Channel | null;
  activeDialog: string | null;
  uiTheme: UiTheme;
  setAuth: (auth: AuthState) => void;
  setServer: Dispatch<SetStateAction<ServerDetail | null>>;
  setServers: Dispatch<SetStateAction<ServerSummary[]>>;
  setChannel: Dispatch<SetStateAction<Channel | null>>;
  setActiveDialog: (dialog: null) => void;
  setUiTheme: (theme: UiTheme) => void;
  setPendingAction: (action: string | null) => void;
  setWorkspaceError: (message: string | null) => void;
  setChannelBadges: Dispatch<SetStateAction<Record<string, ChannelBadgeState>>>;
  openServer: (
    serverId: string,
    token?: string,
    preferredChannelId?: string | null,
  ) => Promise<void>;
}

export function useSettingsActions({
  auth,
  server,
  channel,
  activeDialog,
  uiTheme,
  setAuth,
  setServer,
  setServers,
  setChannel,
  setActiveDialog,
  setUiTheme,
  setPendingAction,
  setWorkspaceError,
  setChannelBadges,
  openServer,
}: UseSettingsActionsOptions) {
  const [channelOverrides, setChannelOverrides] = useState<ChannelPermissionOverride[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [notificationPreferences, setNotificationPreferences] = useState<NotificationPreference[]>(
    [],
  );
  const [invites, setInvites] = useState<Invite[]>([]);
  const profileAvatarInputRef = useRef<HTMLInputElement | null>(null);
  const channelAvatarInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!auth || !channel || activeDialog !== 'channel-settings') return;
    void loadChannelOverrides(channel.id, auth.accessToken);
  }, [activeDialog, channel?.id, auth?.accessToken]);

  useEffect(() => {
    if (!auth || !server || activeDialog !== 'server-settings') return;
    void loadAuditLogs(server.id, auth.accessToken);
    void loadInvites(server.id, auth.accessToken);
  }, [activeDialog, server?.id, auth?.accessToken]);

  async function loadNotificationPreferences(token = auth?.accessToken) {
    if (!token) return;
    try {
      const result = await apiRequest<{ preferences: NotificationPreference[] }>(
        '/users/me/notification-preferences',
        {},
        token,
      );
      setNotificationPreferences(result.preferences);
    } catch {
      setNotificationPreferences([]);
    }
  }

  async function updateNotificationPreference(
    preference: Partial<NotificationPreference> & {
      serverId?: string | null;
      channelId?: string | null;
    },
  ) {
    if (!auth) return;
    setPendingAction('notification-preference');
    try {
      if (!preference.serverId && !preference.channelId && preference.desktopEnabled) {
        await enablePushNotifications(auth.accessToken);
      }
      if (!preference.serverId && !preference.channelId && preference.desktopEnabled === false) {
        await disablePushNotifications(auth.accessToken);
      }

      const result = await apiRequest<{ preference: NotificationPreference }>(
        '/users/me/notification-preferences',
        {
          method: 'PATCH',
          body: JSON.stringify(preference),
        },
        auth.accessToken,
      );
      setNotificationPreferences((current) => [
        result.preference,
        ...current.filter((item) => item.id !== result.preference.id),
      ]);
    } catch (err) {
      setWorkspaceError(err instanceof Error ? err.message : 'Cannot update notifications');
    } finally {
      setPendingAction(null);
    }
  }

  async function loadChannelOverrides(channelId: string, token = auth?.accessToken) {
    if (!token) return;
    try {
      const result = await apiRequest<{ overrides: ChannelPermissionOverride[] }>(
        `/channels/${channelId}/overrides`,
        {},
        token,
      );
      setChannelOverrides(result.overrides);
    } catch (err) {
      setWorkspaceError(err instanceof Error ? err.message : 'Cannot load channel permissions');
    }
  }

  async function loadAuditLogs(serverId: string, token = auth?.accessToken) {
    if (!token) return;
    try {
      const result = await apiRequest<{ logs: AuditLogEntry[] }>(
        `/servers/${serverId}/audit-logs`,
        {},
        token,
      );
      setAuditLogs(result.logs);
    } catch {
      setAuditLogs([]);
    }
  }

  async function loadInvites(serverId: string, token = auth?.accessToken) {
    if (!token) return;
    try {
      const result = await apiRequest<{ invites: Invite[] }>(
        `/servers/${serverId}/invites`,
        {},
        token,
      );
      setInvites(result.invites);
    } catch {
      setInvites([]);
    }
  }

  async function createInviteFromSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!auth || !server) return;
    const form = new FormData(event.currentTarget);
    setPendingAction('invite-settings-create');
    setWorkspaceError(null);
    try {
      const expiresInHours = Number(form.get('expiresInHours') || 24);
      const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000).toISOString();
      const maxUsesValue = String(form.get('maxUses') || '').trim();
      const result = await apiRequest<{ invite: Invite }>(
        `/servers/${server.id}/invites`,
        {
          method: 'POST',
          body: JSON.stringify({
            channelId: channel?.id,
            maxUses: maxUsesValue ? Number(maxUsesValue) : undefined,
            expiresAt,
          }),
        },
        auth.accessToken,
      );
      setInvites((current) => [
        result.invite,
        ...current.filter((invite) => invite.id !== result.invite.id),
      ]);
      event.currentTarget.reset();
    } catch (err) {
      setWorkspaceError(err instanceof Error ? err.message : 'Cannot create invite');
    } finally {
      setPendingAction(null);
    }
  }

  async function revokeInvite(inviteId: string) {
    if (!auth || !server) return;
    setPendingAction(`invite-${inviteId}`);
    setWorkspaceError(null);
    try {
      await apiRequest<{ invite: Invite }>(
        `/servers/${server.id}/invites/${inviteId}`,
        { method: 'DELETE' },
        auth.accessToken,
      );
      setInvites((current) => current.filter((invite) => invite.id !== inviteId));
    } catch (err) {
      setWorkspaceError(err instanceof Error ? err.message : 'Cannot revoke invite');
    } finally {
      setPendingAction(null);
    }
  }

  async function updateProfileAvatar(event: ChangeEvent<HTMLInputElement>) {
    if (!auth) return;
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setPendingAction('profile-avatar');
    try {
      const attachment = await uploadFile(file, auth.accessToken);
      const result = await apiRequest<{ user: AuthState['user'] }>(
        '/users/me',
        {
          method: 'PATCH',
          body: JSON.stringify({ avatarUrl: attachment.url }),
        },
        auth.accessToken,
      );
      setAuth({ ...auth, user: { ...auth.user, ...result.user } });
    } catch (err) {
      setWorkspaceError(err instanceof Error ? err.message : 'Cannot update avatar');
    } finally {
      setPendingAction(null);
    }
  }

  async function updateChannelAvatar(event: ChangeEvent<HTMLInputElement>) {
    if (!auth || !channel || !server) return;
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setPendingAction('channel-avatar');
    try {
      const attachment = await uploadFile(file, auth.accessToken);
      const result = await apiRequest<{ channel: Channel }>(
        `/channels/${channel.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ avatarUrl: attachment.url }),
        },
        auth.accessToken,
      );
      setChannel(result.channel);
      setServer({
        ...server,
        channels: server.channels.map((item) =>
          item.id === result.channel.id ? result.channel : item,
        ),
      });
    } catch (err) {
      setWorkspaceError(err instanceof Error ? err.message : 'Cannot update channel avatar');
    } finally {
      setPendingAction(null);
    }
  }

  async function updateProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!auth) return;
    const form = new FormData(event.currentTarget);
    const nextTheme = String(form.get('uiTheme') || uiTheme) as UiTheme;
    setPendingAction('profile-update');
    setWorkspaceError(null);
    try {
      const result = await apiRequest<{ user: AuthState['user'] }>(
        '/users/me',
        {
          method: 'PATCH',
          body: JSON.stringify({
            displayName: String(form.get('displayName') || '').trim(),
            bio: String(form.get('bio') || '').trim(),
            status: String(form.get('status') || auth.user.status || 'ONLINE'),
          }),
        },
        auth.accessToken,
      );
      setUiTheme(nextTheme);
      setAuth({ ...auth, user: { ...auth.user, ...result.user } });
      setServer((current) =>
        current
          ? {
              ...current,
              members: current.members.map((member) =>
                member.user.id === auth.user.id
                  ? { ...member, user: { ...member.user, ...result.user } }
                  : member,
              ),
            }
          : current,
      );
      setActiveDialog(null);
    } catch (err) {
      setWorkspaceError(err instanceof Error ? err.message : 'Cannot update profile');
    } finally {
      setPendingAction(null);
    }
  }

  async function updateServerSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!auth || !server) return;
    const form = new FormData(event.currentTarget);
    setPendingAction('server-update');
    setWorkspaceError(null);
    try {
      const result = await apiRequest<{ server: ServerDetail }>(
        `/servers/${server.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            name: String(form.get('name') || '').trim(),
            description: String(form.get('description') || '').trim(),
          }),
        },
        auth.accessToken,
      );
      setServer(result.server);
      hydratePersistentChannelBadges(result.server);
      setServers((current) =>
        current.map((item) =>
          item.id === result.server.id
            ? {
                ...item,
                name: result.server.name,
                description: result.server.description,
                channels: result.server.channels,
              }
            : item,
        ),
      );
      setActiveDialog(null);
    } catch (err) {
      setWorkspaceError(err instanceof Error ? err.message : 'Cannot update server');
    } finally {
      setPendingAction(null);
    }
  }

  async function updateChannelSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!auth || !server || !channel) return;
    const form = new FormData(event.currentTarget);
    setPendingAction('channel-update');
    setWorkspaceError(null);
    try {
      const positionValue = String(form.get('position') || '').trim();
      const result = await apiRequest<{ channel: Channel }>(
        `/channels/${channel.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            name: String(form.get('name') || '').trim(),
            topic: String(form.get('topic') || '').trim(),
            isPrivate: form.get('isPrivate') === 'on',
            position: positionValue ? Number(positionValue) : undefined,
          }),
        },
        auth.accessToken,
      );
      setChannel(result.channel);
      setServer({
        ...server,
        channels: server.channels.map((item) =>
          item.id === result.channel.id ? result.channel : item,
        ),
      });
      setActiveDialog(null);
    } catch (err) {
      setWorkspaceError(err instanceof Error ? err.message : 'Cannot update channel');
    } finally {
      setPendingAction(null);
    }
  }

  async function saveChannelOverrides(nextOverrides: ChannelPermissionOverride[]) {
    if (!auth || !channel) return;
    const result = await apiRequest<{ overrides: ChannelPermissionOverride[] }>(
      `/channels/${channel.id}/overrides`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          overrides: nextOverrides
            .filter((override) => override.allow.length || override.deny.length)
            .map(({ roleId, memberId, allow, deny }) => ({
              roleId,
              memberId,
              allow,
              deny,
            })),
        }),
      },
      auth.accessToken,
    );
    setChannelOverrides(result.overrides);
    await openServer(channel.serverId, auth.accessToken, channel.id);
  }

  async function toggleChannelRoleOverride(roleId: string, permission: string, enabled: boolean) {
    if (!auth || !channel) return;
    setPendingAction(`channel-override-${roleId}-${permission}`);
    setWorkspaceError(null);
    try {
      const existing = channelOverrides.find((override) => override.roleId === roleId);
      const nextOverride: ChannelPermissionOverride = {
        id: existing?.id ?? `local-role-${roleId}`,
        channelId: channel.id,
        roleId,
        memberId: null,
        allow: enabled
          ? Array.from(new Set([...(existing?.allow ?? []), permission]))
          : (existing?.allow ?? []).filter((item) => item !== permission),
        deny: (existing?.deny ?? []).filter((item) => item !== permission),
      };
      await saveChannelOverrides([
        ...channelOverrides.filter((override) => override.roleId !== roleId),
        nextOverride,
      ]);
    } catch (err) {
      setWorkspaceError(err instanceof Error ? err.message : 'Cannot update channel permission');
    } finally {
      setPendingAction(null);
    }
  }

  async function toggleChannelMemberOverride(
    memberId: string,
    permission: string,
    disposition: 'allow' | 'deny',
    enabled: boolean,
  ) {
    if (!auth || !channel) return;
    setPendingAction(`channel-member-override-${memberId}-${permission}-${disposition}`);
    setWorkspaceError(null);
    try {
      const existing = channelOverrides.find((override) => override.memberId === memberId);
      const allowWithoutPermission = (existing?.allow ?? []).filter((item) => item !== permission);
      const denyWithoutPermission = (existing?.deny ?? []).filter((item) => item !== permission);
      const nextOverride: ChannelPermissionOverride = {
        id: existing?.id ?? `local-member-${memberId}`,
        channelId: channel.id,
        roleId: null,
        memberId,
        allow:
          disposition === 'allow' && enabled
            ? Array.from(new Set([...allowWithoutPermission, permission]))
            : allowWithoutPermission,
        deny:
          disposition === 'deny' && enabled
            ? Array.from(new Set([...denyWithoutPermission, permission]))
            : denyWithoutPermission,
      };
      await saveChannelOverrides([
        ...channelOverrides.filter((override) => override.memberId !== memberId),
        nextOverride,
      ]);
    } catch (err) {
      setWorkspaceError(
        err instanceof Error ? err.message : 'Cannot update member channel permission',
      );
    } finally {
      setPendingAction(null);
    }
  }

  async function reloadCurrentServer(preferredChannelId = channel?.id) {
    if (!auth || !server) return;
    await openServer(server.id, auth.accessToken, preferredChannelId);
  }

  async function createRole(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!auth || !server) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setPendingAction('role-create');
    setWorkspaceError(null);
    try {
      await apiRequest<{ role: Role }>(
        `/servers/${server.id}/roles`,
        {
          method: 'POST',
          body: JSON.stringify({
            name: String(form.get('name') || '').trim(),
            color: String(form.get('color') || '').trim() || undefined,
            permissions: form.getAll('permissions').map(String),
          }),
        },
        auth.accessToken,
      );
      formElement.reset();
      await reloadCurrentServer();
    } catch (err) {
      setWorkspaceError(err instanceof Error ? err.message : 'Cannot create role');
    } finally {
      setPendingAction(null);
    }
  }

  async function toggleRolePermission(role: Role, permission: string, enabled: boolean) {
    if (!auth) return;
    const permissions = enabled
      ? [...new Set([...role.permissions, permission])]
      : role.permissions.filter((item) => item !== permission);
    setPendingAction(`role-${role.id}`);
    setWorkspaceError(null);
    try {
      await apiRequest<{ role: Role }>(
        `/roles/${role.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ permissions }),
        },
        auth.accessToken,
      );
      await reloadCurrentServer();
    } catch (err) {
      setWorkspaceError(err instanceof Error ? err.message : 'Cannot update role');
    } finally {
      setPendingAction(null);
    }
  }

  async function deleteRole(role: Role) {
    if (!auth) return;
    setPendingAction(`role-${role.id}`);
    setWorkspaceError(null);
    try {
      await apiRequest<{ ok: true }>(
        `/roles/${role.id}`,
        {
          method: 'DELETE',
        },
        auth.accessToken,
      );
      await reloadCurrentServer();
    } catch (err) {
      setWorkspaceError(err instanceof Error ? err.message : 'Cannot delete role');
    } finally {
      setPendingAction(null);
    }
  }

  async function toggleMemberRole(memberId: string, roleId: string, enabled: boolean) {
    if (!auth || !server) return;
    setPendingAction(`member-role-${memberId}-${roleId}`);
    setWorkspaceError(null);
    try {
      await apiRequest<{ ok: true }>(
        `/servers/${server.id}/members/${memberId}/roles/${roleId}`,
        {
          method: enabled ? 'POST' : 'DELETE',
        },
        auth.accessToken,
      );
      await reloadCurrentServer();
    } catch (err) {
      setWorkspaceError(err instanceof Error ? err.message : 'Cannot update member roles');
    } finally {
      setPendingAction(null);
    }
  }

  async function removeMember(memberId: string) {
    if (!auth || !server) return;
    setPendingAction(`member-remove-${memberId}`);
    setWorkspaceError(null);
    try {
      await apiRequest<{ ok: true }>(
        `/servers/${server.id}/members/${memberId}`,
        { method: 'DELETE' },
        auth.accessToken,
      );
      setActiveDialog(null);
      await reloadCurrentServer();
    } catch (err) {
      setWorkspaceError(err instanceof Error ? err.message : 'Cannot remove member');
    } finally {
      setPendingAction(null);
    }
  }

  function hydratePersistentChannelBadges(nextServer: ServerDetail) {
    const badges = nextServer.channels.reduce<Record<string, ChannelBadgeState>>(
      (current, item) => {
        if (item.unreadCount) {
          current[item.id] = { count: item.unreadCount, mentions: 0 };
        }
        return current;
      },
      {},
    );
    setChannelBadges((current) => ({ ...current, ...badges }));
  }

  return {
    channelOverrides,
    auditLogs,
    notificationPreferences,
    invites,
    profileAvatarInputRef,
    channelAvatarInputRef,
    loadNotificationPreferences,
    updateNotificationPreference,
    createInviteFromSettings,
    revokeInvite,
    updateProfileAvatar,
    updateChannelAvatar,
    updateProfile,
    updateServerSettings,
    updateChannelSettings,
    toggleChannelRoleOverride,
    toggleChannelMemberOverride,
    createRole,
    toggleRolePermission,
    deleteRole,
    toggleMemberRole,
    removeMember,
    hydratePersistentChannelBadges,
  };
}
