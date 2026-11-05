// The machine's project list: created from an older install's ledger once, kept up to date by init, the UI and the
// commands the hook starts, read by the config loader (story folder chosen for this machine) and the UI.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as Projects from '../lib/projects.mjs';
import * as Ledger from '../lib/ledger.mjs';
import { loadConfig } from '../lib/config.mjs';
import { show } from '../lib/config-cmd.mjs';
import { handleHook } from '../lib/hook.mjs';
import * as A from '../lib/ui-api.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BIN = path.resolve(HERE, '../bin/momentry.mjs');
const FAKE_CLAUDE = path.join(HERE, 'fixtures', 'fake-claude');

function sandbox() {
  const base = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'dm-projects-')));
  const home = path.join(base, 'home');
  const env = {
    PATH: process.env.PATH, HOME: home, USERPROFILE: home, XDG_CONFIG_HOME: path.join(base, 'config-home'),
    MOMENTRY_CACHE: path.join(base, 'cache'), MOMENTRY_CONFIG: path.join(base, 'config', 'config.json'),
  };
  const repo = (name, { on = true } = {}) => {
    const r = path.join(base, name);
    fs.mkdirSync(path.join(r, '.git'), { recursive: true });
    if (on) fs.writeFileSync(path.join(r, '.momentry.json'), '{}\n');
    return r;
  };
  const file = Projects.listFile(env);
  const onDisk = () => JSON.parse(fs.readFileSync(file, 'utf8'));
  return { base, env, repo, file, onDisk };
}

const run = (args, { cwd, env }) => spawnSync(process.execPath, [BIN, ...args], { cwd, env, encoding: 'utf8' });

test('the list lives in the config dir, never in a repo', () => {
  const { env, base } = sandbox();
  assert.equal(Projects.listFile(env), path.join(base, 'config-home', 'momentry', 'projects.json'));
});

test('an older install: the list is filled once from the ledger and MOMENTRY_REPOS, gone folders left out', () => {
  const { env, base, repo, file, onDisk } = sandbox();
  const a = repo('alpha');
  const b = repo('beta', { on: false });
  const c = repo('gamma', { on: false });
  fs.mkdirSync(path.join(b, 'sub'));
  const ledger = Ledger.load(env.MOMENTRY_CACHE);
  ledger.sessions['claude:aaaaaaaa'] = { repoRoot: a, harvests: [] };
  ledger.sessions['claude:bbbbbbbb'] = { repoRoot: path.join(b, 'sub'), harvests: [] };
  ledger.sessions['claude:cccccccc'] = { repoRoot: path.join(base, 'deleted'), harvests: [] };
  Ledger.save(ledger, env.MOMENTRY_CACHE);
  assert.equal(Projects.read(env), null);
  const list = Projects.load({ ...env, MOMENTRY_REPOS: c });
  assert.deepEqual(Object.keys(list.projects).sort(), [a, b, c].sort());
  assert.equal(list.projects[a].name, 'alpha');
  assert.ok(fs.existsSync(file));
  if (process.platform !== 'win32') assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  // removed later: not brought back from the ledger
  assert.equal(Projects.forget(env, b), true);
  assert.equal(Projects.forget(env, b), false);
  assert.deepEqual(Object.keys(Projects.load(env).projects).sort(), [a, c].sort());
  assert.deepEqual(Object.keys(onDisk().projects).sort(), [a, c].sort());
});

test('remember adds a project and writes only when something changed; a broken file is reported, not replaced', () => {
  const { env, repo, file, onDisk } = sandbox();
  const a = repo('alpha');
  Projects.remember(env, a, { name: 'alpha' });
  const first = onDisk();
  assert.equal(first.projects[a].name, 'alpha');
  assert.match(first.projects[a].added, /^\d{4}-\d\d-\d\dT/);
  const mtime = fs.statSync(file).mtimeMs;
  Projects.remember(env, a, { name: 'alpha' });
  assert.equal(fs.statSync(file).mtimeMs, mtime, 'unchanged entry: no write');
  Projects.remember(env, a, { name: 'renamed' });
  assert.equal(onDisk().projects[a].name, 'renamed');
  assert.equal(onDisk().projects[a].added, first.projects[a].added);
  fs.writeFileSync(file, '{broken');
  assert.throws(() => Projects.remember(env, a), /danh sách dự án hỏng/);
  assert.equal(fs.readFileSync(file, 'utf8'), '{broken');
  assert.throws(() => loadConfig({ cwd: a, env }), /danh sách dự án hỏng/);
});

