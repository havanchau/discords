import { forwardRef, Module } from '@nestjs/common';
import { AuthModule } from '@/modules/auth/auth.module';
import { MessagesModule } from '@/modules/messages/messages.module';
import { PermissionsModule } from '@/modules/permissions/permissions.module';
import { RealtimePublisherModule } from '@/modules/realtime/realtime-publisher.module';
import { RealtimeUnreadService } from '@/modules/realtime/realtime-unread.service';
import { WorkflowActionsService } from './workflow-actions';
import { WorkflowHttpAllowlistController } from './workflow-http-allowlist.controller';
import { WorkflowHttpAllowlistService } from './workflow-http-allowlist.service';
import { WorkflowRunSweepService } from './workflow-run-sweep.service';
import { WorkflowTriggerController } from './workflow-trigger.controller';
import { WorkflowTriggerService } from './workflow-trigger.service';
import { WorkflowsController } from './workflows.controller';
import { WorkflowsService } from './workflows.service';

@Module({
  imports: [
    AuthModule,
    forwardRef(() => MessagesModule),
    PermissionsModule,
    RealtimePublisherModule,
  ],
  controllers: [WorkflowsController, WorkflowHttpAllowlistController, WorkflowTriggerController],
  providers: [
    WorkflowsService,
    WorkflowHttpAllowlistService,
    WorkflowTriggerService,
    WorkflowActionsService,
    WorkflowRunSweepService,
    // Stateless (Prisma + permissions), as in WebhooksModule/ForwardingModule.
    RealtimeUnreadService,
  ],
  // MessagesService injects this for the message-match trigger, so it has to leave the module.
  exports: [WorkflowTriggerService],
})
export class WorkflowsModule {}
