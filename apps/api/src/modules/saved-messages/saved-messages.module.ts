import { Module } from '@nestjs/common';
import { AuthModule } from '@/modules/auth/auth.module';
import { NotificationsModule } from '@/modules/notifications/notifications.module';
import { PermissionsModule } from '@/modules/permissions/permissions.module';
import { PushModule } from '@/modules/push/push.module';
import { ReminderSweepService } from './reminder-sweep.service';
import { SavedMessagesController } from './saved-messages.controller';
import { SavedMessagesService } from './saved-messages.service';

@Module({
  imports: [AuthModule, NotificationsModule, PermissionsModule, PushModule],
  controllers: [SavedMessagesController],
  providers: [SavedMessagesService, ReminderSweepService],
})
export class SavedMessagesModule {}
