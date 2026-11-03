// Review fixes: explicit windows vs ledger, cluster fallback by line overlap, dead chunks, scan budget,
// hook stdin that never closes, log without content, privacy label on unchecked merges.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { PassThrough } from 'node:stream';
import { fileURLToPath } from 'node:url';
import * as L from '../lib/ledger.mjs';
import { fallback } from '../lib/cluster.mjs';
import { readStdin, handleHook } from '../lib/hook.mjs';
import { sanitize } from '../lib/log.mjs';
import { writeNew, mergeInto, readStory } from '../lib/box.mjs';
import { put, release } from '../lib/quarantine.mjs';
import { readEntries } from '../lib/sources/claude.mjs';
import { chunk } from '../lib/reduce.mjs';
import { detect } from '../lib/hotspots.mjs';
import { encodeProjectDir } from '../lib/sources/claude.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BIN = path.resolve(HERE, '../bin/momentry.mjs');
const FIX = path.join(HERE, 'fixtures', 'pipeline');
const VAULT = path.join(HERE, 'fixtures', 'privacy', 'vault');
const UUID = '5e5510aa-0000-4000-8000-000000000001';
const SID = 'claude:5e5510aa';
const MINI = fs.readFileSync(path.join(FIX, 'claude-mini.jsonl'), 'utf8').trimEnd().split('\n');
const tmp = () => fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'dm-rob-')));
const ok = (o) => JSON.stringify({ type: 'result', is_error: false, total_cost_usd: 0.01, result: JSON.stringify(o) });

function setup() {
  const base = tmp();
  const repo = path.join(base, 'repo');
  fs.mkdirSync(path.join(repo, '.git'), { recursive: true });
  fs.writeFileSync(path.join(repo, '.momentry.json'), '{}');
  const tr = path.join(base, `${UUID}.jsonl`);
  const env = {
    PATH: process.env.PATH, HOME: path.join(base, 'home'), USERPROFILE: path.join(base, 'home'), TZ: 'UTC',
    MOMENTRY_CACHE: path.join(base, 'cache'), MOMENTRY_CONFIG: path.join(base, 'none.json'),
    MOMENTRY_PRIVACY_SOURCES: JSON.stringify([{ type: 'vault-titles', path: VAULT }]),
  };
  return {
    base, repo, tr, env, box: path.join(repo, 'docs', 'storytelling-material'), cache: env.MOMENTRY_CACHE,
    write(n, file = tr) { fs.writeFileSync(file, MINI.slice(0, n).map((l) => l.replaceAll('__REPO__', JSON.stringify(repo).slice(1, -1))).join('\n') + '\n'); },
    run(args, extra = {}) {
      const r = spawnSync(process.execPath, [BIN, ...args], { cwd: repo, env: { ...env, ...extra }, encoding: 'utf8' });
      return { code: r.status, out: r.stdout, err: r.stderr };
    },
    harvest(set, ...more) { return this.run(['harvest', '--transcript', tr, '--fake-llm', path.join(FIX, set), ...more]); },
    stories() { try { return fs.readdirSync(this.box).filter((f) => f.endsWith('.md')).sort(); } catch { return []; } },
    ledger(sid = SID) { return JSON.parse(fs.readFileSync(path.join(this.cache, 'ledger.json'), 'utf8')).sessions[sid]; },
  };
}

// ---------- ledger ----------

const info = { source: 'claude', transcriptPath: '/x', repoRoot: '/r', size: 100, mtimeMs: 1 };
const rec = (o) => ({ at: 'x', fromLine: 1, toLine: 10, runs: 1, runsFailed: 0, chunks: 1, hotspots: 0, hotspotsMissing: 0, stories: 0,
  written: 0, merged: 0, privacyBlocked: 0, privacyUnchecked: 0, usd: null, secs: 0, status: 'done', ...o });

