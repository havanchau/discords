import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  workflowTriggerTypes,
  WORKFLOW_MAX_STEPS,
  WORKFLOW_MESSAGE_MATCH_MAX_TERMS,
  WORKFLOW_MESSAGE_MATCH_TERM_MAX_LENGTH,
  WORKFLOW_MIN_STEPS,
  WORKFLOW_NAME_MAX_LENGTH,
  WORKFLOW_SCHEDULE_MAX_MINUTES,
  WORKFLOW_SCHEDULE_MIN_MINUTES,
  type WorkflowTriggerType,
} from '@discord-clone/shared';
import { WorkflowStepDto } from './workflow-step.dto';

export class UpdateWorkflowDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(WORKFLOW_NAME_MAX_LENGTH)
  name?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsIn(workflowTriggerTypes)
  triggerType?: WorkflowTriggerType;

  // MESSAGE_MATCHES
  @IsOptional()
  @IsString()
  @MaxLength(64)
  channelId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(WORKFLOW_MESSAGE_MATCH_MAX_TERMS)
  @IsString({ each: true })
  @MaxLength(WORKFLOW_MESSAGE_MATCH_TERM_MAX_LENGTH, { each: true })
  terms?: string[];

  // SCHEDULE
  @IsOptional()
  @IsInt()
  @Min(WORKFLOW_SCHEDULE_MIN_MINUTES)
  @Max(WORKFLOW_SCHEDULE_MAX_MINUTES)
  intervalMinutes?: number;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(WORKFLOW_MIN_STEPS)
  @ArrayMaxSize(WORKFLOW_MAX_STEPS)
  @ValidateNested({ each: true })
  @Type(() => WorkflowStepDto)
  steps?: WorkflowStepDto[];
}
