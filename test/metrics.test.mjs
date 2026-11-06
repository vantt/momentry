import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { stringify } from '../lib/frontmatter.mjs';
import * as M from '../lib/metrics.mjs';
import * as A from '../lib/ui-api.mjs';
import * as Q from '../lib/quarantine.mjs';
import { projectId } from '../lib/projects.mjs';
import { loadConfig } from '../lib/config.mjs';
import { noteFirstStory } from '../lib/pipeline.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(HERE, '..');
const BIN = path.join(SRC, 'bin', 'momentry.mjs');
const BODY = '\n# Cache cũ\n\n**Bối cảnh:** API chậm.\n**Chuyện gì xảy ra:** Đổi Map sang LRU.\n**Bài học:** Đo trước.\n';

function sandbox() {
  const base = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'dm-metrics-')));
  const env = {
    PATH: process.env.PATH, HOME: path.join(base, 'home'), USERPROFILE: path.join(base, 'home'),
    MOMENTRY_CACHE: path.join(base, 'cache'), MOMENTRY_CONFIG: path.join(base, 'config', 'config.json'), XDG_CONFIG_HOME: path.join(base, 'config-home'),
  };
  const cache = env.MOMENTRY_CACHE;
  const onDisk = () => JSON.parse(fs.readFileSync(path.join(cache, M.FILE), 'utf8'));
  /** A git repo with an observed project and stories of falling strength (first one ranks highest). */
  const project = (name, n = 0) => {
    const root = path.join(base, name);
    const box = path.join(root, 'docs', 'storytelling-material');
    fs.mkdirSync(path.join(root, '.git'), { recursive: true });
    fs.mkdirSync(box, { recursive: true });
    fs.writeFileSync(path.join(root, '.momentry.json'), '{}\n');
    const ids = [];
    for (let i = 0; i < n; i++) {
      const id = `2026-11-${String(i + 1).padStart(2, '0')}-${name}-s${i}`;
      const strong = Math.max(0, 3 - Math.floor(i / 3));
      fs.writeFileSync(path.join(box, `${id}.md`), stringify({ id, date: id.slice(0, 10), status: 'raw', tension: 'nho_ma_to', stakes: strong, strength: strong, hits: n - i }, BODY));
      ids.push(id);
    }
    return { root, box, ids, ctx: { env, cwd: root } };
  };
  const userConfig = (v) => { fs.mkdirSync(path.dirname(env.MOMENTRY_CONFIG), { recursive: true }); fs.writeFileSync(env.MOMENTRY_CONFIG, JSON.stringify(v)); };
  return { base, env, cache, onDisk, project, userConfig };
}

const at = (iso) => new Date(iso);

test('install time: a fresh machine gets a known time, once; later calls keep it', () => {
  const { env, cache, onDisk } = sandbox();
  const first = M.noteInstall(env, { fresh: true, via: 'install', now: at('2026-11-01T10:00:00Z') });
  assert.deepEqual(first, { at: '2026-11-01T10:00:00.000Z', known: true, via: 'install', noted: '2026-11-01T10:00:00.000Z' });
  M.noteInstall(env, { fresh: true, via: 'init', now: at('2026-11-03T10:00:00Z') });
  assert.equal(onDisk().install.at, '2026-11-01T10:00:00.000Z');
  if (process.platform !== 'win32') assert.equal(fs.statSync(path.join(cache, M.FILE)).mode & 0o777, 0o600);
});

test('install time: a machine that used momentry before measuring is unknown, not invented', () => {
  const a = sandbox();
  fs.mkdirSync(a.cache, { recursive: true });
  fs.writeFileSync(path.join(a.cache, 'ledger.json'), '{"version":1,"sessions":{}}\n');
  const r = M.noteInstall(a.env, { fresh: true, via: 'init', now: at('2026-11-05T10:00:00Z') });
  assert.equal(r.known, false);
  assert.equal(r.at, null);
  // an update of an older install (marker already there) is unknown even with an empty cache
  const b = sandbox();
  assert.equal(M.noteInstall(b.env, { fresh: false, via: 'install' }).known, false);
  M.noteStory(b.cache, { project: '0123456789', private: false, capturedBy: 'harvest' });
  const m = M.measures(M.load(b.cache));
  assert.equal(m.firstStory.state, 'unknown');
  assert.equal(m.firstStory.seconds, null);
});

