import { Equals, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateConversationDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  /**
   * The one-time "enable encryption" action for a conversation created before E2EE shipped. There is
   * no way back: ciphertext already sent cannot be decrypted by the server, so `false` is rejected.
   */
  @IsOptional()
  @Equals(true)
  isEncrypted?: true;
}
