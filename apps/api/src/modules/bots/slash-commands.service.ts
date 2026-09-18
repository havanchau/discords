import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  RESERVED_SLASH_COMMAND_NAMES,
  SLASH_COMMANDS_MAX_PER_BOT_PER_SERVER,
  type SlashCommandOption,
  type SlashCommandView,
} from '@discord-clone/shared';
import { PrismaService } from '@/modules/prisma/prisma.service';
import type { RequestBot } from './bot-request';
import { CreateSlashCommandDto } from './dto/create-slash-command.dto';
import { UpdateSlashCommandDto } from './dto/update-slash-command.dto';

type SlashCommandRow = Prisma.SlashCommandGetPayload<Record<string, never>>;

export function toSlashCommandView(row: SlashCommandRow): SlashCommandView {
  return {
    id: row.id,
    botId: row.botId,
    serverId: row.serverId,
    name: row.name,
    description: row.description,
    options: (row.options as SlashCommandOption[] | null) ?? [],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Per-server slash command registration (`bot-gateway-and-slash-commands.md`, phase 3). Every route
 * requires the bot to already be a member of `:serverId` — a bot cannot pre-register commands into a
 * server it has not been authorized into.
 */
@Injectable()
export class SlashCommandsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(bot: RequestBot, serverId: string): Promise<{ commands: SlashCommandView[] }> {
    await this.requireBotMembership(bot.botId, serverId);
    const rows = await this.prisma.slashCommand.findMany({
      where: { botId: bot.botId, serverId },
      orderBy: { createdAt: 'asc' },
    });
    return { commands: rows.map(toSlashCommandView) };
  }

  async create(bot: RequestBot, serverId: string, dto: CreateSlashCommandDto) {
    await this.requireBotMembership(bot.botId, serverId);
    const name = dto.name.toLowerCase();
    if ((RESERVED_SLASH_COMMAND_NAMES as readonly string[]).includes(name)) {
      throw new ConflictException('Command name is reserved');
    }

    const count = await this.prisma.slashCommand.count({ where: { botId: bot.botId, serverId } });
    if (count >= SLASH_COMMANDS_MAX_PER_BOT_PER_SERVER) {
      throw new BadRequestException('Slash command limit reached for this server');
    }

    try {
      const created = await this.prisma.slashCommand.create({
        data: {
          botId: bot.botId,
          serverId,
          name,
          description: dto.description.trim(),
          options: (dto.options ?? []) as unknown as Prisma.InputJsonValue,
        },
      });
      return { command: toSlashCommandView(created) };
    } catch (error) {
      // Another bot's command with the same name in this server, or a repeat of the same bot's own.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Command name already used in this server');
      }
      throw error;
    }
  }

  async update(bot: RequestBot, serverId: string, commandId: string, dto: UpdateSlashCommandDto) {
    await this.requireBotMembership(bot.botId, serverId);
    const existing = await this.requireOwnCommand(bot.botId, serverId, commandId);
    const updated = await this.prisma.slashCommand.update({
      where: { id: existing.id },
      data: {
        description: dto.description !== undefined ? dto.description.trim() : undefined,
        options:
          dto.options !== undefined ? (dto.options as unknown as Prisma.InputJsonValue) : undefined,
      },
    });
    return { command: toSlashCommandView(updated) };
  }

  async remove(bot: RequestBot, serverId: string, commandId: string) {
    await this.requireBotMembership(bot.botId, serverId);
    await this.requireOwnCommand(bot.botId, serverId, commandId);
    await this.prisma.slashCommand.delete({ where: { id: commandId } });
    return { ok: true };
  }

  private async requireOwnCommand(botId: string, serverId: string, commandId: string) {
    const command = await this.prisma.slashCommand.findFirst({
      where: { id: commandId, botId, serverId },
    });
    if (!command) throw new NotFoundException('Command not found');
    return command;
  }

  private async requireBotMembership(botId: string, serverId: string) {
    const bot = await this.prisma.bot.findUnique({
      where: { id: botId },
      select: { botUserId: true },
    });
    const member = bot
      ? await this.prisma.serverMember.findUnique({
          where: { userId_serverId: { userId: bot.botUserId, serverId } },
          select: { id: true },
        })
      : null;
    if (!member) throw new NotFoundException('Bot is not a member of this server');
  }
}
