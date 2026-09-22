/** Thrown by every age-gated read/post and by `channel:join`; `error-codes.ts` keys on this literal. */
export const AGE_CONFIRMATION_REQUIRED_MESSAGE = 'You must confirm your age to view this channel';

/**
 * Whether an age-restricted channel still hides its content from a user. The confirmation is a
 * self-attested checkbox recorded once on the user, global across servers — not age verification
 * (docs/features/age-restricted-channels.md). Bots are exempted by the caller, not here.
 */
export function channelNeedsAgeConfirmation(
  channel: { isAgeRestricted: boolean },
  user: { ageConfirmedAt: Date | null },
) {
  return channel.isAgeRestricted && !user.ageConfirmedAt;
}
