import { IsString, MaxLength } from 'class-validator';

export class AuthorizeBotDto {
  @IsString()
  @MaxLength(64)
  serverId!: string;

  @IsString()
  @MaxLength(64)
  roleId!: string;
}
