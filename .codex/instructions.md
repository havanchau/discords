# Codex Instructions

## Mandatory Pre-Task Steps

1. **Always read `DISCORD_UI_SKILL.md`** at the project root before any frontend/UI/CSS work.
2. **Always read `docs/design-rules.md`** for the canonical design token reference.
3. **Use the `ui-polish` skill** for all visual UI tasks.
4. **Create a task checklist before implementation**. Use `- [ ]` for pending work and mark `- [x]` only after the item is genuinely complete and verified.

## Checklist Truth Rule

- Never check incomplete, partially done, blocked, untested, or assumed tasks.
- Update checklist items as work progresses.
- If the scope changes, revise the checklist so it remains accurate.

## File Size Rule

- No source or documentation file should exceed 1000 lines.
- If a file would exceed 1000 lines, split it into focused modules or documents before continuing.
- Existing files over 1000 lines must be reduced as part of any substantial refactor that touches them.

## UI Hard Rules (apply to EVERY frontend change)

- This is a Discord clone. The UI MUST look like Discord's actual desktop app.
- Use established UI/component/accessibility/icon libraries first for every UI task.
- Do not write raw CSS for UI work unless it is strictly required for Discord tokens, exact app-shell layout constraints, or targeted responsive fixes.
- Any unavoidable custom CSS must be minimal, token-based, scoped, and justified by the implementation context.
- Use ONLY the canonical color tokens from `docs/design-rules.md`, as mirrored in `DISCORD_UI_SKILL.md`. No exceptions.
- **Forbidden**: neon cyan `#00e5ff`, neon pink `#ff1fb8`, neon lime `#00ff95`, `#8f78ff`, `#ffb000`, any `rgba(0, 229, 255, ...)`.
- **Forbidden**: gradient backgrounds on panels, glowing box-shadows, decorative borders, border-radius on the app shell.
- **Required**: warm dark palette (`#1e1f22`, `#2b2d31`, `#313338`), Discord Blurple `#5865f2`, flat solid backgrounds.
- **Required**: 4-column layout (72px rail, 240px channel sidebar, flex chat, 240px member sidebar).

## After Any UI Change

- Verify no neon/gradient/glow styling exists.
- Verify all panels use flat solid warm-dark backgrounds.
- Verify brand color is `#5865f2` (not cyan, not old blurple).
- Run `npx tsc --noEmit` and lint.
