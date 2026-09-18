import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  InteractionCreatePayload,
  InvokeInteractionResult,
  SlashCommandOption,
} from '@discord-clone/shared';
import { RealtimeEvents } from '@discord-clone/shared';
import { generateSecretToken } from '@/common/secret-token';
import { Permission, PermissionsService } from '@/modules/permissions/permissions.service';
import { PrismaService } from '@/modules/prisma/prisma.service';
import { RealtimePublisher } from '@/modules/realtime/realtime-publisher.service';
import { BotMessagesService } from './bot-messages.service';
import type { RequestBot } from './bot-request';
import { BotCreateMessageDto } from './dto/bot-create-message.dto';
import { InvokeInteractionDto } from './dto/invoke-interaction.dto';

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
   * The bot's answer. The claim (`PENDING` → `RESPONDED`) happens before the message is created, so
   * two racing callbacks for the same token can never both post — the loser's `updateMany` affects
   * zero rows. If the send itself then fails (e.g. the bot was removed from the server mid-flight),
   * the claim is reverted so the interaction still times out normally instead of being stuck
   * `RESPONDED` with nothing posted (Edge cases → "Bot removed mid-flight").
   */
  async respondToCallback(bot: RequestBot, token: string, dto: BotCreateMessageDto) {
    const interaction = await this.prisma.interaction.findUnique({ where: { token } });
    if (!interaction) throw new NotFoundException('Interaction not found');
    if (interaction.botId !== bot.botId) {
      throw new ForbiddenException('Interaction belongs to a different bot');
    }
    if (interaction.status === 'TIMED_OUT') {
      throw new ConflictException('Interaction already timed out');
    }

    const claim = await this.prisma.interaction.updateMany({
      where: { id: interaction.id, status: 'PENDING' },
      data: { status: 'RESPONDED', respondedAt: new Date() },
    });
    if (claim.count === 0) throw new ConflictException('Interaction already responded to');

    try {
      return await this.botMessages.createMessage(bot, interaction.channelId, dto);
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
