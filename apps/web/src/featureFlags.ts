/**
 * Build-time UI flags.
 *
 * `VITE_E2EE_ENABLED` only hides the encryption UI — it enforces nothing. The API's own
 * `E2EE_ENABLED` is the authoritative gate (docs/features/e2ee-key-management.md -> Risks,
 * "Feature flag"), so a stale build shows a switch whose request is refused rather than letting
 * anything through.
 */
export const E2EE_UI_ENABLED = import.meta.env.VITE_E2EE_ENABLED === 'true';
