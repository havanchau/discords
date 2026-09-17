# Feature Spec: Server Onboarding (Rules Screening and Self-Assign Roles)

Gates a new member's ability to send messages, react, and connect to voice until they accept the server's rules, and offers self-assign role questions right after.

## Goal

A server owner turns on "membership screening" with a rules text; a member who joins cannot send messages, add reactions, or connect to voice until they explicitly accept the rules; accepting can optionally present self-assign role questions.

Acceptance criteria:

- `PATCH /servers/:serverId` (or a dedicated endpoint) lets `MANAGE_SERVER` enable/disable screening and set `rulesText` (1-4000 chars) and an ordered list of self-assign role questions, each mapping to one or more `Role`s.
- A member who has not accepted rules on a screening-enabled server gets `403` from `createMessage`, `toggleReaction`, and `voice:join`/`authorizeCallJoin` — the same three enforcement points that already gate on timeout (`requireNotTimedOut`).
- `POST /servers/:serverId/onboarding/accept` records acceptance and, if the server sent self-assign answers, grants the selected roles in the same transaction.
- Accepting twice is idempotent (`200`, no duplicate role grants).
- The owner and members who joined before screening was turned on are **not** retroactively gated (see Rules).
- `GET /servers/:serverId` includes whether the current member still needs to accept rules, so the client can show the screening gate instead of the normal chat UI.

## Scope

