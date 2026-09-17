import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * The caller of a `/bot-api/*` route, set by `BotAuthGuard` on `request.bot`. It is deliberately not
 * `request.user`: a session route reads `CurrentUser`, which a bot token never populates.
 */
export interface RequestBot {
  botId: string;
  /** The bot's own User id: the identity every permission check and message uses. */
  userId: string;
  username: string;
}

export const CurrentBot = createParamDecorator(
  (_data: unknown, context: ExecutionContext): RequestBot => {
    const request = context.switchToHttp().getRequest<{ bot: RequestBot }>();
    return request.bot;
  },
);
