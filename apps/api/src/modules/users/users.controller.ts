import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '@/common/current-user.decorator';
import { RequestUser } from '@/common/request-user';
import { JwtAuthGuard } from '@/modules/auth/jwt-auth.guard';
import { UpdateNotificationPreferenceDto } from './dto/update-notification-preference.dto';
import { RateLimit } from '@/common/rate-limit.decorator';
import { UpdateMeDto } from './dto/update-me.dto';
import { UpsertUserNoteDto } from './dto/upsert-user-note.dto';
import { UsersService } from './users.service';

@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  getMe(@CurrentUser() user: RequestUser) {
    return this.users.getMe(user.id);
  }

  @RateLimit({ keyPrefix: 'users-update-me', limit: 20, windowMs: 60_000 })
  @Patch('me')
  updateMe(@CurrentUser() user: RequestUser, @Body() dto: UpdateMeDto) {
    return this.users.updateMe(user.id, dto);
  }

  @HttpCode(200)
  @Post('me/age-confirmation')
  confirmAge(@CurrentUser() user: RequestUser) {
    return this.users.confirmAge(user.id);
  }

  // Declared after `me/...` routes so the literal paths are not swallowed by `:userId`.
  @Get(':userId/profile')
  getProfile(
    @CurrentUser() user: RequestUser,
    @Param('userId') userId: string,
    @Query('serverId') serverId?: string,
  ) {
    return this.users.getProfile(user.id, userId, serverId);
  }

  @Get(':userId/note')
  getNote(@CurrentUser() user: RequestUser, @Param('userId') userId: string) {
    return this.users.getNote(user.id, userId);
  }

  @RateLimit({ keyPrefix: 'user-note-write', limit: 30, windowMs: 60_000 })
  @Put(':userId/note')
  upsertNote(
    @CurrentUser() user: RequestUser,
    @Param('userId') userId: string,
    @Body() dto: UpsertUserNoteDto,
  ) {
    return this.users.upsertNote(user.id, userId, dto);
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
