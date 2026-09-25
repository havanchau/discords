import {
  IsArray,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Min,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { DECISION_TITLE_MAX_LENGTH } from '@discord-clone/shared';
import { MessageAttachmentInputDto } from '@/modules/messages/dto/create-message.dto';

export class CreateDecisionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(DECISION_TITLE_MAX_LENGTH)
  title!: string;

  @IsString()
  @MaxLength(4000)
  content = '';

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MessageAttachmentInputDto)
  attachments?: MessageAttachmentInputDto[];

  /** The underlying poll's own `expiresAt`; validated with `validatePollExpiry`, no separate bound. */
  @IsISO8601({ strict: true })
  votingDeadlineAt!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  quorumCount?: number;
}
