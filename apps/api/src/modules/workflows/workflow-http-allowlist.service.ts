import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { WorkflowHttpAllowlistEntryView } from '@discord-clone/shared';
import { Permission, PermissionsService } from '@/modules/permissions/permissions.service';
import { PrismaService } from '@/modules/prisma/prisma.service';
import { AddWorkflowHttpAllowlistEntryDto } from './dto/add-allowlist-entry.dto';

const UNIQUE_CONSTRAINT_ERROR_CODE = 'P2002';

/**
 * A server's HTTP_CALL hostname allowlist: empty by default, which disables HTTP_CALL entirely for
 * that server (Changes -> Rules item 4). `isAllowedHost`/`listHostnames` are the one place both the
 * save-time check (`workflows.service.ts`) and the run-time re-check (`workflow-http.ts`, on every
 * redirect hop) read from, so they can never drift apart.
 */
@Injectable()
export class WorkflowHttpAllowlistService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
  ) {}

  async list(
    userId: string,
    serverId: string,
  ): Promise<{ entries: WorkflowHttpAllowlistEntryView[] }> {
    await this.permissions.requireServerPermission(userId, serverId, Permission.ManageServer);
    const entries = await this.prisma.workflowHttpAllowlistEntry.findMany({
      where: { serverId },
      orderBy: { createdAt: 'asc' },
    });
    return { entries: entries.map(toView) };
  }

  async add(userId: string, serverId: string, dto: AddWorkflowHttpAllowlistEntryDto) {
    await this.permissions.requireServerPermission(userId, serverId, Permission.ManageServer);
    const hostname = dto.hostname.toLowerCase();
    try {
      const entry = await this.prisma.workflowHttpAllowlistEntry.create({
        data: { serverId, hostname, createdById: userId },
      });
      await this.writeAuditLog(serverId, userId, 'WORKFLOW_HTTP_ALLOWLIST_ADD', { hostname });
      return { entry: toView(entry) };
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException('Host already in allowlist');
      }
      throw error;
    }
  }

  async remove(userId: string, serverId: string, entryId: string) {
    await this.permissions.requireServerPermission(userId, serverId, Permission.ManageServer);
    const existing = await this.prisma.workflowHttpAllowlistEntry.findFirst({
      where: { id: entryId, serverId },
    });
    if (!existing) throw new NotFoundException('Allowlist entry not found');
    await this.prisma.workflowHttpAllowlistEntry.delete({ where: { id: entryId } });
    await this.writeAuditLog(serverId, userId, 'WORKFLOW_HTTP_ALLOWLIST_REMOVE', {
      hostname: existing.hostname,
    });
    return { ok: true };
  }

  /** Every hostname currently allowed for a server; loaded once per call, then matched in memory. */
  async listHostnames(serverId: string): Promise<string[]> {
    const entries = await this.prisma.workflowHttpAllowlistEntry.findMany({
      where: { serverId },
      select: { hostname: true },
    });
    return entries.map((entry) => entry.hostname);
  }

  async hasAnyEntry(serverId: string): Promise<boolean> {
    return (await this.prisma.workflowHttpAllowlistEntry.count({ where: { serverId } })) > 0;
  }

  /** Save-time check: throws so the caller never stores an HTTP_CALL step targeting a bad host. */
  async requireAllowedHost(serverId: string, hostname: string) {
    const hostnames = await this.listHostnames(serverId);
    if (!hostnames.length) {
      throw new BadRequestException(
        'HTTP actions are disabled until an allowed host is configured',
      );
    }
    if (!matchesAllowlist(hostnames, hostname)) {
      throw new BadRequestException('Host not in allowlist');
    }
  }

  private async writeAuditLog(
    serverId: string,
    actorId: string,
    action: string,
    metadata: Record<string, unknown>,
  ) {
    await this.prisma.auditLog.create({
      data: { serverId, actorId, action, metadata: metadata as Prisma.InputJsonValue },
    });
  }
}

/** An entry with a leading `*.` matches only a strict subdomain, never the bare domain itself. */
export function matchesAllowlist(entries: string[], hostname: string): boolean {
  const target = hostname.toLowerCase();
  return entries.some((entry) => {
    const normalized = entry.toLowerCase();
    if (normalized.startsWith('*.')) {
      const suffix = normalized.slice(1);
      return target.endsWith(suffix) && target.length > suffix.length;
    }
    return target === normalized;
  });
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === UNIQUE_CONSTRAINT_ERROR_CODE
  );
}

function toView(entry: {
  id: string;
  hostname: string;
  createdAt: Date;
}): WorkflowHttpAllowlistEntryView {
  return { id: entry.id, hostname: entry.hostname, createdAt: entry.createdAt };
}
