import { readdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const DIST_DIR = fileURLToPath(new URL('../dist/', import.meta.url));
const TEXT_EXTENSIONS = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg', '.txt', '.map']);

const privateIpPattern = /\b(?:(?:10)\.(?:\d{1,3})\.(?:\d{1,3})\.(?:\d{1,3})|(?:172)\.(?:1[6-9]|2\d|3[01])\.(?:\d{1,3})\.(?:\d{1,3})|(?:192)\.168\.(?:\d{1,3})\.(?:\d{1,3})|(?:127)\.(?:\d{1,3})\.(?:\d{1,3})\.(?:\d{1,3}))\b/g;
const privateCidrPattern = /\b(?:(?:10)\.(?:\d{1,3})\.(?:\d{1,3})\.0|(?:172)\.(?:1[6-9]|2\d|3[01])\.(?:\d{1,3})\.0|(?:192)\.168\.(?:\d{1,3})\.0|(?:127)\.(?:\d{1,3})\.(?:\d{1,3})\.0)\/(?:\d{1,2})\b/g;
const privatePrefixPattern = /\b(?:(?:10)\.(?:\d{1,3})\.(?:\d{1,3})\.|(?:172)\.(?:1[6-9]|2\d|3[01])\.(?:\d{1,3})\.|(?:192)\.168\.(?:\d{1,3})\.|(?:127)\.(?:\d{1,3})\.(?:\d{1,3})\.)/g;

function extensionOf(path) {
  const lastDot = path.lastIndexOf('.');
  return lastDot === -1 ? '' : path.slice(lastDot);
}

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFiles(absolute));
    } else if (TEXT_EXTENSIONS.has(extensionOf(entry.name))) {
      files.push(absolute);
    }
  }
  return files;
}

function sanitize(text) {
  return text
    .replace(privateCidrPattern, 'private-cidr-redacted')
    .replace(privateIpPattern, 'private-ip-redacted')
    .replace(privatePrefixPattern, 'private-ip-prefix-redacted.');
}

const files = await listFiles(DIST_DIR);
let changed = 0;

for (const file of files) {
  const before = await readFile(file, 'utf8');
  const after = sanitize(before);
  if (after !== before) {
    await writeFile(file, after);
    changed += 1;
  }
}

console.log(`[sanitize-public-build] sanitized ${changed} public artifact(s)`);
