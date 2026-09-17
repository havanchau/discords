import { generateSecretToken, syntheticUserIdentity } from '@/common/secret-token';

/**
 * A bot token is `<botId>.<secret>`. The id lets the guard find the row by primary key and compare
 * the SHA-256 of the secret in constant time, as a webhook URL does. Neither a cuid nor a base64url
 * secret contains `.`, so the split is unambiguous.
 */
export function issueBotToken(botId: string) {
  const secret = generateSecretToken();
  return { token: `${botId}.${secret}`, secret };
}

export function parseBotToken(token: string) {
  const separator = token.indexOf('.');
  if (separator <= 0 || separator === token.length - 1) return null;
  return { botId: token.slice(0, separator), secret: token.slice(separator + 1) };
}

/** The bot's own User row; see `syntheticUserIdentity`. */
export function botUserIdentity() {
  return syntheticUserIdentity('bot', 'bots.invalid');
}
