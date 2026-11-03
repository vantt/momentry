import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, stringify, needsQuote, FrontmatterError } from '../lib/frontmatter.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIX = path.join(HERE, 'fixtures');
const SAMPLE_DIR = path.resolve(HERE, '../docs/sample');
const storyFiles = (dir) => fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}-.+\.md$/.test(f)).sort();

test('parse scalars, lists, comments', () => {
  const md = '---\n# comment\n\ndate: 2026-01-01   # ngày\nn: 42\nneg: -3\ns: "a: b # c"\nbare: chat Claude, V15 (x), y#4\nl: [a, "b, c", 7]\ne: []\nq: ["x"] # tail\nempty:\n---\nBODY\n';
  const { data, body } = parse(md);
  assert.deepEqual(data, {
    date: '2026-01-01', n: 42, neg: -3, s: 'a: b # c', bare: 'chat Claude, V15 (x), y#4',
    l: ['a', 'b, c', 7], e: [], q: ['x'], empty: '',
  });
  assert.equal(body, 'BODY\n');
});

test('parse errors', () => {
  const bad = [
    'no frontmatter',
    '---\ndate: x\n',
    '---\nBad: x\n---\n',
    '---\na: "open\n---\n',
    '---\na: [x, y\n---\n',
    '---\na: [x] junk\n---\n',
    '---\na: "x" junk\n---\n',
    '---\na: [x, , y]\n---\n',
    '---\na: 1\na: 2\n---\n',
    '---\na: [x"y]\n---\n',
  ];
  for (const md of bad) assert.throws(() => parse(md), FrontmatterError, md);
});

test('stringify quoting rules', () => {
  for (const s of ['', 'a:b', 'a#b', 'a,b', '[x', 'x]', 'say "hi"', ' x', 'x ', '12', '0,5', '1.5']) assert.ok(needsQuote(s), s);
  for (const s of ['raw', 'nho_ma_to', '2026-01-01', 'chữ có dấu']) assert.ok(!needsQuote(s), s);
  const out = stringify({ hook: 'plain', source: 'chat', sides: ['a', 'b'], status: 'raw', n: 3, skip: null, l: ['x', 'y:z'] }, '\nB\n');
  assert.equal(out, '---\nhook: "plain"\nsource: "chat"\nsides: ["a", "b"]\nstatus: raw\nn: 3\nl: [x, "y:z"]\n---\n\nB\n');
  assert.throws(() => stringify({ x: 1.5 }));
  assert.throws(() => stringify({ x: true }));
  assert.throws(() => stringify({ Bad: 'x' }));
});

test('sides with comma inside quotes, hook with : and #', () => {
  const data = { hook: 'Lỗi: 8 lần # thật', sides: ['một, hai', 'ba'] };
  const md = stringify(data, '');
  assert.deepEqual(parse(md).data, data);
});

test('machine file round-trips byte for byte', () => {
  const md = fs.readFileSync(path.join(FIX, 'machine-story.md'), 'utf8');
  const { data, body } = parse(md);
  assert.equal(stringify(data, body), md);
  assert.equal(data.hook, 'Một byte: điểm tụt 8 lần # thật');
  assert.deepEqual(data.sides, ['một byte, vô hình', 'điểm tụt 8 lần']);
  assert.equal(data.strength, 3);
});

function roundTrip(dir) {
  for (const f of storyFiles(dir)) {
    const md = fs.readFileSync(path.join(dir, f), 'utf8');
    const a = parse(md);
    const b = parse(stringify(a.data, a.body));
    assert.deepEqual(b, a, f);
    const again = stringify(b.data, b.body);
    assert.equal(stringify(parse(again).data, parse(again).body), again, f);
  }
}

test('fixture box (8 fabricated stories): read, write, read gives same data', () => {
  assert.equal(storyFiles(path.join(FIX, 'box-sample')).length, 8);
  roundTrip(path.join(FIX, 'box-sample'));
  const { data } = parse(fs.readFileSync(path.join(FIX, 'box-sample', '2026-01-10-mot-dau-cach-thua.md'), 'utf8'));
  assert.equal(data.source, 'chat Claude, X1, PR demo/may-pha#7');
});

test('8 real sample stories parse to the expected data', { skip: !fs.existsSync(SAMPLE_DIR) && 'sample dir absent' }, () => {
  const files = storyFiles(SAMPLE_DIR);
  assert.equal(files.length, 8);
  for (const f of files) {
    const { data, body } = parse(fs.readFileSync(path.join(SAMPLE_DIR, f), 'utf8'));
    assert.deepEqual(Object.keys(data), ['date', 'status', 'signals', 'source', 'links', 'threads'], f);
    assert.equal(data.date, f.slice(0, 10));
    assert.equal(data.status, 'raw');
    for (const k of ['signals', 'links', 'threads']) assert.ok(Array.isArray(data[k]), `${f} ${k}`);
    assert.equal(typeof data.source, 'string');
    assert.match(body, /^\n# \S/);
  }
  const get = (id) => parse(fs.readFileSync(path.join(SAMPLE_DIR, `${id}.md`), 'utf8')).data;
  assert.equal(get('2026-11-02-mot-ky-tu-unicode').source, 'chat Claude, V15, PR vantt/obsidian-hybrid-search#4');
  assert.equal(get('2026-11-02-do-tim-kiem-tieng-viet').source, 'chat Claude, V15 (fork OHS), E12.9');
  assert.deepEqual(get('2026-11-02-pkill-tu-ban-minh'), { date: '2026-11-02', status: 'raw', signals: ['khác'], source: 'chat Claude, V15', links: [], threads: [] });
  assert.deepEqual(get('2026-11-03-may-soan-nguoi-duyet').signals, ['người duyệt thứ máy soạn', 'artefact nhìn được', 'ràng buộc định hình thiết kế']);
  assert.deepEqual(get('2026-11-03-hop-chua-sinh-ra-giua-chat').threads, ['nguoi-va-may', 'build-in-public']);
  roundTrip(SAMPLE_DIR);
});
