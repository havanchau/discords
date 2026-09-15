import { ConfigService } from '@nestjs/config';

export const DEV_TWO_FACTOR_ENCRYPTION_KEY = 'dev-two-factor-key-change-me-in-production';
export const MIN_TWO_FACTOR_KEY_LENGTH = 32;

export function twoFactorEncryptionKey(config: ConfigService) {
  return config.get<string>('TWO_FACTOR_ENCRYPTION_KEY', DEV_TWO_FACTOR_ENCRYPTION_KEY);
}

/** Called at startup: production must not seal 2FA secrets with the development key. */
export function assertTwoFactorKeyConfigured(config: ConfigService) {
  if (config.get<string>('NODE_ENV') !== 'production') return;
  const key = config.get<string>('TWO_FACTOR_ENCRYPTION_KEY');
  if (!key || key === DEV_TWO_FACTOR_ENCRYPTION_KEY || key.length < MIN_TWO_FACTOR_KEY_LENGTH) {
    throw new Error(
      `TWO_FACTOR_ENCRYPTION_KEY must be set to at least ${MIN_TWO_FACTOR_KEY_LENGTH} characters in production`,
    );
  }
}
