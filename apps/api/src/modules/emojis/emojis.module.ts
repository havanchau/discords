import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { RealtimePublisherModule } from '../realtime/realtime-publisher.module';
import { EmojisController } from './emojis.controller';
import { EmojisService } from './emojis.service';

@Module({
  imports: [AuthModule, PermissionsModule, RealtimePublisherModule],
  controllers: [EmojisController],
  providers: [EmojisService],
})
export class EmojisModule {}
