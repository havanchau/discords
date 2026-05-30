import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(32)
  @Matches(/^[a-zA-Z0-9_.-]+$/)
  username!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  displayName?: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;
}
