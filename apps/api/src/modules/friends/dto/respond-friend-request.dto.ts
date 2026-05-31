import { IsIn } from 'class-validator';

export class RespondFriendRequestDto {
  @IsIn(['ACCEPTED', 'REJECTED', 'BLOCKED'])
  status!: 'ACCEPTED' | 'REJECTED' | 'BLOCKED';
}
