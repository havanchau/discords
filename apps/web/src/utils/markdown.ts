export type MarkdownNode =
  | { type: 'text'; value: string }
  | { type: 'bold' | 'italic' | 'underline' | 'strike' | 'spoiler'; children: MarkdownNode[] }
  | { type: 'inlineCode'; value: string }
  | { type: 'codeBlock'; language: string | null; value: string }
  | { type: 'blockquote'; children: MarkdownNode[] }
  | { type: 'link'; href: string }
  // `kind` mirrors the server's everyone/here keywords only — it does not resolve against real role
  // data, so a role mention renders with `kind: 'user'`, the same as an unresolved username
  // (docs/features/everyone-here-and-role-mentions.md, Trade-offs: no round trip from the renderer).
  | { type: 'mention'; value: string; kind: 'everyone' | 'here' | 'user' }
  | { type: 'emoji'; name: string };

type ContainerType = 'bold' | 'italic' | 'underline' | 'strike' | 'spoiler';

const MAX_DEPTH = 5;
const CODE_FENCE = /```(?:([a-zA-Z0-9_+-]*)\n)?([\s\S]*?)```/g;

/*
 * Alternation order is the precedence when two syntaxes start at the same position: code first so
 * its contents stay literal, then spoiler, bold before italic, and so on.
 */
const INLINE_PATTERN = new RegExp(
  [
    '`([^`\\n]+)`',
    '\\|\\|([\\s\\S]+?)\\|\\|',
    '\\*\\*([\\s\\S]+?)\\*\\*',
    '__([\\s\\S]+?)__',
    '~~([\\s\\S]+?)~~',
    '\\*(?![\\s*])([\\s\\S]*?[^\\s*])\\*(?!\\*)',
    '(?<!\\w)_(?![\\s_])([\\s\\S]*?[^\\s_])_(?!\\w)',
    '(https?:\\/\\/[^\\s<]*[^\\s<.,:;!?)\\]\'"])',
    '(@[\\w.-]+)',
    '(:[a-zA-Z0-9_]{2,32}:)',
  ].join('|'),
  'g',
);

const CONTAINER_GROUPS: Array<[number, ContainerType]> = [
  [2, 'spoiler'],
  [3, 'bold'],
  [4, 'underline'],
  [5, 'strike'],
  [6, 'italic'],
  [7, 'italic'],
];

/** `token` includes the leading `@`, e.g. `@everyone`. */
function mentionKind(token: string): 'everyone' | 'here' | 'user' {
  const word = token.slice(1).toLowerCase();
  if (word === 'everyone') return 'everyone';
  if (word === 'here') return 'here';
  return 'user';
}

export function parseMarkdown(content: string): MarkdownNode[] {
  const nodes: MarkdownNode[] = [];
  let cursor = 0;

  for (const match of content.matchAll(CODE_FENCE)) {
    const start = match.index ?? 0;
    pushNodes(nodes, parseBlocks(trimTrailingNewline(content.slice(cursor, start))));
    nodes.push({
      type: 'codeBlock',
      language: match[1] || null,
      value: trimTrailingNewline(match[2]),
    });
    cursor = start + match[0].length;
    // A newline right after the closing fence belongs to the block, not the following text.
    if (content[cursor] === '\n') cursor += 1;
  }

  pushNodes(nodes, parseBlocks(content.slice(cursor)));
  return nodes;
}

function parseBlocks(text: string): MarkdownNode[] {
  if (!text) return [];
  const nodes: MarkdownNode[] = [];
  let paragraph: string[] = [];
  let quote: string[] = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    pushNodes(nodes, parseInline(paragraph.join('\n'), 0));
    paragraph = [];
  };
  const flushQuote = () => {
    if (!quote.length) return;
    nodes.push({ type: 'blockquote', children: parseInline(quote.join('\n'), 0) });
    quote = [];
  };

  text.split('\n').forEach((line) => {
    if (line.startsWith('> ')) {
      flushParagraph();
      quote.push(line.slice(2));
    } else {
      flushQuote();
      paragraph.push(line);
    }
  });
  flushParagraph();
  flushQuote();
  return nodes;
}

function parseInline(text: string, depth: number): MarkdownNode[] {
  const nodes: MarkdownNode[] = [];
  let cursor = 0;

  for (const match of text.matchAll(INLINE_PATTERN)) {
    const start = match.index ?? 0;
    pushText(nodes, text.slice(cursor, start));
    cursor = start + match[0].length;

    if (match[1] !== undefined) {
      nodes.push({ type: 'inlineCode', value: match[1] });
      continue;
    }
    const container = CONTAINER_GROUPS.find(([group]) => match[group] !== undefined);
    if (container) {
      const [group, type] = container;
      if (depth >= MAX_DEPTH) {
        pushText(nodes, match[0]);
      } else {
        nodes.push({ type, children: parseInline(match[group], depth + 1) });
      }
      continue;
    }
    if (match[8] !== undefined) nodes.push({ type: 'link', href: match[8] });
    else if (match[9] !== undefined)
      nodes.push({ type: 'mention', value: match[9], kind: mentionKind(match[9]) });
    else if (match[10] !== undefined) nodes.push({ type: 'emoji', name: match[10].slice(1, -1) });
  }

  pushText(nodes, text.slice(cursor));
  return nodes;
}

function pushText(nodes: MarkdownNode[], value: string) {
  if (!value) return;
  const last = nodes[nodes.length - 1];
  if (last?.type === 'text') {
    last.value += value;
    return;
  }
  nodes.push({ type: 'text', value });
}

function pushNodes(target: MarkdownNode[], nodes: MarkdownNode[]) {
  nodes.forEach((node) =>
    node.type === 'text' ? pushText(target, node.value) : target.push(node),
  );
}

function trimTrailingNewline(value: string) {
  return value.endsWith('\n') ? value.slice(0, -1) : value;
}

/** Links as the renderer shows them (trailing punctuation excluded), including inside formatting. */
export function extractMarkdownLinks(content: string): string[] {
  const links: string[] = [];
  const visit = (nodes: MarkdownNode[]) =>
    nodes.forEach((node) => {
      if (node.type === 'link') links.push(node.href);
      else if ('children' in node) visit(node.children);
    });
  visit(parseMarkdown(content));
  return [...new Set(links)];
}
