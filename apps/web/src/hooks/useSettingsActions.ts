import {
  ChangeEvent,
  Dispatch,
  FormEvent,
  SetStateAction,
  useEffect,
  useEffectEvent,
  useRef,
} from 'react';
import { parseLocale } from '@discord-clone/shared';
import { useLocale } from '@/i18n/LocaleProvider';
import { useInvalidateUserProfile } from './useUserProfile';
import { queryKeys } from '@/query/queryKeys';
import type { PatchServer, PatchServers, SelectChannel } from '@/query/useWorkspaceStore';
import { useLazyResource } from '@/query/useLazyResource';
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
  uploadFile,
} from '@/api';
import { ChannelBadgeState } from '@/components/WorkspaceSidebar';
import { UiTheme } from '@/contexts/appContexts';
import { disablePushNotifications, enablePushNotifications } from '@/utils/pushNotifications';
import { formText } from '@/utils/formText';

interface UseSettingsActionsOptions {
  auth: AuthState | null;
  server: ServerDetail | null;
  channel: Channel | null;
  activeDialog: string | null;
  uiTheme: UiTheme;
  setAuth: (auth: AuthState) => void;
  patchServer: PatchServer;
  patchServers: PatchServers;
  selectChannel: SelectChannel;
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

const noOverrides: ChannelPermissionOverride[] = [];
const noAuditLogs: AuditLogEntry[] = [];
const noInvites: Invite[] = [];
const noPreferences: NotificationPreference[] = [];

export function useSettingsActions({
  auth,
  server,
  channel,
  activeDialog,
  uiTheme,
  setAuth,
  patchServer,
  patchServers,
  selectChannel,
  setActiveDialog,
  setUiTheme,
  setPendingAction,
  setWorkspaceError,
  setChannelBadges,
  openServer,
}: UseSettingsActionsOptions) {
  const { locale, setLocale, t } = useLocale();
  const invalidateUserProfile = useInvalidateUserProfile();
  const token = auth?.accessToken;

  // Settings panels read their data when they open; the cache is keyed by the id they asked for.
  const overridesResource = useLazyResource<ChannelPermissionOverride[]>({
    buildKey: queryKeys.channelOverrides,
    enabled: Boolean(token),
    fetch: (channelId) =>
      apiRequest<{ overrides: ChannelPermissionOverride[] }>(
        `/channels/${channelId}/overrides`,
        {},
        token,
      ).then((result) => result.overrides),
  });
  const auditLogsResource = useLazyResource<AuditLogEntry[]>({
    buildKey: queryKeys.auditLogs,
    enabled: Boolean(token),
    fetch: (serverId) =>
      apiRequest<{ logs: AuditLogEntry[] }>(`/servers/${serverId}/audit-logs`, {}, token).then(
        (result) => result.logs,
      ),
  });
  const invitesResource = useLazyResource<Invite[]>({
    buildKey: queryKeys.serverInvites,
    enabled: Boolean(token),
    fetch: (serverId) =>
      apiRequest<{ invites: Invite[] }>(`/servers/${serverId}/invites`, {}, token).then(
        (result) => result.invites,
      ),
  });
  const notificationPreferencesResource = useLazyResource<NotificationPreference[]>({
    buildKey: queryKeys.notificationPreferences,
    enabled: Boolean(token),
    fetch: () =>
      apiRequest<{ preferences: NotificationPreference[] }>(
        '/users/me/notification-preferences',
        {},
        token,
      ).then((result) => result.preferences),
  });

  const channelOverrides = overridesResource.data ?? noOverrides;
  const auditLogs = auditLogsResource.data ?? noAuditLogs;
  const invites = invitesResource.data ?? noInvites;
  const notificationPreferences = notificationPreferencesResource.data ?? noPreferences;
  const profileAvatarInputRef = useRef<HTMLInputElement | null>(null);
  const profileBannerInputRef = useRef<HTMLInputElement | null>(null);
  const channelAvatarInputRef = useRef<HTMLInputElement | null>(null);

  // Settings panels load when they open, or when the channel, server or token behind them changes.
  const loadChannelSettings = useEffectEvent(() => {
    if (!auth || !channel || activeDialog !== 'channel-settings') return;
    void loadChannelOverrides(channel.id);
  });
  useEffect(() => {
    loadChannelSettings();
  }, [activeDialog, channel?.id, auth?.accessToken]);

  const loadServerSettings = useEffectEvent(() => {
    if (!auth || !server || activeDialog !== 'server-settings') return;
    void loadAuditLogs(server.id);
    void loadInvites(server.id);
  });
  useEffect(() => {
    loadServerSettings();
  }, [activeDialog, server?.id, auth?.accessToken]);

  async function loadNotificationPreferences() {
    if (!auth) return;
    await notificationPreferencesResource.load(auth.user.id);
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
      notificationPreferencesResource.write((current) => [
        result.preference,
        ...(current ?? []).filter((item) => item.id !== result.preference.id),
      ]);
    } catch (err) {
      setWorkspaceError(
        err instanceof Error ? err.message : t('error.fallback.cannot-update-notifications'),
      );
    } finally {
      setPendingAction(null);
    }
  }