test('time to first story: earliest story found by momentry; typed notes do not count; waiting before', () => {
  const { env, cache } = sandbox();
  M.noteInstall(env, { fresh: true, via: 'install', now: at('2026-11-01T10:00:00Z') });
  assert.equal(M.measures(M.load(cache)).firstStory.state, 'waiting');
  M.noteStory(cache, { project: 'aaaaaaaaaa', private: false, capturedBy: 'human', now: at('2026-11-01T10:05:00Z') });
  assert.equal(M.measures(M.load(cache)).firstStory.state, 'waiting', 'a note typed by hand is not a found story');
  M.noteStory(cache, { project: 'aaaaaaaaaa', private: false, capturedBy: 'harvest', now: at('2026-11-01T11:30:00Z') });
  M.noteStory(cache, { project: 'aaaaaaaaaa', private: false, capturedBy: 'harvest', now: at('2026-11-01T12:00:00Z') });
  M.noteStory(cache, { project: 'bbbbbbbbbb', private: true, capturedBy: 'live', now: at('2026-11-01T10:20:00Z') });
  const local = M.measures(M.load(cache));
  assert.deepEqual(local.firstStory, { state: 'measured', at: '2026-11-01T10:20:00.000Z', seconds: 20 * 60 });
  const shared = M.measures(M.load(cache), { excludePrivate: true });
  assert.equal(shared.firstStory.seconds, 90 * 60, 'the private project is left out');
  assert.equal(M.measures(M.load(cache), { excludePrivate: true, privateProjects: ['aaaaaaaaaa'] }).firstStory.state, 'waiting', 'a project in private mode now is left out too');
});

test('the pipeline and a released held story note the first story of their project', () => {
  const { env, cache, project, userConfig } = sandbox();
  const p = project('alpha');
  const names = path.join(p.root, '..', 'names.txt');
  fs.writeFileSync(names, 'Trần Thị Bích Ngọc\n');
  userConfig({ privacy: { sources: [{ type: 'lines', path: names }], privateProjects: [p.root] } });
  const cfg = loadConfig({ cwd: p.root, env });
  noteFirstStory(cfg, 'harvest');
  const m = M.load(cache);
  assert.deepEqual(Object.keys(m.firstStories), [projectId(p.root)]);
  assert.equal(m.firstStories[projectId(p.root)].private, true);

  const q = project('beta');
  const qcfg = loadConfig({ cwd: q.root, env });
  Q.put(qcfg.repo, { id: '2026-11-04-held', data: { date: '2026-11-04', status: 'raw', captured_by: 'harvest' }, body: BODY }, 'unchecked', { cacheDir: qcfg.cacheDir });
  const [held] = Q.list(qcfg.repo, { cacheDir: qcfg.cacheDir });
  const r = A.releaseHeld(q.ctx, { project: projectId(q.root), id: held.id });
  assert.equal(r.released, true, r.message);
  assert.ok(M.load(cache).firstStories[projectId(q.root)], 'release counts as the story arriving');
});

test('a decision records the rank the story had on the default wall, before the change', () => {
  const { cache, project } = sandbox();
  const p = project('alpha', 4);
  const wall = A.listStories(p.ctx);
  assert.deepEqual(wall.map((c) => c.id), p.ids, 'stories rank in the order they were made');
  const key = (i) => wall[i].key;

  A.markStory(p.ctx, key(1), 'use');
  A.markStory(p.ctx, key(0), 'drop');
  A.markStory(p.ctx, key(3), 'later');
  A.markStory(p.ctx, key(3), 'later'); // no change: not recorded again
  A.markStory(p.ctx, key(1), 'drafted'); // still Use: not recorded again
  A.markStory(p.ctx, key(2), 'use'); // the dropped story is hidden, so this one shows as #2
  const marks = M.load(cache).marks;
  assert.deepEqual(marks.map((x) => [x.state, x.rank, x.of]), [['use', 2, 4], ['drop', 1, 4], ['later', 3, 3], ['use', 2, 3]]);
  assert.equal(marks[0].project, projectId(p.root));
  assert.equal(marks[0].story, M.storyRef(key(1)));
  const text = fs.readFileSync(path.join(cache, M.FILE), 'utf8');
  assert.ok(!text.includes('alpha') && !text.includes(p.root), 'no story id, title or path on record');

  // Undo puts the story back to undecided; the latest decision of a story is the one that counts
  A.markStory(p.ctx, key(2), 'restore');
  const t = M.measures(M.load(cache)).top5;
  assert.deepEqual([t.use, t.later, t.drop, t.decided], [1, 1, 1, 3]);
  assert.equal(t.enough, false);
  assert.equal(t.rate, null);
});

