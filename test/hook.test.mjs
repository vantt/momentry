// hook entry and hooks --print (PRD 6.4). Spawn is faked: no background process is ever started here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { handleHook, printHookConfig } from '../lib/hook.mjs';
import { paths } from '../lib/paths.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BIN = path.resolve(HERE, '../bin/momentry.mjs');

function sandbox(observed = true) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'dm-hook-'));
  const repo = path.join(base, 'repo');
  fs.mkdirSync(path.join(repo, '.git'), { recursive: true });
  if (observed) fs.writeFileSync(path.join(repo, '.momentry.json'), '{}');
  const env = { PATH: process.env.PATH, HOME: path.join(base, 'home'), USERPROFILE: path.join(base, 'home'), MOMENTRY_CACHE: path.join(base, 'cache'), MOMENTRY_CONFIG: path.join(base, 'none.json') };
  const calls = [];
  const spawn = (cmd, args, opts) => { calls.push({ cmd, args, opts }); return { on() {}, unref() { calls.at(-1).unref = true; } }; };
  return { base, repo, env, calls, spawn };
}
const logOf = (env) => { try { return fs.readFileSync(path.join(env.MOMENTRY_CACHE, 'hook.log'), 'utf8'); } catch { return ''; } };

test('STORY_HARVEST=1 returns at once', () => {
  const s = sandbox();
  const r = handleHook('pre-compact', JSON.stringify({ cwd: s.repo }), {}, { env: { ...s.env, STORY_HARVEST: '1' }, spawn: s.spawn });
  assert.deepEqual(r, { spawned: false, reason: 'story-harvest' });
  assert.equal(s.calls.length, 0);
});

test('bad stdin: logged, nothing spawned, no throw', () => {
  const s = sandbox();
  const r = handleHook('pre-compact', '{not json', {}, { env: s.env, spawn: s.spawn });
  assert.equal(r.spawned, false);
  assert.equal(s.calls.length, 0);
  assert.match(logOf(s.env), /hook.bad-stdin/);
});

test('unobserved repo: nothing spawned', () => {
  const s = sandbox(false);
  const r = handleHook('session-end', JSON.stringify({ cwd: s.repo, transcript_path: '/t.jsonl' }), {}, { env: s.env, spawn: s.spawn });
  assert.deepEqual(r, { spawned: false, reason: 'not-observed' });
  assert.equal(s.calls.length, 0);
});

test('pre-compact spawns a detached harvest with process.execPath and STORY_HARVEST=1', () => {
  const s = sandbox();
  const payload = { session_id: '0A1B2C3D-1111', transcript_path: '/p/0a1b2c3d.jsonl', cwd: path.join(s.repo), hook_event_name: 'PreCompact' };
  const r = handleHook('pre-compact', JSON.stringify(payload), {}, { env: s.env, spawn: s.spawn, binPath: '/abs/bin/momentry.mjs' });
  assert.equal(r.spawned, true);
  const c = s.calls[0];
  assert.equal(c.cmd, process.execPath);
  assert.deepEqual(c.args, ['/abs/bin/momentry.mjs', 'harvest', '--transcript', '/p/0a1b2c3d.jsonl', '--repo', s.repo, '--session', 'claude:0a1b2c3d']);
  assert.equal(c.opts.detached, true);
  assert.equal(c.opts.stdio, 'ignore');
  assert.equal(c.opts.env.STORY_HARVEST, '1');
  assert.equal(c.unref, true);
  assert.match(logOf(s.env), /hook.spawned/);
  assert.doesNotMatch(logOf(s.env), /0a1b2c3d\.jsonl/, 'no transcript path in the log');
});

test('session-start spawns scan for the runtime; codex without transcript path falls back to --session', () => {
  const s = sandbox();
  handleHook('session-start', JSON.stringify({ cwd: s.repo, session_id: 'abcdef12-x' }), {}, { env: s.env, spawn: s.spawn, binPath: '/b' });
  assert.deepEqual(s.calls[0].args, ['/b', 'scan', '--repo', s.repo, '--claude', '--auto', '--except', 'claude:abcdef12']);
  handleHook('pre-compact', JSON.stringify({ cwd: s.repo, session_id: '01a1a126-4b3a-77b3-a22f-52292aacdcae' }), { codex: true }, { env: s.env, spawn: s.spawn, binPath: '/b' });
  assert.deepEqual(s.calls[1].args, ['/b', 'harvest', '--session', 'codex:2aacdcae', '--repo', s.repo], 'Codex ids are UUIDv7: tail, not head');
  handleHook('pre-compact', '', { codex: true }, { env: s.env, spawn: s.spawn, binPath: '/b', cwd: s.repo });
  assert.deepEqual(s.calls[2].args, ['/b', 'scan', '--repo', s.repo, '--codex', '--auto']);
});

