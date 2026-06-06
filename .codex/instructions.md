# Codex Instructions

## Mandatory Pre-Task Steps

1. **Always read `DISCORD_UI_SKILL.md`** at the project root before any frontend/UI/CSS work.
2. **Always read `docs/design-rules.md`** for the complete design token reference.
3. **Use the `ui-polish` skill** for all visual UI tasks.

## UI Hard Rules (apply to EVERY frontend change)

- This is a Discord clone. The UI MUST look like Discord's actual desktop app.
- Use ONLY the color tokens from `DISCORD_UI_SKILL.md`. No exceptions.
- **Forbidden**: neon cyan `#00e5ff`, neon pink `#ff1fb8`, neon lime `#00ff95`, `#8f78ff`, `#ffb000`, any `rgba(0, 229, 255, ...)`.
- **Forbidden**: gradient backgrounds on panels, glowing box-shadows, decorative borders, border-radius on the app shell.
- **Required**: warm dark palette (`#1e1f22`, `#2b2d31`, `#313338`), Discord Blurple `#5865f2`, flat solid backgrounds.
- **Required**: 4-column layout (72px rail, 240px channel sidebar, flex chat, 240px member sidebar).

## After Any UI Change

- Verify no neon/gradient/glow styling exists.
- Verify all panels use flat solid warm-dark backgrounds.
- Verify brand color is `#5865f2` (not cyan, not old blurple).
- Run `npx tsc --noEmit` and lint.
