# Feature Spec: User Notes

Lets a user write a private note about another user, visible only to its author, edited inline from that user's profile card.

- **Status**: draft — awaiting review
- **Date**: 2026-09-18
- **Related**: `docs/features/user-profile.md`, `docs/features/ui-identity-redesign.md`, `docs/features/account-deletion-and-export.md`, `docs/features/user-blocking.md`

## Goal

Today the profile card (`apps/web/src/components/profile/ProfileCard.tsx`) shows only public fields — nothing lets a user privately remember "who this person is" (e.g. "met at the KStorm event, works on the design team"). Discord has this as "Notes"; this doc adds the same thing, scoped as narrowly as possible: one private text field per (author, target) pair, never shared with anyone, including the target.

**Acceptance criteria**

- [ ] A user viewing someone else's profile card sees an editable note textarea; empty when none was ever written.
- [ ] The note is saved on blur; an empty/whitespace-only note deletes the stored row.
- [ ] `GET /users/:id/note` and `PUT /users/:id/note` only ever return or accept the **caller's own** note about `:id` — no endpoint exposes what anyone else wrote about `:id`, including `:id` themself.
- [ ] A note can only be written about a user the caller can currently view a profile for (`canViewProfile`); anyone else gets `404`, matching `getProfile`'s existing behavior.
- [ ] Notes the caller authored are included in their account data export; deleted with their account. Notes about a deleted (anonymized) user are deleted too.

## Scope

**In scope**

- `UserNote` model, `GET`/`PUT /users/:id/note`, inline textarea in `ProfileCard.tsx`.
- Account export and account-anonymization cleanup for both directions (authored / about).

**Out of scope**

- Notes about oneself (no self-note UI or API path; the profile card already hides its action row for `isSelf`, see Current behavior).
- Rich text / mentions / attachments in a note — plain text only.
- Any server-scoped variant ("note visible to other mods") — Discord does not have this either; a note is always private to its author.
- Showing a note in contexts other than the profile card (e.g. member list row) — a future follow-up, not required for parity.

## Current behavior

- The profile card is a single reusable component opened from the member list, messages, and DMs (`apps/web/src/components/profile/ProfileCard.tsx:25-149`), backed by `useUserProfile` (`apps/web/src/hooks/useUserProfile.ts:20-40`), which calls `GET /users/:id/profile` (`apps/api/src/modules/users/users.controller.ts:28-34`).
- `UsersService.getProfile` (`apps/api/src/modules/users/users.service.ts:125-166`) returns `UserProfile` (`PROFILE_USER_SELECT` fields, `apps/api/src/modules/users/user-profile.ts:6-18`, plus the optional server-scoped nickname/roles), gated by `canViewProfile`.
- `canViewProfile` (`apps/api/src/modules/users/users.service.ts:169-197`): `true` for self; `false` if a `UserBlock` row exists in either direction (`:171-180`); otherwise `true` if the two share a server (`:182-186`) or a DM conversation (`:188-196`). `getProfile` throws `NotFoundException` when this is `false` (`:130-132`) — existence is never leaked to a blocked or unrelated user.
- The `UserProfile` shared type (`packages/shared/src/api-contract.ts:49-55`) is `PublicUser` (the `User` shape minus `email`/`emailVerifiedAt`/`platformRole`) plus `createdAt` and the optional server context — it carries nothing author-specific, because it is the same payload for any viewer who can see the profile.
- `User` model (`apps/api/prisma/models/users.prisma:31-108`): no existing per-viewer annotation field; `blocksCreated`/`blocksReceived` (`:97-98`) are the closest precedent for a directional per-user-pair row.
- `UserBlock` (`apps/api/prisma/models/users.prisma:131-140`): composite PK `(blockerId, blockedId)`, both sides `onDelete: Cascade`.
- Account deletion never hard-deletes the `User` row — it anonymizes it in place (`apps/api/src/modules/users/account-anonymization.ts:26-29` comment: "The `User` row is kept because required relations without a cascade … still point at it"), so `onDelete: Cascade` on a `User` FK does not fire during normal account deletion; the actual cleanup is the explicit `deletePrivateAccountRows` (`account-anonymization.ts:123-152`), which already deletes `UserBlock` rows in both directions for the deleted user (`:142`) and `SavedMessage` rows the user authored (`:143`).
- `collectAccountExport` (`apps/api/src/modules/users/account-export-collector.ts:30`) already draws the line the same way this feature needs: it documents (`:24-26`) that data belonging to someone else about the owner — "reports filed against the owner, and who reported them" — is never included in the owner's own export; `blockedUsers` (`:317-319`) only lists blocks the owner created, not blocks against them.
- Write endpoints that mutate a per-caller row use `@RateLimit(...)` (e.g. `apps/api/src/modules/saved-messages/saved-messages.controller.ts:20,32`, 30 requests/min), never on the paired `GET`.
- Latest migration folder: `apps/api/prisma/migrations/20260918007000_add_stage_channels`; a new migration follows that `YYYYMMDDHHmmss_description` naming.
- i18n catalogs are split per domain under `apps/web/src/i18n/locales/en/*.ts` and `locales/vi/*.ts` (e.g. `profile.ts`, holding the `profileCard.*` keys the card already uses, `apps/web/src/i18n/locales/en/profile.ts:1-29`).

