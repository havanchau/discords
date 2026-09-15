import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { RateLimit } from '../../common/rate-limit.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LinkPreviewQueryDto } from './dto/link-preview-query.dto';
import { LinkPreviewsService } from './link-previews.service';

@UseGuards(JwtAuthGuard)
@Controller('link-previews')
export class LinkPreviewsController {
  constructor(private readonly linkPreviews: LinkPreviewsService) {}

  @RateLimit({ keyPrefix: 'link-preview', limit: 60, windowMs: 60_000 })
  @Get()
  getPreview(@Query() query: LinkPreviewQueryDto) {
    return this.linkPreviews.getPreview(query.url);
  }
}
