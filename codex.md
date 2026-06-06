# Codex Project Configuration

## Required Skills

- **`ui-polish`**: Use for ALL frontend/UI/CSS tasks.

## Implementation Checklist Rule

Before implementing any task, create a checklist of concrete work items. Use `- [ ]` for unfinished work and mark `- [x]` only when that item is actually complete and verified. Never check pending, partial, blocked, untested, or assumed work.

## Required Reading (before any frontend task)

1. `DISCORD_UI_SKILL.md` — mandatory color tokens, component patterns, anti-patterns
2. `docs/design-rules.md` — full design system reference
3. `docs/ui-design-spec.md` — UX acceptance criteria

## Global UI Constraint

This project is a Discord clone. Every UI change MUST produce output that looks like Discord's real desktop app — warm dark backgrounds, flat solid panels, Discord Blurple (#5865F2) for primary actions. No neon colors, no gradients on panels, no glowing effects, no decorative borders. Read `DISCORD_UI_SKILL.md` for the complete enforced ruleset.

UI implementation must be library-first. Use established React UI, accessibility, icon, motion, and utility libraries before writing custom styles. Raw CSS is forbidden unless it is strictly required for minimal token-based styling, exact Discord layout constraints, or targeted responsive fixes; any unavoidable custom CSS must be scoped and justified by the implementation context.
