// Ledger and locks (PRD 6.3).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import * as L from '../lib/ledger.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'dm-ledger-'));
const rec = (over) => ({
  at: 't', fromLine: 1, toLine: 10, runs: 1, runsFailed: 0, chunks: 1, hotspots: 0, hotspotsMissing: 0, stories: 0,
  written: 0, merged: 0, privacyBlocked: 0, privacyUnchecked: 0, usd: null, secs: 0, status: 'done', ...over,
});
const info = { source: 'claude', transcriptPath: '/x', repoRoot: '/r', size: 100, mtimeMs: 1 };
const deadPid = () => spawnSync(process.execPath, ['-e', 'process.stdout.write(String(process.pid))'], { encoding: 'utf8' }).stdout;

test('load/save: missing file is empty; atomic write, dir 0700', () => {
  const dir = path.join(tmp(), 'cache');
  assert.deepEqual(L.load(dir), { version: 1, sessions: {}, repos: {} });
  const l = L.record(L.load(dir), 'claude:a', info, rec({}));
  L.save(l, dir);
  if (process.platform !== 'win32') assert.equal(fs.statSync(dir).mode & 0o777, 0o700); // Windows has no POSIX modes
  assert.equal(L.load(dir).sessions['claude:a'].lastLine, 10);
  assert.deepEqual(fs.readdirSync(dir), ['ledger.json']);
});

test('needsHarvest: new, nothing new, grown, shrunk/rewritten', () => {
  const l = L.record({ version: 1, sessions: {} }, 's', info, rec({ toLine: 10 }));
  assert.deepEqual(L.needsHarvest(l, 'other', { size: 5, mtimeMs: 1, lines: 3 }), { fromLine: 1 });
  assert.equal(L.needsHarvest(l, 'other', { size: 0, mtimeMs: 1, lines: 0 }), null);
  assert.equal(L.needsHarvest(l, 's', { size: 100, mtimeMs: 1, lines: 10 }), null, 'second run writes nothing');
  assert.deepEqual(L.needsHarvest(l, 's', { size: 150, mtimeMs: 2, lines: 14 }), { fromLine: 11 });
  assert.deepEqual(L.needsHarvest(l, 's', { size: 50, mtimeMs: 2, lines: 12 }), { fromLine: 1 }, 'smaller size');
  assert.deepEqual(L.needsHarvest(l, 's', { size: 200, mtimeMs: 2, lines: 4 }), { fromLine: 1 }, 'fewer lines');
});

test('record: failed keeps lastLine; partial advances and adds needsRescore; mainGoals appended', () => {
  const l = { version: 1, sessions: {} };
  L.record(l, 's', info, rec({ toLine: 10, mainGoal: 'g1' }));
  L.record(l, 's', info, rec({ fromLine: 11, toLine: 20, status: 'failed' }));
  assert.equal(l.sessions.s.lastLine, 10);
  assert.equal(l.sessions.s.status, 'failed');
  L.record(l, 's', info, rec({ fromLine: 11, toLine: 25, status: 'partial', needsRescore: ['a', 'b'], mainGoal: 'g2' }));
  L.record(l, 's', info, rec({ fromLine: 26, toLine: 30, status: 'partial', needsRescore: ['b', 'c'] }));
  const s = l.sessions.s;
  assert.equal(s.lastLine, 30);
  assert.deepEqual(s.needsRescore, ['a', 'b', 'c']);
  assert.deepEqual(s.mainGoals, [{ toLine: 10, text: 'g1' }, { toLine: 25, text: 'g2' }]);
  assert.equal(s.harvests.length, 4);
  assert.equal(s.harvests[0].mainGoal, undefined);
  assert.equal(L.forget(l, 's'), true);
  assert.equal(L.forget(l, 's'), false);
});

test('lock: wx; live lock sets pending; dead pid replaced; stale mtime replaced', () => {
  const cacheDir = tmp();
  const a = L.lock('claude:abc', { cacheDir, staleSec: 3600 });
  assert.equal(a.ok, true);
  const info = JSON.parse(fs.readFileSync(a.handle.path, 'utf8'));
  assert.equal(info.pid, process.pid);
  const b = L.lock('claude:abc', { cacheDir, staleSec: 3600 });
  assert.deepEqual(b, { ok: false, pending: true });
  assert.equal(L.load(cacheDir).sessions['claude:abc'].pending, true);
  L.touch(a.handle);
  L.unlock(a.handle);
  assert.equal(fs.existsSync(a.handle.path), false);

  const file = path.join(cacheDir, 'locks', 'claude_abc.lock');
  fs.writeFileSync(file, JSON.stringify({ pid: Number(deadPid()), startedAt: 'x' }));
  const c = L.lock('claude:abc', { cacheDir, staleSec: 3600 });
  assert.equal(c.ok, true, 'lock of a dead pid is removed');
  L.unlock(c.handle);

  fs.writeFileSync(file, JSON.stringify({ pid: process.pid, startedAt: 'x' }));
  const old = new Date(Date.now() - 7200e3);
  fs.utimesSync(file, old, old);
  const d = L.lock('claude:abc', { cacheDir, staleSec: 3600 });
  assert.equal(d.ok, true, 'live pid but older than staleSec');
  L.unlock(d.handle);
});
