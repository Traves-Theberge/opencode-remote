import { existsSync, statSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();

function collectMarkdownFiles(dir) {
  const abs = path.resolve(root, dir);
  if (!existsSync(abs)) {
    return [];
  }

  const out = [];
  const stack = [abs];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const next = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(next);
        continue;
      }
      if (entry.isFile() && next.endsWith('.md')) {
        out.push(path.relative(root, next));
      }
    }
  }

  return out.sort();
}

const filesToScan = [
  'README.md',
  'docs/README.md',
  'docs/ARCHITECTURE.md',
  'docs/COMMAND_MODEL.md',
  'docs/DATA_MODELS.md',
  'docs/DATABASE_SCHEMA.md',
  'docs/ERD.md',
  'docs/ONBOARDING.md',
  'docs/OPERATIONS.md',
  ...collectMarkdownFiles('docs/wiki'),
];

const failures = [];

function isLocalDocRef(ref) {
  return ref.startsWith('docs/') || ref === 'CHANGELOG.md';
}

function validateRef(ownerFile, ref) {
  if (ref.includes('*')) {
    return;
  }

  if (!isLocalDocRef(ref)) {
    return;
  }

  const candidate = path.resolve(root, ref);
  if (!existsSync(candidate)) {
    failures.push(`${ownerFile}: missing path ${ref}`);
    return;
  }

  if (ref.endsWith('/')) {
    const stat = statSync(candidate);
    if (!stat.isDirectory()) {
      failures.push(`${ownerFile}: expected directory ${ref}`);
    }
  }
}

for (const relativeFile of filesToScan) {
  const abs = path.resolve(root, relativeFile);
  if (!existsSync(abs)) {
    failures.push(`missing scan source ${relativeFile}`);
    continue;
  }

  const content = readFileSync(abs, 'utf8');
  const matches = content.matchAll(/`([^`]+)`/g);
  for (const match of matches) {
    const ref = String(match[1] || '').trim();
    if (!ref) {
      continue;
    }
    validateRef(relativeFile, ref);
  }
}

if (failures.length > 0) {
  console.error('Documentation link/path check failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('Documentation link/path check passed.');
