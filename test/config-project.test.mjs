// `momentry config … --project`: every per-project setting goes through the config command, with the writers the web
// UI uses, so both see the same values and hold the same rules. Temp HOME, config and cache only.
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
import { runConfig, write, MACHINE, PROJECT_KEYS } from '../lib/config-cmd.mjs';

const BIN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../bin/momentry.mjs');

function world({ observed = true } = {}) {
  const base = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'dm-cfg-project-')));
  const repo = path.join(base, 'repo');
  fs.mkdirSync(path.join(repo, '.git'), { recursive: true });
  const repoFile = path.join(repo, '.momentry.json');
  if (observed) fs.writeFileSync(repoFile, '{}\n');
  const home = path.join(base, 'home');
  fs.mkdirSync(home);
  const env = {
    PATH: process.env.PATH, HOME: home, USERPROFILE: home, APPDATA: path.join(base, 'appdata'), XDG_CONFIG_HOME: path.join(base, 'config-home'),
    MOMENTRY_CACHE: path.join(base, 'cache'), MOMENTRY_CONFIG: path.join(base, 'config', 'config.json'),
  };
  const cfg = (args, o = {}) => runConfig(args, { cwd: repo, env, project: true, ...o });
  const run = (args, { cwd = repo } = {}) => {
    const r = spawnSync(process.execPath, [BIN, ...args], { cwd, env, encoding: 'utf8' });
    return { code: r.status, out: r.stdout, err: r.stderr, json: () => JSON.parse(r.stdout) };
  };
  const repoJson = () => JSON.parse(fs.readFileSync(repoFile, 'utf8'));
  const userJson = () => { try { return JSON.parse(fs.readFileSync(env.MOMENTRY_CONFIG, 'utf8')); } catch { return {}; } };
  const entry = () => Projects.find(Projects.read(env), repo);
  const ctx = { env, cwd: repo };
  const uiProject = () => A.settingsView(ctx).projects.find((p) => p.root === repo);
  return { base, repo, repoFile, home, env, cfg, run, repoJson, userJson, entry, ctx, uiProject };
}