- **In scope**: `ServerOnboarding` config (rules text, self-assign questions), `MemberOnboardingAcceptance` per member, server-side enforcement on message send, reaction, and voice join, a rules-acceptance screen in the web client, self-assign role picker, interaction with the invite join flow.
- **Out of scope**: age gating / DM verification requirements (Discord's "must verify phone/email"), membership screening approval queue (moderator manually approves each joiner), editing rules text triggering re-acceptance for existing accepted members, self-assign roles as a standalone always-available feature independent of screening (this doc only wires it into the onboarding flow).

## Current Behavior

- `joinInvite` (`apps/api/src/modules/servers/servers.service.ts:309-378`) creates (or reuses) a `ServerMember` row, upserts the `@everyone` role, assigns it, increments `usedCount`, and returns — the member can act immediately with whatever `@everyone` grants.
- No concept of "accepted rules" or "pending member" exists in `schema.prisma`.
- The only existing server-side gate of this shape is `PermissionsService.requireNotTimedOut` (`apps/api/src/modules/permissions/permissions.service.ts:64-70`), called from three places: `createMessage` (`apps/api/src/modules/messages/messages.service.ts:166`), `toggleReaction` (`messages.service.ts:446`), and `createThreadMessage` (`messages.service.ts:281`). Voice join has no equivalent gate today — `authorizeCallJoin` (`apps/api/src/modules/realtime/realtime-access.service.ts:71-82`) only calls `requireChannelMember` (line 76), which checks membership, not timeout or any other per-member gate.
- Self-assign roles do not exist; roles are only granted by `MANAGE_ROLES` holders through the role editor, or implicitly via the `@everyone` role on join.

## Changes

### Rules

- Screening is a server-level toggle (`onboardingEnabled: Boolean`) plus `rulesText: String?` (required, non-empty, when enabled) and `selfAssignQuestions: Json?` — an ordered array of `{ id, prompt, roleIds: string[], multiSelect: boolean }`.
- On join (`joinInvite`), a member on a screening-enabled server gets no automatic `MemberOnboardingAcceptance` row — absence of the row _is_ "not yet accepted." The `@everyone` role is still assigned as today (screening does not change base role assignment), but the new gate blocks action regardless of what `@everyone` grants.
- Enforcement point: a new `PermissionsService.requireOnboardingAccepted(userId, serverId)`, modeled directly on `requireNotTimedOut`, called from the same three call sites (`createMessage`, `toggleReaction`, `createThreadMessage`) plus a new call in `authorizeCallJoin` before `requireChannelMember` returns successfully. The owner (`member.kind === 'OWNER'`) is always exempt, mirroring `requireNotTimedOut`'s owner exemption (`permissions.service.ts:68`).
- Turning screening off does not delete existing `MemberOnboardingAcceptance` rows (harmless once the gate is bypassed by the disabled flag) and does not retroactively gate members who joined before screening was turned on — the row is only checked for existence _when_ `onboardingEnabled` is true, so a pre-existing member who never explicitly accepted is treated as blocked the moment screening is turned on. This is called out explicitly as an edge case owners must be told about (see Trade-offs) rather than silently exempting them, because a silent exemption defeats the purpose of turning screening on.
- Accepting (`POST /servers/:serverId/onboarding/accept`) requires membership (`requireMembership`), validates any submitted `roleIds` against the configured questions' `roleIds` (rejecting anything not offered, `400`), and in one transaction: creates `MemberOnboardingAcceptance` (upsert, so re-accepting is a no-op) and grants the selected roles via `MemberRole.upsert` (same idempotent-upsert pattern already used for the `@everyone` role at `servers.service.ts:361-365`).
- Accept requires `rulesAccepted: true` in the body even when there are no self-assign questions — the endpoint always requires the explicit rules acknowledgment, roles are optional on top of it.
- Audit: `SERVER_ONBOARDING_UPDATE` `{ onboardingEnabled }` on the config change; acceptance itself is not audited (it is a routine member action, not a moderation action, matching that role self-assignment elsewhere is not audited either).

### Client

- `GET /servers/:serverId` response gains `needsOnboarding: boolean` for the current member (computed server-side: `onboardingEnabled && !acceptance`), used to render a full-screen "Read the rules" gate in place of the channel view, following the same pattern `AppShell.tsx` already uses to gate on auth.
- The gate shows `rulesText`, an "I have read and agree" checkbox, then (if configured) the self-assign question list with role checkboxes/radios per `multiSelect`, and a submit button that calls the accept endpoint.
- A blocked action attempted anyway (e.g. a stale tab) surfaces the `403` through the existing error-toast path (`api.ts` error handling) rather than a bespoke screen.
- Server settings gains an "Onboarding" section (visible to `MANAGE_SERVER`) to toggle screening, edit rules text, and manage self-assign questions (prompt + role multi-select), following the same form/list pattern as `ServerBansSection.tsx`.

## Technical Approach

### Data model

```prisma
model Server {
  // ...existing fields unchanged...
  onboardingEnabled     Boolean  @default(false)
  rulesText              String?
  selfAssignQuestions    Json?
  onboardingAcceptances  MemberOnboardingAcceptance[]
}

model MemberOnboardingAcceptance {
  id        String   @id @default(cuid())
  serverId  String
  userId    String
  acceptedAt DateTime @default(now())
  server    Server @relation(fields: [serverId], references: [id], onDelete: Cascade)
  user      User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([serverId, userId])
}
```

Migration `<timestamp>_add_server_onboarding`. `selfAssignQuestions` as `Json` matches the existing precedent of `AuditLog.metadata: Json?` (`schema.prisma`) for a structure with no query need beyond "load it whole."

### API

| Method  | Path                                   | Body                                            | Response                                                |
| ------- | -------------------------------------- | ----------------------------------------------- | ------------------------------------------------------- |
| `PATCH` | `/servers/:serverId/onboarding`        | `{ enabled, rulesText?, selfAssignQuestions? }` | `{ server }`                                            |
| `GET`   | `/servers/:serverId/onboarding`        | —                                               | `{ enabled, rulesText, selfAssignQuestions, accepted }` |
| `POST`  | `/servers/:serverId/onboarding/accept` | `{ rulesAccepted: true, roleIds?: string[] }`   | `{ ok: true, grantedRoleIds: string[] }`                |

### Realtime

- No new realtime event: the client reads `needsOnboarding` from the existing `GET /servers/:serverId` fetch on join/reload, matching the "handle reconnects by refetching missed state" rule (`RULE.md`) instead of adding a socket event for a one-time gate.
- `voice:join` (`apps/api/src/modules/realtime/voice.gateway.ts:32-68`) rejection from `requireOnboardingAccepted` reuses the existing failure path already used for `authorizeCallJoin` failures (line 46) — no new socket error shape.

### Files

- API: `apps/api/prisma/schema.prisma`, new migration, new `apps/api/src/modules/servers/onboarding.service.ts` (or a method group on `servers.service.ts`), `servers.controller.ts` (3 new routes), `dto/update-onboarding.dto.ts`, `dto/accept-onboarding.dto.ts`, `apps/api/src/modules/permissions/permissions.service.ts` (`requireOnboardingAccepted`), `apps/api/src/modules/messages/messages.service.ts` (3 call sites), `apps/api/src/modules/realtime/realtime-access.service.ts` (`authorizeCallJoin`).
- Web: `apps/web/src/api.ts`, new `apps/web/src/components/onboarding/RulesGate.tsx`, `SelfAssignQuestion.tsx`, `apps/web/src/AppShell.tsx` (render gate when `needsOnboarding`), `apps/web/src/components/settings/ServerOnboardingSettings.tsx`, `apps/web/src/i18n/locales/en.ts` / `vi.ts`.

## Trade-offs

| Option                                                                                                                        | Pros                                                                                                                                                                                    | Cons                                                                                                                                                            | Verdict                                                                                                                                                         |
| ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reuse `requireNotTimedOut`'s pattern (new sibling method, same call sites) vs. a single combined "requireCanParticipate" gate | Keeps each gate's failure message and intent distinct (`You are timed out...` vs. `You must accept the server rules first`); matches how the repo already separates concerns per method | One more `await` line at each of 4 call sites instead of one                                                                                                    | **Chosen** — matches existing precedent exactly, and a combined gate would hide which specific reason blocked the user                                          |
| Exempt pre-screening members automatically vs. blocking them until they explicitly accept                                     | Less disruptive when an owner turns screening on for the first time                                                                                                                     | Defeats the point of screening (a bad-actor member who joined an hour before screening was enabled stays ungated forever)                                       | **Chosen to block, not exempt** — the doc calls this out as a behavior owners must be told about in the UI copy, rather than silently picking the softer option |
| `selfAssignQuestions` as `Json` vs. a normalized `OnboardingQuestion`/`OnboardingQuestionRole` table pair                     | `Json` is a one-column, one-migration change matching `AuditLog.metadata`'s precedent; questions have no independent lifecycle (no per-question audit, no cross-server reuse)           | Cannot be queried/filtered in SQL (e.g. "servers with more than 3 questions"); a schema mistake in the JSON only surfaces at read time, not via a DB constraint | **Chosen** for v1; normalize later if question-level querying becomes a real need                                                                               |

## Deviations From The Original Design

Written back after implementation, so the doc matches the code:

- **Existing members are blocked.** The acceptance criterion "members who joined before screening was turned on are not retroactively gated" contradicts Rules and Trade-offs; the implementation follows Rules ("block, not exempt"), as recorded in open question 22. The settings copy tells the owner before they save.
- **Acceptance is a column, not a table.** `ServerMember.onboardingAcceptedAt DateTime?` replaces `MemberOnboardingAcceptance`. The gate then reads one row (the same row `requireNotTimedOut` reads), and acceptance leaves with the membership: a kicked member, a member who leaves, and an account anonymized by account deletion (which deletes its `ServerMember` rows) all have to accept again. The account export lists it per membership as `rulesAcceptedAt`. Migration `20260917008000_add_server_onboarding` adds the three `Server` columns and this one; all are nullable or defaulted.
- **Exemption.** The owner and members holding `MANAGE_SERVER` (the permission that edits screening) are exempt, both in the gate and in `needsOnboarding`. The spec named only the owner, which would have locked out the admins who configure the rules. The rule lives once in `apps/api/src/modules/permissions/onboarding-gate.ts` (`memberNeedsOnboarding`).
- **The gate covers every participation path, not three.** `PermissionsService.requireOnboardingAccepted` sits beside `requireNotTimedOut`:
  - `MessagesService.requireCanPostInChannel`, which every top-level channel send goes through: socket `message:create`, REST `POST /channels/:channelId/messages`, forwarding into a channel, scheduled channel sends at send time, and channel poll creation. A new send path that uses this helper is gated for free.
  - `createThreadMessage` (REST and socket thread replies), `updateMessage` (REST and socket edits, after the author check), `toggleReaction` (REST and socket), `PollsService.vote` for channel polls, and `RealtimeAccessService.authorizeCallJoin` for server voice channels (`voice:join`).
  - Not gated: deleting or pinning one's own message, closing one's own poll, typing indicators, reading, reports, saved messages, and every direct-message path (DM calls included). Scheduling a message is not refused up front; the send is refused at `sendAt`.
- **Scheduled sends** refused by the gate fail with the new reason `RULES_NOT_ACCEPTED` (`scheduled-message.rules.ts` maps the literal; API and web catalogs and `ScheduledMessageItem` translate it).
- **Self-assign safety.**
  - A role can be offered only if it is not `@everyone` and carries no permission outside `SELF_ASSIGNABLE_ROLE_PERMISSIONS` (`VIEW_CHANNEL`, `SEND_MESSAGES`, `CREATE_INVITE`, `CONNECT_VOICE`, `SPEAK_VOICE`, `UPLOAD_FILES`); otherwise the save is refused with `400 Role cannot be self-assigned` (`404 Role not found` for a foreign or unknown id).
  - Adding a role to the offer that was not offered before also requires `MANAGE_ROLES`, because offering a role grants it; keeping or removing roles needs only `MANAGE_SERVER`.
  - Stored questions are re-validated against the server's current roles on every read and on accept: a deleted role, or one later edited to carry a moderation permission, silently stops being offered, and a question left with no role is omitted. Saving writes back the cleaned list.
  - Accept refuses any role not currently offered (`400 Role is not offered by this server`) and more than one role from a single-choice question (`400 Choose one role for each single-choice question`).
  - Accepting is one-shot: a conditional `updateMany` on `onboardingAcceptedAt: null` records it, and roles are granted (`createMany` with `skipDuplicates`) only by the request that recorded it, so a repeat returns `200` with `grantedRoleIds: []` and self-assignment is not reopened after onboarding.
- **Limits** (shared constants): rules text up to 4000 characters, 5 questions, 10 roles per question, prompts up to 200 characters. `rulesText` and `selfAssignQuestions` may be omitted from `PATCH` to keep the stored values; `rulesText` is required whenever the result is enabled (`400 Rules text is required to turn on screening`).
- **API shapes.** `PATCH /servers/:serverId/onboarding` returns the same `ServerOnboardingView` as `GET` (not `{ server }`), which is what the settings form needs. `POST .../accept` on a server with screening off returns `400 Rules screening is not enabled`. `GET /servers` and `GET /servers/:serverId` no longer return the screening columns; `GET /servers/:serverId` returns `needsOnboarding`. Member rows in the server detail still carry every `ServerMember` column, so `onboardingAcceptedAt` is visible to other members, as `timeoutUntil` already is.
- **Web.** The gate (`components/onboarding/RulesGate.tsx`, `SelfAssignQuestion.tsx`) replaces `ChatPanel` in `components/app/AuthenticatedWorkspace.tsx`, not in `AppShell.tsx`, which is near the file-size limit. Settings use `ServerOnboardingSettings.tsx` and `OnboardingQuestionEditor.tsx` with the AutoMod form patterns. Accepting refetches the server detail; a tab whose detail predates a change shows a "Continue" button that refetches it. A single-choice question uses checkboxes that keep one role checked, since there is no radio primitive.
- No realtime event, as specified: a member whose tab loaded before screening was turned on sees the translated `403` until the server detail is refetched.
- **Bots are exempt** (added with [bot-api.md](bot-api.md)): `memberNeedsOnboarding` returns false for a member of kind `BOT`, since a bot cannot accept rules and the admin who authorized it chose its role.
- **Realtime (2026-09-17):** `PATCH /servers/:serverId/onboarding` emits `server:onboarding-updated` `{ serverId }` to the server room; clients refetch the server detail and onboarding. See [wave-3-2-follow-ups.md](./wave-3-2-follow-ups.md).

## Risks & Rollback

- **Risk**: enabling screening on a live server immediately blocks every member who has not accepted — including members already mid-conversation — the moment the toggle flips, per the "block, not exempt" decision above. This must be surfaced clearly in the settings UI copy before an owner flips it.
- **Risk**: `voice:join`'s new gate is the first non-authorization block in that path; if `requireOnboardingAccepted` throws outside the expected `ForbiddenException` shape, the socket error handling must not silently swallow it (per `RULE.md`'s "never swallow errors").
- **Rollback**: revert code; the migration is additive (new nullable/defaulted `Server` columns, new table) — dropping it is safe since no other table references `MemberOnboardingAcceptance`.

