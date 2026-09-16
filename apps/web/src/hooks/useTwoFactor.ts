import { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '../api';
import { useTranslation } from '../i18n/LocaleProvider';

export interface TwoFactorStatus {
  enabled: boolean;
  enabledAt: string | null;
  recoveryCodesRemaining: number;
}

export interface TwoFactorSetup {
  secret: string;
  otpauthUrl: string;
}

export function useTwoFactor(accessToken: string) {
  const t = useTranslation();
  const [status, setStatus] = useState<TwoFactorStatus | null>(null);
  const [setup, setSetup] = useState<TwoFactorSetup | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      setStatus(await apiRequest<TwoFactorStatus>('/auth/2fa', {}, accessToken));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error.fallback.cannot-load-two-factor-status'));
    }
  }, [accessToken]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  async function run<T>(request: () => Promise<T>, fallbackError: string) {
    setIsBusy(true);
    setError(null);
    try {
      return await request();
    } catch (err) {
      setError(err instanceof Error ? err.message : fallbackError);
      return null;
    } finally {
      setIsBusy(false);
    }
  }

  async function startSetup() {
    setRecoveryCodes(null);
    const result = await run(
      () => apiRequest<TwoFactorSetup>('/auth/2fa/setup', { method: 'POST' }, accessToken),
      'Cannot start two-factor setup',
    );
    if (result) setSetup(result);
  }

  async function confirmSetup(code: string) {
    const result = await run(
      () =>
        apiRequest<{ recoveryCodes: string[] }>(
          '/auth/2fa/enable',
          { method: 'POST', body: JSON.stringify({ code }) },
          accessToken,
        ),
      'Cannot enable two-factor authentication',
    );
    if (!result) return;
    setSetup(null);
    setRecoveryCodes(result.recoveryCodes);
    await loadStatus();
  }

  async function disable(password: string, code: string) {
    const result = await run(
      () =>
        apiRequest(
          '/auth/2fa/disable',
          { method: 'POST', body: JSON.stringify({ password, code }) },
          accessToken,
        ),
      'Cannot disable two-factor authentication',
    );
    if (!result) return false;
    setRecoveryCodes(null);
    await loadStatus();
    return true;
  }

  async function regenerateRecoveryCodes(code: string) {
    const result = await run(
      () =>
        apiRequest<{ recoveryCodes: string[] }>(
          '/auth/2fa/recovery-codes',
          { method: 'POST', body: JSON.stringify({ code }) },
          accessToken,
        ),
      'Cannot regenerate recovery codes',
    );
    if (!result) return;
    setRecoveryCodes(result.recoveryCodes);
    await loadStatus();
  }

  return {
    status,
    setup,
    recoveryCodes,
    error,
    isBusy,
    startSetup,
    cancelSetup: () => setSetup(null),
    confirmSetup,
    disable,
    regenerateRecoveryCodes,
    dismissRecoveryCodes: () => setRecoveryCodes(null),
  };
}
