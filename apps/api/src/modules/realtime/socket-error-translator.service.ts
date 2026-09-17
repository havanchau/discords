import { HttpException, Injectable } from '@nestjs/common';
import { Socket } from 'socket.io';
import { translateErrorMessage } from '@/common/http-exception.filter';
import { I18nService } from '@/common/i18n/i18n.service';
import { defaultLocale, parseLocale } from '@/common/i18n/locale';
import { PrismaService } from '@/modules/prisma/prisma.service';
import { readSocketUser } from './socket-user';

/**
 * Socket handlers acknowledge business refusals with `{ error }`, which never reaches the HTTP
 * exception filter. This gives those acks the same translation as a REST error.
 */
@Injectable()
export class SocketErrorTranslator {
  constructor(
    private readonly i18n: I18nService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * The socket carries no locale, so the stored choice is read here, only on the refusal path, and
   * the handshake's Accept-Language is the fallback.
   */
  async ack(client: Socket, error: HttpException) {
    const userId = readSocketUser(client)?.id;
    const user = userId
      ? await this.prisma.user.findUnique({ where: { id: userId }, select: { locale: true } })
      : null;
    const header = client.handshake.headers['accept-language'];
    const locale = parseLocale(user?.locale) ?? parseLocale(header) ?? defaultLocale;
    return { error: translateErrorMessage(this.i18n, locale, error.message) };
  }
}