## Test Plan

- **Automated**: none — `RULE.md` forbids `*.test.ts`/`*.spec.ts` files. Verify with `npm run typecheck`, `npm run lint`, `npm run build`.
- **Manual**:
  1. Owner enables screening with rules text and one self-assign question → new member joins via invite → sees the rules gate, cannot send a message (`403`), cannot react (`403`), cannot join voice (`voice:join` rejected) → accepts rules and picks a role → gate disappears, message send succeeds, role appears on their member.
  2. Re-submitting accept a second time returns `200` without granting a duplicate `MemberRole` row.
  3. Failure case: submitting a `roleId` not listed in any configured question returns `400`.
  4. With screening on and a member who has not accepted: edit an old message, forward a message into the server, vote in a channel poll, create a poll, reply in a thread → each refused with the translated "You must accept the server rules first". A message they scheduled earlier fails at its send time with the reason "You had not accepted the server rules at the scheduled time."
  5. A member holding a role with `MANAGE_SERVER` is not gated; the owner is not gated.
  6. Failure case: a `MANAGE_SERVER` holder without `MANAGE_ROLES` adds a new role to a question → `403 Missing permission: MANAGE_ROLES`; offering a role with `KICK_MEMBERS` → `400`.
  7. Delete a role that a question offers → `GET /servers/:serverId/onboarding` no longer lists it, and accepting with its id returns `400`.

## Deployment Notes

- Run migration `20260917008000_add_server_onboarding` before deploying the API.
- New `onboarding.*` i18n keys land in both `en` and `vi` catalogs in the same change (`docs/features/i18n-localization.md`).
- No breaking change to existing endpoints; `needsOnboarding` is an additive field on `GET /servers/:serverId`.
