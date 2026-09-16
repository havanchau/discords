# Documentation Index

This folder contains focused project documentation. Keep each file responsible for one topic and link to the canonical owner instead of duplicating large sections.

## Files

| File | Purpose |
| --- | --- |
| `architecture.md` | Repository architecture, boundaries, data ownership, realtime model, scaling rules. |
| `deployment.md` | Render API, Vercel web, Cloudinary, environment variables, and deployment flow. |
| `design-rules.md` | Canonical UI implementation rules; token values live in `apps/web/src/styles/tokens.css`. |
| `feature-roadmap.md` | Backlog slices and the feature delivery checklist. |
| `feature-spec.md` | Product scope, feature areas, API surfaces, realtime events, and completion checklist. |
| `implementation-plan.md` | Sprint plan, delivery sequence, test strategy, risks, and definition of done. |
| `markdown-structure.md` | Markdown ownership, structure rules, and automated documentation validation. |
| `security-check.md` | Security checklist for auth, permissions, realtime, uploads, secrets, and abuse controls. |
| `ui-design-spec.md` | Short product-facing UI summary and UX acceptance criteria. |
| `ui-event-ownership-map.md` | Realtime/UI side-effect ownership map for focused hooks and providers. |
| `ui-redesign-plan.md` | Phase status for the UI identity redesign. |

## Feature Specs

| File | Purpose |
| --- | --- |
| `features/realtime-chat.md` | Persistent realtime text chat, messaging CRUD, and pagination. |
| `features/voice-webrtc.md` | Voice channel occupancy and WebRTC peer-to-peer signaling. |
| `features/media-uploads.md` | Attachment uploads, chunked media assembly, and storage drivers. |
| `features/ui-identity-redesign.md` | Neutral visual identity and the global-CSS to CSS Modules migration. |
| `features/ui-consistency-pass.md` | Token-only colours, uniform control heights, and the type scale across the web UI. |
| `features/performance-optimization.md` | Batched permission/unread queries, web bundle size, and message list re-renders. |
| `features/ddos-protection.md` | Application-layer protection against request, connection, and slow-client floods. |
| `features/user-blocking.md` | Blocking users and enforcing blocks on friend and DM paths. |
| `features/dm-message-actions.md` | Editing, deleting, replying to, reacting to, and pinning direct messages. |
| `features/group-dm.md` | Group direct conversations and their membership lifecycle. |
| `features/dm-calls.md` | Ringing voice and video calls inside direct conversations. |
| `features/member-bans.md` | Banning and unbanning server members. |
| `features/member-timeout-and-slowmode.md` | Member timeouts and per-channel slowmode. |
| `features/channel-categories.md` | Collapsible channel categories. |
| `features/message-markdown.md` | Safe Discord-style markdown rendering. |
| `features/custom-emoji.md` | Server custom emoji in messages and reactions. |
| `features/link-previews.md` | SSRF-safe link preview cards. |
| `features/email-verification-delivery.md` | Verification links delivered only by email, with resend. |
| `features/oauth-login.md` | Google and Facebook sign-in with PKCE and one-time login codes. |
| `features/password-reset.md` | Email-based password reset. |
| `features/session-management.md` | Listing and revoking active sessions. |
| `features/two-factor-auth.md` | TOTP two-factor authentication and recovery codes. |
| `features/server-events.md` | Scheduled server events with interest tracking. |
| `features/i18n-localization.md` | English and Vietnamese localization across web, email, push, and API errors. |
| `features/user-profile.md` | Profile banner, pronouns, custom status, per-server identity, and the profile card. |

## Root Documents

| File | Purpose |
| --- | --- |
| `README.md` | Project overview and local setup. |
| `RULE.md` | Product and engineering invariants. |
| `AGENT.md` | Canonical guidance for coding agents. Follows `.claude` standards. |
| `AGENTS.md` | Compatibility pointer to `AGENT.md`. |
| `DISCORD_UI_SKILL.md` | Agent-facing UI checklist that links back to `docs/design-rules.md`. |

Tool-specific entry points that only point back to `AGENT.md`: `.codex/instructions.md` (Codex) and `.agents/skills/ui-polish/SKILL.md` (UI workflow skill).

## Maintenance Rules

- Write documentation in English.
- Follow `.claude` documentation standards (`~/.claude/rules/documentation.md`).
- Place feature-specific implementation specifications under `docs/features/<kebab-name>.md` and add them to the Feature Specs table above.
- Delete a feature spec once it is superseded; git history keeps the record.
- Keep setup commands in `README.md` and deployment commands in `deployment.md`.
- Keep canonical UI rules in `design-rules.md` and token values in `tokens.css`; agent-facing files may summarize them but must not introduce separate values.
- Keep product scope in `feature-spec.md`.
- Keep sprint sequencing in `implementation-plan.md`.
- Keep Markdown structure rules and docs validation in `markdown-structure.md`.
- Keep root Markdown limited to repository entry points, agent instructions, and tool configuration.
- Prefer links over duplicated paragraphs.
