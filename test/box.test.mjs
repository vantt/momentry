import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readBox, readStory, writeNew, mergeInto, uniqueId, storiesOfSession, checkBox, whatHappened, titleOf } from '../lib/box.mjs';
import { parse } from '../lib/frontmatter.mjs';

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'dm-box-'));
const copyBox = () => { const d = tmp(); fs.cpSync(path.join(FIX, 'box-sample'), d, { recursive: true }); return d; };

const newStory = (id, extra = {}) => ({
  id,
  data: { date: id.slice(0, 10), repo: 'demo', status: 'raw', signals: ['khác'], source: 'chat Claude, claude:aaaa1111', sessions: ['claude:aaaa1111'], captured_by: 'harvest', hit_by: ['harvest'], lines: ['claude:aaaa1111#L5'], hits: 1, runs: 1, privacy: 'checked', links: [], threads: [], ...extra },
  body: '\n# Tiêu đề bịa\n\n**Chuyện gì xảy ra:** một việc bịa.\n',
});

test('readBox ignores README and reads 8 fixture stories', () => {
  const s = readBox(path.join(FIX, 'box-sample'));
  assert.equal(s.length, 8);
  assert.ok(s.every((x) => x.error === null));
  assert.equal(readBox(path.join(FIX, 'nope')).length, 0);
});

test('checkBox is clean on fixture box', () => {
  assert.deepEqual(checkBox(readBox(path.join(FIX, 'box-sample'))), []);
});

test('checkBox reports id mismatch, broken link, bad enums, hits > runs, parse error', () => {
  const d = copyBox();
  writeNew(d, newStory('2026-01-12-chuyen-moi', { tension: 'la', strength: 5, hits: 3, runs: 1, links: ['2026-01-01-khong-co'] }));
  fs.writeFileSync(path.join(d, '2026-01-12-sai-id.md'), '---\nid: 2026-01-12-khac\ndate: 2026-01-12\nstatus: raw\n---\n');
  fs.writeFileSync(path.join(d, '2026-01-12-hong.md'), '---\ndate 2026\n---\n');
  fs.writeFileSync(path.join(d, '2026-01-12-thieu.md'), '---\nstatus: lạ\nlinks: x\n---\n');
  const errs = checkBox(readBox(d));
  const has = (file, field, re) => assert.ok(errs.some((e) => e.file === file && e.field === field && re.test(e.msg)), `${file} ${field}`);
  has('2026-01-12-chuyen-moi.md', 'tension', /lạ/);
  has('2026-01-12-chuyen-moi.md', 'strength', /0-3/);
  has('2026-01-12-chuyen-moi.md', 'hits', /> runs/);
  has('2026-01-12-chuyen-moi.md', 'links', /gãy/);
  has('2026-01-12-sai-id.md', 'id', /khác tên file/);
  has('2026-01-12-hong.md', '-', /frontmatter hỏng/);
  has('2026-01-12-thieu.md', 'date', /thiếu/);
  has('2026-01-12-thieu.md', 'status', /lạ/);
  has('2026-01-12-thieu.md', 'links', /danh sách/);
  const only = checkBox(readBox(d), new Set(['2026-01-12-sai-id']));
  assert.ok(only.every((e) => e.file === '2026-01-12-sai-id.md'));
});

test('writeNew puts id first, never overwrites; uniqueId adds -2', () => {
  const d = tmp();
  const p = writeNew(d, newStory('2026-01-12-chuyen'));
  const { data } = parse(fs.readFileSync(p, 'utf8'));
  assert.equal(Object.keys(data)[0], 'id');
  assert.equal(data.id, '2026-01-12-chuyen');
  assert.throws(() => writeNew(d, newStory('2026-01-12-chuyen')), { code: 'EEXIST' });
  assert.equal(uniqueId(d, '2026-01-12-chuyen'), '2026-01-12-chuyen-2');
  assert.equal(uniqueId(d, '2026-01-12-chuyen', new Set(['2026-01-12-chuyen-2'])), '2026-01-12-chuyen-3');
  assert.throws(() => writeNew(d, newStory('bad id')));
  assert.deepEqual(fs.readdirSync(d), ['2026-01-12-chuyen.md']);
});

test('mergeInto appends lists, bumps runs/hits, adds outsider once, idempotent', () => {
  const d = tmp();
  writeNew(d, newStory('2026-01-12-chuyen'));
  const patch = {
    append: { sessions: ['claude:bbbb2222'], lines: ['claude:aaaa1111#L5', 'claude:bbbb2222#L9'], hit_by: ['outsider'], signals: ['khác'] },
    add: { runs: 1, hits: 1 },
    set: { hook: 'Hook bịa', tension: 'none', strength: 0, stakes: 1, status: 'dropped', links: ['x'] },
    outsider: 'cách làm phổ biến là bịa.',
  };
  const r = mergeInto(d, '2026-01-12-chuyen', patch);
  assert.ok(r.changed);
  const s = readStory(d, '2026-01-12-chuyen');
  assert.deepEqual(s.data.sessions, ['claude:aaaa1111', 'claude:bbbb2222']);
  assert.deepEqual(s.data.lines, ['claude:aaaa1111#L5', 'claude:bbbb2222#L9']);
  assert.deepEqual(s.data.hit_by, ['harvest', 'outsider']);
  assert.deepEqual(s.data.signals, ['khác']);
  assert.equal(s.data.runs, 2);
  assert.equal(s.data.hits, 2);
  assert.equal(s.data.hook, 'Hook bịa');
  assert.equal(s.data.status, 'raw');
  assert.deepEqual(s.data.links, []);
  assert.match(s.body, /\*\*Góc người ngoài:\*\* cách làm phổ biến là bịa\.\n$/);

  const before = fs.readFileSync(s.path, 'utf8');
  const again = mergeInto(d, '2026-01-12-chuyen', { append: patch.append, outsider: 'khác' });
  assert.equal(again.changed, false);
  assert.equal(fs.readFileSync(s.path, 'utf8'), before);
});

test('mergeInto leaves machine fields alone when status is not raw', () => {
  const d = tmp();
  writeNew(d, newStory('2026-01-12-da-chon', { status: 'picked', hook: 'cũ', stakes: 1 }));
  mergeInto(d, '2026-01-12-da-chon', { append: { lines: ['claude:aaaa1111#L7'] }, add: { runs: 1, hits: 1 }, set: { hook: 'mới', stakes: 3 } });
  const s = readStory(d, '2026-01-12-da-chon');
  assert.equal(s.data.hook, 'cũ');
  assert.equal(s.data.stakes, 1);
  assert.equal(s.data.runs, 1);
  assert.equal(s.data.hits, 1);
  assert.deepEqual(s.data.lines, ['claude:aaaa1111#L5', 'claude:aaaa1111#L7']);
});

test('storiesOfSession, whatHappened, titleOf', () => {
  const d = copyBox();
  writeNew(d, newStory('2026-01-12-chuyen'));
  assert.deepEqual(storiesOfSession(d, 'claude:aaaa1111').map((s) => s.id), ['2026-01-12-chuyen']);
  const s = readStory(d, '2026-01-10-mot-dau-cach-thua');
  assert.equal(titleOf(s.body), 'Một dấu cách thừa làm máy pha dừng hẳn');
  assert.match(whatHappened(s.body), /^Một dấu cách ở cuối tên.*10 phút\.$/);
});
