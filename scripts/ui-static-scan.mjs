import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const scannedExtensions = new Set(['.css', '.html', '.js', '.jsx', '.mjs', '.ts', '.tsx']);
const ignoredPathParts = ['/dist/', '/build/', '/coverage/', '/node_modules/'];
const forbiddenPatterns = [
  {
    name: 'forbidden neon cyan',
    pattern: /#00e5ff|rgba\(\s*0\s*,\s*229\s*,\s*255\s*,/i
  },
  {
    name: 'forbidden neon pink',
    pattern: /#ff1fb8/i
  },
  {
    name: 'forbidden neon green or lime',
    pattern: /#00ff95|#3cffb0/i
  },
  {
    name: 'forbidden neon violet',
    pattern: /#8f78ff/i
  },
  {
    name: 'forbidden neon amber',
    pattern: /#ffb000/i
  },
  {
    name: 'panel or shell gradient',
    pattern:
      /\.(?:app-shell|server-rail|channel-sidebar|workspace-sidebar|chat-panel|chat-area|member-sidebar|sidebar|shell)[\s\S]{0,500}(?:linear-gradient|radial-gradient)\(/i
  },
  {
    name: 'colored glow shadow',
    pattern: /box-shadow\s*:[^;\n]*(?:rgba\(\s*(?!0\s*,\s*0\s*,\s*0)[^)]+\)|#(?:[0-9a-f]{3}){1,2})/i
  }
];

const files = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
  .split(/\r?\n/)
  .filter(Boolean)
  .filter((file) => file !== 'scripts/ui-static-scan.mjs')
  .filter((file) => scannedExtensions.has(extensionOf(file)))
  .filter((file) => !ignoredPathParts.some((part) => file.includes(part)));

const findings = [];

for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  for (const rule of forbiddenPatterns) {
    const match = rule.pattern.exec(text);
    if (!match) continue;
    findings.push({
      file,
      line: lineForIndex(text, match.index),
      rule: rule.name,
      sample: firstLine(match[0])
    });
  }
}

if (findings.length > 0) {
  console.error('Static UI scan failed:');
  for (const finding of findings) {
    console.error(`- ${finding.file}:${finding.line} ${finding.rule} (${finding.sample})`);
  }
  process.exit(1);
}

console.log(`Scanned ${files.length} UI source files. No forbidden UI patterns found.`);

function extensionOf(file) {
  const index = file.lastIndexOf('.');
  return index === -1 ? '' : file.slice(index);
}

function lineForIndex(text, index) {
  return text.slice(0, index).split(/\r\n|\r|\n/).length;
}

function firstLine(text) {
  return text.split(/\r?\n/)[0].trim().slice(0, 120);
}