test('a story folder chosen for this machine wins over the repo file; env and flags still win over it', () => {
  const { env, base, repo } = sandbox();
  const a = repo('alpha');
  fs.writeFileSync(path.join(a, '.momentry.json'), '{"box":"notes"}\n');
  assert.equal(loadConfig({ cwd: a, env }).box, path.join(a, 'notes'));
  const outside = path.join(base, 'stories', 'alpha');
  Projects.setBox(env, a, outside);
  assert.equal(Projects.boxOf(env, a), outside);
  assert.equal(loadConfig({ cwd: path.join(a), env }).box, outside);
  assert.equal(show({ cwd: a, env }).values.box.source, 'dự án trên máy này');
  assert.equal(loadConfig({ cwd: a, env: { ...env, MOMENTRY_BOX: 'env-box' } }).box, path.join(a, 'env-box'));
  assert.equal(loadConfig({ cwd: a, env, flags: { box: 'flag-box' } }).box, path.join(a, 'flag-box'));
  Projects.setBox(env, a, null);
  assert.equal(loadConfig({ cwd: a, env }).box, path.join(a, 'notes'));
  assert.throws(() => Projects.setBox(env, a, 'relative'), /absolute/);
});

test('init puts the repo on the list and creates the story folder chosen for this machine', () => {
  const { env, base, repo, onDisk } = sandbox();
  const a = repo('alpha', { on: false });
  const e = { ...env, PATH: `${FAKE_CLAUDE}${path.delimiter}${env.PATH}` };
  const dry = run(['init', '--no-connect', '--dry-run'], { cwd: a, env: e });
  assert.equal(dry.status, 0, dry.stderr);
  assert.equal(fs.existsSync(Projects.listFile(env)), false, 'dry run writes nothing');
  run(['init', '--no-connect'], { cwd: a, env: e });
  assert.equal(onDisk().projects[a].name, 'alpha');
  // a repo already observed before the list existed joins it on its next init
  const b = repo('beta');
  const outside = path.join(base, 'stories', 'beta');
  Projects.setBox(env, b, outside);
  run(['init', '--no-connect'], { cwd: b, env: e });
  assert.ok(fs.existsSync(outside), 'story folder made where the list says');
  assert.deepEqual(Object.keys(onDisk().projects).sort(), [a, b].sort());
});

