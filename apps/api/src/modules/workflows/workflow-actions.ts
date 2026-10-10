import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  forwardRef,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  WORKFLOW_HTTP_MAX_REDIRECTS,
  WORKFLOW_HTTP_MAX_RESPONSE_BYTES,
  WORKFLOW_HTTP_RESPONSE_EXCERPT_MAX_LENGTH,
  WORKFLOW_HTTP_TIMEOUT_MS,
  type WorkflowFailureReason,
} from '@discord-clone/shared';
import { messageInclude, formatMessage } from '@/modules/messages/message.format';
import { MessagesService } from '@/modules/messages/messages.service';
import { PrismaService } from '@/modules/prisma/prisma.service';
import { RealtimePublisher } from '@/modules/realtime/realtime-publisher.service';
import { RealtimeUnreadService } from '@/modules/realtime/realtime-unread.service';
import { WorkflowHttpAllowlistService } from './workflow-http-allowlist.service';
import { WorkflowTriggerService } from './workflow-trigger.service';
import { openSecretHeader } from './workflow-secrets';
import {
  callWorkflowHttp,
  WorkflowHttpBlockedError,
  WorkflowHttpTimeoutError,
  WorkflowHttpTooLargeError,
} from './workflow-http';
import type {
  StoredHttpCallStepConfig,
  StoredStepConfig,
  WorkflowStepSnapshotEntry,
} from './workflow-view';

export interface WorkflowStepContext {
  serverId: string;
  workflowId: string;
  workflowName: string;
  executorUserId: string;
  runId: string;
  runDepth: number;
}

export type WorkflowStepOutcome =
  | { status: 'SUCCEEDED'; detail?: string }
  | { status: 'FAILED'; reason: WorkflowFailureReason };

/**
 * Per-`actionType` step executors. Each returns a typed outcome; the sweep service decides what to
 * do with it (advance to the next step, or stop the run `FAILED` at this step's index).
 */
@Injectable()
export class WorkflowActionsService {
  private readonly logger = new Logger(WorkflowActionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    // forwardRef: MessagesModule imports WorkflowsModule back for the message-match trigger.
    @Inject(forwardRef(() => MessagesService))
    private readonly messages: MessagesService,
    private readonly realtime: RealtimePublisher,
    private readonly unread: RealtimeUnreadService,
    private readonly allowlist: WorkflowHttpAllowlistService,
    private readonly trigger: WorkflowTriggerService,
    private readonly config: ConfigService,
  ) {}

  async execute(
    ctx: WorkflowStepContext,
    step: WorkflowStepSnapshotEntry,
  ): Promise<WorkflowStepOutcome> {
    if (step.actionType === 'POST_MESSAGE') {
      return this.postMessage(ctx, step.config as Extract<StoredStepConfig, { content: string }>);
    }
    return this.httpCall(ctx, step.config as StoredHttpCallStepConfig);
  }