test('pi/omp: session id from the transcript uuid tail; harvest the transcript', () => {
  const s = sandbox();
  const tr = '/p/sessions/--x--/2026-01-10T09-00-00-000Z_0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b.jsonl';
  handleHook('session-end', JSON.stringify({ session_id: '0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b', transcript_path: tr, cwd: s.repo }), { omp: true }, { env: s.env, spawn: s.spawn, binPath: '/b' });
  assert.deepEqual(s.calls[0].args, ['/b', 'harvest', '--transcript', tr, '--repo', s.repo, '--session', 'omp:2e3f4a5b']);
  handleHook('session-start', JSON.stringify({ session_id: '0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b', cwd: s.repo }), { pi: true }, { env: s.env, spawn: s.spawn, binPath: '/b' });
  assert.deepEqual(s.calls[1].args, ['/b', 'scan', '--repo', s.repo, '--pi', '--auto', '--except', 'pi:2e3f4a5b']);
});

test('agy: camelCase payload, workspace as cwd, session recorded in the index, scan of older sessions', () => {
  const s = sandbox();
  const payload = { conversationId: '0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f7777', transcriptPath: '/g/brain/x/.system_generated/logs/transcript.jsonl', workspacePaths: [s.repo], hookEventName: 'SessionStart' };
  handleHook('session-start', JSON.stringify(payload), { agy: true }, { env: s.env, spawn: s.spawn, binPath: '/b', cwd: '/hooks-json-dir' });
  assert.deepEqual(s.calls[0].args, ['/b', 'scan', '--repo', s.repo, '--agy', '--auto'], 'the just-opened agy session is left to the quiet rule');
  const idx = fs.readFileSync(path.join(s.env.MOMENTRY_CACHE, 'agy-sessions.jsonl'), 'utf8');
  assert.match(idx, /"conversationId":"0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f7777"/);
});

test('CLI hook --agy always prints {} (Antigravity needs a JSON object), others print nothing', () => {
  const s = sandbox();
  const r = spawnSync(process.execPath, [BIN, 'hook', 'session-start', '--agy'], { cwd: s.repo, env: s.env, input: 'not json', encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.equal(r.stdout.trim(), '{}');
  const q = spawnSync(process.execPath, [BIN, 'hook', 'session-start', '--agy'], { cwd: s.repo, env: { ...s.env, STORY_HARVEST: '1' }, input: '{}', encoding: 'utf8' });
  assert.equal(q.stdout.trim(), '{}');
});

test('CLI hook --user-home: momentry uses the real home (cache, config) when the host ran under another HOME', () => {
  const s = sandbox();
  const real = path.join(s.base, 'real-home');
  const env = { ...s.env, HOME: path.join(s.base, 'agy-account'), USERPROFILE: path.join(s.base, 'agy-account') };
  delete env.MOMENTRY_CACHE;
  const payload = JSON.stringify({ conversationId: '0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f7777', transcriptPath: '/g/t.jsonl', workspacePaths: [s.repo] });
  const r = spawnSync(process.execPath, [BIN, 'hook', 'session-start', '--agy', '--user-home', real], { cwd: s.repo, env: { ...env, STORY_HARVEST: '' }, input: payload, encoding: 'utf8' });
  assert.equal(r.stdout.trim(), '{}');
  assert.ok(fs.existsSync(path.join(paths({ HOME: real, USERPROFILE: real }).cache, 'agy-sessions.jsonl')), 'index under the real home');
  assert.ok(!fs.existsSync(path.join(s.base, 'agy-account', '.cache')), 'nothing under the account HOME');
});

test('a throwing spawn never escapes', () => {
  const s = sandbox();
  const r = handleHook('session-end', JSON.stringify({ cwd: s.repo, transcript_path: '/t' }), {}, { env: s.env, spawn: () => { throw new Error('boom'); } });
  assert.deepEqual(r, { spawned: false, reason: 'error' });
});

test('printHookConfig uses absolute node and bin paths; includes /bip template', () => {
  const claude = printHookConfig('claude', { execPath: '/usr/bin/node', binPath: '/home/u/cis/bin/momentry.mjs' });
  assert.match(claude, /"\\"\/usr\/bin\/node\\" \\"\/home\/u\/cis\/bin\/momentry.mjs\\" hook pre-compact"/);
  for (const ev of ['PreCompact', 'SessionEnd', 'SessionStart']) assert.match(claude, new RegExp(`"${ev}"`));
  assert.match(claude, /add --by human --title/);
  const json = JSON.parse(claude.slice(claude.indexOf('{'), claude.indexOf('\n}\n') + 2));
  assert.equal(json.hooks.SessionEnd[0].hooks[0].type, 'command');
  const codex = printHookConfig('codex', { execPath: '/n', binPath: '/b.mjs' });
  assert.match(codex, /"PreCompact"[\s\S]*"SessionEnd"[\s\S]*"SessionStart"/);
  assert.match(codex, /hook pre-compact --codex/);
  assert.match(codex, /scan --codex/);
  assert.match(codex, /hooks\.state/);
});

test('CLI hooks --print prints process.execPath; hook on an observed repo with bad stdin exits 0 silently', () => {
  const s = sandbox();
  let r = spawnSync(process.execPath, [BIN, 'hooks', '--print', '--claude', '--codex'], { cwd: s.repo, env: s.env, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.stdout.includes(JSON.stringify(`"${process.execPath}" "${BIN}" hook session-end`)));
  assert.match(r.stdout, /PreCompact/);
  r = spawnSync(process.execPath, [BIN, 'hook', 'session-end'], { cwd: s.repo, env: s.env, input: 'xx', encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '');
  assert.match(logOf(s.env), /hook.bad-stdin/);
});
