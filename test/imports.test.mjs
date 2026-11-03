import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = fs.readdirSync(ROOT, { recursive: true })
  .filter((f) => f.endsWith('.mjs') && !f.split(path.sep).some((p) => p === 'fixtures' || p === 'docs'))
  .map((f) => path.join(ROOT, f));

const SPEC_RE = [
  /\bimport\s+(?:[\w*{}\s,]+\s+from\s+)?['"]([^'"]+)['"]/g,
  /\bexport\s+[\w*{}\s,]+\s+from\s+['"]([^'"]+)['"]/g,
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
];

test('every import is node: or relative', () => {
  assert.ok(files.length > 20);
  const bad = [];
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    for (const re of SPEC_RE) {
      for (const m of src.matchAll(re)) {
        if (!m[1].startsWith('node:') && !m[1].startsWith('./') && !m[1].startsWith('../')) bad.push(`${path.relative(ROOT, f)}: ${m[1]}`);
      }
    }
  }
  assert.deepEqual(bad, []);
});

test('no package.json, no node_modules', () => {
  assert.ok(!fs.existsSync(path.join(ROOT, 'package.json')));
  assert.ok(!fs.existsSync(path.join(ROOT, 'node_modules')));
});

test('every module loads', async () => {
  for (const f of files.filter((f) => !f.includes(`${path.sep}test${path.sep}`))) {
    if (f.endsWith(path.join('bin', 'momentry.mjs'))) continue;
    await import(f);
  }
});
