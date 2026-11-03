#!/usr/bin/env node
// Prints the CHANGELOG.md section of one version (release notes). Usage: node scripts/changelog-section.mjs v0.1.0
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Body of the `## [X.Y.Z]` section, or '' when absent. @param {string} text @param {string} version */
export function section(text, version) {
  const v = version.replace(/^v/, '');
  const parts = text.split(/^## /m);
  const hit = parts.find((s) => s.startsWith(`[${v}]`) || s.startsWith(`${v} `) || s.startsWith(`v${v}`));
  return hit ? hit.split('\n').slice(1).join('\n').trim() : '';
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const v = process.argv[2];
  if (!v) { console.error('cách dùng: node scripts/changelog-section.mjs vX.Y.Z'); process.exit(2); }
  const body = section(fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8'), v);
  if (!body) { console.error(`CHANGELOG.md không có mục ${v}`); process.exit(1); }
  console.log(body);
}