test('show --project lists every per-project setting with its value and where it comes from', () => {
  const w = world();
  const s = w.cfg(['show']).data;
  assert.equal(s.root, w.repo);
  assert.deepEqual(Object.keys(s.values), PROJECT_KEYS);
  assert.deepEqual(s.values.box, { value: path.join(w.repo, 'docs', 'storytelling-material'), source: 'mặc định' });
  assert.deepEqual(s.values.repo, { value: 'repo', source: 'mặc định' });
  assert.deepEqual(s.values['budget.dailyUsd'], { value: 3, source: 'mặc định, chung mọi dự án' });
  assert.deepEqual(s.values.private, { value: false, source: 'mặc định' });
  assert.deepEqual(s.values.paused, { value: false, source: 'mặc định' });
  assert.deepEqual(s.files, { repo: w.repoFile, machine: Projects.listFile(w.env), user: w.env.MOMENTRY_CONFIG });

  // a general value set by the user shows as such
  runConfig(['set', 'budget.dailyUsd', '5'], { cwd: w.repo, env: w.env });
  assert.deepEqual(w.cfg(['get', 'budget.dailyUsd']).data, { root: w.repo, key: 'budget.dailyUsd', value: 5, source: 'người dùng, chung mọi dự án' });

  // CLI: JSON envelope, text lines with the source, --repo from another folder
  const r = w.run(['config', 'show', '--project', '--json', '--repo', w.repo], { cwd: w.base });
  assert.equal(r.code, 0, r.err);
  assert.equal(r.json().ok, true);
  assert.equal(r.json().data.values.paused.source, 'mặc định');
  const text = w.run(['config', 'show', '--project']).out;
  assert.match(text, /^budget\.dailyUsd\s+5\s+\(người dùng, chung mọi dự án\)$/m);
  assert.match(text, /^# dự án /m);
});

test('box outside the repo stays on this machine; inside it goes to the repo file; the UI sees the same', () => {
  const w = world();
  const outside = path.join(w.home, 'Documents', 'momentry-chuyen');

  let r = w.cfg(['set', 'box', outside], { dryRun: true }).data;
  assert.equal(r.dryRun, true);
  assert.equal(r.where, 'machine');
  assert.equal(Projects.read(w.env), null, 'dry run writes nothing');

  r = w.cfg(['set', 'box', '~/Documents/momentry-chuyen']).data;
  assert.deepEqual({ value: r.value, where: r.where, changed: r.changed, file: r.file }, { value: outside, where: 'machine', changed: true, file: Projects.listFile(w.env) });
  assert.equal(w.entry().box, outside);
  assert.deepEqual(w.repoJson(), {}, 'a path of this machine never goes into the repo file');
  assert.deepEqual(w.cfg(['get', 'box']).data, { root: w.repo, key: 'box', value: outside, source: MACHINE });
  assert.equal(loadConfig({ cwd: w.repo, env: w.env }).box, outside);
  assert.equal(w.uiProject().box, outside);
  assert.equal(w.cfg(['set', 'box', outside]).data.changed, false, 'setting the same folder again changes nothing');

  // inside the repo: relative in the repo file, and the machine's folder is dropped
  r = w.cfg(['set', 'box', path.join(w.repo, 'notes', 'chuyen')]).data;
  assert.equal(r.where, 'repo');
  assert.deepEqual(w.repoJson(), { box: 'notes/chuyen' });
  assert.equal(w.entry().box, undefined);
  assert.deepEqual(w.cfg(['get', 'box']).data.source, 'repo');
  assert.equal(w.uiProject().values.box.value, 'notes/chuyen');

  // the UI writes, the CLI reads
  A.saveSetting(w.ctx, { key: 'box', value: outside, scope: 'project', project: w.uiProject().id });
  assert.deepEqual(w.cfg(['get', 'box']).data, { root: w.repo, key: 'box', value: outside, source: MACHINE });

  // unset removes the most specific setting first
  w.cfg(['unset', 'box']);
  assert.equal(w.cfg(['get', 'box']).data.value, path.join(w.repo, 'notes', 'chuyen'));
  w.cfg(['unset', 'box']);
  assert.deepEqual(w.repoJson(), {});
  assert.equal(w.cfg(['get', 'box']).data.source, 'mặc định');
  assert.equal(w.cfg(['unset', 'box']).data.changed, false);
});

test('box refusals: the repo itself, a folder above it, . and ..; nothing is written', () => {
  const w = world();
  for (const bad of ['.', '..', '../elsewhere', w.repo, w.base, './']) {
    assert.throws(() => w.cfg(['set', 'box', bad]), (e) => e.code === 'config-invalid' && e.exitCode === 1, bad);
  }
  assert.deepEqual(w.repoJson(), {});
  assert.equal(Projects.read(w.env), null);
  const r = w.run(['config', 'set', 'box', '..', '--project', '--json']);
  assert.equal(r.code, 1);
  assert.equal(r.json().error.code, 'config-invalid');
});

test('per-project budget: user config by repo root, never the repo file; falls back to the general budget', () => {
  const w = world();
  let r = w.cfg(['set', 'budget.dailyUsd', '1.5'], { dryRun: true }).data;
  assert.equal(r.changed, true);
  assert.deepEqual(w.userJson(), {}, 'dry run writes nothing');
  r = w.cfg(['set', 'budget.dailyUsd', '1.5']).data;
  assert.equal(r.file, w.env.MOMENTRY_CONFIG);
  assert.deepEqual(w.userJson(), { budget: { projects: { [w.repo]: 1.5 } } });
  assert.deepEqual(w.repoJson(), {});
  assert.equal(loadConfig({ cwd: w.repo, env: w.env }).budget.projectUsd, 1.5);
  assert.deepEqual(w.cfg(['get', 'budget.dailyUsd']).data, { root: w.repo, key: 'budget.dailyUsd', value: 1.5, source: MACHINE });
  assert.equal(w.uiProject().budget, 1.5);

  assert.throws(() => w.cfg(['set', 'budget.dailyUsd', '-1']), (e) => e.code === 'config-invalid');
  assert.throws(() => w.cfg(['set', 'budget.dailyUsd', 'nhiều']), (e) => e.code === 'config-invalid');

  A.saveProjectBudget(w.ctx, { project: w.uiProject().id, usd: 2 });
  assert.equal(w.cfg(['get', 'budget.dailyUsd']).data.value, 2);
  w.cfg(['unset', 'budget.dailyUsd']);
  assert.deepEqual(w.userJson(), {});
  assert.equal(w.cfg(['get', 'budget.dailyUsd']).data.source, 'mặc định, chung mọi dự án');
  assert.equal(w.uiProject().budget, null);
});

test('private mode: user config only, the same switch the UI flips', () => {
  const w = world();
  w.cfg(['set', 'private', 'true']);
  assert.deepEqual(w.userJson(), { privacy: { privateProjects: [w.repo] } });
  assert.equal(loadConfig({ cwd: w.repo, env: w.env }).privateMode, true);
  assert.equal(w.uiProject().privateMode, true);
  assert.deepEqual(w.cfg(['get', 'private']).data.source, MACHINE);
  assert.equal(w.cfg(['set', 'private', '1']).data.changed, false);
  assert.throws(() => w.cfg(['set', 'private', 'maybe']), (e) => e.code === 'config-invalid');

  A.savePrivateMode(w.ctx, { project: w.uiProject().id, on: false });
  assert.deepEqual(w.cfg(['get', 'private']).data, { root: w.repo, key: 'private', value: false, source: 'mặc định' });
  w.cfg(['set', 'private', 'true']);
  w.cfg(['unset', 'private']);
  assert.deepEqual(w.userJson(), {});
});

test('paused: pause/resume are shortcuts for the same key, and the UI switch agrees', () => {
  const w = world();
  let r = w.run(['config', 'set', 'paused', 'true', '--project', '--json']);
  assert.equal(r.code, 0, r.err);
  assert.equal(r.json().data.changed, true);
  const viaConfig = w.entry();
  assert.equal(viaConfig.paused, true);
  assert.match(w.run(['pause']).out, /đã tạm dừng sẵn/, 'the shortcut sees what config set');
  assert.equal(w.uiProject().paused, true);

  r = w.run(['resume', '--json']);
  assert.equal(r.code, 0, r.err);
  assert.equal(r.json().data.changed, true);
  assert.equal(w.cfg(['get', 'paused']).data.value, false);
  assert.ok(w.entry().resumed, 'resume through the shortcut records when, like config set paused false');

  w.run(['pause']);
  assert.deepEqual(w.cfg(['get', 'paused']).data, { root: w.repo, key: 'paused', value: true, source: MACHINE });
  assert.deepEqual(w.repoJson(), {}, 'never the repo file');
  A.saveGathering(w.ctx, { project: w.uiProject().id, on: true });
  assert.equal(w.cfg(['get', 'paused']).data.value, false);
  w.cfg(['set', 'paused', 'true']);
  w.cfg(['unset', 'paused']);
  assert.equal(w.entry().paused, undefined);
});

test('repo name goes to the repo file; an unobserved repo takes only what stays on this machine', () => {
  const w = world();
  w.cfg(['set', 'repo', 'Dự án X']);
  assert.deepEqual(w.repoJson(), { repo: 'Dự án X' });
  assert.deepEqual(w.cfg(['get', 'repo']).data.source, 'repo');
  w.cfg(['unset', 'repo']);
  assert.deepEqual(w.repoJson(), {});

  const u = world({ observed: false });
  for (const [k, v] of [['repo', 'x'], ['box', 'notes'], ['paused', 'true']]) {
    assert.throws(() => u.cfg(['set', k, v]), (e) => e.code === 'not-observed' && e.fix === 'momentry init', k);
  }
  assert.equal(fs.existsSync(u.repoFile), false, 'config never turns a repo on; that is init');
  const outside = path.join(u.home, 'chuyen');
  assert.equal(u.cfg(['set', 'box', outside]).data.where, 'machine');
  assert.equal(u.cfg(['set', 'paused', 'false']).data.changed, false);
});

test('refusals: shared keys, unknown keys, other subcommands with --project, project keys without it', () => {
  const w = world();
  assert.throws(() => w.cfg(['set', 'harvest.runs', '2']), (e) => e.code === 'config-not-project' && e.exitCode === 1);
  assert.throws(() => w.cfg(['get', 'pased']), (e) => e.code === 'config-unknown-key' && /paused/.test(e.why));
  assert.throws(() => w.cfg(['path']), (e) => e.exitCode === 2);
  assert.throws(() => runConfig(['get', 'paused'], { cwd: w.repo, env: w.env }), (e) => e.code === 'config-project-only' && /--project/.test(e.fix));
  assert.throws(() => w.cfg(['show'], { cwd: w.base }), (e) => e.code === 'not-git');
  assert.equal(w.run(['config', 'default', '--project']).code, 2);
});

test('the repo file cannot set what belongs to this machine', () => {
  const w = world();
  fs.writeFileSync(w.repoFile, JSON.stringify({
    paused: true, private: true,
    budget: { dailyUsd: 100, projects: { [w.repo]: 50 } },
    privacy: { privateProjects: [w.repo] },
  }));
  const v = w.cfg(['show']).data.values;
  assert.deepEqual(v.paused, { value: false, source: 'mặc định' });
  assert.deepEqual(v.private, { value: false, source: 'mặc định' });
  assert.deepEqual(v['budget.dailyUsd'], { value: 3, source: 'mặc định, chung mọi dự án' });
  const c = loadConfig({ cwd: w.repo, env: w.env });
  assert.equal(c.budget.dailyUsd, 3, 'a cloned repo cannot raise what it may spend');
  assert.equal(c.budget.projectUsd, null);
  assert.ok(c.ignored.includes('budget.dailyUsd'));
  // and no writer puts them there
  assert.throws(() => write({ cwd: w.repo, env: w.env, key: 'budget.dailyUsd', value: '9', scope: 'project' }), (e) => e.code === 'config-user-only');
  assert.throws(() => write({ cwd: w.repo, env: w.env, key: 'paused', value: 'true', scope: 'project' }), (e) => e.code === 'config-project-only');
});
