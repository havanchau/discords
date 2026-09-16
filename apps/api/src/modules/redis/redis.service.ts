import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { randomUUID } from 'crypto';
import { RedisConfig, readRedisConfig } from '../../common/redis-config';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly extraClients: Redis[] = [];

  readonly config: RedisConfig;
  readonly client: Redis;
  /** Identifies this process in logs and in the keys it owns, so a restart is traceable. */
  readonly instanceId: string;

  constructor(configService: ConfigService) {
    this.config = readRedisConfig(configService);
    this.instanceId = configService.get<string>('INSTANCE_ID') || randomUUID();
    this.client = this.createClient('main');
  }

  private createClient(name: string) {
    const client = new Redis(this.config.url, {
      lazyConnect: true,
      maxRetriesPerRequest: 3,
      // A command issued while the connection is down must fail loudly rather than queue forever.
      enableOfflineQueue: false,
    });
    this.watch(client, name);
    return client;
  }

  /**
   * The Socket.IO adapter needs its own pair, because a subscriber connection cannot issue other
   * commands and so must never be the client the rest of the app uses. Both connect eagerly and
   * keep an offline queue: the adapter is attached synchronously while they are still connecting,
   * and dropping those first broadcasts would lose messages rather than delay them.
   */
  createAdapterClients() {
    const pubClient = new Redis(this.config.url, { maxRetriesPerRequest: null });
    const subClient = pubClient.duplicate();
    this.watch(pubClient, 'adapter-pub');
    this.watch(subClient, 'adapter-sub');
    this.extraClients.push(pubClient, subClient);
    return { pubClient, subClient };
  }

  private watch(client: Redis, name: string) {
    client.on('error', (error: Error) => {
      this.logger.error(`Redis connection "${name}" failed: ${error.message}`);
    });
  }

  key(...parts: string[]) {
    return [this.config.keyPrefix, ...parts].join(':');
  }

  async onModuleInit() {
    // Connect eagerly so an unreachable Redis stops the boot instead of failing on the first socket.
    await this.client.connect();
    await this.client.ping();
    this.logger.log(`Redis connected (instance ${this.instanceId})`);
  }

  async onModuleDestroy() {
    await Promise.all([this.client, ...this.extraClients].map((client) => client.quit()));
  }
}
