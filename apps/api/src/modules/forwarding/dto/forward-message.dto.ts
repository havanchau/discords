import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class ForwardMessageDto {
  @IsIn(['channel', 'conversation'])
  destinationType!: 'channel' | 'conversation';

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  destinationId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}
