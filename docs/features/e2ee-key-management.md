# E2EE Key Management

- **Status**: draft — awaiting review
- **Date**: 2026-09-25
- **Related**: [`age-restricted-channels.md`](age-restricted-channels.md) (precedent for a gate flag +
  server-enforced check + client gate screen), [`dm-push-notifications.md`](dm-push-notifications.md),
  [`automod.md`](automod.md)

## Goal

Today's "E2EE" is a single shared passphrase a member types into a form; anyone who learns the
passphrase (guessed, shared over an insecure channel, shoulder-surfed) can read every message, there
is no way to know who currently holds the key, and Direct Messages carry **no encryption at all** —
every DM is stored and pushed as plaintext. This task replaces the passphrase with real per-device
key management: content keys are generated randomly (not derived from something typed), never leave
a device unencrypted, and are distributed to member devices individually — so removing a member (or a
device) can actually stop future messages from being readable by them.

**Acceptance criteria**:

- [ ] A new device belonging to an existing member of an encrypted channel/conversation can decrypt
      new messages once its owner completes device verification (Changes → Rules item 6) — no shared
      secret is typed anywhere.
- [ ] A member kicked or banned from a server, or removed from a group DM, cannot decrypt messages
      sent to that channel/conversation **after** their removal, even if they retain a wrapped key
      from before (Changes → Rules item 8, key rotation).
- [ ] A brand-new member added to an already-encrypted channel/conversation can decrypt messages sent
      **after** they join, once at least one existing online member's client has wrapped the current
      content key for their device (Changes → Rules item 7).
- [ ] Every DM conversation (1:1 and group) is encrypted by default with no opt-in step; every server
      text channel is encrypted only when a `ManageChannels` holder turns it on, and the UI states the
      five losses below before they confirm (Changes → Rules item 2, Edge cases).
- [ ] A private key never appears in a network request body, response, or log — grep of the API
      surface (Technical approach → API contract) confirms only public keys and wrapped (ciphertext)
      keys cross the wire.
- [ ] Legacy `e2ee:v1:` messages (passphrase-derived) remain in the database unmodified and are never
      silently dropped or reported as corrupted; the client offers a "enter the old passphrase" path
      to open them (Changes → Rules item 10).

## Scope

**In scope**

- Per-device WebCrypto keypair generation, storage, and public-key registration.
- A random per-channel/per-conversation symmetric content key, wrapped individually for every
  member's every registered device.
