import { Module } from '@nestjs/common';
import { AuthModule } from '@/modules/auth/auth.module';
import { PermissionsModule } from '@/modules/permissions/permissions.module';
import { RolesController } from './roles.controller';
import { RolesService } from './roles.service';

@Module({
  imports: [AuthModule, PermissionsModule],
  controllers: [RolesController],
  providers: [RolesService],
})
export class RolesModule {}
