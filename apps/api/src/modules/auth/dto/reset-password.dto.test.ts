import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ResetPasswordDto } from './reset-password.dto';

async function errorsFor(password: string) {
  const dto = plainToInstance(ResetPasswordDto, { token: 'a'.repeat(43), password });
  return (await validate(dto)).flatMap((error) => Object.keys(error.constraints ?? {}));
}

describe('ResetPasswordDto', () => {
  it('accepts a password that satisfies the registration policy', async () => {
    assert.deepEqual(await errorsFor('Str0ng!Pass'), []);
  });

  it('refuses passwords missing a character class', async () => {
    assert.ok((await errorsFor('alllowercase1!')).includes('matches'));
    assert.ok((await errorsFor('NoSymbols123')).includes('matches'));
  });

  it('refuses passwords shorter than 8 characters', async () => {
    assert.ok((await errorsFor('S0rt!a')).includes('minLength'));
  });
});
