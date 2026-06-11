export type SearchHasFilter = 'file' | 'link';

export interface ParsedMessageSearch {
  text: string;
  from?: string;
  in?: string;
  has: SearchHasFilter[];
  before?: string;
  after?: string;
  invalid: string[];
  tokens: Array<{ label: string; value: string }>;
}

const OPERATORS = new Set(['from', 'in', 'has', 'before', 'after']);

export function parseMessageSearchQuery(query: string): ParsedMessageSearch {
  const words: string[] = [];
  const has = new Set<SearchHasFilter>();
  const invalid: string[] = [];
  const tokens: ParsedMessageSearch['tokens'] = [];
  const parsed: ParsedMessageSearch = { text: '', has: [], invalid, tokens };

  for (const part of tokenizeSearchQuery(query)) {
    const match = part.match(/^([a-z]+):(.+)$/i);
    const key = match?.[1]?.toLowerCase();
    const rawValue = match?.[2] ?? '';
    const value = unquote(rawValue.trim());

    if (!key || !OPERATORS.has(key)) {
      words.push(unquote(part));
      continue;
    }

    if (!value) {
      invalid.push(`${key}: needs a value`);
      continue;
    }

    if (key === 'from') {
      parsed.from = value;
      tokens.push({ label: 'From', value });
      continue;
    }

    if (key === 'in') {
      parsed.in = value.replace(/^#/, '');
      tokens.push({ label: 'In', value: parsed.in });
      continue;
    }

    if (key === 'has') {
      if (value === 'link' || value === 'file') {
        has.add(value);
        tokens.push({ label: 'Has', value });
      } else {
        invalid.push(`has:${value} is not supported`);
      }
      continue;
    }

    if (key === 'before' || key === 'after') {
      if (isValidDateFilter(value)) {
        parsed[key] = value;
        tokens.push({ label: key === 'before' ? 'Before' : 'After', value });
      } else {
        invalid.push(`${key}:${value} is not a valid date`);
      }
    }
  }

  parsed.text = words.join(' ').trim();
  parsed.has = [...has];
  return parsed;
}

export function buildMessageSearchParams(query: string) {
  const parsed = parseMessageSearchQuery(query);
  const params = new URLSearchParams();
  if (parsed.text) params.set('search', parsed.text);
  if (parsed.from) params.set('from', parsed.from);
  if (parsed.in) params.set('in', parsed.in);
  if (parsed.before) params.set('before', parsed.before);
  if (parsed.after) params.set('after', parsed.after);
  if (parsed.has.includes('file')) params.set('hasFile', 'true');
  if (parsed.has.includes('link')) params.set('hasLink', 'true');
  return { parsed, params };
}

export interface MessageSearchSnippet {
  before: string;
  match: string;
  after: string;
  fallback: string;
}

export function buildMessageSearchSnippet(content: string, query: string): MessageSearchSnippet {
  const compactContent = content.replace(/\s+/g, ' ').trim();
  const terms = searchableTerms(query);
  const normalized = compactContent.toLowerCase();
  const matchTerm = terms.find((term) => normalized.includes(term));

  if (!compactContent) {
    return { before: '', match: '', after: '', fallback: 'Attachment-only message' };
  }

  if (!matchTerm) {
    return { before: '', match: '', after: '', fallback: truncateSnippet(compactContent) };
  }

  const matchStart = normalized.indexOf(matchTerm);
  const matchEnd = matchStart + matchTerm.length;
  const windowStart = Math.max(0, matchStart - 42);
  const windowEnd = Math.min(compactContent.length, matchEnd + 58);

  return {
    before: `${windowStart > 0 ? '…' : ''}${compactContent.slice(windowStart, matchStart)}`,
    match: compactContent.slice(matchStart, matchEnd),
    after: `${compactContent.slice(matchEnd, windowEnd)}${windowEnd < compactContent.length ? '…' : ''}`,
    fallback: '',
  };
}

function searchableTerms(query: string) {
  return parseMessageSearchQuery(query)
    .text.split(/\s+/)
    .map((term) => term.trim().toLowerCase())
    .filter((term) => term.length >= 2)
    .sort((left, right) => right.length - left.length);
}

function truncateSnippet(value: string) {
  return value.length > 110 ? `${value.slice(0, 109)}…` : value;
}

function unquote(value: string) {
  return value.replace(/^"(.+)"$/, '$1');
}

function tokenizeSearchQuery(query: string) {
  return query.match(/[a-z]+:"[^"]+"|"[^"]+"|\S+/gi) ?? [];
}

function isValidDateFilter(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