  /**
   * Posted as the workflow's own `executorUser` (UserKind.WORKFLOW), through the same
   * prisma-create/formatMessage/broadcast path `WebhookDeliveryService.post` uses -- skipping
   * channel view/send permission, timeout, slowmode and onboarding checks (none apply to a
   * synthetic author with no member row), still screened by AutoMod (Changes -> Rules item 3).
   */
  private async postMessage(
    ctx: WorkflowStepContext,
    config: { channelId: string; content: string },
  ): Promise<WorkflowStepOutcome> {
    const channel = await this.prisma.channel.findUnique({
      where: { id: config.channelId },
      select: {
        id: true,
        name: true,
        type: true,
        serverId: true,
        isAgeRestricted: true,
        isPrivate: true,
      },
    });
    if (!channel || channel.serverId !== ctx.serverId || channel.type !== 'TEXT') {
      return { status: 'FAILED', reason: 'INVALID_TARGET' };
    }

    try {
      await this.messages.requireMentionPermission(
        ctx.executorUserId,
        channel.serverId,
        config.content,
      );
    } catch (error) {
      if (error instanceof ForbiddenException)
        return { status: 'FAILED', reason: 'INVALID_TARGET' };
      throw error;
    }

    let autoModAlerts;
    try {
      autoModAlerts = await this.messages.enforceAutoMod({
        userId: ctx.executorUserId,
        serverId: channel.serverId,
        channelId: channel.id,
        texts: [config.content],
        webhookAuthorName: ctx.workflowName,
      });
    } catch (error) {
      if (error instanceof BadRequestException)
        return { status: 'FAILED', reason: 'AUTOMOD_BLOCKED' };
      throw error;
    }

    const stored = await this.prisma.message.create({
      data: {
        channelId: channel.id,
        serverId: channel.serverId,
        authorId: ctx.executorUserId,
        content: config.content,
      },
      include: messageInclude,
    });
    const message = formatMessage(stored, ctx.executorUserId);

    this.realtime.emitToRoom(this.realtime.channelRoom(channel.id), 'message:created', message);
    const recipients = await this.unread.listUnreadRecipients(message);
    recipients.forEach((recipient) => {
      this.realtime.emitToRoom(this.realtime.userRoom(recipient.userId), 'unread:updated', {
        channelId: channel.id,
        count: 1,
        mentions: recipient.mentions,
      });
    });
    await this.messages.notifyMentionedUsers({
      authorId: ctx.executorUserId,
      authorUsername: ctx.workflowName,
      serverId: channel.serverId,
      channelId: channel.id,
      channelName: channel.name,
      isAgeRestricted: channel.isAgeRestricted,
      isPrivate: channel.isPrivate,
      content: config.content,
    });
    await this.messages.postAutoModAlerts(autoModAlerts);

    // A message a POST_MESSAGE step created never goes through `MessagesService.createMessage`, so
    // it never reaches the `evaluateMessage` hook wired there -- this step calls it directly, tagged
    // with this run as the cause, so a chained MESSAGE_MATCHES trigger is bounded by the same depth
    // cap (Changes -> Rules item 7). Never allowed to fail this step's own success.
    this.trigger
      .evaluateMessage(
        {
          id: message.id,
          serverId: channel.serverId,
          channelId: channel.id,
          content: config.content,
        },
        { causeRunId: ctx.runId, depth: ctx.runDepth + 1 },
      )
      .catch((error) =>
        this.logger.error('Chained workflow evaluation failed', errorDetail(error)),
      );

    return { status: 'SUCCEEDED' };
  }

  /**
   * An outbound GET/POST behind the same address-class + DNS-pinning policy `safeFetchHtml` uses for
   * link previews, plus a per-server hostname allowlist re-checked on every hop (`workflow-http.ts`).
   * The secret header is opened only here, sent, and never stored or logged in either branch below.
   */
  private async httpCall(
    ctx: WorkflowStepContext,
    config: StoredHttpCallStepConfig,
  ): Promise<WorkflowStepOutcome> {
    const allowedHostnames = await this.allowlist.listHostnames(ctx.serverId);
    if (!allowedHostnames.length) return { status: 'FAILED', reason: 'HOST_NOT_ALLOWED' };

    const secretHeader = config.secretHeader
      ? {
          name: config.secretHeader.name,
          value: openSecretHeader(config.secretHeader.sealedValue, this.config),
        }
      : undefined;

    try {
      const result = await callWorkflowHttp(config.url, {
        method: config.method,
        body: config.body,
        secretHeader,
        allowedHostnames,
        timeoutMs: WORKFLOW_HTTP_TIMEOUT_MS,
        maxRedirects: WORKFLOW_HTTP_MAX_REDIRECTS,
        maxResponseBytes: WORKFLOW_HTTP_MAX_RESPONSE_BYTES,
      });
      const host = new URL(result.finalUrl).hostname;
      // Audited with host and status only -- never the request/response body or headers, and never
      // the secret header's value (Changes -> Rules item 4).
      await this.prisma.auditLog.create({
        data: {
          serverId: ctx.serverId,
          actorId: ctx.executorUserId,
          action: 'WORKFLOW_HTTP_CALL',
          targetId: ctx.workflowId,
          metadata: { workflowId: ctx.workflowId, host, statusCode: result.statusCode },
        },
      });
      return {
        status: 'SUCCEEDED',
        detail: truncate(result.body, WORKFLOW_HTTP_RESPONSE_EXCERPT_MAX_LENGTH),
      };
    } catch (error) {
      if (error instanceof WorkflowHttpBlockedError)
        return { status: 'FAILED', reason: error.reason };
      if (error instanceof WorkflowHttpTimeoutError)
        return { status: 'FAILED', reason: 'HTTP_TIMEOUT' };
      if (error instanceof WorkflowHttpTooLargeError)
        return { status: 'FAILED', reason: 'RESPONSE_TOO_LARGE' };
      this.logger.error(
        `Workflow HTTP_CALL step failed for workflow ${ctx.workflowId}`,
        errorDetail(error),
      );
      return { status: 'FAILED', reason: 'UNKNOWN' };
    }
  }
}

function truncate(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function errorDetail(error: unknown) {
  return error instanceof Error ? error.stack : error;
}
