import { IsString, MaxLength } from 'class-validator';

export class UpsertUserNoteDto {
  /** Trimmed by the service; an empty result deletes the note. */
  @IsString()
  @MaxLength(300)
  content!: string;
}
