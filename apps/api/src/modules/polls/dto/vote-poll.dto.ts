import { ArrayMaxSize, ArrayMinSize, IsArray, IsString, MaxLength } from 'class-validator';
import { POLL_MAX_OPTIONS } from '@/modules/polls/poll-status';

/** The full selection; voting again replaces it. There is no "remove vote", so it is never empty. */
export class VotePollDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(POLL_MAX_OPTIONS)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  optionIds!: string[];
}
