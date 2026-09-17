// Vietnamese copy, merged from one module per area. Keys mirror ../en exactly; npm run i18n:check
// enforces it.
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

export const vi = {
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
} as const;
