import { useQueryClient } from '@tanstack/react-query';
import { apiRequest, postMultipart, AuthState, Role } from '@/api';
import { useTranslation } from '@/i18n/LocaleProvider';
import { queryKeys } from '@/query/queryKeys';

interface UseRoleAppearanceActionsOptions {
  auth: AuthState | null;
  serverId: string | null;
  setPendingAction: (action: string | null) => void;
  setWorkspaceError: (message: string | null) => void;
}

/**
 * Hoist toggle and icon upload/remove for a role. Kept out of `useSettingsActions.ts` (829 lines,
 * against the 1000-line cap) — same reason `user-profile.md` moved server-profile actions into
 * their own hook (docs/features/role-hoist-and-icon.md).
 *
 * `RolesUpdated` reaches every open client, including this one, through
 * `useServerModeration`'s listener; the mutation here also invalidates the query directly so the
 * caller's own optimistic wait does not depend on the socket round trip.
 */
export function useRoleAppearanceActions({
  auth,
  serverId,
  setPendingAction,
  setWorkspaceError,
}: UseRoleAppearanceActionsOptions) {
  const t = useTranslation();
  const queryClient = useQueryClient();

  async function refetchServer() {
    if (!serverId) return;
    await queryClient.invalidateQueries({ queryKey: queryKeys.serverDetail(serverId) });
  }

  async function updateRoleHoist(role: Role, isHoisted: boolean) {
    if (!auth) return;
    setPendingAction(`role-${role.id}`);
    setWorkspaceError(null);
    try {
      await apiRequest<{ role: Role }>(
        `/roles/${role.id}`,
        { method: 'PATCH', body: JSON.stringify({ isHoisted }) },
        auth.accessToken,
      );
      await refetchServer();
    } catch (err) {
      setWorkspaceError(
        err instanceof Error ? err.message : t('error.fallback.cannot-update-role'),
      );
    } finally {
      setPendingAction(null);
    }
  }

  async function uploadRoleIcon(role: Role, file: File) {
    if (!auth) return false;
    setPendingAction(`role-${role.id}`);
    setWorkspaceError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      await postMultipart<{ role: Role }>(`/roles/${role.id}/icon`, form, auth.accessToken);
      await refetchServer();
      return true;
    } catch (err) {
      setWorkspaceError(
        err instanceof Error ? err.message : t('error.fallback.cannot-update-role'),
      );
      return false;
    } finally {
      setPendingAction(null);
    }
  }

  async function removeRoleIcon(role: Role) {
    if (!auth) return;
    setPendingAction(`role-${role.id}`);
    setWorkspaceError(null);
    try {
      await apiRequest<{ role: Role }>(
        `/roles/${role.id}/icon`,
        { method: 'DELETE' },
        auth.accessToken,
      );
      await refetchServer();
    } catch (err) {
      setWorkspaceError(
        err instanceof Error ? err.message : t('error.fallback.cannot-update-role'),
      );
    } finally {
      setPendingAction(null);
    }
  }

  return { updateRoleHoist, uploadRoleIcon, removeRoleIcon };
}