test('the CLI mark goes through the same record', () => {
  const { env, cache, project } = sandbox();
  const p = project('alpha', 2);
  const r = spawnSync(process.execPath, [BIN, 'mark', p.ids[1], 'use', '--json'], { cwd: p.root, env, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.deepEqual(M.load(cache).marks.map((x) => [x.state, x.rank]), [['use', 2]]);
  const dry = spawnSync(process.execPath, [BIN, 'mark', p.ids[0], 'drop', '--dry-run', '--json'], { cwd: p.root, env, encoding: 'utf8' });
  assert.equal(dry.status, 0);
  assert.equal(M.load(cache).marks.length, 1, 'a dry run records nothing');
});

test('top-5 Use rate: only stories decided while in the top 5, shown from the threshold on', () => {
  const m = { version: 1, install: null, firstStories: {}, marks: [] };
  const add = (i, state, rank, priv = false, project = 'aaaaaaaaaa') => m.marks.push({ at: `2026-11-05T10:${String(i).padStart(2, '0')}:00.000Z`, project, story: `s${i}`, state, rank, of: 20, private: priv });
  for (let i = 0; i < 6; i++) add(i, 'use', 1 + (i % 5));
  add(6, 'drop', 3); add(7, 'later', 5); add(8, 'drop', 6); add(9, 'use', 12);
  add(10, 'drop', 2);
  let t = M.measures(m).top5;
  assert.deepEqual([t.use, t.later, t.drop, t.decided, t.enough, t.rate], [6, 1, 2, 9, false, null]);
  add(11, 'use', 4, true, 'bbbbbbbbbb');
  t = M.measures(m).top5;
  assert.deepEqual([t.decided, t.enough, t.rate], [10, true, 0.7]);
  const shared = M.measures(m, { excludePrivate: true }).top5;
  assert.deepEqual([shared.decided, shared.enough, shared.rate], [9, false, null], 'private-mode decisions are left out of a shareable number');
  assert.equal(M.measures(m, { excludePrivate: true, privateProjects: ['aaaaaaaaaa'] }).top5.decided, 0);
});

test('the record stays small: oldest decisions go first; a broken file reads as empty', () => {
  const { cache } = sandbox();
  for (let i = 0; i < M.MAX_MARKS + 5; i++) M.noteMark(cache, { project: 'aaaaaaaaaa', key: `k${i}`, state: 'use', rank: 1, of: 1, private: false, now: new Date(Date.UTC(2026, 10, 5, 0, 0, i)) });
  const marks = M.load(cache).marks;
  assert.equal(marks.length, M.MAX_MARKS);
  assert.equal(marks[0].story, M.storyRef('k5'));
  assert.throws(() => M.noteMark(cache, { project: 'aaaaaaaaaa', key: 'x', state: 'maybe', rank: 1, of: 1, private: false }), /unknown decision/);
  fs.writeFileSync(path.join(cache, M.FILE), '{not json');
  assert.deepEqual(M.load(cache), { version: 1, install: null, firstStories: {}, marks: [] });
});

test('the numbers reach the Cost screen and status --json', () => {
  const { env, project } = sandbox();
  const p = project('alpha', 1);
  M.noteInstall(env, { fresh: true, via: 'init', now: at('2026-11-01T10:00:00Z') });
  const c = A.costView(p.ctx);
  assert.equal(c.measures.firstStory.state, 'waiting');
  assert.equal(c.measures.top5.needed, M.MIN_TOP5);
  const r = spawnSync(process.execPath, [BIN, 'status', '--json'], { cwd: p.root, env, encoding: 'utf8' });
  const j = JSON.parse(r.stdout);
  assert.equal(j.data.measures.install.known, true);
  assert.equal(j.data.measures.top5.decided, 0);
});

test('init records the install time on a new machine; an installed copy records it on first activation only', () => {
  const s = sandbox();
  const p = s.project('alpha');
  spawnSync(process.execPath, [BIN, 'init', '--no-connect'], { cwd: p.root, env: s.env, encoding: 'utf8' });
  assert.equal(s.onDisk().install.known, true);
  assert.equal(s.onDisk().install.via, 'init');

  // a copy laid out as install.sh does, activated fresh, then an older install updated
  const fresh = sandbox();
  const copy = (home) => {
    const dest = path.join(home, 'versions', 'v0.0.0-test');
    for (const d of ['bin', 'lib', 'prompts', 'rules', 'ui']) fs.cpSync(path.join(SRC, d), path.join(dest, d), { recursive: true });
    return path.join(dest, 'bin', 'momentry.mjs');
  };
  const activate = (sb, home) => spawnSync(process.execPath, [copy(home), '_activate', '--json'], { env: { ...sb.env, MOMENTRY_HOME: home, MOMENTRY_INSTALL_DIR: path.join(sb.base, 'bin') }, encoding: 'utf8' });
  let r = activate(fresh, path.join(fresh.base, 'app'));
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(fresh.onDisk().install.known, true);
  assert.equal(fresh.onDisk().install.via, 'install');

  const old = sandbox();
  const home = path.join(old.base, 'app');
  fs.mkdirSync(home, { recursive: true });
  fs.writeFileSync(path.join(home, '.momentry-managed'), '{"version":"0.1.0"}\n');
  r = activate(old, home);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.deepEqual([old.onDisk().install.known, old.onDisk().install.at], [false, null]);
});

test('a story written by the pipeline notes the first story; a note typed by hand does not', () => {
  const { env, cache, project, userConfig } = sandbox();
  const p = project('alpha');
  const names = path.join(p.root, '..', 'names.txt');
  fs.writeFileSync(names, 'Trần Thị Bích Ngọc\n');
  userConfig({ privacy: { sources: [{ type: 'lines', path: names }] } });
  const add = (by) => spawnSync(process.execPath, [BIN, 'add', '--title', `Cache ${by}`, '--note', 'p95 xuống 90ms', '--by', by, '--json'], { cwd: p.root, env, encoding: 'utf8' });
  let r = add('human');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.deepEqual(M.load(cache).firstStories, {});
  r = add('live');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.deepEqual(Object.keys(M.load(cache).firstStories), [projectId(p.root)]);
});
