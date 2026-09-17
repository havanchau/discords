import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const webRoot = 'apps/web/src';
const catalogDir = path.join(webRoot, 'i18n');
const TRANSLATED_ATTRIBUTES = new Set([
  'title',
  'aria-label',
  'placeholder',
  'alt',
  'label',
  'aria-description',
]);

const findings = [];

const files = execFileSync(
  'git',
  [
    'ls-files',
    '--cached',
    '--others',
    '--exclude-standard',
    `${webRoot}/**/*.ts`,
    `${webRoot}/**/*.tsx`,
  ],
  {
    encoding: 'utf8',
  },
)
  .split(/\r?\n/)
  .filter(Boolean)
  .filter((file) => !file.startsWith(catalogDir));

for (const file of files) {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  // Only .tsx holds JSX; in .ts, `=> Promise<void>` and union types look like markup to a regex.
  const isComponentFile = file.endsWith('.tsx');
  let previous = '';
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (line.includes('i18n-ignore')) {
      previous = trimmed;
      return;
    }
    if (isComponentFile) {
      for (const text of jsxTextLiterals(line)) {
        findings.push({ file, line: index + 1, text, kind: 'jsx-text' });
      }
      // A JSX child on its own line: the element opened above and this line is prose.
      // `=>` also ends with '>', but what follows an arrow is an expression, not JSX text.
      if (previous.endsWith('>') && !previous.endsWith('=>') && isStandaloneCopy(trimmed)) {
        findings.push({ file, line: index + 1, text: trimmed, kind: 'jsx-text' });
      }
      for (const { attribute, text } of attributeLiterals(line)) {
        findings.push({ file, line: index + 1, text, kind: `attribute ${attribute}` });
      }
    } else {
      for (const text of copySinkLiterals(line)) {
        findings.push({ file, line: index + 1, text, kind: 'copy literal' });
      }
    }
    if (trimmed.length > 0) previous = trimmed;
  });
}

const catalogFindings = checkCatalogs();
const apiFindings = checkApiCatalogs();
const errorCodeFindings = checkErrorCodeMap();
report([...catalogFindings, ...apiFindings, ...errorCodeFindings, ...findings]);

function jsxTextLiterals(line) {
  const results = [];
  // Text sitting between a closing '>' and an opening '<' on the same line.
  const pattern = />([^<>{}]+)</g;
  let match;
  while ((match = pattern.exec(line)) !== null) {
    const text = match[1].trim();
    // `{a ? <X/> : <Y/>}` leaves fragments like ': hint ?' between tags; those are code, not copy.
    if (/^[:?]/.test(text) || / \? /.test(text) || /\?$/.test(text)) continue;
    // A single word between '>' and '<' is only copy when a tag actually closes on this line;
    // otherwise it is a type argument such as `=> Promise<void>`.
    if (!/\s/.test(text) && !line.includes('</')) continue;
    if (/[A-Za-z]{3}/.test(text) && !/^[A-Za-z]+\(\)$/.test(text)) results.push(text);
  }
  return results;
}

function attributeLiterals(line) {
  const results = [];
  const pattern = /\b([a-zA-Z-]+)=(?:"([^"]*)"|\{'([^']*)'\}|\{`([^`${}]*)`\})/g;
  let match;
  while ((match = pattern.exec(line)) !== null) {
    const attribute = match[1];
    if (!TRANSLATED_ATTRIBUTES.has(attribute)) continue;
    const text = (match[2] ?? match[3] ?? match[4] ?? '').trim();
    if (isCopy(text)) results.push({ attribute, text });
  }
  return results;
}

// Copy is prose: at least two words, and at least one of them longer than one letter.
function isCopy(text) {
  if (!/[A-Za-z]{2}/.test(text)) return false;
  if (!/\s/.test(text)) return false;
  if (/^[\d\s.,:;|/\\-]+$/.test(text)) return false;
  return true;
}

// A JSX child line is text by position, so a single word ('Save') counts as copy here.
// In plain .ts, copy only reaches the user through a known sink: a UI error/notice setter, or a
// `label`/`title`/`description`/`placeholder` field on an options object.
function copySinkLiterals(line) {
  const results = [];
  const pattern =
    /(?:set(?:WorkspaceError|WorkspaceNotice|Error|Notice|VerificationHint|Status)\(|(?:label|title|description|placeholder)\s*:\s*)'([^']{3,})'/g;
  let match;
  while ((match = pattern.exec(line)) !== null) {
    if (isCopy(match[1])) results.push(match[1]);
  }
  return results;
}

// A JSX child line is text by position, so a single word ('Save') counts as copy here.
function isStandaloneCopy(text) {
  if (/[<>{}=;()]/.test(text)) return false;
  if (text.startsWith('//') || text.startsWith('*') || text.startsWith('/*')) return false;
  if (text.startsWith(')') || text.startsWith(':') || text.includes('?')) return false;
  if (/[,:]$/.test(text)) return false;
  return /[A-Za-z]{3}/.test(text);
}

