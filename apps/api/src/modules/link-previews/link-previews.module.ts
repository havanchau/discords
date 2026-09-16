import { Module } from '@nestjs/common';
import { AuthModule } from '@/modules/auth/auth.module';
import { LinkPreviewsController } from './link-previews.controller';
import { LinkPreviewsService } from './link-previews.service';

@Module({
  imports: [AuthModule],
  controllers: [LinkPreviewsController],
  providers: [LinkPreviewsService],
})
export class LinkPreviewsModule {}
