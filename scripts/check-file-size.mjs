import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const maxLines = Number.parseInt(process.env.MAX_SOURCE_LINES || '1000', 10);
const sourceExtensions = new Set([
  '.cjs',
  '.css',
  '.html',
  '.js',
  '.jsx',
  '.mjs',
  '.prisma',
  '.ts',
  '.tsx'
]);

const ignoredPathParts = [
  '/dist/',
  '/build/',
  '/coverage/',
  '/node_modules/',
  '/.prisma/',
  '/generated/'
];

const files = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
  .split(/\r?\n/)
  .filter(Boolean)
  .filter((file) => sourceExtensions.has(extensionOf(file)))
  .filter((file) => !ignoredPathParts.some((part) => file.includes(part)));

const oversized = files
  .map((file) => ({ file, lines: countLines(file) }))
  .filter(({ lines }) => lines > maxLines)
  .sort((a, b) => b.lines - a.lines || a.file.localeCompare(b.file));

if (oversized.length > 0) {
  console.error(`Source files over ${maxLines} lines:`);
  for (const { file, lines } of oversized) {
    console.error(`- ${file}: ${lines}`);
  }
  process.exit(1);
}

console.log(`Checked ${files.length} source files. No files exceed ${maxLines} lines.`);

function extensionOf(file) {
  const index = file.lastIndexOf('.');
  return index === -1 ? '' : file.slice(index);
}

function countLines(file) {
  const text = fs.readFileSync(file, 'utf8');
  if (text.length === 0) return 0;
  return text.split(/\r\n|\r|\n/).length;
}
