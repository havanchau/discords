import type { Channel, User } from '@/api';

/**
 * Client copy of the API's `channelNeedsAgeConfirmation` (apps/api/src/modules/permissions/age-gate.ts).
 * It only decides whether to show `AgeGate`; the API refuses the content either way.
 */
export function channelNeedsAgeConfirmation(
  channel: Pick<Channel, 'isAgeRestricted'>,
  user: Pick<User, 'ageConfirmedAt'>,
) {
  return Boolean(channel.isAgeRestricted) && !user.ageConfirmedAt;
}
