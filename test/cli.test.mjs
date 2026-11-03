import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BIN = path.resolve(HERE, '../bin/momentry.mjs');
const FIX = path.join(HERE, 'fixtures');
const SAMPLE_DIR = path.resolve(HERE, '../docs/sample');

function sandbox() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'dm-cli-'));
  const repo = path.join(base, 'repo');
  fs.mkdirSync(path.join(repo, '.git'), { recursive: true });
  const env = {
    PATH: process.env.PATH, HOME: path.join(base, 'home'),
    MOMENTRY_CACHE: path.join(base, 'cache'), MOMENTRY_CONFIG: path.join(base, 'none.json'),
  };
  return { base, repo, env };
}

function run(args, { cwd, env, input = '' }) {
  const r = spawnSync(process.execPath, [BIN, ...args], { cwd, env, input, encoding: 'utf8' });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

const copyTo = (src, dst) => {
  fs.mkdirSync(dst, { recursive: true });
  for (const f of fs.readdirSync(src)) if (f.endsWith('.md')) fs.copyFileSync(path.join(src, f), path.join(dst, f));
  return dst;
};

test('init: creates repo file and box, needs privacy sources to be ready, idempotent; outside git exits 1', () => {
  const { base, repo, env } = sandbox();
  const e = { ...env, PATH: `${path.join(FIX, 'fake-claude')}${path.delimiter}${env.PATH}` };
  let r = run(['init', '--no-connect'], { cwd: repo, env: e });
  assert.equal(r.code, 1, r.err);
  assert.equal(fs.readFileSync(path.join(repo, '.momentry.json'), 'utf8'), '{}\n');
  assert.ok(fs.existsSync(path.join(repo, 'docs/storytelling-material')));
  assert.match(r.out, /sửa: momentry config privacy-add/);
  const names = path.join(base, 'names.txt');
  fs.writeFileSync(names, 'Trần Thị Bích Ngọc\n');
  fs.writeFileSync(env.MOMENTRY_CONFIG, JSON.stringify({ privacy: { sources: [{ type: 'lines', path: names }] } }));
  r = run(['init', '--no-connect', '--json'], { cwd: repo, env: e });
  assert.equal(r.code, 0, r.out);
  const j = JSON.parse(r.out);
  assert.equal(j.ok, true);
  assert.deepEqual(j.next, ['momentry scan --max-sessions 1']);
  fs.writeFileSync(path.join(repo, '.momentry.json'), '{"box":"docs/storytelling-material"}');
  r = run(['init', '--no-connect'], { cwd: repo, env: e });
  assert.equal(r.code, 0);
  assert.match(r.out, /không có gì phải làm[\s\S]*✓ Sẵn sàng/);
  assert.equal(fs.readFileSync(path.join(repo, '.momentry.json'), 'utf8'), '{"box":"docs/storytelling-material"}');
  fs.mkdirSync(path.join(base, 'plain'));
  assert.equal(run(['init', '--no-connect'], { cwd: path.join(base, 'plain'), env: e }).code, 1);
});

test('check on fixture box: shape clean, privacy unchecked -> 3', () => {
  const { repo, env } = sandbox();
  copyTo(path.join(FIX, 'box-sample'), path.join(repo, 'docs/storytelling-material'));
  const r = run(['check'], { cwd: repo, env });
  assert.equal(r.code, 3, r.err);
  assert.match(r.err, /8 chuyện, khuôn sạch; bỏ qua kiểm riêng tư/);
  assert.equal(r.out, '');
});

test('check on a copy of the 8 real sample stories is shape-clean', { skip: !fs.existsSync(SAMPLE_DIR) && 'sample dir absent' }, () => {
  const { base, env } = sandbox();
  const box = copyTo(SAMPLE_DIR, path.join(base, 'box'));
  const r = run(['check', '--box', box], { cwd: base, env });
  assert.equal(r.code, 3, r.err);
  assert.match(r.err, /^check: 8 chuyện, khuôn sạch; bỏ qua kiểm riêng tư/m);
  assert.doesNotMatch(r.err, /\.md: /);
});

test('check reports broken link and bad id with exit 1', () => {
  const { base, env } = sandbox();
  const box = copyTo(path.join(FIX, 'box-sample'), path.join(base, 'box'));
  fs.writeFileSync(path.join(box, '2026-01-12-gay.md'), '---\nid: 2026-01-12-khac\ndate: 2026-01-12\nstatus: raw\nlinks: [2026-01-01-mat-tich]\n---\n');
  const r = run(['check', '--box', box], { cwd: base, env });
  assert.equal(r.code, 1);
  assert.match(r.err, /2026-01-12-gay\.md: links: link gãy: 2026-01-01-mat-tich/);
  assert.match(r.err, /2026-01-12-gay\.md: id: /);
});

test('check: missing box exits 1', () => {
  const { base, env } = sandbox();
  assert.equal(run(['check', '--box', path.join(base, 'nope')], { cwd: base, env }).code, 1);
});

test('list: table, filters, json', () => {
  const { base, env } = sandbox();
  const box = copyTo(path.join(FIX, 'box-sample'), path.join(base, 'box'));
  let r = run(['list', '--box', box], { cwd: base, env });
  assert.equal(r.code, 0, r.err);
  const lines = r.out.trim().split('\n');
  assert.equal(lines.length, 9);
  assert.match(lines[0], /^id\s+date\s+status\s+hook\s+tension\s+stakes\s+strength\s+hits$/);
  r = run(['list', '--box', box, '--status', 'picked', '--json'], { cwd: base, env });
  assert.deepEqual(JSON.parse(r.out).data.map((x) => x.id), ['2026-01-10-bang-tra-lam-cham-hon']);
  r = run(['list', '--box', box, '--thread', 'nguoi-va-may', '--json'], { cwd: base, env });
  assert.equal(JSON.parse(r.out).data.length, 3);
});

test('no arguments prints task-ordered help; usage errors exit 2 with a hint', () => {
  const { base, env } = sandbox();
  const h = run([], { cwd: base, env });
  assert.equal(h.code, 0);
  assert.match(h.out, /1\. momentry init[\s\S]*Agents/);
  const u = run(['lisst'], { cwd: base, env });
  assert.equal(u.code, 2);
  assert.match(u.err, /ý bạn là "momentry list"/);
  assert.equal(run(['list', '--bogus'], { cwd: base, env }).code, 2);
  assert.equal(run(['harvest', '--runs', 'x', '--session', 's'], { cwd: base, env }).code, 2);
  const j = run(['nope', '--json'], { cwd: base, env });
  assert.equal(j.code, 2);
  assert.deepEqual(Object.keys(JSON.parse(j.out)), ['schema', 'ok', 'data', 'error', 'next']);
  assert.equal(JSON.parse(j.out).ok, false);
});

test('harvest needs an observed repo', () => {
  const { repo, env } = sandbox();
  const r = run(['harvest', '--session', 'claude:00000000'], { cwd: repo, env });
  assert.equal(r.code, 1);
  assert.match(r.err, /không được quan sát/);
});

test('hook: always exit 0, never prints to stdout', () => {
  const { repo, env } = sandbox();
  for (const input of ['', 'not json', '{"cwd":"/nowhere"}']) {
    const r = run(['hook', 'pre-compact'], { cwd: repo, env, input });
    assert.equal(r.code, 0);
    assert.equal(r.out, '');
  }
  const r = run(['hook', 'pre-compact'], { cwd: repo, env: { ...env, STORY_HARVEST: '1' }, input: '{}' });
  assert.equal(r.code, 0);
  assert.equal(r.out, '');
  assert.ok(!fs.existsSync(path.join(env.MOMENTRY_CACHE, 'never')));
});
