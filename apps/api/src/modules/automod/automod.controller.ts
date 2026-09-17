import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '@/common/current-user.decorator';
import { RateLimit } from '@/common/rate-limit.decorator';
import { RequestUser } from '@/common/request-user';
import { JwtAuthGuard } from '@/modules/auth/jwt-auth.guard';
import { AutoModService } from './automod.service';
import { CreateAutoModRuleDto } from './dto/create-automod-rule.dto';
import { UpdateAutoModRuleDto } from './dto/update-automod-rule.dto';

@UseGuards(JwtAuthGuard)
@Controller()
export class AutoModController {
  constructor(private readonly automod: AutoModService) {}

  @Get('servers/:serverId/automod-rules')
  list(@CurrentUser() user: RequestUser, @Param('serverId') serverId: string) {
    return this.automod.list(user.id, serverId);
  }

  @RateLimit({ keyPrefix: 'automod-rule-create', limit: 20, windowMs: 60_000 })
  @Post('servers/:serverId/automod-rules')
  create(
    @CurrentUser() user: RequestUser,
    @Param('serverId') serverId: string,
    @Body() dto: CreateAutoModRuleDto,
  ) {
    return this.automod.create(user.id, serverId, dto);
  }

  @RateLimit({ keyPrefix: 'automod-rule-update', limit: 20, windowMs: 60_000 })
  @Patch('automod-rules/:ruleId')
  update(
    @CurrentUser() user: RequestUser,
    @Param('ruleId') ruleId: string,
    @Body() dto: UpdateAutoModRuleDto,
  ) {
    return this.automod.update(user.id, ruleId, dto);
  }

  @RateLimit({ keyPrefix: 'automod-rule-delete', limit: 20, windowMs: 60_000 })
  @Delete('automod-rules/:ruleId')
  remove(@CurrentUser() user: RequestUser, @Param('ruleId') ruleId: string) {
    return this.automod.remove(user.id, ruleId);
  }
}
