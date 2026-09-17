import { Injectable } from '@nestjs/common';
import { MessagesService } from '@/modules/messages/messages.service';
import { PrismaService } from '@/modules/prisma/prisma.service';
import { RealtimePublisher } from '@/modules/realtime/realtime-publisher.service';
import { RealtimeUnreadService } from '@/modules/realtime/realtime-unread.service';
import type { RequestBot } from './bot-request';
import { BotCreateMessageDto } from './dto/bot-create-message.dto';

/**
 * What a bot reads and writes over REST. Every call goes through the same service methods a person's
 * request does, keyed on the bot's own User id, so membership, channel view/send permission,
 * timeout, slowmode and AutoMod apply to the bot's roles unchanged. Rules screening does not: a bot
 * cannot accept rules, and the admin who authorized it already chose what it may do
 * (`memberNeedsOnboarding`).
 */
@Injectable()
export class BotMessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly messages: MessagesService,
    private readonly unread: RealtimeUnreadService,
    private readonly realtime: RealtimePublisher,
  ) {}

  async getIdentity(bot: RequestBot) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: bot.userId },
      select: { id: true, username: true, displayName: true, avatarUrl: true, kind: true },
    });
    return { botId: bot.botId, user };
  }

  listMessages(bot: RequestBot, channelId: string, cursor?: string) {
    return this.messages.listMessages(bot.userId, channelId, cursor);
  }

  async createMessage(bot: RequestBot, channelId: string, dto: BotCreateMessageDto) {
    // Mentions (push) and AutoMod alerts are handled inside `createMessage`.
    const result = await this.messages.createMessage(bot.userId, channelId, {
      content: dto.content,
      replyToMessageId: dto.replyToMessageId,
    });
    // Persist first, emit second. `createMessage` does not broadcast (the socket gateway does for a
    // person's send), so this REST path emits the same events, as `ForwardingService.deliver` does.
    const { message } = result;
    this.realtime.emitToRoom(
      this.realtime.channelRoom(message.channelId),
      'message:created',
      message,
    );
    const recipients = await this.unread.listUnreadRecipients(message);
    recipients.forEach((recipient) => {
      this.realtime.emitToRoom(this.realtime.userRoom(recipient.userId), 'unread:updated', {
        channelId: message.channelId,
        count: 1,
        mentions: recipient.mentions,
      });
    });
    return result;
  }
}
