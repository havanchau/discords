import { Body, Controller, Delete, Get, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/current-user.decorator';
import { RateLimit } from '../../common/rate-limit.decorator';
import { RequestUser } from '../../common/request-user';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateEventDto } from './dto/create-event.dto';
import { SetInterestDto } from './dto/set-interest.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { EventsService } from './events.service';

@UseGuards(JwtAuthGuard)
@Controller()
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Get('servers/:serverId/events')
  list(@CurrentUser() user: RequestUser, @Param('serverId') serverId: string) {
    return this.events.list(user.id, serverId);
  }

  @RateLimit({ keyPrefix: 'event-create', limit: 20, windowMs: 60_000 })
  @Post('servers/:serverId/events')
  create(
    @CurrentUser() user: RequestUser,
    @Param('serverId') serverId: string,
    @Body() dto: CreateEventDto,
  ) {
    return this.events.create(user.id, serverId, dto);
  }

  @RateLimit({ keyPrefix: 'event-update', limit: 20, windowMs: 60_000 })
  @Patch('events/:eventId')
  update(
    @CurrentUser() user: RequestUser,
    @Param('eventId') eventId: string,
    @Body() dto: UpdateEventDto,
  ) {
    return this.events.update(user.id, eventId, dto);
  }

  @RateLimit({ keyPrefix: 'event-cancel', limit: 20, windowMs: 60_000 })
  @Delete('events/:eventId')
  cancel(@CurrentUser() user: RequestUser, @Param('eventId') eventId: string) {
    return this.events.cancel(user.id, eventId);
  }

  @RateLimit({ keyPrefix: 'event-interest', limit: 60, windowMs: 60_000 })
  @Put('events/:eventId/interest')
  setInterest(
    @CurrentUser() user: RequestUser,
    @Param('eventId') eventId: string,
    @Body() dto: SetInterestDto,
  ) {
    return this.events.setInterest(user.id, eventId, dto.interested);
  }
}