## Changes

### Rules / Flow

1. `UserNote` stores one row per `(authorId, targetId)` pair: `content` (plain text, trimmed, 1–300 chars), `createdAt`, `updatedAt`. No row exists for "no note" — the client renders an empty textarea from a `404`-free `note: null` response, not from an empty-string row.
2. `GET /users/:id/note` returns the caller's own note about `:id`, or `null`. It never returns anyone else's note, including one `:id` may have written about the caller — a note is authorId-scoped to the caller by construction (looked up as `(authorId: callerId, targetId: id)`), so there is nothing to filter.
3. `PUT /users/:id/note` upserts `content` for `(authorId: callerId, targetId: id)`. `content` trimmed to empty deletes the row (idempotent: deleting a non-existent note is a no-op `200`, not a `404`) — this is the only path to remove a note; there is no separate `DELETE`.
4. Both endpoints require `canViewProfile(callerId, id)` (reusing `UsersService`'s existing private method); failing it returns `404`, the same status and message `getProfile` already uses, so a blocked or unrelated user's note cannot be probed for existence either.
5. A user cannot write a note about themselves: `id === callerId` is a `400`. (`canViewProfile` already returns `true` for self, so this is checked explicitly, not inferred from the visibility gate.)
6. The web textarea autosaves on blur (not on every keystroke): change is buffered in local component state, `PUT` fires once the field loses focus and only if the trimmed value actually changed since the last save. No optimistic list update is needed — the field is single-value per card instance.

### Edge cases

| Case | Expected behavior |
|---|---|
| Empty / whitespace-only content on `PUT` | Deletes the row if one exists; `200 { note: null }`. |
| `id === callerId` | `400` — cannot note yourself. |
| Target the caller cannot view (blocked either direction, no shared server/DM) | `404` on both `GET` and `PUT`, matching `getProfile`. |
| A note written before a block, then the two get blocked | Row is **not** deleted by blocking; `GET`/`PUT` return `404` while the block stands (hidden, not lost) because `canViewProfile` gates both — same as any other profile data during a block. If unblocked later, the note reappears unchanged. |
| Duplicate `PUT` with the same content | Idempotent — `updatedAt` bumps, `content` unchanged. |
| Content over 300 chars | `400` validation error. |
| Unauthorized (no `Authorization` header) | `401`, the existing `JwtAuthGuard` on the controller. |
| Target user is later anonymized (account deletion) | The note the caller wrote **about** that target is deleted along with every note **authored by** the deleted account, in the same anonymization transaction (Rules item 7 below) — a stale note about "Deleted User" would be confusing and the identity it referred to no longer exists. |

7. `deletePrivateAccountRows` (`account-anonymization.ts:123-152`) gains one more line, mirroring how it already deletes `UserBlock` in both directions (`:142`): `await tx.userNote.deleteMany({ where: { OR: [{ authorId: userId }, { targetId: userId }] } })`. This is a deliberate choice, not the only one — see Trade-offs.

## Technical approach

**Files touched**

| File | Change |
|---|---|
| `apps/api/prisma/models/users.prisma` | Add `UserNote` model + two relations on `User` (`notesWritten`, `notesReceived`). |
| `apps/api/prisma/migrations/<timestamp>_add_user_notes/migration.sql` | New hand-written migration. |
| `apps/api/src/modules/users/dto/upsert-user-note.dto.ts` (new) | `{ content: string }`, `@IsString() @MaxLength(300)`. |
| `apps/api/src/modules/users/users.service.ts` | `getNote`, `upsertNote` methods, reusing `canViewProfile`. |
| `apps/api/src/modules/users/users.controller.ts` | `GET`/`PUT /users/:userId/note`. |
| `apps/api/src/modules/users/account-anonymization.ts` | One `userNote.deleteMany` line in `deletePrivateAccountRows` (Rules item 7). |
| `apps/api/src/modules/users/account-export-collector.ts` | Include notes the owner authored (their own words), same pattern as `savedMessages`/`blockedUsers`; never notes about the owner. |
| `packages/shared/src/api-contract.ts` | `UserNote { targetId: string; content: string; updatedAt: Date }`. |
| `apps/web/src/api.ts` | `getUserNote`/`putUserNote` calls. |
| `apps/web/src/query/queryKeys.ts` | `userNote(userId)` key. |
| `apps/web/src/hooks/useUserNote.ts` (new) | React Query read + mutation, mirrors `useUserProfile.ts`'s shape. |
| `apps/web/src/components/profile/ProfileCard.tsx` | Textarea + autosave-on-blur, shown when `!isSelf`. |
| `apps/web/src/components/profile/ProfileCard.module.css` | Note field styling. |
| `apps/web/src/i18n/locales/en/profile.ts`, `locales/vi/profile.ts` | `profileCard.note.*` keys (label, placeholder, saved indicator). |

**API contract**

- `GET /users/:userId/note`
  - Response `200`: `{ note: UserNote | null }`
  - Errors: `404` caller cannot view `:userId`'s profile
- `PUT /users/:userId/note`
  - Request: `{ content: string }` (1–300 chars after trim; empty deletes)
  - Response `200`: `{ note: UserNote | null }` (`null` when the trimmed content was empty)
  - Errors: `400` `userId === callerId` · `400` content over 300 chars · `404` caller cannot view `:userId`'s profile
- Rate limit: `PUT` only, `@RateLimit({ keyPrefix: 'user-note-write', limit: 30, windowMs: 60_000 })`, matching `saved-messages.controller.ts:20`. `GET` is unlimited, matching every other paired read in the repo.

**DB / migration**

- New table `UserNote`: `id` (cuid PK), `authorId`, `targetId`, `content` (`TEXT`), `createdAt`, `updatedAt`. `@@unique([authorId, targetId])`, `@@index([targetId])` (for the anonymization cleanup's `targetId` half of the `OR`; `authorId` is already the unique index's leading column so it needs no separate index).
- Both `authorId` and `targetId` are `User` FKs with `onDelete: Cascade` — for schema/seed consistency with every other per-user row in the repo (e.g. `SavedMessage.owner`, `apps/api/prisma/models/messages.prisma`-adjacent patterns), even though the anonymization flow never actually deletes a `User` row and relies on the explicit `deletePrivateAccountRows` line above instead (same "belt and suspenders" as `UserBlock`, which is Cascade on both sides and still explicitly deleted in `deletePrivateAccountRows:142`).
- Migration file: `apps/api/prisma/migrations/<timestamp>_add_user_notes/migration.sql`, hand-written: `CREATE TABLE`, the unique/index, two `ADD CONSTRAINT ... FOREIGN KEY ... ON DELETE CASCADE ON UPDATE CASCADE`, following the exact shape of `20260918007000_add_stage_channels/migration.sql`. New table, no lock concern on existing tables.

**Libraries** — none new; reuses `class-validator`'s `@MaxLength` (already used across the repo's DTOs) and the existing `ContextMenu`-free inline-field pattern already in `ProfileCard.tsx`.

