import { IsString, MaxLength, MinLength } from 'class-validator';

export class SupersedeDecisionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  supersededByDecisionId!: string;
}
