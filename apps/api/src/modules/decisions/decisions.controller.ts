import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '@/common/current-user.decorator';
import { RateLimit } from '@/common/rate-limit.decorator';
import { RequestUser } from '@/common/request-user';
import { JwtAuthGuard } from '@/modules/auth/jwt-auth.guard';
import { CreateDecisionDto } from './dto/create-decision.dto';
import { ListDecisionsQueryDto } from './dto/list-decisions-query.dto';
import { ResolveDecisionDto } from './dto/resolve-decision.dto';
import { SupersedeDecisionDto } from './dto/supersede-decision.dto';
import { DecisionsService } from './decisions.service';

@UseGuards(JwtAuthGuard)
@Controller()
export class DecisionsController {
  constructor(private readonly decisions: DecisionsService) {}

  @Get('channels/:channelId/decisions')
  listInChannel(
    @CurrentUser() user: RequestUser,
    @Param('channelId') channelId: string,
    @Query() query: ListDecisionsQueryDto,
  ) {
    return this.decisions.listChannelDecisions(user.id, channelId, query);
  }

  @RateLimit({ keyPrefix: 'decision-create', limit: 10, windowMs: 60_000 })
  @Post('channels/:channelId/decisions')
  create(
    @CurrentUser() user: RequestUser,
    @Param('channelId') channelId: string,
    @Body() dto: CreateDecisionDto,
  ) {
    return this.decisions.createProposal(user.id, channelId, dto);
  }

  @Get('decisions/:decisionId')
  get(@CurrentUser() user: RequestUser, @Param('decisionId') decisionId: string) {
    return this.decisions.getDecision(user.id, decisionId);
  }

  @RateLimit({ keyPrefix: 'decision-resolve', limit: 30, windowMs: 60_000 })
  @Post('decisions/:decisionId/resolve')
  resolve(
    @CurrentUser() user: RequestUser,
    @Param('decisionId') decisionId: string,
    @Body() dto: ResolveDecisionDto,
  ) {
    return this.decisions.resolve(user.id, decisionId, dto);
  }

  @RateLimit({ keyPrefix: 'decision-supersede', limit: 30, windowMs: 60_000 })
  @Post('decisions/:decisionId/supersede')
  supersede(
    @CurrentUser() user: RequestUser,
    @Param('decisionId') decisionId: string,
    @Body() dto: SupersedeDecisionDto,
  ) {
    return this.decisions.supersede(user.id, decisionId, dto);
  }
}
