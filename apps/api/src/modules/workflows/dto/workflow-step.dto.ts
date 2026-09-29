import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  workflowActionTypes,
  WORKFLOW_HTTP_BODY_MAX_BYTES,
  WORKFLOW_HTTP_SECRET_HEADER_NAME_MAX_LENGTH,
  WORKFLOW_HTTP_SECRET_HEADER_VALUE_MAX_LENGTH,
  WORKFLOW_HTTP_URL_MAX_LENGTH,
  WORKFLOW_POST_MESSAGE_MAX_LENGTH,
  type WorkflowActionType,
  type WorkflowHttpMethod,
} from '@discord-clone/shared';

/**
 * Shapes only; which fields an actionType needs is checked by `WorkflowsService` (same idiom as
 * `CreateAutoModRuleDto`: one flat DTO with every trigger/action's optional fields).
 */
export class WorkflowStepDto {
  @IsIn(workflowActionTypes)
  actionType!: WorkflowActionType;

  // POST_MESSAGE
  @IsOptional()
  @IsString()
  @MaxLength(64)
  channelId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(WORKFLOW_POST_MESSAGE_MAX_LENGTH)
  content?: string;

  // HTTP_CALL
  @IsOptional()
  @MaxLength(WORKFLOW_HTTP_URL_MAX_LENGTH)
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true, require_tld: false })
  url?: string;

  @IsOptional()
  @IsIn(['GET', 'POST'])
  method?: WorkflowHttpMethod;

  @IsOptional()
  @IsString()
  @MaxLength(WORKFLOW_HTTP_BODY_MAX_BYTES)
  body?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(WORKFLOW_HTTP_SECRET_HEADER_NAME_MAX_LENGTH)
  secretHeaderName?: string;

  /** Plaintext; sealed by `WorkflowsService` before storage, never stored or echoed back as-is. */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(WORKFLOW_HTTP_SECRET_HEADER_VALUE_MAX_LENGTH)
  secretHeaderValue?: string;

  /** Set to keep an existing sealed secret unchanged on update without resubmitting its value. */
  @IsOptional()
  @IsBoolean()
  keepExistingSecret?: boolean;
}
