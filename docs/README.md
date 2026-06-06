# Documentation Index

This folder contains focused project documentation. Keep each file responsible for one topic and link to the canonical owner instead of duplicating large sections.

## Files

| File                | Purpose                                                                                   |
| ------------------- | ----------------------------------------------------------------------------------------- |
| `architecture.md`   | Repository architecture, boundaries, data ownership, realtime model, scaling rules.       |
| `deployment.md`     | Render API, Vercel web, Cloudinary, environment variables, and deployment flow.           |
| `design-rules.md`   | Canonical UI implementation rules for Discord-like product surfaces.                      |
| `security-check.md` | Security checklist for auth, permissions, realtime, uploads, secrets, and abuse controls. |
| `ui-design-spec.md` | Short product-facing UI summary that points to `design-rules.md`.                         |

## Root Documents

| File                            | Purpose                                           |
| ------------------------------- | ------------------------------------------------- |
| `README.md`                     | Project overview and local setup.                 |
| `RULE.md`                       | Product and engineering invariants.               |
| `AGENT.md`                      | Guidance for coding agents.                       |
| `discord-clone-feature-spec.md` | Product scope and feature checklist.              |
| `IMPLEMENTATION_PLAN.md`        | Sprint plan and definition of done.               |
| `DISCORD_UI_SKILL.md`           | Notes for using Codex `ui-polish` with this repo. |

## Maintenance Rules

- Write documentation in English.
- Keep setup commands in `README.md` and deployment commands in `deployment.md`.
- Keep UI tokens and component rules only in `design-rules.md`.
- Keep product scope in `discord-clone-feature-spec.md`.
- Keep sprint sequencing in `IMPLEMENTATION_PLAN.md`.
- Prefer links over duplicated paragraphs.