function checkCatalogs() {
  const en = readCatalog('en');
  const vi = readCatalog('vi');
  const problems = [...en.problems, ...vi.problems];

  for (const [key, where] of en.keys) {
    if (!vi.keys.has(key))
      problems.push({ file: where.file, line: where.line, text: key, kind: 'missing key in vi' });
  }
  for (const [key, where] of vi.keys) {
    if (!en.keys.has(key))
      problems.push({ file: where.file, line: where.line, text: key, kind: 'missing key in en' });
  }
  return problems;
}

// The API translates errors by looking the thrown English literal up in ERROR_MESSAGE_CODES. An
// edited literal would silently fall back to English, so every mapped literal must still exist.
function checkErrorCodeMap() {
  const mapFile = 'apps/api/src/common/i18n/error-codes.ts';
  if (!fs.existsSync(mapFile)) return [];

  const sources = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', 'apps/api/src/**/*.ts'],
    { encoding: 'utf8' },
  )
    .split(/\r?\n/)
    .filter(Boolean)
    .filter((file) => !file.startsWith('apps/api/src/common/i18n/'))
    .map((file) => fs.readFileSync(file, 'utf8'))
    .join('\n');

  const problems = [];
  const mapText = fs.readFileSync(mapFile, 'utf8');
  const lines = mapText.split(/\r?\n/);
  lines.forEach((line, index) => {
    const match = /^\s*'((?:[^'\\]|\\')+)': '[A-Z0-9_]+',$/.exec(line);
    if (!match) return;
    const literal = match[1].replace(/\\'/g, "'");
    if (!sources.includes(literal)) {
      problems.push({
        file: mapFile,
        line: index + 1,
        text: literal,
        kind: 'error literal no longer thrown',
      });
    }
  });
  return problems;
}

function checkApiCatalogs() {
  const en = readApiCatalogKeys('en');
  const vi = readApiCatalogKeys('vi');
  const problems = [];
  for (const key of en) {
    if (!vi.has(key)) {
      problems.push({
        file: 'apps/api/src/common/i18n/locales/vi.ts',
        line: 1,
        text: key,
        kind: 'missing key',
      });
    }
  }
  for (const key of vi) {
    if (!en.has(key)) {
      problems.push({
        file: 'apps/api/src/common/i18n/locales/en.ts',
        line: 1,
        text: key,
        kind: 'missing key',
      });
    }
  }
  return problems;
}

function readApiCatalogKeys(locale) {
  const file = `apps/api/src/common/i18n/locales/${locale}.ts`;
  if (!fs.existsSync(file)) return new Set();
  const keys = new Set();
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    // Prettier moves a long value to the next line, leaving the key alone on its line.
    const match = /^\s*'?([A-Za-z0-9_.]+)'?:\s*(?:'|$)/.exec(line);
    if (match) keys.add(match[1]);
  }
  return keys;
}

// Each locale is a folder of per-area modules merged by its index.ts. A later spread silently wins
// over an earlier one, so a key defined in two modules is reported, as is a module index.ts skips.
function readCatalog(locale) {
  const dir = path.join(catalogDir, 'locales', locale);
  const keys = new Map();
  const problems = [];
  if (!fs.existsSync(dir)) return { keys, problems };
  const indexFile = path.join(dir, 'index.ts');
  const indexText = fs.existsSync(indexFile) ? fs.readFileSync(indexFile, 'utf8') : '';
  const modules = fs
    .readdirSync(dir)
    .filter((name) => name.endsWith('.ts') && name !== 'index.ts')
    .sort();
  for (const name of modules) {
    const file = path.join(dir, name);
    if (!indexText.includes(`from './${name.slice(0, -'.ts'.length)}';`)) {
      problems.push({ file: indexFile, line: 1, text: name, kind: 'module not merged' });
    }
    fs.readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .forEach((line, index) => {
        const match = /^\s*'([^']+)':/.exec(line);
        if (!match) return;
        const previous = keys.get(match[1]);
        if (previous) {
          problems.push({
            file,
            line: index + 1,
            text: `${match[1]} (also ${previous.file}:${previous.line})`,
            kind: 'duplicate key',
          });
          return;
        }
        keys.set(match[1], { file, line: index + 1 });
      });
  }
  return { keys, problems };
}

function report(problems) {
  if (problems.length === 0) {
    console.log(`Checked ${files.length} web source files. No untranslated copy found.`);
    return;
  }

  console.error('i18n check failed:');
  for (const problem of problems) {
    console.error(`- ${problem.file}:${problem.line} [${problem.kind}] ${problem.text}`);
  }
  console.error(`${problems.length} findings.`);
  process.exit(1);
}
