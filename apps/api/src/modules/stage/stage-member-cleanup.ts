import { Prisma } from '@prisma/client';

export interface RemovedStageRows {
  speakerChannelIds: string[];
  requestChannelIds: string[];
}

/**
 * Deletes a removed member's speaker slots and speak requests across the server's stage channels.
 * Runs inside the kick/ban transaction: the `User` cascade only fires on account deletion, so
 * nothing else would clear them (`stage-channels.md` → Changes, cleanup on member removal).
 */
export async function deleteMemberStageRows(
  tx: Prisma.TransactionClient,
  serverId: string,
  userId: string,
): Promise<RemovedStageRows> {
  const where = { userId, channel: { serverId } };
  const [speakers, requests] = await Promise.all([
    tx.stageSpeaker.findMany({ where, select: { channelId: true } }),
    tx.stageSpeakRequest.findMany({ where, select: { channelId: true } }),
  ]);
  if (speakers.length) await tx.stageSpeaker.deleteMany({ where });
  if (requests.length) await tx.stageSpeakRequest.deleteMany({ where });
  return {
    speakerChannelIds: speakers.map((row) => row.channelId),
    requestChannelIds: requests.map((row) => row.channelId),
  };
}
