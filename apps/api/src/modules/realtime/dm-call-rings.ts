export type DmCallMode = 'voice' | 'video';

export interface DmCallRing {
  conversationId: string;
  callerUserId: string;
  mode: DmCallMode;
  isGroup: boolean;
  memberUserIds: string[];
}

interface StoredRing extends DmCallRing {
  timer: ReturnType<typeof setTimeout>;
}

export const DM_CALL_RING_TIMEOUT_MS = 30_000;

/*
 * Pending DM call rings, one per conversation, kept in memory like call participants. A ring ends
 * when someone answers, the caller cancels, a 1-1 callee declines, or the timeout fires.
 */
export class DmCallRings {
  private readonly rings = new Map<string, StoredRing>();

  constructor(
    private readonly onExpire: (ring: DmCallRing) => void,
    private readonly timeoutMs = DM_CALL_RING_TIMEOUT_MS,
  ) {}

  start(ring: DmCallRing) {
    this.clear(ring.conversationId);
    const timer = setTimeout(() => {
      const expired = this.clear(ring.conversationId);
      if (expired) this.onExpire(expired);
    }, this.timeoutMs);
    timer.unref?.();
    this.rings.set(ring.conversationId, { ...ring, timer });
  }

  get(conversationId: string): DmCallRing | undefined {
    const stored = this.rings.get(conversationId);
    return stored ? withoutTimer(stored) : undefined;
  }

  clear(conversationId: string): DmCallRing | undefined {
    const stored = this.rings.get(conversationId);
    if (!stored) return undefined;
    clearTimeout(stored.timer);
    this.rings.delete(conversationId);
    return withoutTimer(stored);
  }
}

function withoutTimer({ timer: _timer, ...ring }: StoredRing): DmCallRing {
  return ring;
}