test('the first hook run in an observed repo puts it on the list (through the scan it starts)', () => {
  const { env, repo, onDisk } = sandbox();
  const a = repo('alpha');
  const spawned = [];
  // runs the command the hook would start in the background, here and now
  const spawn = (cmd, args, opts) => {
    spawned.push(args);
    const r = spawnSync(cmd, args, { cwd: opts.cwd, env: opts.env, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    return { on() {}, unref() {} };
  };
  const r = handleHook('session-start', JSON.stringify({ session_id: 'deadbeef-0000', cwd: a }), {}, { env, spawn });
  assert.equal(r.spawned, true);
  assert.equal(spawned[0][1], 'scan');
  assert.equal(onDisk().projects[a].name, 'alpha');
  // a repo that is not observed is not added
  const b = repo('beta', { on: false });
  assert.equal(handleHook('session-start', JSON.stringify({ cwd: b }), {}, { env, spawn }).spawned, false);
  assert.equal(onDisk().projects[b], undefined);
  // a dry run does not add
  const c = repo('gamma');
  const dry = run(['scan', '--dry-run', '--claude'], { cwd: c, env });
  assert.equal(dry.status, 0, dry.stderr);
  assert.equal(onDisk().projects[c], undefined);
});

test('UI: projects come from the list (older installs from the ledger), plus the repo the UI started in', () => {
  const { env, base, repo } = sandbox();
  const a = repo('alpha');
  const b = repo('beta', { on: false });
  const ledger = Ledger.load(env.MOMENTRY_CACHE);
  ledger.sessions['claude:aaaaaaaa'] = { repoRoot: a, harvests: [] };
  Ledger.save(ledger, env.MOMENTRY_CACHE);
  const ctx = { env, cwd: b };
  let list = A.listProjects(ctx);
  assert.deepEqual(list.map((p) => [p.name, p.observed, p.missing]), [['alpha', true, false], ['beta', false, false]]);
  assert.deepEqual(Object.keys(Projects.read(env).projects), [a], 'the repo the UI started in is shown, not listed');
  // a session in a new repo after the list exists: shown only once it is listed (by init, the UI or the hook)
  const c = repo('gamma');
  ledger.sessions['claude:cccccccc'] = { repoRoot: c, harvests: [] };
  Ledger.save(ledger, env.MOMENTRY_CACHE);
  assert.equal(A.listProjects(ctx).some((p) => p.root === c), false);
  Projects.remember(env, c);
  assert.equal(A.listProjects(ctx).some((p) => p.root === c), true);
  // MOMENTRY_REPOS still shows its repos
  const d = repo('delta', { on: false });
  list = A.listProjects({ env: { ...env, MOMENTRY_REPOS: d }, cwd: b });
  assert.equal(list.find((p) => p.root === d)?.observed, true);
  void base;
});

test('UI: turning a project on lists it; a gone folder stays listed as missing and can be removed', async () => {
  const { env, base, repo } = sandbox();
  const a = repo('alpha', { on: false });
  const ctx = { env, cwd: base };
  const info = await A.turnOn(ctx, { root: a });
  assert.equal(info.observed, true);
  assert.ok(Projects.find(Projects.read(env), a));
  const b = repo('beta');
  Projects.remember(env, b);
  const outside = path.join(base, 'kept-stories');
  Projects.setBox(env, b, outside);
  fs.mkdirSync(outside);
  fs.writeFileSync(path.join(outside, '2026-11-01-x.md'), '---\nid: 2026-11-01-x\n---\n# X\n');
  fs.rmSync(b, { recursive: true });
  const list = A.listProjects(ctx);
  const gone = list.at(-1);
  assert.equal(gone.root, b, 'missing projects sort last');
  assert.equal(gone.missing, true);
  assert.equal(gone.observed, false);
  assert.equal(gone.name, 'beta');
  assert.equal(gone.box, outside);
  assert.match(gone.error, /folder of this project is gone/);
  await assert.rejects(() => A.healthView(ctx, { project: gone.id }), (e) => e.status === 409);
  assert.throws(() => A.exportProject(ctx, gone.id), (e) => e.status === 409);
  assert.throws(() => A.deleteProject(ctx, { project: gone.id, confirm: 'nope' }), /Type beta/);
  const r = A.deleteProject(ctx, { project: gone.id, confirm: 'beta' });
  assert.ok(r.removed >= 1);
  assert.equal(fs.existsSync(path.join(outside, '2026-11-01-x.md')), false);
  assert.equal(Projects.find(Projects.read(env), b), null);
  assert.equal(A.listProjects(ctx).some((p) => p.root === b), false);
  // deleting a project that is still there takes it off the list too
  const pa = A.listProjects(ctx).find((p) => p.root === a);
  A.deleteProject(ctx, { project: pa.id, confirm: 'alpha' });
  assert.equal(Projects.find(Projects.read(env), a), null);
});

test('UI settings: a story folder outside the repo stays on this machine, inside goes to the repo file', () => {
  const { env, base, repo } = sandbox();
  const a = repo('alpha');
  Projects.remember(env, a);
  const ctx = { env, cwd: a };
  const pid = A.listProjects(ctx)[0].id;
  const repoFile = () => JSON.parse(fs.readFileSync(path.join(a, '.momentry.json'), 'utf8'));
  const outside = path.join(base, 'elsewhere');
  let v = A.saveSetting(ctx, { key: 'box', value: outside, scope: 'project', project: pid });
  assert.deepEqual(repoFile(), {}, 'no path of this machine in the repo file');
  assert.equal(Projects.boxOf(env, a), outside);
  assert.deepEqual(v.projects[0].values.box, { value: outside, source: 'repo' });
  assert.throws(() => A.saveSetting(ctx, { key: 'box', value: base, scope: 'project', project: pid }), /contains it/);
  assert.equal(Projects.boxOf(env, a), outside, 'refused value changes nothing');
  v = A.saveSetting(ctx, { key: 'box', value: 'notes/stories', scope: 'project', project: pid });
  assert.deepEqual(repoFile(), { box: 'notes/stories' });
  assert.equal(Projects.boxOf(env, a), null);
  assert.equal(v.projects[0].values.box.value, 'notes/stories');
  A.saveSetting(ctx, { key: 'box', value: outside, scope: 'project', project: pid });
  // reset removes the machine choice first, then the repo file's value
  A.saveSetting(ctx, { key: 'box', value: null, scope: 'project', project: pid });
  assert.equal(Projects.boxOf(env, a), null);
  assert.deepEqual(repoFile(), { box: 'notes/stories' });
  A.saveSetting(ctx, { key: 'box', value: null, scope: 'project', project: pid });
  assert.deepEqual(repoFile(), {});
});
