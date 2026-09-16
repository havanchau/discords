import { Module } from '@nestjs/common';
import { AuthModule } from '@/modules/auth/auth.module';
import { PermissionsModule } from '@/modules/permissions/permissions.module';
import { RealtimePublisherModule } from '@/modules/realtime/realtime-publisher.module';
import { EmojisController } from './emojis.controller';
import { EmojisService } from './emojis.service';

@Module({
  imports: [AuthModule, PermissionsModule, RealtimePublisherModule],
  controllers: [EmojisController],
  providers: [EmojisService],
})
export class EmojisModule {}
