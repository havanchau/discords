import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '@/common/current-user.decorator';
import { RequestUser } from '@/common/request-user';
import { JwtAuthGuard } from '@/modules/auth/jwt-auth.guard';
import { ListServerDecisionsQueryDto } from './dto/list-decisions-query.dto';
import { DecisionsService } from './decisions.service';

/** The server-wide decision index (docs/features/decision-channels.md → Changes → Search). */
@UseGuards(JwtAuthGuard)
@Controller('servers/:serverId/decisions')
export class ServerDecisionsController {
  constructor(private readonly decisions: DecisionsService) {}

  @Get()
  list(
    @CurrentUser() user: RequestUser,
    @Param('serverId') serverId: string,
    @Query() query: ListServerDecisionsQueryDto,
  ) {
    return this.decisions.listServerDecisions(user.id, serverId, query);
  }
}
