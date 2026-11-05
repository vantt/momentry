// Pausing gathering for one project on this machine: kept in the user's project list (never the repo file), honoured
// by the hooks, `scan --auto` and the session-start reminder; manual commands still run; the CLI, status, doctor and
// the web UI show it. Temp HOME, config and cache only; no network, no model.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as Projects from '../lib/projects.mjs';
import * as A from '../lib/ui-api.mjs';
import { loadConfig } from '../lib/config.mjs';
import { handleHook } from '../lib/hook.mjs';
import { buildChecks } from '../lib/checks.mjs';
import { run as runChecks, format } from '../lib/doctor.mjs';
import { writeNew } from '../lib/box.mjs';
import { encodeProjectDir } from '../lib/sources/claude.mjs';

const BIN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../bin/momentry.mjs');

/** An observed repo with a privacy source, a story folder and a private cache. */
function world({ observed = true } = {}) {
  const base = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'dm-pause-')));
  const repo = path.join(base, 'repo');
  fs.mkdirSync(path.join(repo, '.git'), { recursive: true });
  if (observed) fs.writeFileSync(path.join(repo, '.momentry.json'), '{}\n');
  const box = path.join(repo, 'docs', 'storytelling-material');
  fs.mkdirSync(box, { recursive: true });
  const names = path.join(base, 'names.txt');
  fs.writeFileSync(names, 'Bí Mật\n');
  const cache = path.join(base, 'cache');
  fs.mkdirSync(cache, { mode: 0o700 });
  const home = path.join(base, 'home');
  fs.mkdirSync(home);
  const env = {
    PATH: process.env.PATH, HOME: home, USERPROFILE: home, APPDATA: path.join(base, 'appdata'), XDG_CONFIG_HOME: path.join(base, 'config-home'),
    MOMENTRY_CACHE: cache, MOMENTRY_CONFIG: path.join(base, 'none.json'), MOMENTRY_PRIVACY_SOURCES: names,
  };
  const run = (args, { cwd = repo, input } = {}) => {
    const r = spawnSync(process.execPath, [BIN, ...args], { cwd, env, input, encoding: 'utf8' });
    return { code: r.status, out: r.stdout, err: r.stderr, json: () => JSON.parse(r.stdout) };
  };
  const entry = () => Projects.find(Projects.read(env), repo);
  const story = (id) => writeNew(box, { id, data: { date: '2026-11-01', status: 'raw' }, body: `\n# ${id}\n` });
  return { base, repo, box, cache, home, env, run, entry, story };
}

/** A spawn stand-in that records what the hook would start. */
function recorder() {
  const calls = [];
  const spawn = (cmd, args) => { calls.push(args); return { on() {}, unref() {} }; };
  return { calls, spawn };
}

test('pause and resume: per machine in the project list, the repo file untouched, idempotent, --dry-run writes nothing', () => {
  const w = world();
  const repoFile = fs.readFileSync(path.join(w.repo, '.momentry.json'), 'utf8');

  let r = w.run(['pause', '--dry-run', '--json']);
  assert.equal(r.code, 0, r.err);
  assert.equal(r.json().data.dryRun, true);
  assert.equal(w.entry()?.paused, undefined, 'dry run writes nothing');

  r = w.run(['pause', '--json']);
  assert.equal(r.code, 0, r.err);
  assert.deepEqual({ ...r.json().data, root: null }, { repo: 'repo', root: null, paused: true, changed: true });
  assert.equal(w.entry().paused, true);
  assert.equal(fs.readFileSync(path.join(w.repo, '.momentry.json'), 'utf8'), repoFile, 'the repo file is never written');
  assert.equal(loadConfig({ cwd: w.repo, env: w.env }).paused, true);

  r = w.run(['pause']);
  assert.equal(r.code, 0);
  assert.match(r.out, /đã tạm dừng sẵn/);

  // --repo from another folder, like every other command
  r = w.run(['resume', '--repo', w.repo, '--json'], { cwd: w.base });
  assert.equal(r.code, 0, r.err);
  assert.equal(r.json().data.changed, true);
  assert.equal(w.entry().paused, undefined);
  assert.ok(Number.isFinite(Date.parse(w.entry().resumed)), 'resuming records when');
  assert.equal(loadConfig({ cwd: w.repo, env: w.env }).resumedAt, w.entry().resumed);

  r = w.run(['resume']);
  assert.equal(r.code, 0);
  assert.match(r.out, /không có gì để bật lại/);
});

