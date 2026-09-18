import { BadRequestException, ValidationError, ValidationPipe } from '@nestjs/common';
import { CreateMessageDto } from '@/modules/messages/dto/create-message.dto';
import { ReactionDto } from '@/modules/messages/dto/reaction.dto';

/** The first constraint message, depth-first, so a nested attachment error names the field. */
function firstConstraintMessage(errors: ValidationError[]): string {
  for (const error of errors) {
    const message = Object.values(error.constraints ?? {})[0];
    if (message) return message;
    const nested = firstConstraintMessage(error.children ?? []);
    if (nested) return nested;
  }
  return '';
}

/**
 * Socket bodies skip the global validation pipe, so the send handlers run the same `CreateMessageDto`
 * rules as REST (attachment URL allowlist, MIME type, size cap, field lengths) with the same options
 * as `main.ts`. The refusal is a single-message `BadRequestException`, which the ack can show.
 */
const messageBodyPipe = new ValidationPipe({
  whitelist: true,
  transform: true,
  forbidNonWhitelisted: true,
  exceptionFactory: (errors) =>
    new BadRequestException(firstConstraintMessage(errors) || 'Invalid message'),
});

export async function validateSocketMessageBody(body: {
  content?: unknown;
  replyToMessageId?: unknown;
  attachments?: unknown;
  stickerId?: unknown;
}): Promise<CreateMessageDto> {
  const dto: unknown = await messageBodyPipe.transform(
    {
      content: body.content,
      replyToMessageId: body.replyToMessageId,
      attachments: body.attachments,
      stickerId: body.stickerId,
    },
    { type: 'body', metatype: CreateMessageDto },
  );
  return dto as CreateMessageDto;
}

/** `reaction:toggle` runs the REST `ReactionDto` rules (non-empty, at most 64 characters). */
export async function validateSocketReactionBody(body: { emoji?: unknown }): Promise<ReactionDto> {
  const dto: unknown = await messageBodyPipe.transform(
    { emoji: body.emoji },
    { type: 'body', metatype: ReactionDto },
  );
  return dto as ReactionDto;
}
