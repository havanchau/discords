import { Module } from '@nestjs/common';
import { LivekitService } from './livekit.service';

/** Standalone so both the voice gateway and the server moderation path can reach the SFU. */
@Module({
  providers: [LivekitService],
  exports: [LivekitService],
})
export class LivekitModule {}
