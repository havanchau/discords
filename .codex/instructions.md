# Codex Instructions

Codex-specific entry point. Repository rules are not restated here; [`AGENT.md`](../AGENT.md) is the
canonical agent guide and this file only adds what Codex needs to find it.

## Before any task

1. Read [`AGENT.md`](../AGENT.md) — operating rules, checklist rules, docs-driven workflow, file size
   limits, and verification.
2. For frontend, CSS, or UI component work, also read [`DISCORD_UI_SKILL.md`](../DISCORD_UI_SKILL.md)
   and [`docs/design-rules.md`](../docs/design-rules.md), and use the `ui-polish` skill in
   [`.agents/skills/ui-polish/`](../.agents/skills/ui-polish/SKILL.md).
3. Follow the global `.claude` standards referenced by `AGENT.md`
   (`~/.claude/rules/workflow.md`, `~/.claude/rules/documentation.md`,
   `~/.claude/rules/self-review.md`).

## Source of truth

Do not copy rules or token values into this file. If a rule changes, update its owner document —
see the ownership table in [`docs/markdown-structure.md`](../docs/markdown-structure.md).
