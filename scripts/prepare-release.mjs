#!/usr/bin/env node
// Prepares a release: checks the tree, bumps lib/version.mjs, moves CHANGELOG "Unreleased" under the new
// version, runs the tests, and prints the commit/tag/push commands for a human to run.
// Usage: node scripts/prepare-release.mjs <X.Y.Z> [--dry-run]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { VERSION, compareVersions } from '../lib/version.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const git = (...a) => execFileSync('git', ['-C', ROOT, ...a], { encoding: 'utf8' }).trim();
const die = (m, fix) => { console.error(`lỗi: ${m}${fix ? `\n  sửa: ${fix}` : ''}`); process.exit(1); };

const { values, positionals } = parseArgs({ options: { 'dry-run': { type: 'boolean' } }, allowPositionals: true });
const next = (positionals[0] ?? '').replace(/^v/, '');
if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(next)) { console.error('cách dùng: node scripts/prepare-release.mjs X.Y.Z [--dry-run]'); process.exit(2); }
if (compareVersions(next, VERSION) <= 0) die(`${next} không mới hơn ${VERSION}`);

if (git('status', '--porcelain', '--untracked-files=no')) die('cây làm việc chưa sạch', 'commit hoặc stash trước');
if (git('rev-parse', '--abbrev-ref', 'HEAD') !== 'main') die('không ở nhánh main', 'git switch main');
try { git('fetch', '--quiet', 'origin', 'main'); } catch { die('không fetch được origin', 'kiểm mạng / quyền'); }
if (git('rev-parse', 'HEAD') !== git('rev-parse', 'origin/main')) die('main khác origin/main', 'git pull --ff-only hoặc git push');
if (git('tag', '--list', `v${next}`)) die(`tag v${next} đã có`);

const verFile = path.join(ROOT, 'lib', 'version.mjs');
const clFile = path.join(ROOT, 'CHANGELOG.md');
const cl = fs.readFileSync(clFile, 'utf8');
if (!/^## \[Unreleased\]/m.test(cl)) die('CHANGELOG.md thiếu mục "## [Unreleased]"');
const today = new Date().toISOString().slice(0, 10);
const newCl = cl.replace(/^## \[Unreleased\]\n/m, `## [Unreleased]\n\n## [${next}] - ${today}\n`);
const newVer = fs.readFileSync(verFile, 'utf8').replace(/export const VERSION = '[^']*';/, `export const VERSION = '${next}';`);

if (values['dry-run']) {
  console.log(`dry-run: sẽ đổi lib/version.mjs ${VERSION} -> ${next}, thêm mục [${next}] - ${today} vào CHANGELOG.md, chạy test`);
  process.exit(0);
}
fs.writeFileSync(verFile, newVer);
fs.writeFileSync(clFile, newCl);
execFileSync(process.execPath, ['--test', ...fs.readdirSync(path.join(ROOT, 'test')).filter((f) => f.endsWith('.test.mjs')).map((f) => path.join(ROOT, 'test', f))], { stdio: 'inherit' });
console.log(`\nĐã chuẩn bị v${next}. Kiểm lại diff rồi chạy:\n  git commit -am "chore: release v${next}"\n  git tag v${next}\n  git push origin main v${next}`);
