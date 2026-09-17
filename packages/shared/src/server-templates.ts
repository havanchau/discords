/** Built-in starter templates. Their content lives in the API; the client localizes the name by id. */
export const builtInServerTemplateIds = ['gaming', 'study-group', 'friends'] as const;
export type BuiltInServerTemplateId = (typeof builtInServerTemplateIds)[number];

export const SERVER_TEMPLATE_NAME_MAX_LENGTH = 60;
/** Private templates one source server may hold. */
export const SERVER_TEMPLATE_MAX_PER_SERVER = 10;
/** Size caps that bound the replay transaction; a larger server cannot be saved as a template. */
export const SERVER_TEMPLATE_MAX_ROLES = 25;
export const SERVER_TEMPLATE_MAX_CATEGORIES = 25;
export const SERVER_TEMPLATE_MAX_CHANNELS = 100;
export const SERVER_TEMPLATE_MAX_OVERRIDES = 250;

/**
 * `GET /templates` entry. A built-in template has `builtInId` set and no `sourceServerId`; a private
 * template is one the caller can still use, because they manage its source server.
 */
export interface ServerTemplateSummary {
  id: string;
  name: string;
  builtInId: BuiltInServerTemplateId | null;
  sourceServerId: string | null;
  roleCount: number;
  categoryCount: number;
  channelCount: number;
  createdAt: Date | null;
}

/** `POST /servers/:serverId/templates`. */
export interface CreateServerTemplateInput {
  name: string;
}

/** `POST /servers/from-template/:templateId`; responds with the same `{ server }` as `POST /servers`. */
export interface CreateServerFromTemplateInput {
  name: string;
  description?: string;
}
