import { IsBoolean } from 'class-validator';

export class SetInterestDto {
  @IsBoolean()
  interested!: boolean;
}
