import type { AutoModAction, AutoModRule, AutoModTriggerType, CreateAutoModRuleInput } from '@/api';

/** The rule form's editable state; list fields are kept as the text the manager typed. */
export interface AutoModDraft {
  name: string;
  triggerType: AutoModTriggerType;
  termsText: string;
  pattern: string;
  mentionLimit: string;
  domainsText: string;
  action: AutoModAction;
  alsoAllowMessage: boolean;
  timeoutMinutes: string;
  /** Empty string means no alert channel. */
  alertChannelId: string;
  exemptRoleIds: string[];
  exemptChannelIds: string[];
}

export function draftFromRule(rule: AutoModRule | null): AutoModDraft {
  return {
    name: rule?.name ?? '',
    triggerType: rule?.triggerType ?? 'KEYWORD',
    termsText: rule?.terms.join('\n') ?? '',
    pattern: rule?.pattern ?? '',
    mentionLimit: String(rule?.mentionLimit ?? 5),
    domainsText: rule?.allowedDomains.join('\n') ?? '',
    action: rule?.action ?? 'BLOCK_MESSAGE',
    alsoAllowMessage: rule?.alsoAllowMessage ?? false,
    timeoutMinutes: String(rule?.timeoutMinutes ?? 5),
    alertChannelId: rule?.alertChannelId ?? '',
    exemptRoleIds: rule?.exemptRoleIds ?? [],
    exemptChannelIds: rule?.exemptChannelIds ?? [],
  };
}

/** Sends only the fields the trigger and action use; the API validates and clears the rest. */
export function inputFromDraft(draft: AutoModDraft): CreateAutoModRuleInput {
  const isTimeout = draft.action === 'TIMEOUT_AUTHOR';
  return {
    name: draft.name.trim(),
    triggerType: draft.triggerType,
    ...(draft.triggerType === 'KEYWORD' ? { terms: splitLines(draft.termsText) } : {}),
    ...(draft.triggerType === 'REGEX' ? { pattern: draft.pattern } : {}),
    ...(draft.triggerType === 'MENTION_SPAM' ? { mentionLimit: Number(draft.mentionLimit) } : {}),
    ...(draft.triggerType === 'EXTERNAL_LINK'
      ? { allowedDomains: splitLines(draft.domainsText) }
      : {}),
    action: draft.action,
    alsoAllowMessage: isTimeout && draft.alsoAllowMessage,
    ...(isTimeout ? { timeoutMinutes: Number(draft.timeoutMinutes) } : {}),
    alertChannelId: draft.alertChannelId || null,
    exemptRoleIds: draft.exemptRoleIds,
    exemptChannelIds: draft.exemptChannelIds,
  };
}

export function toggleId(ids: string[], id: string, checked: boolean) {
  return checked ? [...new Set([...ids, id])] : ids.filter((item) => item !== id);
}

function splitLines(text: string) {
  return text
    .split(/[\n,]/)
    .map((line) => line.trim())
    .filter(Boolean);
}
