import { Permission } from './channel-permission';

/** Thrown by every gated action; `failureReasonOf` and `error-codes.ts` key on this literal. */
export const RULES_NOT_ACCEPTED_MESSAGE = 'You must accept the server rules first';

export interface OnboardingGateMember {
  kind: string;
  onboardingAcceptedAt: Date | null;
  roles: Array<{ role: { permissions: string[] } }>;
}

/**
 * Whether rules screening still blocks a member. The owner and `MANAGE_SERVER` holders, who write the
 * rules, are exempt. So is a bot: it cannot read or accept rules, and the admin who authorized it chose
 * its role (docs/features/bot-api.md). Every other member who has not accepted is blocked, including
 * members who joined before screening was turned on (docs/features/server-onboarding.md).
 */
export function memberNeedsOnboarding(
  server: { onboardingEnabled: boolean },
  member: OnboardingGateMember,
) {
  if (
    !server.onboardingEnabled ||
    member.kind === 'OWNER' ||
    member.kind === 'BOT' ||
    member.onboardingAcceptedAt
  ) {
    return false;
  }
  return !member.roles.some(({ role }) => role.permissions.includes(Permission.ManageServer));
}
