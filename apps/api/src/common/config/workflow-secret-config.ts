import { ConfigService } from '@nestjs/config';

export const DEV_WORKFLOW_SECRET_ENCRYPTION_KEY = 'dev-workflow-secret-key-change-me-in-production';
export const MIN_WORKFLOW_SECRET_KEY_LENGTH = 32;

/** Seals an HTTP_CALL step's `secretHeader.value` (`workflow-secrets.ts`), mirroring 2FA's key. */
export function workflowSecretEncryptionKey(config: ConfigService) {
  return config.get<string>('WORKFLOW_SECRET_ENCRYPTION_KEY', DEV_WORKFLOW_SECRET_ENCRYPTION_KEY);
}

/** Called at startup: production must not seal workflow secrets with the development key. */
export function assertWorkflowSecretKeyConfigured(config: ConfigService) {
  if (config.get<string>('NODE_ENV') !== 'production') return;
  const key = config.get<string>('WORKFLOW_SECRET_ENCRYPTION_KEY');
  if (
    !key ||
    key === DEV_WORKFLOW_SECRET_ENCRYPTION_KEY ||
    key.length < MIN_WORKFLOW_SECRET_KEY_LENGTH
  ) {
    throw new Error(
      `WORKFLOW_SECRET_ENCRYPTION_KEY must be set to at least ${MIN_WORKFLOW_SECRET_KEY_LENGTH} characters in production`,
    );
  }
}
