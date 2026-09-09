import 'reflect-metadata';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { RATE_LIMIT_METADATA, type RateLimitOptions } from './rate-limit.decorator';
import { AuthController } from '../modules/auth/auth.controller';
import { JwtAuthGuard } from '../modules/auth/jwt-auth.guard';
import { DirectMessagesController } from '../modules/direct-messages/direct-messages.controller';
import { FriendsController } from '../modules/friends/friends.controller';
import { MessagesController } from '../modules/messages/messages.controller';
import { ServersController } from '../modules/servers/servers.controller';
import { UploadsController } from '../modules/uploads/uploads.controller';

describe('security metadata', () => {
  it('guards private resource controllers with JWT auth', () => {
    [
      DirectMessagesController,
      FriendsController,
      MessagesController,
      ServersController,
      UploadsController,
    ].forEach((controller) => {
      const guards = Reflect.getMetadata(GUARDS_METADATA, controller) as unknown[] | undefined;
      assert.ok(guards?.includes(JwtAuthGuard), `${controller.name} is missing JwtAuthGuard`);
    });
  });

  it('rate-limits high-abuse HTTP endpoints', () => {
    const endpoints: Array<[object, string]> = [
      [AuthController.prototype.register, 'auth-register'],
      [AuthController.prototype.login, 'auth-login'],
      [AuthController.prototype.verifyEmail, 'auth-verify-email'],
      [AuthController.prototype.refresh, 'auth-refresh'],
      [DirectMessagesController.prototype.createMessage, 'direct-message-create'],
      [FriendsController.prototype.request, 'friend-request'],
      [MessagesController.prototype.create, 'message-create'],
      [MessagesController.prototype.createThreadMessage, 'thread-message-create'],
      [MessagesController.prototype.react, 'reaction-toggle'],
      [ServersController.prototype.create, 'server-create'],
      [ServersController.prototype.createInvite, 'invite-create'],
      [ServersController.prototype.joinInvite, 'invite-join'],
      [UploadsController.prototype.upload, 'upload-file'],
      [UploadsController.prototype.uploadChunk, 'upload-chunk'],
    ];

    endpoints.forEach(([handler, keyPrefix]) => {
      const metadata = Reflect.getMetadata(RATE_LIMIT_METADATA, handler) as
        | RateLimitOptions
        | undefined;
      assert.ok(metadata, `${keyPrefix} is missing rate-limit metadata`);
      assert.equal(metadata.keyPrefix, keyPrefix);
      assert.ok(metadata.limit > 0, `${keyPrefix} must have a positive limit`);
      assert.ok(metadata.windowMs > 0, `${keyPrefix} must have a positive window`);
    });
  });
});
