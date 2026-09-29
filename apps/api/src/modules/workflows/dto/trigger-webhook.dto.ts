import { IsObject, IsOptional } from 'class-validator';

/** Body of `POST /workflow-triggers/:workflowId/:token`. `payload` is untrusted, unused in v1. */
export class TriggerWebhookDto {
  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;
}
