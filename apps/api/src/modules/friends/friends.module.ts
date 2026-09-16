import { Module } from '@nestjs/common';
import { AuthModule } from '@/modules/auth/auth.module';
import { PrismaModule } from '@/modules/prisma/prisma.module';
import { NotificationsModule } from '@/modules/notifications/notifications.module';
import { RealtimePublisherModule } from '@/modules/realtime/realtime-publisher.module';
import { FriendsController } from './friends.controller';
import { FriendsService } from './friends.service';

@Module({
  imports: [AuthModule, PrismaModule, NotificationsModule, RealtimePublisherModule],
  controllers: [FriendsController],
  providers: [FriendsService],
  exports: [FriendsService],
})
export class FriendsModule {}
