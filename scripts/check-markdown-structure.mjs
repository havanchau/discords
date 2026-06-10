import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const maxMarkdownLines = Number.parseInt(process.env.MAX_MARKDOWN_LINES || '1000', 10);
const markdownFiles = execFileSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard', '*.md'],
  { encoding: 'utf8' },
)
  .split(/\r?\n/)
  .filter(Boolean)
  .sort((a, b) => a.localeCompare(b));

const findings = [];

for (const file of markdownFiles) {
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split(/\r\n|\r|\n/);
  const contentLines = text.length === 0 ? 0 : lines.length;

  if (contentLines > maxMarkdownLines) {
    addFinding(
      file,
      1,
      `has ${contentLines} lines, above the ${maxMarkdownLines}-line documentation limit`,
    );
  }

  checkFirstHeading(file, lines);
  checkHeadingHierarchy(file, lines);
  checkFenceBalance(file, lines);
  checkRelativeLinks(file, text);
}

if (findings.length > 0) {
  console.error('Markdown structure check failed:');
  for (const finding of findings) {
    console.error(`- ${finding.file}:${finding.line} ${finding.message}`);
  }
  process.exit(1);
}

console.log(`Checked ${markdownFiles.length} Markdown files. Structure looks good.`);

function checkFirstHeading(file, lines) {
  const firstContentIndex = lines.findIndex((line) => line.trim().length > 0);
  if (firstContentIndex === -1) {
    addFinding(file, 1, 'is empty');
    return;
  }

  if (!/^#\s+\S/.test(lines[firstContentIndex])) {
    addFinding(file, firstContentIndex + 1, 'must start with a single H1 heading');
  }
}

function checkHeadingHierarchy(file, lines) {
  let h1Count = 0;
  let previousLevel = 0;
  let inFence = false;

  lines.forEach((line, index) => {
    if (isFenceMarker(line)) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;

    const match = /^(#{1,6})\s+\S/.exec(line);
    if (!match) return;

    const level = match[1].length;
    if (level === 1) h1Count += 1;
    if (previousLevel > 0 && level > previousLevel + 1) {
      addFinding(file, index + 1, `heading jumps from H${previousLevel} to H${level}`);
    }
    previousLevel = level;
  });

  if (h1Count !== 1) {
    addFinding(file, 1, `must contain exactly one H1 heading, found ${h1Count}`);
  }
}

function checkFenceBalance(file, lines) {
  let fence = null;

  lines.forEach((line, index) => {
    const match = /^(\s*)(`{3,}|~{3,})/.exec(line);
    if (!match) return;

    const marker = match[2][0];
    const length = match[2].length;
    if (!fence) {
      fence = { marker, length, line: index + 1 };
      return;
    }

    if (marker === fence.marker && length >= fence.length) {
      fence = null;
    }
  });

  if (fence) {
    addFinding(file, fence.line, 'opens a fenced code block that is never closed');
  }
}

function checkRelativeLinks(file, text) {
  const searchableText = maskInlineCode(maskFencedCode(text));
  const linkPattern = /(?<!!)(?:\[[^\]\n]+\]\(([^)\n]+)\))/g;
  let match;
  while ((match = linkPattern.exec(searchableText))) {
    const rawTarget = match[1].trim();
    const target = rawTarget.replace(/^<|>$/g, '').split('#')[0].trim();
    if (!target || isExternalTarget(target)) continue;

    const decodedTarget = decodeURIComponent(target);
    const resolved = path.normalize(path.join(path.dirname(file), decodedTarget));
    if (resolved.startsWith('..') || path.isAbsolute(resolved)) {
      addFinding(
        file,
        lineForIndex(text, match.index),
        `links outside the repository: ${rawTarget}`,
      );
      continue;
    }
    if (!fs.existsSync(resolved)) {
      addFinding(file, lineForIndex(text, match.index), `links to missing file: ${rawTarget}`);
    }
  }
}

function maskInlineCode(text) {
  return text
    .replace(/<code>[\s\S]*?<\/code>/gi, (match) => match.replace(/\S/g, ' '))
    .replace(/`+[^`]*`+/g, (match) => match.replace(/\S/g, ' '));
}

function maskFencedCode(text) {
  let inFence = false;
  return text
    .split(/(\r\n|\r|\n)/)
    .map((part) => {
      if (part === '\n' || part === '\r' || part === '\r\n') return part;
      const marker = isFenceMarker(part);
      if (marker) {
        const masked = part.replace(/\S/g, ' ');
        inFence = !inFence;
        return masked;
      }
      return inFence ? part.replace(/\S/g, ' ') : part;
    })
    .join('');
}

function isFenceMarker(line) {
  return /^\s*(`{3,}|~{3,})/.test(line);
}

function isExternalTarget(target) {
  return /^(?:[a-z][a-z0-9+.-]*:|#)/i.test(target);
}

function lineForIndex(text, index) {
  return text.slice(0, index).split(/\r\n|\r|\n/).length;
}

function addFinding(file, line, message) {
  findings.push({ file, line, message });
}
