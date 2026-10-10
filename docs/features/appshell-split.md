# Feature Spec: AppShell Split

A no-behavior-change split of `apps/web/src/AppShell.tsx` (901 lines, `wc -l apps/web/src/AppShell.tsx`) ahead of the file-size cap (`npm run check:file-size`, `docs/markdown-structure.md`/`AGENT.md` reference the same 1000-line rule for source files) and ahead of upcoming work (SFU call UI, stage, slash command interactions, admin page) that would otherwise all land in this one file.

Acceptance criteria:

- `apps/web/src/AppShell.tsx` is meaningfully smaller after the split (target: under 600 lines) with no other file crossing the cap.
- `npm run check:file-size`, `npm run typecheck`, `npm run lint`, `npm run build` all pass.
- Every manual scenario in Test Plan behaves identically before and after the split.
- No prop, hook call order, or effect dependency changes meaning — this is a pure code-motion change, not a refactor of behavior.

## Scope

**In scope**

- Moving self-contained state/effects/handlers already living directly in `AppShell.tsx` into new hooks or small builder functions.
- Moving the large prop-object literals passed to `<AuthenticatedWorkspace>` into builder functions, so `AppShell.tsx` itself is mostly hook wiring plus a handful of function calls.

**Out of scope**

- Any change to what a hook does internally (`useWorkspaceNavigation`, `useChatOrchestrator`, etc. — already extracted, untouched here).
- Adding the SFU call UI, stage, slash command, or admin-page work this split makes room for — those are separate, future docs.
- Introducing a router (the codebase has none today, per `server-templates-and-discovery.md`'s "the app has no router and `AppShell.tsx` is close to the file-size limit" note, `docs/features/server-templates-and-discovery.md:172`) — not proposed here.

## Current Behavior

`AppShell.tsx` (`apps/web/src/AppShell.tsx:53-901`) is one function component with three regions:

1. **Hook wiring** (lines 53-360): ~25 `useState`/`useRef` declarations and calls into ~20 already-extracted hooks (`useAuthSession`, `useWorkspaceNavigation`, `useChatOrchestrator`, `useHomeWorkspace`, `useNotifications`, `useTheme`, `useChannelEncryption`, `useChannelReadState`, `useMessageHistory`, `useSettingsActions`, `useRealtimeSocket`, `useTypingIndicator`, `useComposerRestrictions`, `useServerEmojis`, `useServerEvents`, `useServerModeration`, `useThreadPanel`, `useChannelCall`, `useSoundboardPlayback`, `useDirectCall`, `useComposerAttachments`), each already isolating its own state and effects elsewhere.
2. **Component-local effects and handlers** (lines 360-612): three `useEffect`s (active-channel ref sync, account-data load, auth-clear cleanup, lines 360-378), the channel-open flow (`firstUnreadMessageId` state plus the `openChannel` `useEffectEvent` and its `useEffect`, lines 380-461, ~82 lines), a favicon-badge effect (463-469), two `useMemo`s (memberIdentities/selectedMember, 472-480), and the message-send flow (`sendChatMessage`, `sendMessage`, `messageActions` via `useChannelMessageActions`, 482-607, ~125 lines).
3. **JSX prop assembly** (lines 614-901): the early return for the unauthenticated state, one large `workspaceContextValue` object (622-640), and the `<AuthenticatedWorkspace>` call with seven large inline prop objects (`workspace`, `chat`, `members`, `home`, `savedMessages`, `incomingCall`, `settings`, roughly 660-897).

No section here is dead code or unreachable; every piece is used by the JSX at the bottom.

## Changes

### What moves, where, and approximate size

| Extract                              | New file                                                                                     | Approx. lines moved | Contents                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------ | -------------------------------------------------------------------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Channel-open flow                    | `apps/web/src/hooks/useChannelOpening.ts`                                                    | ~90                 | `firstUnreadMessageId` state, the `activeChannelIdRef` sync effect (360-362), the `openChannel` `useEffectEvent` and its triggering `useEffect` (380-461). Takes `channel`, `auth`, `socket`, `decryptMessagesForDisplay`, `setMessages`, `setMessageCursor`, `setTypingUsers`, `setChannelBadges`, `setReplyingToMessage`, `threadPanel.close`, `setSearchResults`, `setWorkspaceError`, `markChannelRead`, `loadPinnedMessages`, `setActiveCalls`, `t` as inputs; returns `firstUnreadMessageId`. |
| Message send flow                    | `apps/web/src/hooks/useMessageComposerActions.ts`                                            | ~115                | `sendChatMessage` and `sendMessage` (482-587), plus the `messageActions` (`useChannelMessageActions` call, 589-607) it already depends on. Takes the same auth/channel/socket/encryption/draft/attachment pieces `AppShell` already assembled; returns `{ sendChatMessage, sendMessage, messageActions }`.                                                                                                                                                                                          |
| Favicon badge effect                 | folded into `useChannelOpening.ts` or left in `AppShell.tsx` (4 lines, not worth a new file) | 0 (kept)            | `updateFaviconBadge` effect (463-469) — small enough that moving it adds an import for no real size win; left in place.                                                                                                                                                                                                                                                                                                                                                                             |
| Workspace/members/home prop assembly | `apps/web/src/components/app/buildWorkspaceShellProps.ts`                                    | ~130                | The `workspace`, `members`, `home`, `savedMessages`, `incomingCall` object literals (660-681, 785-836) as a single pure function `buildWorkspaceShellProps(...)` returning the same shape, so `AppShell.tsx` calls one function instead of inlining five object literals.                                                                                                                                                                                                                           |
| Chat/settings prop assembly          | `apps/web/src/components/app/buildChatAndSettingsProps.ts`                                   | ~140                | The `chat` and `settings` object literals (696-784, 837-897), same pattern: one function returning both shapes from the already-computed hook outputs.                                                                                                                                                                                                                                                                                                                                              |

**What stays in `AppShell.tsx`**: all `useState`/`useRef` declarations (state must live where React tracks it — moving `useState` itself into a plain function would not preserve identity across renders the way a custom hook does, so state stays either in `AppShell` or moves into the new hooks above, never into the plain `build*Props.ts` builder functions), every existing hook call (`useAuthSession`, `useWorkspaceNavigation`, etc., unchanged), the two `useMemo`s (472-480, small and already reading only local state), `logout`, the unauthenticated early return, `workspaceContextValue`, and the final `<WorkspaceProvider>`/`<KeyboardShortcuts>`/`<AuthenticatedWorkspace>` JSX itself (now calling the two new builder functions instead of inlining their contents).

Net effect: `AppShell.tsx` goes from ~901 lines to roughly hook wiring (300) + the two small effects/memos kept (30) + `logout`/early-return/JSX shell calling the builders (120) ≈ 450-500 lines; the two new hooks and two new builder files are each well under the cap.

### Edge cases

| Case                                                                                                                                   | Expected behavior                                                                                                                                                                                                                                                                                                             |
| -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A prop the builder functions read is derived from state declared in `AppShell.tsx`                                                     | Passed into the builder as a plain argument — the builder functions are pure, no hooks inside them, so argument order/values must exactly match what was inlined today.                                                                                                                                                       |
| `useChannelOpening`'s effect dependency array                                                                                          | Copied verbatim (`[channel?.id, auth?.accessToken, socket]`, line 461) — dependency arrays are the single most behavior-sensitive part of this move and must not be "cleaned up" as part of the split.                                                                                                                        |
| `useMessageComposerActions` needing `channelDraft`/`selectedFiles` setters that themselves come from other hooks already in `AppShell` | Passed through as arguments, same as `sendChatMessage` already receives `selectedFiles`/`setSelectedFiles` today via closure — no new prop-drilling pattern introduced beyond what a custom hook's parameter object already looks like elsewhere in this codebase (every other extracted hook here takes one options object). |

## Technical Approach

**Files touched**

| File                                                       | Change                                                                               |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `apps/web/src/AppShell.tsx`                                | Remove the moved code; call the two new hooks and two new builder functions instead. |
| `apps/web/src/hooks/useChannelOpening.ts`                  | New.                                                                                 |
| `apps/web/src/hooks/useMessageComposerActions.ts`          | New.                                                                                 |
| `apps/web/src/components/app/buildWorkspaceShellProps.ts`  | New.                                                                                 |
| `apps/web/src/components/app/buildChatAndSettingsProps.ts` | New.                                                                                 |

No API contract, DB, or migration changes — this is a frontend-only, behavior-preserving code move.

**Libraries** — none new.

## Trade-offs

| Option                                                                                    | Pros                                                                                                                                                                                                                                                                                          | Cons                                                                                                                                                                                                                                                                                                                                     | Verdict                                                                                                                                                                                                                                                                                                               |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Extract two hooks (stateful) + two pure builder functions (JSX prop assembly), chosen** | Matches the file's own existing pattern exactly (`AppShell.tsx` already delegates every other piece of state to a same-shaped custom hook); pure builder functions for prop assembly need no new state-management concept and are trivially easy to verify (same inputs → same output object) | Four new small files instead of one; a future reader needs to open `buildWorkspaceShellProps.ts` to see the shape of `workspace`/`members`/`home` props                                                                                                                                                                                  | **Chosen** — smallest possible behavior risk, and consistent with how member-timeout-and-slowmode's `useChannelMessageActions.ts` was already extracted "to keep channel message actions out of `AppShell.tsx`" (`docs/features/member-timeout-and-slowmode.md`, referenced by `docs/features/message-reports.md:27`) |
| Split `AppShell.tsx` into multiple top-level components instead of hooks/builders         | Could reduce prop-drilling further                                                                                                                                                                                                                                                            | `AppShell` is fundamentally one component's worth of state feeding one big prop tree into `<AuthenticatedWorkspace>`; splitting into sibling components would need to either duplicate the shared state or introduce new context providers, which is a real behavior-shaped decision (re-render boundaries change), not a pure code move | Ruled out for this doc — it stops being "no-behavior-change" the moment a new context boundary or component split changes re-render timing                                                                                                                                                                            |
| Leave `AppShell.tsx` as is until it actually exceeds the cap                              | Zero work now                                                                                                                                                                                                                                                                                 | The task brief already lists three upcoming features that will each add code here; splitting after the cap is hit means doing this same move under time pressure and with a bigger, harder-to-review diff                                                                                                                                | Ruled out — the whole point of this doc is to do the split while it is still small and low-risk                                                                                                                                                                                                                       |

## Risks & Rollback

- **What can break**: a missed argument or wrong closure captured when moving `sendChatMessage`/`openChannel` into hooks — mitigated by copying dependency arrays and closures verbatim and by the manual scenarios below covering every moved code path.
- **Not covered**: this split does not reduce `AuthenticatedWorkspace.tsx`'s own prop-count or size — out of scope, and not currently near the cap (not measured here; flag as a follow-up if it grows).
- **Rollback**: revert the commit; no data, migration, or API surface is involved.

## Test Plan

**Automated**: none — the repo forbids `*.test.ts`/`*.spec.ts` files (`RULE.md`); `apps/web` has no component test runner either. Verified with `npm run typecheck`, `npm run lint`, `npm run build`, `npm run check:file-size`, and `npm run ui:smoke` (existing smoke script, `scripts/ui-smoke.mjs`).

**Manual** (run before and after the split, compare):

1. Open a text channel with unread messages → the unread divider appears at the same message as before, and the channel is marked read (`markChannelRead`) the same way.
2. Switch channels quickly (click channel A, then B, then A again) → messages load once per channel with no stale state bleeding across the `useChannelOpening` effect re-runs.
3. Send a text message and a message with an attachment while the socket is connected, then again with the socket disconnected (e.g. throttle/offline in devtools) → both paths in `sendChatMessage` still work identically (socket ack path and HTTP fallback path).
4. Send a sticker via `sendSticker` → composer clears the reply state the same way.
5. Open server settings, member roles, invites, and the reports queue sections → nothing in the `settings.data`/`settings.actions` prop shapes changed, so every settings tab renders and its actions (ban, timeout, role toggle) still work.
6. **Failure case**: trigger a workspace error (e.g. an API call that fails) → `workspaceError` still surfaces through `alerts.error` exactly as before, since `workspaceContextValue` and the `chat.alerts` prop are unchanged in shape.

## Deviations

- **`sendChatMessage`/`sendVoiceMessage` circular dependency**: `useComposerAttachments`'s
  `sendVoiceMessage` callback needs `sendChatMessage`, which `useMessageComposerActions` cannot
  produce until it receives `selectedFiles`/`setSelectedFiles` from `useComposerAttachments`. The
  original code broke this with function-declaration hoisting (`sendChatMessage` was a hoisted
  `function`, so the closure in `useComposerAttachments`'s options object could reference it even
  though it was declared textually later). A `const` from a hook has no such hoisting. `AppShell.tsx`
  now holds a `sendChatMessageRef` (`useRef`, initialized to a no-op resolving `undefined`),
  `useComposerAttachments` calls through `sendChatMessageRef.current(...)`, and an effect with no
  dependency array (`useEffect(() => { sendChatMessageRef.current = sendChatMessage; })`) keeps the
  ref pointing at the latest function after every render — the same behavior as the old hoisted
  function, since that function was also recreated every render.
- **`useChannelOpening`'s ref-sync effect dependency array**: the doc said dependency arrays are
  copied verbatim. `activeChannelIdRef` is now a parameter of the hook rather than a `useRef` declared
  inside it, so `react-hooks/exhaustive-deps` requires it in the array (`[channel?.id,
activeChannelIdRef]` instead of `[channel?.id]`). The ref's identity never changes, so this is a
  lint-only difference with no behavior change.
- **Settings/moderation/emoji grouping to reach the line-count target**: to get `AppShell.tsx` closer
  to the under-600-line target, `useSettingsActions()`'s return value is kept as one `settingsActions`
  object (instead of destructuring its ~25 fields into local variables) and `buildChatAndSettingsProps`/
  `buildWorkspaceShellProps` take `settingsActions`, `moderation` and `serverEmojis` as whole objects
  rather than one parameter per field. This is a pure access-pattern change (`settingsActions.foo`
  instead of `foo`); no field was renamed, added or removed.

## Deployment Notes

- No new env vars, no migration, no cache/queue to clear.
- Frontend-only change; no coordinated backend deploy needed.
- No breaking API change.
