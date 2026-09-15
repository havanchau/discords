export interface HtmlMetadata {
  title: string | null;
  description: string | null;
  siteName: string | null;
}

const MAX_TITLE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 300;
const META_TAG = /<meta\s[^>]*>/gi;
const ATTRIBUTE = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
const TITLE_TAG = /<title[^>]*>([\s\S]*?)<\/title>/i;

/** Reads Open Graph, Twitter, and standard meta tags from an HTML document without executing it. */
export function parseHtmlMetadata(html: string): HtmlMetadata {
  const meta = new Map<string, string>();
  for (const [tag] of html.matchAll(META_TAG)) {
    const attributes = new Map<string, string>();
    for (const match of tag.matchAll(ATTRIBUTE)) {
      attributes.set(match[1].toLowerCase(), match[2] ?? match[3] ?? match[4] ?? '');
    }
    const key = (attributes.get('property') ?? attributes.get('name'))?.toLowerCase();
    const content = attributes.get('content');
    if (key && content !== undefined && !meta.has(key)) meta.set(key, content);
  }

  const title = firstText(
    [meta.get('og:title'), meta.get('twitter:title'), TITLE_TAG.exec(html)?.[1]],
    MAX_TITLE_LENGTH,
  );
  const description = firstText(
    [meta.get('og:description'), meta.get('description'), meta.get('twitter:description')],
    MAX_DESCRIPTION_LENGTH,
  );
  const siteName = firstText([meta.get('og:site_name')], MAX_TITLE_LENGTH);
  return { title, description, siteName };
}

function firstText(candidates: Array<string | undefined>, maxLength: number) {
  for (const candidate of candidates) {
    const text = decodeEntities(candidate ?? '')
      .replace(/\s+/g, ' ')
      .trim();
    if (text) return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
  }
  return null;
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

function decodeEntities(value: string) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, body: string) => {
    if (body[0] === '#') {
      const codePoint =
        body[1] === 'x' || body[1] === 'X'
          ? Number.parseInt(body.slice(2), 16)
          : Number.parseInt(body.slice(1), 10);
      return Number.isInteger(codePoint) && codePoint > 0 && codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : entity;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? entity;
  });
}
