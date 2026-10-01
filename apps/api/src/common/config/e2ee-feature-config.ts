import { ConfigService } from '@nestjs/config';

/**
 * The authoritative gate for per-device E2EE (docs/features/e2ee-key-management.md -> Risks &
 * rollback, "Feature flag").
 *
 * Default OFF on purpose: `main` auto-deploys to production, so a deploy that sets nothing must ship
 * the feature inert. While this is false the API refuses to mark any new scope encrypted; scopes
 * already encrypted keep working, so flipping it back off never strands data.
 *
 * The web's `VITE_E2EE_ENABLED` only hides UI. It is not a substitute for this check — a refused
 * request is the guarantee, not a hidden button.
 */
export function isE2eeEnabled(config: ConfigService) {
  return config.get<string>('E2EE_ENABLED', 'false') === 'true';
}
