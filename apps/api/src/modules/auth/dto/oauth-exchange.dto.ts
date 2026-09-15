import { IsString, MaxLength, MinLength } from 'class-validator';

export class OAuthExchangeDto {
  @IsString()
  @MinLength(16)
  @MaxLength(128)
  code!: string;
}