test('ledger: explicit window never moves lastLine back nor skips lines', () => {
  const l = L.record({ version: 1, sessions: {} }, 's', info, rec({ toLine: 12 }), { lines: 12 });
  L.record(l, 's', { ...info, size: 50 }, rec({ fromLine: 1, toLine: 8 }), { explicit: true, lines: 12 });
  assert.equal(l.sessions.s.lastLine, 12);
  assert.equal(l.sessions.s.size, 100, 'explicit window keeps size/mtime');
  const g = L.record({ version: 1, sessions: {} }, 'g', info, rec({ toLine: 10 }), { lines: 20 });
  L.record(g, 'g', info, rec({ fromLine: 500, toLine: 600 }), { explicit: true, lines: 600 });
  assert.equal(g.sessions.g.lastLine, 10, 'a gap is not skipped');
  L.record(g, 'g', { ...info, size: 300 }, rec({ fromLine: 5, toLine: 15 }), { explicit: true, lines: 20 });
  assert.equal(g.sessions.g.lastLine, 15, 'contiguous window raises lastLine');
  assert.equal(g.sessions.g.size, 100, 'not at the end yet: size unchanged so scan still runs');
  L.record(g, 'g', { ...info, size: 300 }, rec({ fromLine: 16, toLine: 20, status: 'failed' }), { explicit: true, lines: 20 });
  assert.equal(g.sessions.g.lastLine, 15);
  assert.equal(g.sessions.g.status, 'done', 'a failed explicit window leaves status');
});

test('ledger: failedCount and scanState give up on unchanged failing files', () => {
  const l = { version: 1, sessions: {} };
  const t = { size: 100, mtimeMs: 1 };
  for (let i = 1; i <= 3; i++) {
    L.record(l, 's', info, rec({ status: 'failed' }), { lines: 10 });
    assert.equal(l.sessions.s.failedCount, i);
    assert.equal(L.scanState(l.sessions.s, t, 3), i < 3 ? 'run' : 'gave-up');
  }
  assert.equal(L.scanState(l.sessions.s, { size: 120, mtimeMs: 2 }, 3), 'run', 'a changed file is tried again');
  L.record(l, 's', info, rec({ toLine: 6, status: 'partial' }), { lines: 10 });
  assert.equal(l.sessions.s.failedCount, 4, 'stopped before the end counts too');
  L.record(l, 's', info, rec({ fromLine: 7, toLine: 10 }), { lines: 10 });
  assert.equal(l.sessions.s.failedCount, 0);
  assert.equal(L.scanState(l.sessions.s, t, 3), 'same');
});

// ---------- cluster fallback ----------

test('cluster fallback: raw stories join the old story whose lines they share', () => {
  const raw = (id, lines, run = 1) => ({ id, run, title: id, what_happened: 'x', signals: [], lines });
  const box = (id, lines) => ({ id, data: { lines: lines.map((n) => `${SID}#L${n}`) }, body: `\n# ${id}\n` });
  const out = fallback([raw('r1-c1-S1', [1, 3]), raw('r1-c1-S2', [4]), raw('r2-c1-S1', [9])], [box('a', [1, 2]), box('b', [3, 4])]);
  const byId = Object.fromEntries(out.map((c) => [c.id, c.members]));
  assert.deepEqual(byId['box:a'], ['box:a', 'r1-c1-S1'], 'tie on overlap goes to the smallest id');
  assert.deepEqual(byId['box:b'], ['box:b', 'r1-c1-S2']);
  assert.deepEqual(byId['C:r2-c1-S1'], ['r2-c1-S1']);
  assert.equal(out.find((c) => c.id === 'box:a').hits, 1);
});

test('re-harvest of old lines with a failing cluster call merges, no -2 files, lastLine kept', () => {
  const s = setup();
  s.write(8);
  assert.equal(s.harvest('llm-ok').code, 0);
  s.write(12);
  assert.equal(s.harvest('llm-two-windows', '--no-outsider').code, 0);
  const before = s.stories();
  assert.equal(before.length, 3);
  // explicit window over old lines; llm-ok has no cluster-1 -> fallback by lines
  let r = s.harvest('llm-ok', '--from-line', '1', '--to-line', '8', '--no-outsider');
  assert.match(r.out, /gộp/);
  assert.deepEqual(s.stories(), before, r.out + r.err);
  assert.equal(s.ledger().lastLine, 12);
  r = s.harvest('llm-ok');
  assert.match(r.out, /không có dòng mới/, 'the hook after it does not re-harvest L9-12');
  // rewritten (shorter) file -> from line 1, merged into old files
  s.write(8);
  r = s.harvest('llm-ok', '--no-outsider');
  assert.match(r.out, /L1-L8/);
  assert.deepEqual(s.stories(), before, r.out + r.err);
});

