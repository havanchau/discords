import { ConfigService } from '@nestjs/config';
import { createSecretBox } from '@/modules/auth/secret-box';
import { workflowSecretEncryptionKey } from '@/common/config/workflow-secret-config';

/**
 * Seals/opens an HTTP_CALL step's `secretHeader.value`, mirroring `two-factor-config.ts`'s use of
 * `createSecretBox`. The sealed form is what `WorkflowStep.config` stores; `openSecretHeader` is
 * called only inside `workflow-http.ts`, right before the request that needs it.
 */
export function sealSecretHeader(value: string, config: ConfigService) {
  return createSecretBox(workflowSecretEncryptionKey(config)).seal(value);
}

export function openSecretHeader(sealedValue: string, config: ConfigService) {
  return createSecretBox(workflowSecretEncryptionKey(config)).open(sealedValue);
}
