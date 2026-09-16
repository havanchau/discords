import { Module } from '@nestjs/common';
import { AuthModule } from '@/modules/auth/auth.module';
import { PrismaModule } from '@/modules/prisma/prisma.module';
import { RealtimePublisherModule } from '@/modules/realtime/realtime-publisher.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [AuthModule, PrismaModule, RealtimePublisherModule],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
