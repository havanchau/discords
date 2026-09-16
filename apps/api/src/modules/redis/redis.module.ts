import { Global, Module } from '@nestjs/common';
import { RedisFixedWindowLimiter } from '../../common/redis-fixed-window-limiter';
import { RedisService } from './redis.service';

@Global()
@Module({
  providers: [RedisService, RedisFixedWindowLimiter],
  exports: [RedisService, RedisFixedWindowLimiter],
})
export class RedisModule {}
