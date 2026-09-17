import type { AutoModAction, AutoModTriggerType } from '@discord-clone/shared';
import type { SafeRegex } from './safe-regex';

/** A rule as the evaluator holds it in memory: terms lowercased, the pattern already compiled. */
export interface CompiledAutoModRule {
  id: string;
  name: string;
  triggerType: AutoModTriggerType;
  terms: string[];
  regex: SafeRegex | null;
  mentionLimit: number | null;
  allowedDomains: string[];
  action: AutoModAction;
  alsoAllowMessage: boolean;
  timeoutMinutes: number | null;
  alertChannelId: string | null;
  exemptRoleIds: string[];
  exemptChannelIds: string[];
}

// Fixed, linear patterns written here, never user input.
const MENTION_PATTERN = /@([a-zA-Z0-9_]+)/g;
const INVITE_PATTERN = /(?:https?:\/\/[^\s/]+\/invite\/|\bdiscords\.gg\/)[A-Za-z0-9_-]+/i;
const URL_PATTERN = /https?:\/\/[^\s<>()]+/gi;
// What the web client's `encryptChannelMessage` produces (`apps/web/src/e2ee.ts`).
const ENCRYPTED_CONTENT_PATTERN = /^e2ee:v1:[A-Za-z0-9+/]+=*:[A-Za-z0-9+/]+=*$/;

/** E2EE channel content is ciphertext the server cannot read: never evaluated, refused while a rule applies. */
export function isEncryptedContent(text: string) {
  return ENCRYPTED_CONTENT_PATTERN.test(text);
}

/** Whether a fired rule stops the message from being stored. */
export function blocksMessage(rule: Pick<CompiledAutoModRule, 'action' | 'alsoAllowMessage'>) {
  return (
    rule.action === 'BLOCK_MESSAGE' || (rule.action === 'TIMEOUT_AUTHOR' && !rule.alsoAllowMessage)
  );
}

export function ruleMatches(rule: CompiledAutoModRule, text: string): boolean {
  switch (rule.triggerType) {
    case 'KEYWORD': {
      const lowered = text.toLowerCase();
      return rule.terms.some((term) => lowered.includes(term));
    }
    case 'REGEX':
      return rule.regex?.test(text) ?? false;
    case 'MENTION_SPAM': {
      const mentions = new Set([...text.matchAll(MENTION_PATTERN)].map((m) => m[1].toLowerCase()));
      return rule.mentionLimit !== null && mentions.size > rule.mentionLimit;
    }
    case 'INVITE_LINK':
      return INVITE_PATTERN.test(text);
    case 'EXTERNAL_LINK':
      return [...text.matchAll(URL_PATTERN)].some(
        (match) => !isAllowedHost(match[0], rule.allowedDomains),
      );
  }
}

/** An allowed domain also covers its subdomains. A URL that cannot be parsed is not allowed. */
function isAllowedHost(rawUrl: string, allowedDomains: string[]) {
  if (!URL.canParse(rawUrl)) return false;
  const hostname = new URL(rawUrl).hostname.toLowerCase();
  return allowedDomains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
}
