import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  InteractionCreatePayload,
  InvokeInteractionResult,
  MessageComponentRow,
  SlashCommandOption,
} from '@discord-clone/shared';
import { RealtimeEvents } from '@discord-clone/shared';
import { generateSecretToken } from '@/common/secret-token';
import { Permission, PermissionsService } from '@/modules/permissions/permissions.service';
import { PrismaService } from '@/modules/prisma/prisma.service';
import { RealtimePublisher } from '@/modules/realtime/realtime-publisher.service';
import { BotMessagesService } from './bot-messages.service';
import type { RequestBot } from './bot-request';
import { ComponentClickDto } from './dto/component-click.dto';
import { InteractionCallbackDto } from './dto/interaction-callback.dto';
import { InvokeInteractionDto } from './dto/invoke-interaction.dto';
import { findComponent, validateComponentRows } from './message-components';

/**
 * The invoke → gateway-deliver → callback lifecycle of a server-registered slash command
 * (`bot-gateway-and-slash-commands.md` → Changes → Invocation flow). Delivery is a targeted emit to
 * the owning bot's socket, never a room broadcast; the callback is the only write, and it is
 * idempotent by a conditional `UPDATE ... WHERE status = 'PENDING'`.
 */
@Injectable()
export class InteractionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
    private readonly realtime: RealtimePublisher,
    private readonly botMessages: BotMessagesService,
  ) {}

  /** `POST /channels/:channelId/interactions` — session auth, the invoker is a human member. */
  async invoke(
    userId: string,
    channelId: string,
    dto: InvokeInteractionDto,
  ): Promise<InvokeInteractionResult> {
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
      select: { id: true, serverId: true },
    });
    if (!channel) throw new NotFoundException('Channel not found');

    // Same pair a human's own message send checks; never trust the client-side suggestion filter.
    await this.permissions.requireChannelPermission(userId, channel.id, Permission.ViewChannel);
    await this.permissions.requireChannelPermission(userId, channel.id, Permission.SendMessages);

    const command = await this.prisma.slashCommand.findFirst({
      where: { id: dto.commandId, serverId: channel.serverId },
    });
    if (!command) throw new NotFoundException('Command not found');

    validateOptions((command.options as SlashCommandOption[] | null) ?? [], dto.args);

    const invoker = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, username: true, displayName: true },
    });

    const token = generateSecretToken();
    // Persist first, emit second: a socket delivery failure never leaves an interaction nobody can find.
    await this.prisma.interaction.create({
      data: {
        token,
        commandId: command.id,
        botId: command.botId,
        serverId: channel.serverId,
        channelId: channel.id,
        invokerUserId: userId,
        args: dto.args,
      },
    });

    const payload: InteractionCreatePayload = {
      interactionToken: token,
      type: 'APPLICATION_COMMAND',
      commandName: command.name,
      args: dto.args,
      channelId: channel.id,
      serverId: channel.serverId,
      invoker: { id: invoker.id, username: invoker.username, displayName: invoker.displayName },
    };
    // Targeted emit to the owning bot's socket only, never a room broadcast; a registry miss (bot
    // offline) is not an error here — the interaction still waits out its TTL (see Edge cases).
    this.realtime.emitToRoom(
      this.realtime.botRoom(command.botId),
      RealtimeEvents.InteractionCreate,
      payload,
    );

    return { interactionToken: token };
  }

  /**
   * `POST /messages/:messageId/component-interactions` — session auth, a human member clicking a
   * button or picking a select option (`bot-message-components.md` → Changes, steps 4-6). The owning
   * bot is read off the message's author, not off a `SlashCommand`, since a component interaction has
   * none.
   */
  async invokeComponent(
    userId: string,
    messageId: string,
    dto: ComponentClickDto,
  ): Promise<InvokeInteractionResult> {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: {
        id: true,
        channelId: true,
        serverId: true,
        authorId: true,
        components: true,
        deletedAt: true,
      },
    });
    if (!message || message.deletedAt) throw new NotFoundException('Message not found');

    // Never trust the client-side render alone (Edge cases → "Click by a member without
    // ViewChannel"). Only ViewChannel, not SendMessages — deliberately looser than the slash-command
    // invoke check (Trade-offs → "Click check requires only ViewChannel").
    await this.permissions.requireChannelPermission(
      userId,
      message.channelId,
      Permission.ViewChannel,
    );
    // Decision (Open Questions #51): a member currently under timeout must not be able to drive a bot
    // through a button click — the same gate every other participation path already applies (sends,
    // edits, reactions, poll votes), and matches decision #39 (a timed-out member cannot even edit
    // their own messages) — letting them still click a button would be an inconsistent hole.
    await this.permissions.requireNotTimedOut(userId, message.serverId);

    const rows = (message.components as MessageComponentRow[] | null) ?? [];
    const component = findComponent(rows, dto.customId);
    if (!component) throw new NotFoundException('Component not found');
    if (component.disabled) throw new ForbiddenException('Component is disabled');
    if (component.type === 'BUTTON' && component.style === 'LINK') {
      // A LINK button is never posted here at all (Changes, step 4) — the client opens `url`
      // directly. Reaching this endpoint for one is a stale/forged click, not a real case.
      throw new NotFoundException('Component not found');
    }

    let values: string[] | undefined;
    if (component.type === 'SELECT') {
      const validValues = new Set(component.options.map((option) => option.value));
      values = dto.values ?? [];
      if (values.length === 0 || values.some((value) => !validValues.has(value))) {
        throw new BadRequestException('Invalid option value');
      }
    }

    // A plain id, not a foreign key (Current behavior) — a message's components only ever exist on a
    // bot-authored message, so this lookup should always succeed; if the bot row itself was deleted,
    // this 404s the same way a slash command with no live bot would (Edge cases →
    // "bot has been removed from the server" is a membership change, not this).
    const bot = await this.prisma.bot.findUnique({ where: { botUserId: message.authorId } });
    if (!bot) throw new NotFoundException('Bot not found');

    const invoker = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, username: true, displayName: true },
    });

    const token = generateSecretToken();
    // Persist first, emit second, same as `invoke()`.
    await this.prisma.interaction.create({
      data: {
        token,
        type: 'MESSAGE_COMPONENT',
        commandId: null,
        botId: bot.id,
        serverId: message.serverId,
        channelId: message.channelId,
        invokerUserId: userId,
        args: Prisma.JsonNull,
        messageId: message.id,
        customId: dto.customId,
        componentType: component.type,
        values: values !== undefined ? values : Prisma.JsonNull,
      },
    });

    const payload: InteractionCreatePayload = {
      interactionToken: token,
      type: 'MESSAGE_COMPONENT',
      messageId: message.id,
      customId: dto.customId,
      componentType: component.type,
      values,
      channelId: message.channelId,
      serverId: message.serverId,
      invoker: { id: invoker.id, username: invoker.username, displayName: invoker.displayName },
    };
    // Targeted emit to the owning bot's socket only; a registry miss (bot offline) still leaves the
    // interaction to wait out its TTL, same as the slash-command flow (Changes, step 6).
    this.realtime.emitToRoom(
      this.realtime.botRoom(bot.id),
      RealtimeEvents.InteractionCreate,
      payload,
    );

    return { interactionToken: token };
  }

  /**
   * The bot's answer, either to a slash command (`type: 'MESSAGE'`, unchanged from today) or to a
   * message component (`type: 'MESSAGE'` posts a new message, `type: 'UPDATE_MESSAGE'` edits the
   * message the component lived on). The claim (`PENDING` → `RESPONDED`) happens before either write,
   * so two racing callbacks for the same token can never both post — the loser's `updateMany` affects
   * zero rows. If the write then fails (e.g. the bot was removed from the server mid-flight), the
   * claim is reverted so the interaction still times out normally instead of being stuck `RESPONDED`
   * with nothing posted (Edge cases → "Bot removed mid-flight").
   */
  async respondToCallback(bot: RequestBot, token: string, dto: InteractionCallbackDto) {
    const interaction = await this.prisma.interaction.findUnique({ where: { token } });
    if (!interaction) throw new NotFoundException('Interaction not found');
    if (interaction.botId !== bot.botId) {
      throw new ForbiddenException('Interaction belongs to a different bot');
    }
    if (interaction.status === 'TIMED_OUT') {
      throw new ConflictException('Interaction already timed out');
    }

    const components = dto.components as MessageComponentRow[] | undefined;
    validateComponentRows(components);

    const claim = await this.prisma.interaction.updateMany({
      where: { id: interaction.id, status: 'PENDING' },
      data: { status: 'RESPONDED', respondedAt: new Date() },
    });
    if (claim.count === 0) throw new ConflictException('Interaction already responded to');

    try {
      if (dto.type === 'UPDATE_MESSAGE') {
        if (!interaction.messageId) {
          throw new BadRequestException('UPDATE_MESSAGE requires a component interaction');
        }
        return await this.botMessages.updateMessage(bot, interaction.messageId, dto);
      }
      if (dto.content === undefined) {
        throw new BadRequestException('content is required');
      }
      return await this.botMessages.createMessage(bot, interaction.channelId, {
        content: dto.content,
        replyToMessageId: dto.replyToMessageId,
        components: dto.components,
      });
    } catch (error) {
      await this.prisma.interaction.updateMany({
        where: { id: interaction.id, status: 'RESPONDED' },
        data: { status: 'PENDING', respondedAt: null },
      });
      throw error;
    }
  }
}

/**
 * Positional, lightweight parsing (`args` is whitespace-split), matching the composer's plain-text
 * invocation model, not a full Discord-style named-option parser (see Scope). A value's presence and
 * shape are checked; `USER`/`CHANNEL` mention resolution is left to the bot once it receives the
 * interaction, since this repo has no server-side mention-parsing utility to reuse here.
 */
function validateOptions(options: SlashCommandOption[], args: string) {
  const tokens = args.trim().length ? args.trim().split(/\s+/) : [];
  options.forEach((option, index) => {
    const raw = tokens[index];
    if (raw === undefined) {
      if (option.required) {
        throw new BadRequestException(`Missing required option: ${option.name}`);
      }
      return;
    }
    if (option.type === 'INTEGER' && !/^-?\d+$/.test(raw)) {
      throw new BadRequestException(`Invalid option: ${option.name}`);
    }
    if (option.type === 'BOOLEAN' && raw !== 'true' && raw !== 'false') {
      throw new BadRequestException(`Invalid option: ${option.name}`);
    }
  });
}
