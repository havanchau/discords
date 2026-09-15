# Feature Spec: Message Markdown

Discord-style text formatting in channel, thread, and direct messages.

## Goal

Message content renders common markdown safely, without ever inserting raw HTML.

Acceptance criteria:

- Supported: `**bold**`, `*italic*` and `_italic_`, `__underline__`, `~~strikethrough~~`, `` `inline code` ``, fenced code blocks with an optional language label, `> ` block quotes, `||spoilers||`, `http(s)` links, `@mentions`.
- Formatting nests (bold inside a spoiler, italic inside bold); code spans and code blocks show their contents literally.
- `snake_case_words` do not turn italic.
- Spoilers are hidden until activated by click or keyboard, and announce themselves to screen readers.
- The renderer builds React elements only; `<script>` and HTML in content render as text.
- Existing link and mention behavior is unchanged: links open in a new tab with `rel="noreferrer"`.

## Scope

- **In scope**: a pure parser, a `MarkdownContent` renderer, use in channel messages, thread messages, and DM rows.
- **Out of scope**: headings, lists, masked links `[text](url)`, syntax highlighting, markdown in the composer preview.

## Current Behavior

- `MessageContent` in `components/chat/MessageRow.tsx:60` splits content on a link regex and a mention regex and renders plain spans. No other formatting exists.
- `/me` produces `*text*` (`utils/executeSlashCommand.ts:36`), which currently shows literal asterisks.
- DM rows render `message.content` as a plain paragraph (`components/home/DirectMessageTimeline.tsx`).

## Changes

### Parser

`parseMarkdown(content): MarkdownNode[]` in `utils/markdown.ts`:

```ts
type MarkdownNode =
  | { type: 'text'; value: string }
  | { type: 'bold' | 'italic' | 'underline' | 'strike' | 'spoiler'; children: MarkdownNode[] }
  | { type: 'inlineCode'; value: string }
  | { type: 'codeBlock'; language: string | null; value: string }
  | { type: 'blockquote'; children: MarkdownNode[] }
  | { type: 'link'; href: string }
  | { type: 'mention'; value: string }
  | { type: 'emoji'; name: string };
```

1. Split out fenced code blocks (```` ``` ````); an unclosed fence is plain text.
2. Group consecutive lines starting with `> ` into one block quote.
3. Tokenize inline text by priority: inline code, spoiler, bold, underline, strike, italic (`*` or word-bounded `_`), link, mention, custom emoji shortcode (`:name:`, used by [custom-emoji.md](custom-emoji.md)).
4. Links exclude trailing `.,:;!?)` characters.
5. Line breaks stay inside text nodes; the renderer uses `white-space: pre-wrap`, and one newline directly next to a code block or block quote is dropped so blocks do not add blank lines.
6. Nesting stops at depth 5; deeper markers render as text.

### Renderer

`components/chat/MarkdownContent.tsx` maps nodes to `strong`, `em`, `u`, `s`, `code`, `pre > code`, `blockquote`, `a`, a mention span, and a spoiler button (`aria-pressed`, label "Spoiler, activate to reveal"). An optional `resolveEmoji(name)` prop renders custom emoji; unresolved shortcodes stay text. Styles live in `MarkdownContent.module.css` using existing tokens.

## Technical Approach

### Files

- `apps/web/src/utils/markdown.ts`, `utils/markdown.test.ts`.
- `apps/web/src/components/chat/MarkdownContent.tsx`, `MarkdownContent.module.css`.
- `apps/web/src/components/chat/MessageRow.tsx` (replace inline split rendering; keep the reply preview, thread preview, and link chips).
- `apps/web/src/components/chat/ThreadPanel.tsx`, `ThreadPanel.module.css` (thread messages).
- `apps/web/src/components/home/DirectMessageRow.tsx`.
- Mention styles move from `MessageRow.module.css` to `MarkdownContent.module.css`.

No API or schema change.

## Trade-offs

- **Hand-written parser vs. `marked` / `react-markdown`**: those implement CommonMark (headings, lists, HTML passthrough) rather than Discord's subset, would need sanitization configuration, and add bundle weight. The subset here is small enough to test exhaustively.
- **Parse on render vs. memoized parse**: `MessageRow` is memoized per message and content is capped at 4000 characters, so parsing is cheap; `useMemo` keyed by content avoids reparsing on unrelated row renders.

## Risks & Rollback

- **Risk**: messages that intentionally contained `*` or `_` pairs now render formatted; Discord behaves the same way.
- **Rollback**: revert `MessageRow` and `DirectMessageRow` to plain rendering.

## Test Plan

- **Automated**: parser tests for each syntax, nesting, snake_case, unclosed markers, code block with language, block quote grouping, link trailing punctuation, HTML-like text staying text; renderer test that a spoiler toggles and that `<img onerror>` content renders as text.
- **Manual**: send a message using every syntax in a channel and a DM, check both themes and a 390px viewport; verify a long code block scrolls horizontally inside the message instead of widening the page.

## Deployment Notes

- Web-only change.