- Key rotation on member removal (kick/ban/leave for a channel's server, or removal from a group DM).
- Multi-device support: a user with several active browsers/machines, each with its own keypair.
- A safety-number / fingerprint verification screen between two users.
- Migration handling for existing `e2ee:v1:` passphrase-encrypted messages.
- New Prisma models for device public keys and wrapped content keys, plus the migration.
- DM encryption on by default (1:1 and group); channel encryption stays opt-in per channel.
- Making the five losses (search, AutoMod, bot/webhook content, mention pings, push body) visible in
  the UI wherever the current code silently already has one of them, or newly introduces one.

**Out of scope**

- Real hardware-backed key storage (WebAuthn/passkey-gated keys) — IndexedDB `CryptoKey` storage only.
- Re-encrypting or backfilling any existing plaintext DM history — encryption starts from the moment a
  conversation is marked encrypted; prior DM rows already exist as plaintext `DirectMessage.content`
  and stay that way (deleting or rewriting history is not attempted).
- Encrypted voice/video (`dm-calls.md`, `voice-sfu.md` scope) — text content only.
- A general "recompute who still has access, evict the rest" live-eviction mechanism beyond what key
  rotation itself provides — `channel-live-settings-sync.md` and open question #55 in
  `docs/features/open-questions.md` already track the general gap for `ViewChannel`; this doc does not
  extend that mechanism.
- Server-side full-text search over encrypted content (impossible by design — see Threat model).
- A dedicated "manage my devices" settings screen beyond what device verification needs; listing and
  revoking devices is in scope only as much as key rotation requires it (Changes → Rules item 9).
- Account-level key recovery / escrow after losing every device — **decided against, not deferred**
  (Trade-offs, Decided note; closes open question #56 in `docs/features/open-questions.md`).

## Current behavior

- `deriveChannelKey(channelId, passphrase)` (`apps/web/src/e2ee.ts:9-29`) runs PBKDF2 (SHA-256,
  210,000 iterations) over a passphrase the user types, with a salt of `discord-clone:${channelId}`
  (not random, not secret — it is public and reused for the same channel forever) to derive a single
  AES-256-GCM key. There is no per-device or per-user key anywhere in the client.
- `encryptChannelMessage`/`decryptChannelMessage` (`apps/web/src/e2ee.ts:31-52`) produce/parse the
  wire format `e2ee:v1:<base64 iv>:<base64 ciphertext>`; `isEncryptedMessage` (`apps/web/src/e2ee.ts:5-7`)
  matches on the `e2ee:` prefix.
- `useChannelEncryption` (`apps/web/src/hooks/useChannelEncryption.ts:14-131`) holds the derived key
  **only in a React ref/state, in memory** (`channelKeys`, `channelKeysRef`, lines 22-23) — nothing is
  persisted; reloading the page or opening another device loses the key, and the member must re-type
  the passphrase (`configureChannelEncryption`, lines 34-48). There is no server-side flag that a
  channel is "encrypted" — it is a purely client-side convention recognized by the `e2ee:v1:` prefix.
- The UI entry point is `UtilityPanel`'s encryption form (`apps/web/src/components/chat/UtilityPanel.tsx:52-54,73-75,110`),
  wired through `AppShell.tsx:188-192,560-561` and `buildChatAndSettingsProps.ts:64-65,156-157,248-249`
  into `configureChannelEncryption`/`clearChannelEncryption`. i18n strings
  (`apps/web/src/i18n/locales/en/auth.ts:92-101`, `vi/auth.ts:89-98`) describe it as "Enable E2EE" with
  a "Channel passphrase" field — the UI never states what is lost by turning it on.
- **Direct Messages have no encryption at all.** `apps/web/src/hooks/useDirectMessages.ts` (427 lines,
  grepped for `e2ee`/`encrypt`: zero matches) sends and receives `DirectMessage.content`
  (`apps/api/prisma/models/direct-messages.prisma:29`) as plaintext; `PushService.sendDirectMessagePush`
  (`apps/api/src/modules/push/push.service.ts:125-154`) puts the raw content directly into the push
  body (`push.directMessage.body`, line 142) with no gate of any kind.
- The API never learns a channel is "encrypted": `Channel` (`apps/api/prisma/models/channels.prisma:22-53`,
  read in full) has no such column. `AutoModScreeningService.screen` (`apps/api/src/modules/automod/automod-screening.service.ts:85-119`)
  detects ciphertext itself, by pattern-matching the `e2ee:v1:...` shape
  (`ENCRYPTED_CONTENT_PATTERN`, `apps/api/src/modules/automod/automod-rules.ts:24,29-31`), and refuses
  to store the message outright (`BadRequestException`, `automod-screening.service.ts:117-119`,
  error code `ENCRYPTED_MESSAGES_ARE_BLOCKED_WHILE_AUTOMOD_IS_ENABLED`, `error-codes.ts:65`,
  `en.ts:64`) whenever any enabled, non-exempt AutoMod rule applies to that author in that channel.
  This existing block is unrelated to key management and is unchanged by this doc.
- `MessagesService.notifyMentionedUsers` (`apps/api/src/modules/messages/messages.service.ts:727-757`)
  calls `parseMentions(input.content)` on the raw stored `content` before ever knowing whether a
  channel is encrypted — for a passphrase-encrypted channel today, `content` is already ciphertext, so
  `parseMentions` scans base64 noise and mention pings inside encrypted channels already never fire
  in practice (inferred from the code path, not manually tested). `PushService.sendMentionPush`
  (`push.service.ts:81-119`) then puts `input.content` (again, the ciphertext for an encrypted channel
  today) straight into the push body unless `isAgeRestricted` is true (lines 101-106) — there is no
  equivalent branch for "this channel is encrypted" the way there now is for age-restriction.
- Precedent this doc follows for "gate flag + single server choke point + client gate screen":
  `age-restricted-channels.md`'s `Channel.isAgeRestricted` / `User.ageConfirmedAt` /
  `PermissionsService.requireAgeConfirmed` design (`docs/features/age-restricted-channels.md`).
- Precedent for a dual-nullable FK across two message tables: `Poll` (`apps/api/prisma/models/direct-messages.prisma`-adjacent
  `messages.prisma`, `messageId String? @unique` / `directMessageId String? @unique`, both relations
  `onDelete: Cascade`) — the schema in this doc for wrapped keys follows the same shape for
  `channelId`/`conversationId`.
- `DirectConversation` / `DirectConversationMember` (`apps/api/prisma/models/direct-messages.prisma:1-23`)
  is the membership table a group DM's key distribution fans out over; `ServerMember`
  (`apps/api/prisma/models/servers.prisma:118-136`) is the equivalent for a channel, including
  `kind: MemberKind` for excluding `BOT` members the same way `age-restricted-channels.md` does
  (`onboarding-gate.ts:25`, cited there).

## Changes

### Threat model

**Protected**: the plaintext content of a message sent in an encrypted channel/conversation, against
a passive reader of the database, the Prisma logs, or a network capture between client and server —
the server only ever stores and relays ciphertext plus public/wrapped keys for encrypted
channels/conversations.

**Not protected — explicit, not hidden**:

- **Metadata**: the server always knows who sent a message, to which channel/conversation, when, and
  its ciphertext length (a rough size signal). Encrypting content does not hide the social graph or
  timing.
- **Endpoint compromise**: if a device is compromised (malware, an unlocked unattended session), its
  private key and every message it can currently decrypt are exposed. Key management protects data
  in transit and at rest on the server, not a compromised client.
- **No channel/conversation binding in the ciphertext (AAD)**: `v2` messages use AES-GCM with no
  associated data binding the ciphertext to the channel/conversation, sender, or message id it was
  actually sent in (same limit as today's `v1` format, `e2ee.ts:33-38`) — a member who holds a content
  key can take a ciphertext blob verbatim and repost it anywhere else the same `keyId`'s key is valid
  (e.g. a different message, a different time) and it will still decrypt correctly, because nothing
  ties the ciphertext to its original context. **Adopted for `v2`, since the wire format is already
  changing in this doc**: `encryptChannelMessage`/`decryptChannelMessage` pass
  `channelId`/`conversationId` as AES-GCM's `additionalData` parameter
  (`crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData }, ...)`), so a `v2` ciphertext only
  decrypts successfully within the channel/conversation it names — copying it elsewhere fails
  authentication instead of silently succeeding. This does not bind to a specific message id or
  sender (out of scope for this doc; flagged as a residual limitation, not solved here) and it does
  not apply to legacy `v1` ciphertext, which keeps its existing behavior unchanged.
- **A device that already holds a wrapped key before rotation**: rotation (Rules item 8) stops
  **future** messages from being wrapped for a removed member's devices; it cannot revoke a device's
  local cache of already-decrypted plaintext or an already-cached copy of the old content key. "They
  can no longer read new messages" is the guarantee; "they have forgotten everything they already
  saw" is not.
- **The five losses below**, all of which are consequences of the server never seeing plaintext for
  encrypted content — they are not bugs to fix, they are the cost of the feature, and each is exposed
  in the UI, not hidden behind the toggle:
  1. **Server-side search** — `messages.search.ts` filters on stored `content`; ciphertext cannot be
     searched meaningfully.
  2. **AutoMod** — already refuses encrypted content outright when a rule applies
     (`automod-screening.service.ts:117-119`, Current behavior); unchanged by this doc.
  3. **Bot/webhook content reading** — a bot or webhook has no channel key unless explicitly given one
     as a "device" (this doc does not extend key distribution to bots — out of scope; a bot in an
     encrypted channel receives ciphertext it cannot decrypt).
  4. **Mention pings** — `parseMentions` already cannot parse ciphertext (Current behavior); this
     stays true and this doc adds no server-side mention-detection alternative for encrypted content.
  5. **Push notification body content** — must show a generic body for any encrypted
     channel/conversation, the same pattern `age-restrictedBody` already established
     (Changes → Rules item 11).

### Rules / Flow

1. **Device identity.** On first use per browser/device, the web client generates a non-extractable
   ECDH P-256 keypair (`crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false,
   ['deriveKey'])`) — P-256 because it is the curve WebCrypto supports broadly for both `deriveKey`
   and `wrapKey`/`unwrapKey`, and pairs with AES-GCM the way the existing `e2ee.ts` content-encryption
   primitive already does, so the content-encryption half of the code does not change. The private
   `CryptoKey` is stored **non-extractable** in IndexedDB (a `CryptoKey` object survives structured
   clone into IndexedDB without ever exposing raw key bytes to JS); a stable client-generated
   `deviceId` (`crypto.randomUUID()`, persisted alongside it) identifies the device to the server. The
   public key is exported (`crypto.subtle.exportKey('spki', ...)`, base64) and registered with the
   server (`DeviceKey`, Technical approach). **The private key never leaves IndexedDB and never
   crosses the network** — this is the one property this whole design exists to guarantee, so every
   subsequent step is judged against it.
2. Whether a channel/conversation is encrypted is now a **server-known flag**, not a client
   convention: `Channel.isEncrypted` (opt-in, `ManageChannels` only, same authorization as every other
   channel setting — `channels.service.ts:19-42,70-102`) and `DirectConversation.isEncrypted` (**always
   true from creation**, no toggle — every new DM and group DM is encrypted by default, matching the
   product decision). Existing DM conversations created before this ships stay `isEncrypted = false`
   (their history is plaintext and cannot be retroactively encrypted — Scope → Out of scope); the
   client offers a one-time "enable encryption for this conversation" action that flips the flag and
   starts a fresh content key for future messages only.
3. **Content key and its id.** The first device to enable encryption on a channel/conversation
   generates a random AES-256-GCM key (`crypto.subtle.generateKey`, not derived from anything typed).
   Every generated content key carries a **`keyId`**: the first 16 bytes of `SHA-256(raw exported key
   bytes)`, base64url-encoded — a stable identifier for that exact key material, computed the same way
   by any client that holds the key, independent of the rotation `version` counter (Rules item 8,
   Technical approach). **Every encrypted message carries the `keyId` of the content key that produced
   it**, and decryption is a lookup by `keyId`, not a trial-and-error scan over every key a device
   holds — this is the fix for the gap identified in review: `version` alone cannot tell two
   independently-generated keys for the same version apart (Edge cases), so the wire format and the
   server's key-storage rows are both keyed on `keyId`, and `version` is kept only as an ordering hint
   for "what should a client try to generate next," never as the thing a message or a stored wrap
   actually references. Wire format: `encryptChannelMessage`/`decryptChannelMessage`
   (`apps/web/src/e2ee.ts:31-52`) are extended for this new version to
   `e2ee:v2:<keyId>:<base64 iv>:<base64 ciphertext>` (five colon-separated parts, versus `v1`'s four —
   `e2ee:v1:<base64 iv>:<base64 ciphertext>`, unchanged). `v2` encryption also binds the ciphertext to
   its channel/conversation via AES-GCM associated data (Threat model — the AAD fix). `isEncryptedMessage` keeps matching on the
   `e2ee:` prefix; the parser (today `content.split(':')`, `e2ee.ts:42`) must branch on the `version`
   field (`v1` → 4 parts, no `keyId`, look up the passphrase-derived key; `v2` → 5 parts, look up the
   unwrapped key by `keyId`) rather than assuming a fixed part count — both formats stay readable
   indefinitely (Rules item 10).
4. **Wrapping.** For every other current member's every registered, non-revoked `DeviceKey`, the
   enabling client derives a per-device shared secret via ECDH (its own private key + that device's
   public key), uses it to wrap the content key (`crypto.subtle.wrapKey('raw', contentKey,
   derivedWrappingKey, 'AES-KW')`), and uploads the wrapped bytes **together with that key's `keyId`**
   (item 3) and the current `version`. The server stores only ciphertext wrapped keys
   (`EncryptedChannelKey`/`EncryptedConversationKey`, Technical approach), each row addressable by
   `keyId` — it cannot unwrap them, it has no private key for anyone.
5. **Bootstrapping a device that was offline when a channel/conversation was first enabled**: on
   sign-in, a device calls `GET /encryption/pending-wraps` (its own `deviceId`); the server reports
   every `(channel|conversation, keyId)` pair where a wrapped key exists for *some* device of the
   caller's account but not for *this* `deviceId` (`version` is included for display/ordering only —
   the actual gap the endpoint reports is per `keyId`, item 3). The device's own request cannot self-wrap (it has
   no content key yet); instead it surfaces "waiting for another of your devices to catch you up" in
   the UI, and any **other**, already-caught-up device of the same user opportunistically wraps for
   its sibling device's public key the next time it is online (same wrap operation as item 4, target
   is a device of the same account rather than a different member). This reuses one mechanism for
   both "new member" and "my other device" instead of two.