## Trade-offs

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| **A (chosen): dedicated `GET`/`PUT /users/:id/note`, separate from `getProfile`** | Keeps `UserProfile`'s existing contract untouched (used by other callers, e.g. export, that must never see a note); a note is fetched only when the card actually needs it. | One extra request per profile-card open (when the caller is not viewing their own profile). | Chosen — `UserProfile` is a shared, viewer-agnostic type; folding a viewer-private field into it would make every consumer of `getProfile` reason about "whose eyes is this response for." |
| B: embed `note` inside the `getProfile` response | One request instead of two. | `UserProfile` would need to become "sometimes has private data" depending on whether `viewerId === requester`, which nothing in the type system enforces today, and the client would fetch note content even for profiles it never edits (e.g. read-only contexts if any appear later). | Rejected — correctness risk not worth saving one request. |
| **C (chosen): empty content deletes, no separate `DELETE`** | One less endpoint; "clear the note" and "never wrote one" collapse to the same state, matching the DB (no empty-string rows). | A client cannot distinguish "explicitly cleared" from "never written" after the fact — acceptable, since nothing needs that distinction. | Chosen — smallest surface. |
| D: explicit `DELETE /users/:id/note` alongside `PUT` | Mirrors REST convention exactly. | Two ways to reach the same state (`PUT` with empty content, or `DELETE`) for no behavioral gain. | Rejected — redundant. |
| **E (chosen): delete notes about a deleted user during anonymization (Rules item 7)** | Consistent with how the repo already treats a block row (`UserBlock` deleted in both directions on account deletion) — the identity a note refers to is gone, so keeping a note about "Deleted User" is dead weight, not a memory worth preserving. | The author loses a note they wrote, with no export of it first (their own account export at that time would have included it if taken earlier; there's no export-on-cascade-delete). | Chosen — matches the existing `UserBlock` precedent exactly; the alternative (F) was ruled out for the reason below. |
| F: keep notes about a deleted user (re-target them at the anonymized placeholder identity) | Author keeps their note text. | The note would reference "Deleted User" going forward with no way to recall who it was about — actively worse than deleting it, and no other per-user-pair table in the repo does this. | Rejected. |

What the chosen option costs: one extra network round trip when opening a profile card for someone other than the caller (Option A); a small, additive migration; two extra lines in the well-tested `deletePrivateAccountRows` sequence.

## Risks & rollback

- **What can break**: nothing existing — this is a wholly new table and two new endpoints; no existing contract changes.
- **Not covered**: notes about oneself, notes visible anywhere besides the profile card, any server-shared or moderator-shared note.
- **Rollback**: revert the code; the migration is additive (`down()` drops `UserNote` and its FKs) and safe to roll back independently — no other table references it.

## Test plan

Not covered by automated tests (repo has no test suite by policy).

**Manual**

1. User A opens User B's profile card (shared server), types a note, blurs the field → `PUT /users/B/note` fires, reload the card → note persists.
2. User A clears the note (blur with empty content) → `GET /users/B/note` afterward returns `{ note: null }`.
3. User A attempts `GET /users/C/note` for a `C` they share no server/DM with → `404`.
4. User A blocks User B (who has an existing note) → `GET /users/B/note` returns `404` while blocked; unblock → note reappears unchanged.
5. User A attempts `PUT /users/A/note` (self) → `400`.
6. **Failure case**: User B (the target) calls `GET /users/A/note` trying to read what A wrote about B → returns A's note about B, i.e. **not** what A wrote about B at all — it returns User B's own note about User A (or `null`), confirming the endpoint is always scoped to the caller as author, never exposing another author's note.
7. Request User A's account data export → the exported note is the one A wrote about B, not any note B wrote about A.
8. Delete User B's account (anonymization sweep) → User A's note about B is gone; User A's notes about other, non-deleted users are untouched.

## Deployment notes

- New env vars: none.
- Migration `<timestamp>_add_user_notes` must run before deploying the API (new table only, no lock concern).
- Shared package (`packages/shared`) must be rebuilt before the API/web build, per the repo's monorepo build order.
- No cache/queue to clear.
- No breaking API change — both endpoints are new.
- Add the new i18n strings to `en/profile.ts` and `vi/profile.ts` and run `npm run i18n:check` (`package.json:23`) before merging the web change.
