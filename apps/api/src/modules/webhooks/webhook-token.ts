import {
  generateSecretToken,
  hashSecretToken,
  secretTokenMatches,
  syntheticUserIdentity,
} from '@/common/secret-token';

export const generateWebhookToken = generateSecretToken;
export const hashWebhookToken = hashSecretToken;
export const webhookTokenMatches = secretTokenMatches;

/** Relative to the API base URL; the client prefixes its own API origin. */
export function webhookPath(webhookId: string, token: string) {
  return `/webhooks/${webhookId}/${token}`;
}

/** The synthetic author row's credentials; see `syntheticUserIdentity`. */
export function webhookUserIdentity() {
  return syntheticUserIdentity('webhook', 'webhooks.invalid');
}