test('pause refuses a repo that is not observed, with the fix', () => {
  const w = world({ observed: false });
  const r = w.run(['pause', '--json']);
  assert.equal(r.code, 1);
  assert.equal(r.json().error.code, 'not-observed');
  assert.deepEqual(r.json().next, ['momentry init']);
  assert.equal(Projects.read(w.env)?.projects?.[w.repo], undefined, 'nothing is added to the list');
  // resuming something that was never paused does not add it either
  assert.equal(w.run(['resume']).code, 0);
  assert.equal(w.entry(), null);
});

test('the hooks start nothing for a paused repo, and start again after resume', () => {
  const w = world();
  const payload = JSON.stringify({ cwd: w.repo, session_id: 'abcdef12-0000', transcript_path: '/t.jsonl' });
  Projects.setPaused(w.env, w.repo, true);
  for (const ev of ['pre-compact', 'session-end', 'session-start']) {
    const rec = recorder();
    const r = handleHook(ev, payload, {}, { env: w.env, spawn: rec.spawn });
    assert.deepEqual(r, { spawned: false, reason: 'paused' }, `${ev}: no root, so no reminder either`);
    assert.equal(rec.calls.length, 0);
  }
  Projects.setPaused(w.env, w.repo, false);
  const rec = recorder();
  assert.equal(handleHook('session-end', payload, {}, { env: w.env, spawn: rec.spawn }).spawned, true);
  assert.equal(rec.calls[0][1], 'harvest');
});

test('the session-start reminder stays silent for a paused repo, even with new stories', () => {
  const w = world();
  w.story('2026-11-01-moi-mot');
  const start = (flags = []) => w.run(['hook', 'session-start', ...flags], { input: JSON.stringify({ cwd: w.repo, session_id: 'abcdef12-0000' }) });
  Projects.setPaused(w.env, w.repo, true);
  let r = start();
  assert.equal(r.code, 0);
  assert.equal(r.out, '');
  assert.equal(w.run(['hook', 'session-start', '--agy'], { input: JSON.stringify({ conversationId: 'c1', transcriptPath: '/t', workspacePaths: [w.repo] }) }).out.trim(), '{}');
  Projects.setPaused(w.env, w.repo, false);
  r = start();
  assert.match(JSON.parse(r.out).systemMessage, /1 chuyện mới/, 'the same repo is reminded once gathering is back on');
});

test('the repo file cannot pause a project, and a list entry that is not exactly true is not a pause', () => {
  const w = world();
  fs.writeFileSync(path.join(w.repo, '.momentry.json'), JSON.stringify({ paused: true, resumed: '2000-01-01T00:00:00Z' }));
  const cfg = loadConfig({ cwd: w.repo, env: w.env });
  assert.equal(cfg.paused, false);
  assert.equal(cfg.resumedAt, null);
  assert.equal(handleHook('session-end', JSON.stringify({ cwd: w.repo, session_id: 'abcdef12-0000' }), {}, { env: w.env, spawn: recorder().spawn }).spawned, true);
  const file = Projects.listFile(w.env);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ projects: { [w.repo]: { name: 'repo', paused: 'yes' } } }));
  assert.equal(loadConfig({ cwd: w.repo, env: w.env }).paused, false);
  assert.equal(Projects.isPaused(w.env, w.repo), false);
  // a broken list never makes the hook throw; the command it starts reports the broken list
  fs.writeFileSync(file, '{broken');
  assert.equal(Projects.isPaused(w.env, w.repo), false);
});

test('scan --auto skips a paused repo without marking a start; a manual scan still runs and says it is paused', () => {
  const w = world();
  Projects.setPaused(w.env, w.repo, true);
  let r = w.run(['scan', '--auto', '--json']);
  assert.equal(r.code, 0, r.err);
  assert.equal(r.json().data.paused, true);
  assert.match(r.json().data.message, /tạm dừng/);
  const ledger = path.join(w.cache, 'ledger.json');
  assert.ok(!fs.existsSync(ledger) || !JSON.parse(fs.readFileSync(ledger, 'utf8')).repos?.[w.repo], 'no auto start is marked while paused');
  r = w.run(['scan']);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /^scan repo: 0 phiên/m);
  assert.match(r.err, /đang tạm dừng gom chuyện.*momentry resume/);
  r = w.run(['add', '--title', 'Ghi tay', '--note', 'Vẫn ghi được khi tạm dừng.']);
  assert.equal(r.code, 0, r.err);
  assert.match(r.err, /đang tạm dừng/);
  assert.equal(fs.readdirSync(w.box).filter((f) => f.endsWith('.md')).length, 1);
});

