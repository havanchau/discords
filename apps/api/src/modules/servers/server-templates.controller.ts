import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '@/common/current-user.decorator';
import { RateLimit } from '@/common/rate-limit.decorator';
import { RequestUser } from '@/common/request-user';
import { JwtAuthGuard } from '@/modules/auth/jwt-auth.guard';
import { CreateServerDto } from './dto/create-server.dto';
import { CreateServerTemplateDto } from './dto/create-server-template.dto';
import { ServerTemplatesService } from './server-templates.service';

@UseGuards(JwtAuthGuard)
@Controller()
export class ServerTemplatesController {
  constructor(private readonly templates: ServerTemplatesService) {}

  @RateLimit({ keyPrefix: 'server-template-create', limit: 10, windowMs: 60_000 })
  @Post('servers/:serverId/templates')
  create(
    @CurrentUser() user: RequestUser,
    @Param('serverId') serverId: string,
    @Body() dto: CreateServerTemplateDto,
  ) {
    return this.templates.createTemplate(user.id, serverId, dto);
  }

  @Get('templates')
  list(@CurrentUser() user: RequestUser) {
    return this.templates.listTemplates(user.id);
  }

  // Same limit as `POST /servers`: both create a server.
  @RateLimit({ keyPrefix: 'server-create', limit: 5, windowMs: 60_000 })
  @Post('servers/from-template/:templateId')
  createServer(
    @CurrentUser() user: RequestUser,
    @Param('templateId') templateId: string,
    @Body() dto: CreateServerDto,
  ) {
    return this.templates.createServerFromTemplate(user.id, templateId, dto);
  }

  @RateLimit({ keyPrefix: 'server-template-delete', limit: 20, windowMs: 60_000 })
  @Delete('templates/:templateId')
  remove(@CurrentUser() user: RequestUser, @Param('templateId') templateId: string) {
    return this.templates.deleteTemplate(user.id, templateId);
  }
}
