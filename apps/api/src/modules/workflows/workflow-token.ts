import {
  generateSecretToken,
  hashSecretToken,
  secretTokenMatches,
  syntheticUserIdentity,
} from '@/common/secret-token';

export const generateWorkflowToken = generateSecretToken;
export const hashWorkflowToken = hashSecretToken;
export const workflowTokenMatches = secretTokenMatches;

/** Relative to the API base URL; the client prefixes its own API origin. */
export function workflowTriggerPath(workflowId: string, token: string) {
  return `/workflow-triggers/${workflowId}/${token}`;
}

/** The synthetic executor's credentials; see `syntheticUserIdentity`. */
export function workflowExecutorIdentity() {
  return syntheticUserIdentity('workflow', 'workflows.invalid');
}
