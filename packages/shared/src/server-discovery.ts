import type { MessageReportReason } from './api-contract.js';

export const DISCOVERY_MAX_TAGS = 5;
export const DISCOVERY_TAG_MAX_LENGTH = 20;
/** A server needs at least this many members (owner included) to be listed. */
export const DISCOVERY_MIN_MEMBERS = 2;
/** Fixed page size, which is also the hard maximum; the endpoint takes no size parameter. */
export const DISCOVERY_PAGE_SIZE = 24;
export const DISCOVERY_QUERY_MAX_LENGTH = 100;
export const DISCOVERY_DESCRIPTION_MAX_LENGTH = 200;
export const SERVER_REPORT_DETAILS_MAX_LENGTH = 500;

/**
 * One server in the public directory. Deliberately a strict subset of what members see: no channels,
 * roles, members or invite codes.
 */
export interface DiscoveryServerCard {
  id: string;
  name: string;
  description: string | null;
  avatarUrl: string | null;
  tags: string[];
  memberCount: number;
}

/** `GET /discovery/servers?query=&tag=&cursor=`, sorted by member count, then id. */
export interface DiscoveryServerPage {
  servers: DiscoveryServerCard[];
  nextCursor: string | null;
}

/** `GET` and `PATCH /servers/:serverId/discovery`, for `MANAGE_SERVER` holders. */
export interface ServerDiscoverySettings {
  listed: boolean;
  description: string | null;
  tags: string[];
  memberCount: number;
  /** Whether the server meets `DISCOVERY_MIN_MEMBERS`; listing is refused while false. */
  eligible: boolean;
}

export interface UpdateServerDiscoveryInput {
  listed?: boolean;
  description?: string;
  tags?: string[];
}

/** `POST /discovery/servers/:serverId/join`: the same fields as an invite join. */
export interface DiscoveryJoinResult {
  serverId: string;
  channelId: string | null;
  joinedNow: boolean;
}

/** `POST /discovery/servers/:serverId/report`. */
export interface ReportServerInput {
  reason: MessageReportReason;
  details?: string;
}