  async function loadChannelOverrides(channelId: string) {
    if (!token) return;
    await overridesResource.load(channelId);
  }

  async function loadAuditLogs(serverId: string) {
    if (!token) return;
    await auditLogsResource.load(serverId);
  }

  async function loadInvites(serverId: string) {
    if (!token) return;
    await invitesResource.load(serverId);
  }

  async function createInviteFromSettings(event?: FormEvent<HTMLFormElement>) {
    if (event) event.preventDefault();
    if (!auth || !server) return;
    const form = event ? new FormData(event.currentTarget) : null;
    setPendingAction('invite-settings-create');
    setWorkspaceError(null);
    try {
      const expiresInHours = Number(form?.get('expiresInHours') || 24);
      const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000).toISOString();
      const maxUsesValue = (form ? formText(form, 'maxUses') : '').trim();
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
      invitesResource.write((current) => [
        result.invite,
        ...(current ?? []).filter((invite) => invite.id !== result.invite.id),
      ]);
      if (event) event.currentTarget.reset();
    } catch (err) {
      setWorkspaceError(
        err instanceof Error ? err.message : t('error.fallback.cannot-create-invite'),
      );
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
      invitesResource.write((current) =>
        (current ?? []).filter((invite) => invite.id !== inviteId),
      );
    } catch (err) {
      setWorkspaceError(
        err instanceof Error ? err.message : t('error.fallback.cannot-revoke-invite'),
      );
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
      setWorkspaceError(
        err instanceof Error ? err.message : t('error.fallback.cannot-update-avatar'),
      );
    } finally {
      setPendingAction(null);
    }
  }

  async function updateProfileBanner(event: ChangeEvent<HTMLInputElement>) {
    if (!auth) return;
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setPendingAction('profile-banner');
    try {
      const attachment = await uploadFile(file, auth.accessToken);
      const result = await apiRequest<{ user: AuthState['user'] }>(
        '/users/me',
        { method: 'PATCH', body: JSON.stringify({ bannerUrl: attachment.url }) },
        auth.accessToken,
      );
      setAuth({ ...auth, user: { ...auth.user, ...result.user } });
      invalidateUserProfile(auth.user.id);
    } catch (err) {
      setWorkspaceError(
        err instanceof Error ? err.message : t('error.fallback.cannot-update-banner'),
      );
    } finally {
      setPendingAction(null);
    }
  }

  /** Per-server nickname and avatar; the account-level values stay untouched. */
  async function updateServerProfile(changes: {
    nickname?: string | null;
    avatarUrl?: string | null;
  }) {
    if (!auth || !server) return;
    setPendingAction('server-profile');
    setWorkspaceError(null);
    try {
      const result = await apiRequest<{ member: ServerDetail['members'][number] }>(
        `/servers/${server.id}/members/me`,
        { method: 'PATCH', body: JSON.stringify(changes) },
        auth.accessToken,
      );
      patchServer((current) =>
        current.id === server.id
          ? {
              ...current,
              members: current.members.map((member) =>
                member.id === result.member.id ? { ...member, ...result.member } : member,
              ),
            }
          : current,
      );
      invalidateUserProfile(auth.user.id);
    } catch (err) {
      setWorkspaceError(
        err instanceof Error ? err.message : t('error.fallback.cannot-update-server-profile'),
      );
    } finally {
      setPendingAction(null);
    }
  }

  async function updateServerProfileAvatar(event: ChangeEvent<HTMLInputElement>) {
    if (!auth) return;
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const attachment = await uploadFile(file, auth.accessToken);
    await updateServerProfile({ avatarUrl: attachment.url });
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
      patchServer((current) => ({
        ...current,
        channels: current.channels.map((item) =>
          item.id === result.channel.id ? result.channel : item,
        ),
      }));
      selectChannel(result.channel.id);
    } catch (err) {
      setWorkspaceError(
        err instanceof Error ? err.message : t('error.fallback.cannot-update-channel-avatar'),
      );
    } finally {
      setPendingAction(null);
    }
  }

  async function updateProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!auth) return;
    const form = new FormData(event.currentTarget);
    const nextTheme = (formText(form, 'uiTheme') || uiTheme) as UiTheme;
    const nextLocale = parseLocale(formText(form, 'locale')) ?? locale;
    setPendingAction('profile-update');
    setWorkspaceError(null);
    try {
      const result = await apiRequest<{ user: AuthState['user'] }>(
        '/users/me',
        {
          method: 'PATCH',
          body: JSON.stringify({
            displayName: formText(form, 'displayName').trim(),
            bio: formText(form, 'bio').trim(),
            // An emptied field is sent as null so the column is cleared, not set to ''.
            pronouns: formText(form, 'pronouns').trim() || null,
            customStatusText: formText(form, 'customStatusText').trim() || null,
            customStatusEmoji: formText(form, 'customStatusEmoji').trim() || null,
            customStatusExpiresAt: customStatusExpiry(formText(form, 'customStatusExpiry')),
            status: formText(form, 'status') || auth.user.status || 'ONLINE',
            locale: nextLocale,
          }),
        },
        auth.accessToken,
      );
      setUiTheme(nextTheme);
      setLocale(nextLocale);
      setAuth({ ...auth, user: { ...auth.user, ...result.user } });
      invalidateUserProfile(auth.user.id);
      patchServer((current) => ({
        ...current,
        members: current.members.map((member) =>
          member.user.id === auth.user.id
            ? { ...member, user: { ...member.user, ...result.user } }
            : member,
        ),
      }));
      setActiveDialog(null);
    } catch (err) {
      setWorkspaceError(
        err instanceof Error ? err.message : t('error.fallback.cannot-update-profile'),
      );
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
            name: formText(form, 'name').trim(),
            description: formText(form, 'description').trim(),
          }),
        },
        auth.accessToken,
      );
      patchServer(() => result.server);
      hydratePersistentChannelBadges(result.server);
      patchServers((current) =>
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
      setWorkspaceError(
        err instanceof Error ? err.message : t('error.fallback.cannot-update-server'),
      );
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
      const positionValue = formText(form, 'position').trim();
      const slowmodeValue = form.get('slowmodeSeconds');
      const categoryValue = form.get('categoryId');
      const result = await apiRequest<{ channel: Channel }>(
        `/channels/${channel.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            name: formText(form, 'name').trim(),
            topic: formText(form, 'topic').trim(),
            isPrivate: form.get('isPrivate') === 'on',
            position: positionValue ? Number(positionValue) : undefined,
            slowmodeSeconds: slowmodeValue === null ? undefined : Number(slowmodeValue),
            // The select is only rendered when the server has categories; '' means "No category".
            categoryId: categoryValue === null ? undefined : formText(form, 'categoryId') || null,
          }),
        },
        auth.accessToken,
      );
      patchServer((current) => ({
        ...current,
        channels: current.channels.map((item) =>
          item.id === result.channel.id ? result.channel : item,
        ),
      }));
      selectChannel(result.channel.id);
      setActiveDialog(null);
    } catch (err) {
      setWorkspaceError(
        err instanceof Error ? err.message : t('error.fallback.cannot-update-channel'),
      );
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
    overridesResource.write(() => result.overrides);
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
      setWorkspaceError(
        err instanceof Error ? err.message : t('error.fallback.cannot-update-channel-permission'),
      );
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
        err instanceof Error
          ? err.message
          : t('error.fallback.cannot-update-member-channel-permission'),
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
            name: formText(form, 'name').trim(),
            color: formText(form, 'color').trim() || undefined,
            permissions: form.getAll('permissions').map(String),
          }),
        },
        auth.accessToken,
      );
      formElement.reset();
      await reloadCurrentServer();
    } catch (err) {
      setWorkspaceError(
        err instanceof Error ? err.message : t('error.fallback.cannot-create-role'),
      );
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
      setWorkspaceError(
        err instanceof Error ? err.message : t('error.fallback.cannot-update-role'),
      );
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
      setWorkspaceError(
        err instanceof Error ? err.message : t('error.fallback.cannot-delete-role'),
      );
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
      setWorkspaceError(
        err instanceof Error ? err.message : t('error.fallback.cannot-update-member-roles'),
      );
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
      setWorkspaceError(
        err instanceof Error ? err.message : t('error.fallback.cannot-remove-member'),
      );
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
    profileBannerInputRef,
    channelAvatarInputRef,
    loadNotificationPreferences,
    updateNotificationPreference,
    createInviteFromSettings,
    revokeInvite,
    updateProfileAvatar,
    updateProfileBanner,
    updateServerProfile,
    updateServerProfileAvatar,
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

/**
 * The form offers presets, not a date picker: the client turns the chosen preset into an absolute
 * UTC timestamp so the stored expiry does not depend on when the server processed the request.
 */
const CUSTOM_STATUS_PRESET_MINUTES: Record<string, number> = {
  '30m': 30,
  '1h': 60,
  '4h': 240,
  today: 24 * 60,
};

function customStatusExpiry(preset: string): string | null {
  const minutes = CUSTOM_STATUS_PRESET_MINUTES[preset];
  // 'never' and an unknown preset both mean "no expiry", which clears any stored one.
  if (!minutes) return null;
  return new Date(Date.now() + minutes * 60_000).toISOString();
}
