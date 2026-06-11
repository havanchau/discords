import type { ActiveCallSummary, CallParticipant } from '../helpers';

export function upsertVoiceParticipant(
  calls: Record<string, ActiveCallSummary>,
  channelId: string,
  participant: CallParticipant,
): Record<string, ActiveCallSummary> {
  const current = calls[channelId] ?? { channelId, mode: participant.mode, participants: [] };
  const participants = [
    ...current.participants.filter((item) => item.socketId !== participant.socketId),
    participant,
  ];
  return { ...calls, [channelId]: { ...current, mode: participant.mode, participants } };
}

export function removeVoiceParticipant(
  calls: Record<string, ActiveCallSummary>,
  channelId: string,
  socketId: string,
): Record<string, ActiveCallSummary> {
  const current = calls[channelId];
  if (!current) return calls;
  const participants = current.participants.filter((item) => item.socketId !== socketId);
  if (!participants.length) {
    const next = { ...calls };
    delete next[channelId];
    return next;
  }
  return { ...calls, [channelId]: { ...current, participants } };
}