// ---------- dead chunk ----------

test('multi-chunk: a chunk failing in every run stops lastLine before it and counts its hotspots', async () => {
  const s = setup();
  s.write(12);
  const entries = readEntries(s.tr);
  const hotspots = detect(entries);
  const maxTokens = 120;
  const chunks = chunk(entries, maxTokens);
  assert.ok(chunks.length >= 3, `need ≥ 3 chunks, got ${chunks.length}`);
  const fake = path.join(s.base, 'fake');
  fs.mkdirSync(fake);
  for (const c of chunks) {
    if (c.k === 2) continue; // missing file -> chunk 2 fails (and its retry)
    const owned = hotspots.filter((h) => c.owns.has(h.L));
    const first = Math.min(...c.owns);
    fs.writeFileSync(path.join(fake, `harvest-c${c.k}-r1.json`), ok({
      stories: [{ title: `Chuyện khúc ${c.k}`, signals: [], lines: [`L${first}`], context: 'giả', what_happened: `việc ở khúc ${c.k}`, lesson: '', artefact: '' }],
      hotspots: owned.map((h) => ({ id: h.id, verdict: 'skip', story_title: '', reason: 'giả' })),
    }));
  }
  const { runSession } = await import('../lib/pipeline.mjs');
  const { loadConfig } = await import('../lib/config.mjs');
  const cfg = loadConfig({ cwd: s.repo, env: s.env, flags: { 'fake-llm': fake, 'no-outsider': true } });
  cfg.harvest.maxInputTokens = maxTokens;
  const r = await runSession(null, { cfg, transcript: s.tr, env: s.env });
  const stop = Math.min(...chunks[1].owns) - 1;
  assert.equal(r.exitCode, 4, r.message);
  assert.match(r.message, /dừng trước khúc hỏng/);
  const l = s.ledger();
  assert.equal(l.lastLine, stop);
  assert.equal(l.status, 'partial');
  assert.equal(l.failedCount, 1);
  const dead = hotspots.filter((h) => chunks[1].owns.has(h.L)).length;
  assert.ok(l.harvests[0].hotspotsMissing >= dead);
  assert.ok(s.stories().length >= 1, 'chunk 1 stories are written');
  assert.match(fs.readFileSync(path.join(s.cache, 'hook.log'), 'utf8'), /harvest.call-failed.*"error":"llm-retry-failed"/);
});

// ---------- scan budget ----------

test('scan --auto: first run only marks the start; later auto scans skip older transcripts; cap per scan', () => {
  const s = setup();
  const dir = path.join(s.env.HOME, '.claude', 'projects', encodeProjectDir(s.repo));
  fs.mkdirSync(dir, { recursive: true });
  const old = new Date(Date.now() - 3 * 3600e3);
  const ids = ['5e5510aa-0000-4000-8000-000000000001', '6e5510aa-0000-4000-8000-000000000001', '7e5510aa-0000-4000-8000-000000000001'];
  for (const id of ids) { const f = path.join(dir, `${id}.jsonl`); s.write(8, f); fs.utimesSync(f, old, old); }
  const fake = { MOMENTRY_FAKE_LLM: path.join(FIX, 'llm-ok') };
  let r = s.run(['scan', '--claude', '--auto'], fake);
  assert.equal(r.code, 0, r.err + r.out);
  assert.match(r.out, /gom 0/);
  assert.match(r.out, /3 phiên cũ hơn lần quét tự động đầu tiên/);
  assert.deepEqual(s.stories(), []);
  r = s.run(['scan', '--claude', '--max-sessions', '1'], fake);
  assert.match(r.out, /gom 1/);
  assert.match(r.out, /còn 2 phiên chưa gom/);
});

// ---------- hook stdin ----------

test('readStdin: TTY gives empty; an open stream returns after the timeout', async () => {
  assert.equal(await readStdin({ isTTY: true }), '');
  const p = new PassThrough();
  p.write('{"a":');
  const t0 = Date.now();
  assert.equal(await readStdin(p, { timeoutMs: 30 }), '{"a":');
  assert.ok(Date.now() - t0 < 1000);
  const q = new PassThrough();
  q.end('{"cwd":"/x"}');
  assert.equal(await readStdin(q, { timeoutMs: 1000 }), '{"cwd":"/x"}');
});

