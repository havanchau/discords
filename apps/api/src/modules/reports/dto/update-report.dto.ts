import { IsIn } from 'class-validator';
import type { UpdateMessageReportInput } from '@discord-clone/shared';

export class UpdateReportDto {
  @IsIn(['RESOLVED', 'DISMISSED'])
  status!: UpdateMessageReportInput['status'];
}
