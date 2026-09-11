# Documentation Index

This folder contains focused project documentation. Keep each file responsible for one topic and link to the canonical owner instead of duplicating large sections.

## Files

| File                        | Purpose                                                                                   |
| --------------------------- | ----------------------------------------------------------------------------------------- |
| `architecture.md`           | Repository architecture, boundaries, data ownership, realtime model, scaling rules.       |
| `deployment.md`             | Render API, Vercel web, Cloudinary, environment variables, and deployment flow.           |
| `design-rules.md`           | Canonical UI implementation rules for Discord-like product surfaces.                      |
| `feature-spec.md`           | Product scope, feature areas, API surfaces, realtime events, and completion checklist.    |
| `features/realtime-chat.md` | Feature spec for persistent realtime text chat, messaging CRUD, and pagination.           |
| `features/voice-webrtc.md`  | Feature spec for voice channel occupancy and WebRTC peer-to-peer signaling.               |
| `features/media-uploads.md` | Feature spec for attachment uploads, chunked media assembly, and storage drivers.         |
| `features/ui-overhaul.md`   | Feature spec for UI visual redesign and web codebase de-duplication.                      |
| `features/ui-identity-redesign.md` | Feature spec for the neutral visual identity and the global-CSS to CSS Modules migration. |
| `implementation-plan.md`    | Sprint plan, delivery sequence, test strategy, risks, and definition of done.             |

| `markdown-structure.md`     | Markdown ownership, structure rules, and automated documentation validation.              |
| `security-check.md`         | Security checklist for auth, permissions, realtime, uploads, secrets, and abuse controls. |
| `ui-design-spec.md`         | Short product-facing UI summary that points to `design-rules.md`.                         |
| `ui-event-ownership-map.md` | Realtime/UI side-effect ownership map for focused hooks and providers.                    |
| `ui-redesign-plan.md`       | Phased Discord-like UI refactor plan and rollback/test strategy.                          |

## Root Documents

| File                  | Purpose                                                                  |
| --------------------- | ------------------------------------------------------------------------ |
| `README.md`           | Project overview and local setup.                                        |
| `RULE.md`             | Product and engineering invariants.                                      |
| `AGENT.md`            | Guidance for coding agents. Follows `.claude` standards.                 |
| `AGENTS.md`           | Compatibility pointer to `AGENT.md`.                                     |
| `DISCORD_UI_SKILL.md` | Agent-facing UI enforcement summary that mirrors `docs/design-rules.md`. |
| `codex.md`            | Codex-specific project configuration.                                    |

## Maintenance Rules

- Write documentation in English.
- Follow `.claude` documentation standards (`~/.claude/rules/documentation.md`).
- Place feature-specific implementation specifications under `docs/features/<kebab-name>.md`.
- Keep setup commands in `README.md` and deployment commands in `deployment.md`.
- Keep canonical UI tokens and component rules in `design-rules.md`; `DISCORD_UI_SKILL.md` may mirror them as an agent-facing checklist but must not introduce separate values.
- Keep product scope in `feature-spec.md`.
- Keep sprint sequencing in `implementation-plan.md`.

- Keep Markdown structure rules and docs validation in `markdown-structure.md`.
- Keep root Markdown limited to repository entry points, agent instructions, and tool configuration.
- Prefer links over duplicated paragraphs.