test('hook with a stdin that never closes exits fast and silent', async () => {
  const base = tmp();
  const env = { PATH: process.env.PATH, HOME: path.join(base, 'home'), USERPROFILE: path.join(base, 'home'), MOMENTRY_CACHE: path.join(base, 'cache'), MOMENTRY_CONFIG: path.join(base, 'none.json') };
  const t0 = Date.now();
  const child = spawn(process.execPath, [BIN, 'hook', 'pre-compact', '--codex'], { cwd: base, env, stdio: ['pipe', 'pipe', 'pipe'] });
  let out = '';
  child.stdout.on('data', (b) => { out += b; });
  const killer = setTimeout(() => child.kill('SIGKILL'), 5000);
  const code = await new Promise((res) => child.on('exit', (c) => res(c)));
  clearTimeout(killer);
  child.stdin.destroy();
  assert.equal(code, 0);
  assert.equal(out, '');
  assert.ok(Date.now() - t0 < 3000, `took ${Date.now() - t0} ms`);
});

// ---------- log ----------

test('hook.log keeps only error kinds, never the payload or model text', () => {
  const base = tmp();
  const repo = path.join(base, 'repo');
  fs.mkdirSync(path.join(repo, '.git'), { recursive: true });
  fs.writeFileSync(path.join(repo, '.momentry.json'), '{}');
  const env = { PATH: process.env.PATH, HOME: base, USERPROFILE: base, MOMENTRY_CACHE: path.join(base, 'cache'), MOMENTRY_CONFIG: path.join(base, 'none.json') };
  handleHook('pre-compact', 'garbage-bi-mat\n', {}, { env, spawn: () => { throw new Error('x'); } });
  const log = fs.readFileSync(path.join(env.MOMENTRY_CACHE, 'hook.log'), 'utf8');
  assert.match(log, /hook.bad-stdin.*"error":"SyntaxError"/);
  assert.doesNotMatch(log, /garbage|bi-mat/);
  const e = Object.assign(new Error('claude thoát 1: lộ chữ của phiên'), { kind: 'llm-exit' });
  assert.deepEqual(sanitize({ error: e, other: new Error('nội dung') }), { error: 'llm-exit', other: 'Error' });
});

// ---------- privacy label, held patches ----------

test('unchecked merge downgrades privacy; a held patch without its target is refused', () => {
  const box = path.join(tmp(), 'box');
  writeNew(box, { id: '2026-01-10-x', data: { date: '2026-01-10', status: 'raw', privacy: 'checked', lines: [] }, body: '\n# X\n' });
  mergeInto(box, '2026-01-10-x', { append: { lines: ['claude:aa#L9'] }, privacy: 'unchecked' });
  assert.equal(readStory(box, '2026-01-10-x').data.privacy, 'unchecked');

  const cacheDir = path.join(tmp(), 'cache');
  put('r', { id: '2026-01-10-gone', target: '2026-01-10-gone', patch: { append: { lines: ['claude:aa#L1'] } } }, 'unchecked', { cacheDir });
  const bl = { terms: [] };
  assert.throws(() => release('r', '2026-01-10-gone', bl, { cacheDir, box }), /không còn trong hộp/);
  assert.equal(readStory(box, '2026-01-10-gone'), null);
});

test('pipeline: allowUnchecked merge marks the old file unchecked', () => {
  const s = setup();
  s.write(8);
  assert.equal(s.harvest('llm-ok').code, 0);
  s.write(12);
  const env = { MOMENTRY_PRIVACY_SOURCES: '[]', MOMENTRY_ALLOW_UNCHECKED: '1' };
  const r = s.run(['harvest', '--transcript', s.tr, '--fake-llm', path.join(FIX, 'llm-two-windows'), '--no-outsider'], env);
  assert.match(r.out, /gộp [1-9]/, r.out + r.err); // score-only patches carry model text too, so they downgrade as well
  const f = fs.readFileSync(path.join(s.box, '2026-01-10-may-pha-nhanh-gap-ba-nho.md'), 'utf8');
  assert.match(f, /privacy: unchecked/);
});
