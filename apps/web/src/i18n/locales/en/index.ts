// Source of truth for the key set, merged from one module per area. Every key here must exist in
// ../vi; npm run i18n:check enforces it.
import { common } from './common';
import { auth } from './auth';
import { profile } from './profile';
import { chat } from './chat';
import { savedScheduled } from './saved-scheduled';
import { channels } from './channels';
import { servers } from './servers';
import { moderation } from './moderation';
import { home } from './home';
import { discovery } from './discovery';
import { shortcuts } from './shortcuts';
import { webhooks } from './webhooks';
import { bots } from './bots';
import { stickersSoundboard } from './stickers-soundboard';
import { platform } from './platform';
import { stage } from './stage';

export const en = {
  ...common,
  ...auth,
  ...profile,
  ...chat,
  ...savedScheduled,
  ...channels,
  ...servers,
  ...moderation,
  ...home,
  ...discovery,
  ...shortcuts,
  ...webhooks,
  ...bots,
  ...stickersSoundboard,
  ...platform,
  ...stage,
} as const;
