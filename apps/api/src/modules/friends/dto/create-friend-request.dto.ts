import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateFriendRequestDto {
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  usernameOrEmail!: string;
}
