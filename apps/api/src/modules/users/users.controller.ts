import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/current-user.decorator';
import { RequestUser } from '../../common/request-user';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UpdateNotificationPreferenceDto } from './dto/update-notification-preference.dto';
import { UpdateMeDto } from './dto/update-me.dto';
import { UsersService } from './users.service';

@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  getMe(@CurrentUser() user: RequestUser) {
    return this.users.getMe(user.id);
  }

  @Patch('me')
  updateMe(@CurrentUser() user: RequestUser, @Body() dto: UpdateMeDto) {
    return this.users.updateMe(user.id, dto);
  }

  @Get('me/notification-preferences')
  listNotificationPreferences(@CurrentUser() user: RequestUser) {
    return this.users.listNotificationPreferences(user.id);
  }

  @Patch('me/notification-preferences')
  updateNotificationPreference(
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateNotificationPreferenceDto,
  ) {
    return this.users.updateNotificationPreference(user.id, dto);
  }
}
