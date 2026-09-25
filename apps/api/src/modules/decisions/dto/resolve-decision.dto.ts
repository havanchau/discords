import { IsIn } from 'class-validator';

export class ResolveDecisionDto {
  @IsIn(['ACCEPTED', 'REJECTED'])
  status!: 'ACCEPTED' | 'REJECTED';
}
