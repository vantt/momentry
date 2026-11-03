import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { put, list, release } from '../lib/quarantine.mjs';
import { loadBlocklist, checkStory } from '../lib/privacy.mjs';
import { writeNew, readStory, readBox } from '../lib/box.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIX = path.join(HERE, 'fixtures', 'privacy');
const BIN = path.resolve(HERE, '../bin/momentry.mjs');
const VAULT = { type: 'vault-titles', path: path.join(FIX, 'vault') };
const bl = loadBlocklist([VAULT]);

function tmp() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'dm-q-'));
  return { cacheDir: path.join(base, 'cache'), box: path.join(base, 'box'), base };
}
const leaky = {
  id: '2026-11-02-gap-ban-cu',
  data: { date: '2026-11-02', status: 'raw', hook: 'Gặp bạn cũ', captured_by: 'harvest' },
  body: '# Gặp bạn cũ\n\n**Chuyện gì xảy ra:** Gọi cho Trần Thị Bích Ngọc.\n',
};

test('put writes a 0600 file in a 0700 dir outside the box, without terms', () => {
  const { cacheDir, box } = tmp();
  const v = checkStory(leaky, leaky.id, bl);
  assert.equal(v.length, 1);
  const file = put('my/repo', leaky, 'violation', { cacheDir, violations: v });
  assert.equal(path.dirname(file), path.join(cacheDir, 'quarantine', 'my_repo'));
  if (process.platform !== 'win32') { // Windows has no POSIX modes; the profile ACL keeps the cache private
    assert.equal(fs.statSync(path.dirname(file)).mode & 0o777, 0o700);
    assert.equal(fs.statSync(path.join(cacheDir, 'quarantine')).mode & 0o777, 0o700);
    assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  }
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.deepEqual(raw.violations, [{ field: 'body', kind: 'exact' }]);
  assert.equal(raw.storyId, leaky.id);
  assert.equal(readBox(box).length, 0);
  const again = put('my/repo', leaky, 'unchecked', { cacheDir });
  assert.equal(path.basename(again), `${leaky.id}-2.json`);
  assert.throws(() => put('r', leaky, 'other', { cacheDir }));
});

test('list returns held items oldest first; empty when none', () => {
  const { cacheDir } = tmp();
  assert.deepEqual(list('r', { cacheDir }), []);
  put('r', leaky, 'violation', { cacheDir });
  put('r', { ...leaky, id: '2026-11-02-khac' }, 'unchecked', { cacheDir });
  fs.writeFileSync(path.join(cacheDir, 'quarantine', 'r', 'broken.json'), '{');
  const items = list('r', { cacheDir });
  assert.deepEqual(items.map((i) => [i.id, i.reason]), [[leaky.id, 'violation'], ['2026-11-02-khac', 'unchecked']]);
  assert.equal(items[0].story.body, leaky.body);
  assert.deepEqual(list('other', { cacheDir }), []);
});

test('release keeps a still-leaking story held', () => {
  const { cacheDir, box } = tmp();
  put('r', leaky, 'violation', { cacheDir });
  const r = release('r', leaky.id, bl, { cacheDir, box });
  assert.equal(r.released, false);
  assert.equal(r.violations[0].field, 'body');
  assert.equal(list('r', { cacheDir }).length, 1);
  assert.equal(readBox(box).length, 0);
});

test('release of an unchecked story writes it with privacy: checked', () => {
  const { cacheDir, box } = tmp();
  const clean = { ...leaky, data: { ...leaky.data, privacy: 'unchecked' }, body: '# Gặp bạn cũ\n\n**Chuyện gì xảy ra:** Gọi điện.\n' };
  put('r', clean, 'unchecked', { cacheDir });
  const r = release('r', leaky.id, bl, { cacheDir, box });
  assert.equal(r.released, true);
  assert.equal(r.path, path.join(box, `${leaky.id}.md`));
  const s = readStory(box, leaky.id);
  assert.equal(s.data.privacy, 'checked');
  assert.equal(s.data.id, leaky.id);
  assert.deepEqual(list('r', { cacheDir }), []);
});

test('release picks a free id and checks it; allowlist applies', () => {
  const { cacheDir, box } = tmp();
  writeNew(box, { id: leaky.id, data: { date: '2026-11-02' }, body: '# cũ\n' });
  put('r', leaky, 'violation', { cacheDir });
  const r = release('r', leaky.id, bl, { cacheDir, box, allow: new Set(['Trần Thị Bích Ngọc']) });
  assert.equal(r.released, true);
  assert.equal(path.basename(r.path), `${leaky.id}-2.md`);
  assert.equal(readStory(box, leaky.id).body, '# cũ\n');
});

test('release of a held patch merges into the target only when clean', () => {
  const { cacheDir, box } = tmp();
  const target = '2026-11-01-chuyen-cu';
  writeNew(box, { id: target, data: { date: '2026-11-01', status: 'raw', lines: ['claude:aa#L1'], runs: 1, hits: 1 }, body: '# Cũ\n' });
  const patch = { append: { lines: ['claude:aa#L9'] }, add: { runs: 1 }, outsider: 'người ta hay nhờ Đặng Quốc Vĩnh' };
  put('r', { id: target, data: {}, body: '', patch, target }, 'violation', { cacheDir });
  let r = release('r', target, bl, { cacheDir, box });
  assert.equal(r.released, false);
  assert.equal(r.violations[0].field, 'append.outsider');
  assert.equal(readStory(box, target).data.runs, 1);

  const cleanPatch = { ...patch, outsider: 'người ta hay viết lại từ đầu' };
  put('r', { id: target, data: {}, body: '', patch: cleanPatch, target }, 'unchecked', { cacheDir });
  r = release('r', `${target}-2`, bl, { cacheDir, box });
  assert.equal(r.released, true);
  const s = readStory(box, target);
  assert.deepEqual(s.data.lines, ['claude:aa#L1', 'claude:aa#L9']);
  assert.equal(s.data.runs, 2);
  assert.match(s.body, /Góc người ngoài:\*\* người ta hay viết lại/);
});

test('release errors: null blocklist -> exitCode 3; unknown id; path tricks', () => {
  const { cacheDir, box } = tmp();
  assert.throws(() => release('r', leaky.id, null, { cacheDir, box }), (e) => e.exitCode === 3);
  assert.throws(() => release('r', 'nope', bl, { cacheDir, box }), /không có/);
  assert.throws(() => release('r', '../x', bl, { cacheDir, box }), /id sai/);
});

test('cli quarantine lists and releases', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'dm-qcli-'));
  const repo = path.join(base, 'repo');
  fs.mkdirSync(path.join(repo, '.git'), { recursive: true });
  const env = { PATH: process.env.PATH, HOME: path.join(base, 'home'), MOMENTRY_CACHE: path.join(base, 'cache'), MOMENTRY_CONFIG: path.join(base, 'u.json') };
  put('repo', leaky, 'violation', { cacheDir: env.MOMENTRY_CACHE });
  const run = (args, e = env) => spawnSync(process.execPath, [BIN, ...args], { cwd: repo, env: e, encoding: 'utf8' });
  let r = run(['quarantine']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, new RegExp(`${leaky.id}\\s+violation`));
  assert.equal(run(['quarantine', '--release', leaky.id]).status, 3);
  fs.writeFileSync(env.MOMENTRY_CONFIG, JSON.stringify({ privacy: { sources: [VAULT] } }));
  r = run(['quarantine', '--release', leaky.id]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /body: T… \(18\)/);
  assert.doesNotMatch(r.stderr, /Ngọc/);
});
