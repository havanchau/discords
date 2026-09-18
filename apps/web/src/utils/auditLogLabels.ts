import type { MessageKey, Translate } from '@/i18n/LocaleProvider';

// Known audit action codes written by the API (`apps/api/src/modules/**`, `auditLog.create`/
// `writeAuditLog` calls). An action outside this map still renders — just as its humanised enum
// name — so a new backend action never breaks the audit log UI.
const AUDIT_ACTION_LABEL_KEYS: Record<string, MessageKey> = {
  AUTOMOD_RULE_CREATE: 'audit.action.AUTOMOD_RULE_CREATE',
  AUTOMOD_RULE_DELETE: 'audit.action.AUTOMOD_RULE_DELETE',
  AUTOMOD_RULE_TRIGGERED: 'audit.action.AUTOMOD_RULE_TRIGGERED',
  AUTOMOD_RULE_UPDATE: 'audit.action.AUTOMOD_RULE_UPDATE',
  BOT_AUTHORIZE: 'audit.action.BOT_AUTHORIZE',
  BOT_REMOVE: 'audit.action.BOT_REMOVE',
  BOT_TOKEN_REGENERATE: 'audit.action.BOT_TOKEN_REGENERATE',
  CATEGORY_CREATE: 'audit.action.CATEGORY_CREATE',
  CATEGORY_DELETE: 'audit.action.CATEGORY_DELETE',
  CATEGORY_UPDATE: 'audit.action.CATEGORY_UPDATE',
  CHANNEL_CREATE: 'audit.action.CHANNEL_CREATE',
  CHANNEL_OVERRIDES_UPDATE: 'audit.action.CHANNEL_OVERRIDES_UPDATE',
  CHANNEL_UPDATE: 'audit.action.CHANNEL_UPDATE',
  EMOJI_CREATE: 'audit.action.EMOJI_CREATE',
  EMOJI_DELETE: 'audit.action.EMOJI_DELETE',
  FORUM_POST_CREATE: 'audit.action.FORUM_POST_CREATE',
  FORUM_TAGS_UPDATE: 'audit.action.FORUM_TAGS_UPDATE',
  INVITE_CREATE: 'audit.action.INVITE_CREATE',
  INVITE_REVOKE: 'audit.action.INVITE_REVOKE',
  MEMBER_BAN: 'audit.action.MEMBER_BAN',
  MEMBER_KICK: 'audit.action.MEMBER_KICK',
  MEMBER_LEAVE: 'audit.action.MEMBER_LEAVE',
  MEMBER_NICKNAME_UPDATE: 'audit.action.MEMBER_NICKNAME_UPDATE',
  MEMBER_PROFILE_UPDATE: 'audit.action.MEMBER_PROFILE_UPDATE',
  MEMBER_ROLE_ADD: 'audit.action.MEMBER_ROLE_ADD',
  MEMBER_ROLE_REMOVE: 'audit.action.MEMBER_ROLE_REMOVE',
  MEMBER_TIMEOUT: 'audit.action.MEMBER_TIMEOUT',
  MEMBER_TIMEOUT_CLEAR: 'audit.action.MEMBER_TIMEOUT_CLEAR',
  MEMBER_UNBAN: 'audit.action.MEMBER_UNBAN',
  MESSAGE_DELETE: 'audit.action.MESSAGE_DELETE',
  MESSAGE_PIN: 'audit.action.MESSAGE_PIN',
  MESSAGE_REPORT_CREATE: 'audit.action.MESSAGE_REPORT_CREATE',
  MESSAGE_UNPIN: 'audit.action.MESSAGE_UNPIN',
  POLL_CLOSE: 'audit.action.POLL_CLOSE',
  POLL_CREATE: 'audit.action.POLL_CREATE',
  ROLE_CREATE: 'audit.action.ROLE_CREATE',
  ROLE_DELETE: 'audit.action.ROLE_DELETE',
  ROLE_UPDATE: 'audit.action.ROLE_UPDATE',
  SERVER_CREATE_FROM_TEMPLATE: 'audit.action.SERVER_CREATE_FROM_TEMPLATE',
  SERVER_DISCOVERY_UPDATE: 'audit.action.SERVER_DISCOVERY_UPDATE',
  SERVER_ONBOARDING_UPDATE: 'audit.action.SERVER_ONBOARDING_UPDATE',
  SERVER_OWNERSHIP_TRANSFER: 'audit.action.SERVER_OWNERSHIP_TRANSFER',
  SERVER_TEMPLATE_CREATE: 'audit.action.SERVER_TEMPLATE_CREATE',
  SERVER_TEMPLATE_DELETE: 'audit.action.SERVER_TEMPLATE_DELETE',
  SERVER_UPDATE: 'audit.action.SERVER_UPDATE',
  SOUNDBOARD_CLIP_CREATE: 'audit.action.SOUNDBOARD_CLIP_CREATE',
  STICKER_CREATE: 'audit.action.STICKER_CREATE',
  WEBHOOK_CREATE: 'audit.action.WEBHOOK_CREATE',
  WEBHOOK_DELETE: 'audit.action.WEBHOOK_DELETE',
  WEBHOOK_REGENERATE: 'audit.action.WEBHOOK_REGENERATE',
};

/** A translated label for a known audit action, or its humanised enum name otherwise. */
export function auditActionLabel(action: string, t: Translate): string {
  const key = AUDIT_ACTION_LABEL_KEYS[action];
  if (key) return t(key);
  return action.replaceAll('_', ' ').toLowerCase();
}
