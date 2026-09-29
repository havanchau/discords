/**
 * Platform-level audit trail (docs/features/platform-audit-log.md). Unlike `AuditLog`
 * (`api-contract.ts`), which is server-scoped and cascades with its `Server`, `PlatformAuditLog`
 * survives the deletion of the thing it describes — closing open question #40.
 */

export const platformAuditActions = [
  'SERVER_DELETE',
  'SERVER_OWNERSHIP_TRANSFER',
  'PLATFORM_REPORT_DISMISS',
  'PLATFORM_REPORT_DELIST',
  'ACCOUNT_DELETION',
] as const;
export type PlatformAuditAction = (typeof platformAuditActions)[number];

export const platformAuditTargetTypes = ['SERVER', 'USER', 'REPORT'] as const;
export type PlatformAuditTargetType = (typeof platformAuditTargetTypes)[number];

/** Same cap as `PLATFORM_REPORTS_PAGE_SIZE` (`api-contract.ts`) — a sibling admin list, same page size. */
export const PLATFORM_AUDIT_LOGS_PAGE_SIZE = 50;

/**
 * One row in `GET /platform/audit-logs`. `actorId`/`targetId` are plain strings, not a live
 * reference: `actorUsername`/`actorDisplayName`/`targetName` are point-in-time snapshots taken at
 * write time, so the row keeps reading correctly after the account/server/report it describes is
 * gone or anonymized.
 */
export interface PlatformAuditLogView {
  id: string;
  action: PlatformAuditAction;
  actorId: string | null;
  actorUsername: string | null;
  actorDisplayName: string | null;
  targetType: PlatformAuditTargetType;
  targetId: string;
  targetName: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

export interface PlatformAuditLogPage {
  logs: PlatformAuditLogView[];
  nextCursor: string | null;
}
