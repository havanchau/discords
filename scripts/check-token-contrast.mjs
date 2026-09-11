/*
 * Verifies that every contrast pairing declared in apps/web/src/styles/tokens.css meets its
 * WCAG threshold in both the light and the dark theme.
 *
 * The pairings live next to the tokens they constrain, inside the `@contrast-pairs` block, so a
 * token change and its contrast budget stay in the same file.
 */
import fs from 'node:fs';

const TOKENS_FILE = 'apps/web/src/styles/tokens.css';
const THEMES = ['light', 'dark'];

const css = fs.readFileSync(TOKENS_FILE, 'utf8');
const pairs = parsePairs(css);
const themeTokens = Object.fromEntries(THEMES.map((theme) => [theme, collectTokens(css, theme)]));

if (pairs.length === 0) {
  console.error(`No @contrast-pairs block found in ${TOKENS_FILE}.`);
  process.exit(1);
}

const failures = [];

for (const theme of THEMES) {
  const tokens = themeTokens[theme];
  for (const pair of pairs) {
    const background = resolveColor(pair.background, tokens);
    if (!background) {
      failures.push(`${theme}: --${pair.background} does not resolve to a color`);
      continue;
    }
    if (background.a < 1) {
      failures.push(`${theme}: --${pair.background} is translucent and cannot be a background`);
      continue;
    }
    const foreground = resolveColor(pair.foreground, tokens);
    if (!foreground) {
      failures.push(`${theme}: --${pair.foreground} does not resolve to a color`);
      continue;
    }
    const ratio = contrastRatio(composite(foreground, background), background);
    if (ratio + 1e-9 < pair.minimum) {
      failures.push(
        `${theme}: --${pair.foreground} on --${pair.background} is ${ratio.toFixed(2)}:1, below ${pair.minimum}:1`,
      );
    }
  }
}

if (failures.length > 0) {
  console.error('Token contrast check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  `Token contrast check passed: ${pairs.length} pairings across ${THEMES.length} themes.`,
);

function parsePairs(text) {
  const block = /@contrast-pairs([\s\S]*?)@end-contrast-pairs/.exec(text);
  if (!block) return [];
  return block[1]
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*\*?\s*/, '').trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))
    .map((line) => {
      const match = /^([a-z0-9-]+)\s+on\s+([a-z0-9-]+)\s*>=\s*([\d.]+)$/i.exec(line);
      if (!match) throw new Error(`Malformed contrast pairing: "${line}"`);
      return { foreground: match[1], background: match[2], minimum: Number(match[3]) };
    });
}

/*
 * Declarations are read in source order: the primitive block first, then the light semantic block,
 * then the dark one. A later block overrides an earlier one, which mirrors how the cascade resolves
 * these selectors at runtime.
 */
function collectTokens(text, theme) {
  const tokens = new Map();
  for (const rule of readRules(stripComments(text))) {
    if (!appliesToTheme(rule.selector, theme)) continue;
    for (const [name, value] of readDeclarations(rule.body)) tokens.set(name, value);
  }
  return tokens;
}

function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '');
}

function readRules(text) {
  const rules = [];
  const pattern = /([^{}]+)\{([^{}]*)\}/g;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    rules.push({ selector: match[1].trim(), body: match[2] });
  }
  return rules;
}

function appliesToTheme(selector, theme) {
  const selectors = selector.split(',').map((part) => part.trim());
  return selectors.some((part) => {
    const themeMatch = /\[data-theme='([a-z]+)'\]/.exec(part);
    if (themeMatch) return themeMatch[1] === theme;
    // A bare `:root` block holds primitives and the default (light) semantics; the dark block is
    // declared later and overrides it, exactly as the cascade does at runtime.
    return part === ':root';
  });
}

function readDeclarations(body) {
  const declarations = [];
  const pattern = /(--[a-z0-9-]+)\s*:\s*([^;]+);/gi;
  let match;
  while ((match = pattern.exec(body)) !== null) {
    declarations.push([match[1].slice(2), match[2].trim()]);
  }
  return declarations;
}

function resolveColor(name, tokens, depth = 0) {
  if (depth > 10) return null;
  const raw = tokens.get(name);
  if (!raw) return null;
  const reference = /^var\(\s*--([a-z0-9-]+)\s*\)$/i.exec(raw);
  if (reference) return resolveColor(reference[1], tokens, depth + 1);
  return parseColor(raw);
}

function parseColor(value) {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value);
  if (hex) {
    const digits =
      hex[1].length === 3
        ? hex[1]
            .split('')
            .map((digit) => digit + digit)
            .join('')
        : hex[1];
    return {
      r: Number.parseInt(digits.slice(0, 2), 16),
      g: Number.parseInt(digits.slice(2, 4), 16),
      b: Number.parseInt(digits.slice(4, 6), 16),
      a: 1,
    };
  }
  const rgba = /^rgba?\(([^)]+)\)$/i.exec(value);
  if (rgba) {
    const parts = rgba[1].split(',').map((part) => Number.parseFloat(part.trim()));
    if (parts.length < 3 || parts.some(Number.isNaN)) return null;
    return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
  }
  return null;
}

function composite(color, background) {
  if (color.a >= 1) return color;
  return {
    r: color.r * color.a + background.r * (1 - color.a),
    g: color.g * color.a + background.g * (1 - color.a),
    b: color.b * color.a + background.b * (1 - color.a),
    a: 1,
  };
}

function contrastRatio(foreground, background) {
  const lighter = Math.max(relativeLuminance(foreground), relativeLuminance(background));
  const darker = Math.min(relativeLuminance(foreground), relativeLuminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

function relativeLuminance({ r, g, b }) {
  const [red, green, blue] = [r, g, b].map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}
