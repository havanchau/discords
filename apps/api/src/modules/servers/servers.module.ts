import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { ServersController } from './servers.controller';
import { ServersService } from './servers.service';

@Module({
  imports: [AuthModule, PermissionsModule],
  controllers: [ServersController],
  providers: [ServersService],
  exports: [ServersService]
})
export class ServersModule {}
