import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ROLE_ICON_MAX_BYTES } from '@discord-clone/shared';
import { CurrentUser } from '@/common/current-user.decorator';
import { RateLimit } from '@/common/rate-limit.decorator';
import { RequestUser } from '@/common/request-user';
import { JwtAuthGuard } from '@/modules/auth/jwt-auth.guard';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { RolesService } from './roles.service';

@UseGuards(JwtAuthGuard)
@Controller()
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get('servers/:serverId/roles')
  list(@CurrentUser() user: RequestUser, @Param('serverId') serverId: string) {
    return this.roles.listRoles(user.id, serverId);
  }

  @Post('servers/:serverId/roles')
  create(
    @CurrentUser() user: RequestUser,
    @Param('serverId') serverId: string,
    @Body() dto: CreateRoleDto,
  ) {
    return this.roles.createRole(user.id, serverId, dto);
  }

  @Patch('roles/:roleId')
  update(
    @CurrentUser() user: RequestUser,
    @Param('roleId') roleId: string,
    @Body() dto: UpdateRoleDto,
  ) {
    return this.roles.updateRole(user.id, roleId, dto);
  }

  @Delete('roles/:roleId')
  remove(@CurrentUser() user: RequestUser, @Param('roleId') roleId: string) {
    return this.roles.deleteRole(user.id, roleId);
  }

  // The file is small enough to hold in memory; multer refuses anything over the icon cap before
  // the service reads a byte of it.
  @RateLimit({ keyPrefix: 'role-icon-upload', limit: 20, windowMs: 60_000 })
  @Post('roles/:roleId/icon')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: ROLE_ICON_MAX_BYTES, files: 1 },
    }),
  )
  uploadIcon(
    @CurrentUser() user: RequestUser,
    @Param('roleId') roleId: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.roles.uploadIcon(user.id, roleId, file);
  }

  @RateLimit({ keyPrefix: 'role-icon-remove', limit: 20, windowMs: 60_000 })
  @Delete('roles/:roleId/icon')
  removeIcon(@CurrentUser() user: RequestUser, @Param('roleId') roleId: string) {
    return this.roles.removeIcon(user.id, roleId);
  }

  @Post('servers/:serverId/members/:memberId/roles/:roleId')
  addMemberRole(
    @CurrentUser() user: RequestUser,
    @Param('serverId') serverId: string,
    @Param('memberId') memberId: string,
    @Param('roleId') roleId: string,
  ) {
    return this.roles.addMemberRole(user.id, serverId, memberId, roleId);
  }

  @Delete('servers/:serverId/members/:memberId/roles/:roleId')
  removeMemberRole(
    @CurrentUser() user: RequestUser,
    @Param('serverId') serverId: string,
    @Param('memberId') memberId: string,
    @Param('roleId') roleId: string,
  ) {
    return this.roles.removeMemberRole(user.id, serverId, memberId, roleId);
  }
}
