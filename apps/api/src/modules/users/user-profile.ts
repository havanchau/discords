import type { CustomStatus } from '@discord-clone/shared';

import type { Prisma } from '@prisma/client';

/** Everything the profile card and the session user need; `email` is added only for the owner. */
export const PROFILE_USER_SELECT = {
  id: true,
  username: true,
  displayName: true,
  avatarUrl: true,
  bannerUrl: true,
  bio: true,
  pronouns: true,
  customStatusText: true,
  customStatusEmoji: true,
  customStatusExpiresAt: true,
  status: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

export type CustomStatusView = CustomStatus;

interface CustomStatusSource {
  customStatusText: string | null;
  customStatusEmoji: string | null;
  customStatusExpiresAt: Date | null;
}

/**
 * An expired status is treated as absent everywhere. Nothing clears the columns on a schedule, so
 * this is the single place that decides whether a stored status still counts.
 */
export function toCustomStatus(user: CustomStatusSource, now = new Date()): CustomStatusView | null {
  if (!user.customStatusText && !user.customStatusEmoji) return null;
  if (user.customStatusExpiresAt && user.customStatusExpiresAt <= now) return null;

  return {
    text: user.customStatusText,
    emoji: user.customStatusEmoji,
    expiresAt: user.customStatusExpiresAt?.toISOString() ?? null,
  };
}

interface ProfileUserRow extends CustomStatusSource {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  bannerUrl: string | null;
  bio: string | null;
  pronouns: string | null;
  status: string;
  createdAt: Date;
}

/**
 * Drops the raw custom-status columns so an expired status cannot be read back around
 * `toCustomStatus`, which is the only thing that decides whether one still counts.
 */
export function toProfileView<T extends ProfileUserRow>(user: T, now = new Date()) {
  const {
    customStatusText: _text,
    customStatusEmoji: _emoji,
    customStatusExpiresAt: _expiresAt,
    ...rest
  } = user;
  return { ...rest, customStatus: toCustomStatus(user, now) };
}