6. **Device verification (anti-MITM).** A device's public key is trusted for wrapping only after its
   owner (or, for someone else's device, that person) confirms a safety number out of band. The
   safety number is a client-computed fingerprint: SHA-256 over the concatenation of both parties'
   sorted device public keys (SPKI bytes), rendered as grouped decimal digits (Signal's own approach,
   named as the pattern being followed, not copied from Signal's source) in a "Verify" screen reached
   from the user's profile. Wrapping proceeds even for an unverified device (so the feature is usable
   without verification) — verification is a visible badge ("Verified" vs. "Unverified device") next
   to each participant's device list, not a hard gate; hard-gating would leave a brand-new member
   unable to receive any key until manually verified by every other member, which the acceptance
   criteria (new member decrypts after joining) rules out.
7. **New member joins.** A channel: the joining event already updates `ServerMember`; the wrap
   coverage check (item 5's `pending-wraps` mechanism, generalized: it also reports devices belonging
   to users who have no wrapped key at all for the channel, not only "my other device") picks it up
   the next time any existing, encryption-capable member's client is online and opens that
   channel/conversation. A DM: creating a group DM conversation already lists its initial members
   (`DirectConversationMember`); the creating client wraps for all of them at creation time, the same
   as item 4.
8. **Rotation on removal.** A member kicked/banned from a server (channel case) or removed from a
   group DM (conversation case) triggers a new content-key **version**: the removal handler bumps
   `Channel.encryptionKeyVersion` / `DirectConversation.encryptionKeyVersion`, and the next online,
   still-current member's client generates a fresh random content key — with its own fresh `keyId`
   (item 3) — at the new version and wraps it for every remaining member's every device (item 4's
   flow). Every message sent after rotation carries this new `keyId` in its `e2ee:v2:` prefix (item 3),
   so which key opens which message is never ambiguous, even across a rotation. Messages sent before
   the removal, encrypted under the old key, are **not** re-encrypted — old ciphertext keeps
   referencing the old `keyId`; devices that already hold a wrap for that `keyId` can still open old
   messages by the same lookup (this is the same "cannot un-see" limit named in Threat model).
   `EncryptedChannelKey`/`EncryptedConversationKey` rows are never deleted on rotation — a device that
   reconnects still needs its old-`keyId` wrapped key to open history sent before it went offline. If
   two different clients each independently generate a "new version N" key for the same rotation
   event (the race in Edge cases), the two keys simply have two different `keyId`s and both end up
   wrapped and stored — no data is lost, because every message unambiguously names the `keyId` it was
   encrypted under; the only cost is that `version` briefly has two live keys until clients converge on
   reusing whichever `keyId` they see first via `pending-wraps` (Edge cases).
