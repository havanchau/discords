import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/current-user.decorator';
import { RequestUser } from '../../common/request-user';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
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
    @Body() dto: CreateRoleDto
  ) {
    return this.roles.createRole(user.id, serverId, dto);
  }

  @Patch('roles/:roleId')
  update(@CurrentUser() user: RequestUser, @Param('roleId') roleId: string, @Body() dto: UpdateRoleDto) {
    return this.roles.updateRole(user.id, roleId, dto);
  }

  @Delete('roles/:roleId')
  remove(@CurrentUser() user: RequestUser, @Param('roleId') roleId: string) {
    return this.roles.deleteRole(user.id, roleId);
  }

  @Post('servers/:serverId/members/:memberId/roles/:roleId')
  addMemberRole(
    @CurrentUser() user: RequestUser,
    @Param('serverId') serverId: string,
    @Param('memberId') memberId: string,
    @Param('roleId') roleId: string
  ) {
    return this.roles.addMemberRole(user.id, serverId, memberId, roleId);
  }

  @Delete('servers/:serverId/members/:memberId/roles/:roleId')
  removeMemberRole(
    @CurrentUser() user: RequestUser,
    @Param('serverId') serverId: string,
    @Param('memberId') memberId: string,
    @Param('roleId') roleId: string
  ) {
    return this.roles.removeMemberRole(user.id, serverId, memberId, roleId);
  }
}
