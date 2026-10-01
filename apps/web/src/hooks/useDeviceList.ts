import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { listDeviceKeys, revokeDeviceKey, type AuthState, type DeviceKey } from '@/api';
import { isDeviceVerified, loadDeviceIdentity, markDeviceVerified } from '@/e2eeStore';
import { useTranslation } from '@/i18n/LocaleProvider';
import { queryKeys } from '@/query/queryKeys';

const noDevices: DeviceKey[] = [];
const noVerifiedDevices: Record<string, boolean> = {};

/**
 * The viewer's own encryption devices, which of them are verified on this device, and which one
 * this browser is. A revoked device is dropped from the list: it can no longer be a wrap target,
 * so there is nothing left to act on.
 */
export function useDeviceList({ auth }: { auth: AuthState }) {
  const t = useTranslation();
  const queryClient = useQueryClient();
  const userId = auth.user.id;
  const queryKey = queryKeys.deviceKeys(userId);
  const [actionError, setActionError] = useState<string | null>(null);

  const devicesQuery = useQuery({
    queryKey,
    queryFn: async () => (await listDeviceKeys(auth.accessToken)).devices,
  });
  const devices = (devicesQuery.data ?? noDevices).filter((device) => !device.revokedAt);

  const localDeviceQuery = useQuery({
    queryKey: [...queryKey, 'local-identity'],
    queryFn: () => loadDeviceIdentity(userId),
    staleTime: Infinity,
  });

  // Verification lives only on this device, and is tied to the exact public key that was compared.
  const verifiedQuery = useQuery({
    queryKey: [
      ...queryKey,
      'verified',
      ...devices.map((device) => `${device.id}:${device.publicKey}`),
    ],
    queryFn: async () => {
      const entries = await Promise.all(
        devices.map(
          async (device) =>
            [device.id, await isDeviceVerified(userId, device.id, device.publicKey)] as const,
        ),
      );
      return Object.fromEntries(entries);
    },
    enabled: devices.length > 0,
  });

  const revokeMutation = useMutation({
    mutationFn: (device: DeviceKey) => revokeDeviceKey(device.deviceId, auth.accessToken),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });
  const verifyMutation = useMutation({
    mutationFn: (device: DeviceKey) => markDeviceVerified(userId, device.id, device.publicKey),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  async function revokeDevice(device: DeviceKey) {
    setActionError(null);
    try {
      await revokeMutation.mutateAsync(device);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t('encryption.devices.revokeError'));
    }
  }

  async function verifyDevice(device: DeviceKey) {
    setActionError(null);
    try {
      await verifyMutation.mutateAsync(device);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t('encryption.safety.verifyError'));
    }
  }

  return {
    devices,
    thisDevice: localDeviceQuery.data ?? null,
    verifiedByDeviceKeyId: verifiedQuery.data ?? noVerifiedDevices,
    isLoading: devicesQuery.isLoading,
    loadError: devicesQuery.error,
    actionError,
    isRevoking: revokeMutation.isPending,
    isVerifying: verifyMutation.isPending,
    revokeDevice,
    verifyDevice,
  };
}