9. **Multi-device.** Nothing in this design assumes one device per user: every rule above already
   operates per `DeviceKey`, not per user. A user's account settings gain a **device list**
   (`label`, first-seen date, verified/unverified) with a "log out this device" action that sets
   `DeviceKey.revokedAt`; a revoked device's public key is skipped by every future wrap (items 4, 5,
   8) but its already-wrapped keys for past versions are not retracted (same limit as item 8).
10. **Migration from v1.** Existing `e2ee:v1:` messages (any channel that used the old passphrase flow
    before this ships) are left exactly as stored — `isEncryptedMessage`/`decryptChannelMessage`
    (`apps/web/src/e2ee.ts:5-7,41-52`) keep working unchanged as a **legacy path**: the client offers
    a "this channel has older messages encrypted with a passphrase — enter it to view them" fallback,
    separate from and coexisting with the new device-key path (new messages in that same channel use
    the new content key once the channel is migrated to `isEncrypted = true` via item 2's flip). The
    old passphrase is never known to the server and cannot be recovered by this feature; a member who
    has forgotten it permanently loses access to that channel's pre-migration history — stated in the
    migration UI copy, not hidden.
11. **Push suppression.** `PushService.sendMentionPush` gains an `isEncrypted: boolean` input
    (mirroring `isAgeRestricted`, `push.service.ts:18,101-106`) and, when true, uses a new
    `push.channelMessage.encryptedBody` i18n key (generic "New message" text, no author, no content)
    instead of `push.channelMessage.body`, evaluated **before** the age-restriction branch (both can
    be true; encrypted takes precedence since there is no plaintext to redact from in the first
    place). `PushService.sendDirectMessagePush` gains the same branch keyed on
    `DirectConversation.isEncrypted`, using `push.directMessage.encryptedBody` instead of
    `push.directMessage.body` (`push.service.ts:142-144`) — meaningful in practice for every DM, since
    DMs are encrypted by default (item 2).
12. **Bots exempt from wrapping**, matching the `age-restricted-channels.md` precedent for
    `ServerMember.kind === 'BOT'`: a bot is never a wrap target and never appears in "pending wraps" —
    it simply receives ciphertext over the API/webhook the same as any other member without a key for
    it, consistent with Threat model item 3 (bot/webhook content reading is already lost).

### Edge cases

| Case | Expected behavior |
|---|---|
| Empty / no content key yet for this device | UI shows "waiting for a key" (item 5) instead of a broken decrypt; message list still renders sender/timestamp, content shows a locked placeholder — same placeholder pattern `useChannelEncryption.ts:85-92` already uses for "no key". |
| Duplicate wrap upload (two online devices both wrap the same content key, identified by its `keyId`, for the same missing device at once) | `EncryptedChannelKey`/`EncryptedConversationKey` unique on `(channelId, conversationId, keyId, deviceKeyId)` (Technical approach) — the second insert is a no-op upsert, not an error; both wraps decrypt to the same content key because they wrap the same key material by construction (same `keyId`). |
| Two devices race to generate a "new key for this rotation" at the same time | No longer a data-loss case, now that messages name their `keyId` rather than only a `version` (Rules item 3, item 8). Two independently generated keys for the same `version` simply get two different `keyId`s; both get wrapped and stored, and every message stays openable by the exact `keyId` it names. The only residual cost is transient: clients may briefly disagree on which `keyId` is "the current one to encrypt new sends under" until they converge (e.g. the lowest `keyId` for that `version` wins, checked via `pending-wraps`, which reports both). This is a UX/coordination nuisance, not a decryption failure — restated in Risks & rollback as a remaining implementation-time detail to verify, not a silent-loss risk. |
| Expired — a device revoked (item 9) tries to fetch pending wraps | `401`/`403` from the normal session check; a revoked `DeviceKey` is not itself an auth mechanism, so this is unaffected by revocation specifically — revocation only stops it being a wrap **target**. |
| Unauthorized — a non-member tries `GET /channels/:id/encryption/keys` | `403`, same `Permission.ViewChannel` guard every other channel-content endpoint already uses (`requireReadableChannel`, `age-restricted-channels.md` Current behavior). |
| Channel turned from encrypted back to unencrypted | New messages stop being wrapped/encrypted; `isEncrypted` flips to `false`; already-sent ciphertext stays as ciphertext forever (no server-side decryption is possible — the server never had the key) — the UI must state this is permanent, not a toggle-back. |
| A member leaves voluntarily (not kicked/banned) | Same rotation as item 8 — a voluntary leave is still "no longer a member," and the guarantee (future messages unreadable by ex-members) does not distinguish leave from kick for its own sake. |
| Owner/`ManageChannels` holder removed from their own encrypted channel's server | Same as any member — rotation does not exempt permission holders, matching `age-restricted-channels.md`'s "no special case" precedent for its own gate. |

## Technical approach

**Files touched**

| File | Change |
|---|---|
| `apps/web/src/e2ee.ts` | Add device keypair generation/export/import helpers, AES-KW wrap/unwrap helpers, and a `computeKeyId(rawKeyBytes)` helper (SHA-256, first 16 bytes, base64url). Keep `encryptChannelMessage`/`decryptChannelMessage`/`isEncryptedMessage` working for the `v1` legacy path unchanged (4-part format, no `keyId`, no AAD); add `v2` variants that emit/parse the 5-part `e2ee:v2:<keyId>:<iv>:<ciphertext>` format and pass `channelId`/`conversationId` as AES-GCM `additionalData` (Threat model — AAD fix). The parser dispatches on the `version` segment first, then splits the remainder according to that version's part count — never a fixed `split(':')` count assumption. |
| `apps/web/src/hooks/useChannelEncryption.ts` | Replace passphrase-based `configureChannelEncryption` with device-key bootstrap (load/generate device keypair, fetch/unwrap the current content key via the new key-management endpoints); persist the unwrapped `CryptoKey` per channel in IndexedDB (not just in-memory state) so a reload does not require re-fetching a wrap. |
| `apps/web/src/hooks/useDirectMessages.ts` | Encrypt/decrypt DM content the same way channel messages do, gated on `DirectConversation.isEncrypted` (true by default per conversation). |
| `apps/web/src/hooks/useDeviceKeys.ts` (new) | Device keypair lifecycle: generate-once, IndexedDB storage, registration call, pending-wraps polling/handling. |
| `apps/web/src/components/settings/DeviceListSettings.tsx` (new) | Device list + revoke action (Rules item 9). |
| `apps/web/src/components/chat/SafetyNumberDialog.tsx` (new) | Safety-number verification screen (Rules item 6). |
| `apps/web/src/components/chat/UtilityPanel.tsx` | Replace the passphrase form with an "Enable encryption" action with no text input, plus the five-loss disclosure copy before confirming. |
| `apps/web/src/components/settings/ChannelSettings.tsx` | `isEncrypted` `SwitchRow`, same pattern as `isPrivate` (`:178-181`) and `isAgeRestricted` (`age-restricted-channels.md`). |
| `apps/api/prisma/models/channels.prisma` | `isEncrypted Boolean @default(false)`, `encryptionKeyVersion Int @default(0)`. |
| `apps/api/prisma/models/direct-messages.prisma` | `DirectConversation.isEncrypted Boolean @default(true)`, `encryptionKeyVersion Int @default(1)`; new `EncryptedConversationKey` model. |
| `apps/api/prisma/models/` (new file, e.g. `encryption.prisma`) | `DeviceKey`, `EncryptedChannelKey` models. |
| New migration `apps/api/prisma/migrations/<ts>_add_e2ee_key_management/` | Hand-written, both directions. |
| `apps/api/src/modules/encryption/` (new module) | `DeviceKeyController`/`Service` (register/list/revoke device keys), `EncryptionKeyController`/`Service` (upload/fetch wrapped keys, pending-wraps, rotation trigger hook). |
| `apps/api/src/modules/channels/channels.service.ts` | `isEncrypted` in create/update DTOs + audit metadata, same pattern as `isAgeRestricted`. |
| `apps/api/src/modules/servers/server-moderation.service.ts` | On kick/ban, bump `Channel.encryptionKeyVersion` for the server's encrypted channels (Rules item 8) — same file that already evicts sockets on kick/ban (`announceRemoval`, cited in `age-restricted-channels.md` Current behavior). |
| `apps/api/src/modules/direct-messages/*` | On group-DM member removal, bump `DirectConversation.encryptionKeyVersion`. |
| `apps/api/src/modules/messages/messages.service.ts` | `notifyMentionedUsers` gains and forwards `isEncrypted` (mirroring `isAgeRestricted`). |
| `apps/api/src/modules/push/push.service.ts` | `sendMentionPush`/`sendDirectMessagePush` branch on `isEncrypted` for a content-free body (Rules item 11). |
| `apps/api/src/common/i18n/locales/{en,vi}.ts` | `push.channelMessage.encryptedBody`, `push.directMessage.encryptedBody`. |
| `apps/web/src/i18n/locales/{en,vi}/auth.ts` | Replace passphrase-era `encryption.*` strings with device-flow copy (enable/disable, five-loss disclosure, device list, safety number). |
| `packages/shared/src/api-contract.ts` | `Channel.isEncrypted`, `DirectConversation.isEncrypted`, `DeviceKey`, wrapped-key request/response DTOs. |

**API contract**

- `POST /devices/keys` — register/update this device's public key. Request:
  `{ deviceId, publicKey, label }`. Response `201`: `{ deviceKey: DeviceKey }` (public fields only,
  never a private key — there is none server-side). Errors: `400` invalid key format.
- `GET /devices/keys` — list the caller's own devices (Device list settings). Response `200`:
  `{ devices: DeviceKey[] }`.
- `DELETE /devices/keys/:deviceId` — revoke (`revokedAt = now()`), idempotent. Response `200`:
  `{ ok: true }`.
- `POST /channels/:channelId/encryption/keys` / `POST /conversations/:conversationId/encryption/keys`
  — upload one or more wrapped keys for one `keyId`. Request: `{ keyId, version, wraps: [{
  deviceKeyId, wrappedKey }] }` (`keyId` is what the row is keyed and looked up on; `version` is
  carried along only as the ordering/"current" hint, per Rules item 3). Response `201`:
  `{ accepted: number, alreadyPresent: number }` (idempotent upsert per Edge cases "duplicate wrap
  upload"). Errors: `403` not a member / no `ManageChannels` for the first-enable call.
- `GET /channels/:channelId/encryption/pending-wraps` / conversation equivalent — devices missing a
  wrapped key for the current `keyId`, for the caller's own account and (if the caller already holds
  the key) for other members. Response `200`: `{ keyId, version, missing: [{ deviceKeyId, publicKey,
  userId }] }`.
- `GET /channels/:channelId/encryption/keys?keyId=` / conversation equivalent — the caller's own
  wrapped key for a specific `keyId` (current or historical, for opening old messages after
  rotation — a client reads the `keyId` off the message it is trying to decrypt and requests exactly
  that one, never a `version`-wide scan). Response `200`: `{ wrappedKey: string | null }` (`null`
  while waiting, matching Edge cases "no content key yet").
- `PATCH /channels/:channelId` (existing) — request body gains `isEncrypted?: boolean`; same
  authorization (`ManageChannels`) and audit-log pattern as every other channel field.
- `PATCH /conversations/:conversationId` (existing group-DM settings endpoint) — gains
  `isEncrypted?: boolean` for the one-time "enable for this pre-existing conversation" action (Rules
  item 2); 1:1 DMs default `isEncrypted: true` at creation with no toggle exposed.

**DB / migration**

```prisma
model DeviceKey {
  id         String    @id @default(cuid())
  userId     String
  deviceId   String
  publicKey  String
  label      String?
  createdAt  DateTime  @default(now())
  revokedAt  DateTime?
  user       User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, deviceId])
  @@index([userId])
}

model EncryptedChannelKey {
  id             String              @id @default(cuid())
  channelId      String?
  conversationId String?
  /// Identifies the exact content key: base64url of the first 16 bytes of SHA-256(raw key bytes).
  /// What a `v2` message actually names and what decryption looks up — never guessed or scanned for.
  keyId          String
  /// Ordering/"current key to encrypt new sends under" hint only; never what a message references.
  version        Int
  deviceKeyId    String
  wrappedKey     String
  createdAt      DateTime            @default(now())
  channel        Channel?            @relation(fields: [channelId], references: [id], onDelete: Cascade)
  conversation   DirectConversation? @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  deviceKey      DeviceKey           @relation(fields: [deviceKeyId], references: [id], onDelete: Cascade)

  @@unique([channelId, conversationId, keyId, deviceKeyId])
  @@index([deviceKeyId])
  @@index([channelId, keyId])
  @@index([conversationId, keyId])
  @@index([channelId, version])
  @@index([conversationId, version])
}
```

`keyId` is the column a `v2` message's ciphertext actually references (Changes → Rules item 3) and is
what the unique constraint and the two new indexes are built around — this is the fix for the design
gap identified in review: two independently generated keys for the same `version` no longer collide
or make a message's key ambiguous, because they have two different `keyId`s and each wrap row is
addressed by its own. `version` is retained only as an ordering/"what should a client try to encrypt
new sends under" hint (Rules item 8) — kept indexed too, since "give me the current wraps for this
channel" is still a real query shape, but no lookup that resolves a specific message's key ever
filters on `version` alone.

`channelId`/`conversationId` dual-nullable-FK follows the `Poll` model's existing
`messageId`/`directMessageId` pattern for the same "one row belongs to either a channel or a
conversation" shape — no new pattern introduced. `Channel.isEncrypted`/`encryptionKeyVersion` and
`DirectConversation.isEncrypted`/`encryptionKeyVersion` are additive, defaulted columns (nullable-or-
default rule, `~/.claude/rules/database.md`): `Channel.isEncrypted` defaults `false` (no behavior
change for existing channels), `DirectConversation.isEncrypted` defaults `true` **going forward**
(new conversations only — the migration's `ADD COLUMN ... DEFAULT true` would otherwise silently mark
every existing plaintext DM as "encrypted", which is false; the migration must set the default to
`false` at the column level and the application layer sets `true` explicitly on every new
`DirectConversation` creation call, never relying on the column default for existing rows). This is a
correction from a naive `DEFAULT true` and must be implemented exactly this way — flagged here so it
is not missed during implementation.

Indexes: `(deviceKeyId)` (a device's own wraps), `(channelId, keyId)`/`(conversationId, keyId)` (the
lookup a message's decrypt-by-`keyId` and `pending-wraps` actually use), `(channelId,
version)`/`(conversationId, version)` (the "give me the current version's wraps" display/ordering
query, Rules item 8) — five lookup shapes total, covering both the `keyId`-exact path every real
decrypt takes and the `version`-wide path only used for "what should I generate next." `DeviceKey(userId)`
for "list my devices" and for looking up wrap targets by member.

Migration: hand-written, both tables additive, both `Channel`/`DirectConversation` column additions
nullable-or-defaulted; `down()` drops all three new things. No backfill of historical DM content
(Scope → Out of scope) — nothing to migrate for `EncryptedChannelKey` rows either, since there is no
prior key-wrapping data to preserve.

**Libraries** — none new. WebCrypto (`crypto.subtle`) covers keypair generation, ECDH derivation,
AES-KW wrap/unwrap, and AES-GCM content encryption; it is already the only crypto primitive this repo
uses for E2EE (`apps/web/src/e2ee.ts`), so no dependency is added.

## Trade-offs

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| **A (chosen): per-device ECDH P-256 keypairs + wrapped content keys** | No shared secret ever typed or transmitted; removing a member/device provably stops future access; matches the product decision (private key never leaves the device). | Real implementation cost: device bootstrap, wrap distribution, rotation, multi-device — several new endpoints and a new module, versus one function today. | Chosen — it is the only option that satisfies "private key never leaves the device" and "kicked members lose future access," both explicit product requirements. |
| B: keep the shared passphrase, just store it more safely (e.g. encrypted-at-rest server-side, unlocked by the user's login) | Small diff, no new tables. | The server would hold something that unlocks the passphrase — defeats "server never sees plaintext content or the means to get it"; still one secret for the whole channel, so a kicked member who already knows it is never actually cut off. | Rejected — does not meet either acceptance criterion about revocation or about the server never holding key material. |
| C: server-side re-encryption on membership change (server holds a master key, re-wraps automatically) | Simplest rotation — no client cooperation needed. | Requires the server to hold decrypting key material at some point, which is exactly what E2EE is meant to avoid; a server compromise would then expose everything. | Rejected outright — contradicts the goal, not just a worse version of it. |
| D: X25519 instead of ECDH P-256 | Slightly faster, smaller keys, increasingly preferred in modern messaging protocols (e.g. Signal's X3DH). | Not part of the W3C WebCrypto spec's required algorithm set — browser support for `X25519` in `SubtleCrypto` is inconsistent (still behind flags/polyfills in some engines as of this repo's dependencies), while `ECDH`/`P-256` is universally supported and is what the acceptance criteria can be verified against without adding a JS polyfill library. | Rejected for now — P-256 meets the same guarantees with zero new dependencies; revisit if a future doc adds a JS X25519 library for another reason. |
| E: hard-gate wrapping on safety-number verification (no key delivered until verified) | Strongest anti-MITM guarantee. | A brand-new member could not read anything until manually verified by an existing member — directly breaks the "new member can decrypt after joining" acceptance criterion, and no existing feature in this repo requires manual per-user verification before basic participation. | Rejected — verification stays visible/optional (Rules item 6), not a hard gate. |
| **F (chosen, DM default-on / channel opt-in)**: asymmetric defaults | Matches the decided product requirement directly: DMs are inherently 1:1-or-small-group and higher-expectation-of-privacy by default; channels are larger, moderated spaces where AutoMod/search loss is a heavier, deliberate trade a moderator should explicitly accept. | Two different default/authorization paths to maintain (`isEncrypted` default `true` at DM creation vs. `ManageChannels`-gated toggle for channels) instead of one uniform flag. | Chosen — this is the explicit, already-decided product requirement, not a design choice this doc is free to make differently. |
| **G (chosen, decided): no key-recovery/escrow at all — losing all devices permanently loses access to encrypted history from that point forward** | Simplest, and matches the strict reading of "private key never leaves the device" — there is nothing server-side to compromise, subpoena, or brute-force; no second key-management subsystem to build, secure, and maintain. | Product cost: a user who loses every device loses all encrypted-channel/DM history encrypted since their last surviving device (not their whole account, and not plaintext content sent before encryption was ever turned on). No re-derivation is possible because the content key is random, not derived from anything memorable — by design. | **Decided** — final for this version, not a placeholder. See Decided note below. |
| H (recovery alternative, rejected): opt-in encrypted recovery key | A user who saves a recovery phrase (shown once at first enable, never stored in plaintext) can recover access to wrapped keys on a brand-new device by re-deriving a wrapping key from the phrase (Argon2id/PBKDF2) and unwrapping an encrypted escrow blob the server stores. Avoids total data loss on device loss — closer to WhatsApp's/Signal PIN-backup model. | The server would hold an encrypted escrow blob whose security degrades to the strength of the recovery phrase (a weak or reused phrase is a real attack surface) — a half-built version of this is exactly the kind of server-held key-recovery path E2EE exists to remove; it is also a second key-management subsystem (generation, display-once UX, escrow storage, recovery flow) on top of everything in this doc. | **Rejected for this and any near-term version** (decided by the user, 2026-09-25) — see Decided note below. If ever revisited, it is its own separate design doc, not an addition to this one. |

**Decided** (2026-09-25): **no account-level key recovery in this version, final** — a user who loses
every device loses access to every content key that was never wrapped for a surviving device, and
therefore to the encrypted history protected by it. Reason: a recovery mechanism (Option H) means the
server ends up holding *something* that can reconstruct a private key or a content key given the right
secret — even encrypted, even opt-in, that is a server-held recovery path, i.e. exactly the kind of
backdoor this feature exists to remove. Building it "a little" (opt-in, escrow, weak-phrase caveats
and all) does not avoid that; it just makes it partial and easy to under-scope. The UI for enabling
encryption must state this plainly — "if you lose access to every device that had this key, this
history cannot be recovered by anyone, including us" — before a user turns encryption on, not as fine
print. Open question #56 in `docs/features/open-questions.md` is closed by this decision, not left
open.

What the chosen option costs: one new backend module (device keys + wrapped keys), a rewritten
`useChannelEncryption`/new `useDeviceKeys` client flow, and an ongoing operational cost every time a
channel/conversation membership changes (rotation requires an online, still-current member's client to
do work — Risks & rollback names what happens when none is online promptly). Multi-device support
multiplies wrap count by device count per channel/conversation (a channel with 50 members ×2 devices
each is 100 wraps per version) — acceptable at this app's scale (small server-oriented chat), flagged
here in case a very large server's channel encryption is later proposed.

## Risks & rollback

- **What can break**: the rotation race in Edge cases ("two devices race to generate a new key") is a
  real concurrency case (`~/.claude/rules/failure-and-state.md`) — since every message now names the
  exact `keyId` it was encrypted under (Rules item 3), the race can no longer make a message
  undecryptable or ambiguous; both independently generated keys get wrapped and stored under their own
  `keyId`, and every message stays openable by the `keyId` it names. What remains is a **coordination
  cost, not a data-loss risk**: two live "current" keys for one `version` until clients converge on
  one (via `pending-wraps`, Edge cases) — flagged for the implementer to pick and document the exact
  convergence rule (e.g. lowest `keyId` wins) before shipping, so it is deterministic rather than
  "whichever client's write happened to run last."
- **A channel/conversation rotates while every member is offline**: no client is present to generate
  and wrap the new version's key, so new messages sent in that state have **no** content key to
  encrypt under until some member's client comes online — the sender's own client must be the
  fallback generator (it is itself an online, current member) the first time it tries to send after a
  rotation with an empty current version, rather than assuming another member will have done it.
  This must be implemented as part of Rules item 8, not left implicit — named here as a gap the
  Technical approach section does not yet fully close.
- **Not covered**: hardware-backed key protection (Scope), DM history predating encryption being
  enabled (Scope), account-level key recovery after losing every device (Trade-offs G/H — **decided,
  not built, by design**), server-side search/AutoMod/bot-reading/mention-pings on encrypted content
  (Threat model, by design).
- **Rollback**: reverting the code leaves the new tables and columns in place but unused (additive
  migration, `down()` drops them if a full rollback is needed). Any channel/conversation already
  flipped to `isEncrypted = true` before a rollback keeps that ciphertext in the database — rolling
  back the *code* does not decrypt it; a full schema rollback (`down()`) would delete the
  `DeviceKey`/`EncryptedChannelKey`/`EncryptedConversationKey` rows, permanently losing every wrapped
  key (equivalent to losing all devices at once for every affected channel/conversation) — this
  `down()` must say so in its own comment, per `~/.claude/rules/database.md`, and the report at
  rollback time must repeat it.
- **Gate before enabling for real users**: per the user's explicit instruction, this feature must
  **not** be turned on for anyone until (a) the rotation-on-removal race above is verified fixed,
  (b) the "offline at rotation" fallback (above) is implemented, and (c) the manual test scenarios
  below all pass — a half-working E2EE (silently undecryptable messages, or a rotation that never
  completes) is worse than the current passphrase scheme, because it looks secure while failing
  silently.

## Test plan

Not covered by automated tests (repo has no test suite by policy,
`~/.claude/rules/testing.md`).

**Manual**

1. Two browser profiles (two "devices") for the same test account, both registered via
   `POST /devices/keys` → `GET /devices/keys` lists both. Enable encryption on a channel from device
   A → device B, opened later, ends up able to decrypt new messages sent from device A (multi-device,
   acceptance criterion 1).
2. Member X (device A) enables encryption on a channel they moderate → member Y (a different account,
   already in the channel) opens the channel before any wrap exists for them → sees "waiting for a
   key" placeholder, not an error → member X's client (still open) picks up the pending wrap and
   uploads it → member Y's client, on its next poll/reconnect, decrypts (new-member acceptance
   criterion).
3. Member Y is kicked from the server → a `ManageChannels` holder sends a new message in the
   encrypted channel → member Y's account (now removed, so testable only via a saved wrapped-key
   snapshot / API call as that former member) cannot obtain a wrap for the new version and cannot
   decrypt the new message; a message sent **before** the kick is still decryptable using the old
   version's already-held key (kick/rotation acceptance criterion, plus Threat model's "cannot un-see"
   caveat, tested as "cannot see new, can still see old").
4. Create a new 1:1 DM between two test accounts → `GET` the conversation shows `isEncrypted: true`
   with no setup step taken by either user (default-on acceptance criterion); send a message → the
   stored `DirectMessage.content` is ciphertext (`e2ee:v2:...`), confirmed by direct inspection of the
   dev database row (never real customer data, `~/.claude/rules/database.md`).
5. A channel with existing `e2ee:v1:` passphrase messages is migrated (`isEncrypted: true` flipped) →
   old messages still open via the "enter the old passphrase" fallback; a new message sent after
   migration uses the new device-key flow and appears alongside the old ones without the client
   treating the old ones as corrupted (migration acceptance criterion).
6. Safety-number screen: two accounts each open the other's device-verification dialog → the computed
   fingerprint matches on both sides for the same device pair, and changes if either account registers
   an additional device (own device list changes the fingerprint input).
7. Push notification for a mention in an encrypted channel, and for a message in an encrypted DM, both
   arrive with the generic body text, never the author or content — repeat with AutoMod-adjacent
   `isAgeRestricted` also true, to confirm the encrypted branch takes precedence (Rules item 11).
8. Network tab / server log inspection during every step above: confirm no request or response body
   ever contains anything but a public key or a wrapped (ciphertext) key — grep the diff's new
   endpoints for anything resembling a private key parameter (there should be none).

## Deployment notes

- New env vars: none — WebCrypto is browser-native, no server-side crypto secret is introduced by
  this feature (unlike `TWO_FACTOR_ENCRYPTION_KEY` in `two-factor-auth.md`, because the server never
  holds decrypting key material here).
- Migration `<ts>_add_e2ee_key_management` must run before deploying the API (adds two nullable/
  defaulted columns and two new tables — safe, no backfill, no lock concern on tables of this repo's
  size).
- No cache/queue to clear.
- Breaking API change: none for existing clients — `isEncrypted` fields are new and default to the
  status quo (`false` for channels; DM default is only `true` for conversations created after this
  ships, per the corrected migration behavior in Technical approach). Existing `e2ee:v1:` client code
  paths are kept, not removed, so an un-updated client (if any existed) would simply never see the new
  fields.
- This feature must **not** be enabled for real users until the Risks & rollback gating conditions
  are met — this is a deployment gate, not only a code-review note.