test('after resume, hook-run scans leave sessions from the pause to a manual scan', () => {
  const w = world();
  const dir = path.join(w.home, '.claude', 'projects', encodeProjectDir(w.repo));
  fs.mkdirSync(dir, { recursive: true });
  const t = path.join(dir, '5e5510aa-0000-4000-8000-000000000001.jsonl');
  fs.writeFileSync(t, `${JSON.stringify({ type: 'user', cwd: w.repo, message: { role: 'user', content: 'xin chào' } })}\n`);
  const during = new Date(Date.now() - 3 * 3600e3);
  fs.utimesSync(t, during, during);
  fs.writeFileSync(path.join(w.cache, 'ledger.json'), JSON.stringify({ version: 1, sessions: {}, repos: { [w.repo]: { autoSince: new Date(Date.now() - 864e5).toISOString() } } }));
  const r0 = w.run(['scan', '--auto', '--dry-run']);
  assert.doesNotMatch(r0.out, /phiên cũ hơn/, 'before any pause the session counts');
  Projects.setPaused(w.env, w.repo, true);
  Projects.setPaused(w.env, w.repo, false);
  const r = w.run(['scan', '--auto', '--dry-run']);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /gom 0/);
  assert.match(r.out, /1 phiên cũ hơn lần quét tự động đầu tiên hoặc lần bật lại/);
});

test('status and doctor show a pause as information, never as a failure', async () => {
  const w = world();
  Projects.setPaused(w.env, w.repo, true);
  const ctx = { cwd: w.repo, env: w.env, platform: process.platform, prefix: 'momentry', connect: false, quick: true };
  const res = await runChecks(buildChecks(ctx).filter((c) => ['config.valid', 'project.paused'].includes(c.code)), ctx, {});
  const c = res.results.find((x) => x.code === 'project.paused');
  assert.equal(c.status, 'info');
  assert.equal(res.ok, true);
  assert.match(format(res.results).join('\n'), /^i gom chuyện: đang tạm dừng/m);
  assert.doesNotMatch(format(res.results).join('\n'), /sửa:/);

  const r = w.run(['status', '--json']);
  const env = r.json();
  assert.equal(env.data.paused, true);
  assert.ok(!env.next.includes('momentry resume'), 'status never tells an agent to undo the user\'s pause');
  assert.match(w.run(['status']).out, /đang tạm dừng gom chuyện/);
  Projects.setPaused(w.env, w.repo, false);
  assert.equal(w.run(['status', '--json']).json().data.paused, false);
});

test('UI: the Gather stories switch pauses and resumes; projects, settings and health carry the state', async () => {
  const w = world();
  const ctx = { env: w.env, cwd: w.repo };
  const id = A.listProjects(ctx).find((p) => p.root === w.repo).id;
  assert.equal(A.settingsView(ctx).projects[0].paused, false);

  let v = A.saveGathering(ctx, { project: id, on: false });
  assert.equal(v.projects.find((p) => p.id === id).paused, true);
  assert.equal(w.entry().paused, true);
  assert.equal(A.overview(ctx).projects.find((p) => p.id === id).paused, true);
  const h = await A.healthView(ctx, { project: id });
  assert.equal(h.project.paused, true);
  const check = h.checks.find((c) => c.code === 'project.paused');
  assert.equal(check.status, 'info');
  assert.equal(check.canFix, false);
  assert.match(check.why, /Paused/);

  assert.throws(() => A.saveGathering(ctx, { project: id, on: 'no' }), A.UiError);
  assert.throws(() => A.saveGathering(ctx, { project: 'ffffffffff', on: true }), A.UiError);
  v = A.saveGathering(ctx, { project: id, on: true });
  assert.equal(v.projects.find((p) => p.id === id).paused, false);
  assert.equal(w.entry().paused, undefined);
});
