import { useSyncExternalStore } from 'react';

/**
 * A jump requested from outside the open view (Saved Messages), carried across the navigation that
 * opens the channel or conversation. The destination view performs it once the message has loaded.
 * A target that never loads (older than the loaded history) expires instead of firing later.
 */
export interface PendingMessageJump {
  messageId: string;
  /** Exactly one of the two is set. */
  channelId: string | null;
  conversationId: string | null;
  expiresAt: number;
}

const JUMP_TTL_MS = 10_000;

let pending: PendingMessageJump | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

export function requestMessageJump(target: Omit<PendingMessageJump, 'expiresAt'>) {
  pending = { ...target, expiresAt: Date.now() + JUMP_TTL_MS };
  notify();
}

export function clearMessageJump() {
  if (!pending) return;
  pending = null;
  notify();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The live, unexpired request, or null. */
export function usePendingMessageJump() {
  const current = useSyncExternalStore(subscribe, () => pending);
  return current && current.expiresAt > Date.now() ? current : null;
}
