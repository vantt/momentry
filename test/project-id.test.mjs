// Project identity across machines: the id comes from the repo's root commit, so one repo checked out at two paths
// is one project and two repos at one path are two; a repo without a commit keeps the path hash. Data an older
// install keyed by the path hash (taste, measures, profile) moves to the new id; the web UI keeps the checkout id.
// Real git repositories in temp dirs only; never the user's cache or config.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { stringify } from '../lib/frontmatter.mjs';
import { projectId, checkoutId, rootCommit, moveData, FILE } from '../lib/project-id.mjs';
import { profilePath, readProfile } from '../lib/project-profile.mjs';
import { storyRef } from '../lib/metrics.mjs';
import * as T from '../lib/taste.mjs';
import * as M from '../lib/metrics.mjs';
import * as A from '../lib/ui-api.mjs';

const tmp = (p) => fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), p)));
const BASE = tmp('dm-pid-');
const GIT_ENV = {
  ...process.env, HOME: path.join(BASE, 'git-home'), GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: path.join(BASE, 'gitconfig'),
  GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.invalid', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.invalid',
};
const git = (cwd, ...args) => {
  const r = spawnSync('git', args, { cwd, env: GIT_ENV, encoding: 'utf8' });
  assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
};
/** A repo at `dir` with one commit (`seed` makes its history different from another repo's). */
function repo(dir, seed = 'a') {
  fs.mkdirSync(dir, { recursive: true });
  git(dir, 'init', '-q');
  fs.writeFileSync(path.join(dir, 'README.md'), `# ${seed}\n`);
  git(dir, 'add', 'README.md');
  git(dir, 'commit', '-q', '--no-gpg-sign', '-m', `first ${seed}`);
  return dir;
}
const story = (box, id) => {
  fs.mkdirSync(box, { recursive: true });
  fs.writeFileSync(path.join(box, `${id}.md`), stringify({ id, date: id.slice(0, 10), status: 'raw', strength: 2 }, '\n# T\n'));
};
const mode = (f) => fs.statSync(f).mode & 0o777;

test('one repo at two paths has one project id; the checkout ids differ', () => {
  const a = repo(path.join(BASE, 'm1', 'work', 'app'));
  const b = path.join(BASE, 'm2', 'src', 'app-copy');
  git(BASE, 'clone', '-q', a, b);
  assert.equal(rootCommit(a), rootCommit(b));
  assert.match(projectId(a), /^[0-9a-f]{10}$/);
  assert.equal(projectId(a), projectId(b));
  assert.notEqual(checkoutId(a), checkoutId(b));
  assert.notEqual(projectId(a), checkoutId(a), 'not the path hash');
  // the id does not move with a new commit, a new remote or a renamed folder
  fs.writeFileSync(path.join(b, 'x.txt'), 'x');
  git(b, 'add', 'x.txt'); git(b, 'commit', '-q', '--no-gpg-sign', '-m', 'second');
  git(b, 'remote', 'set-url', 'origin', 'https://example.invalid/other.git');
  const moved = path.join(BASE, 'm2', 'src', 'renamed');
  fs.renameSync(b, moved);
  assert.equal(projectId(moved), projectId(a));
});

test('two repos at the same path (two machines, or a folder reused) are two projects; data is never moved between them', () => {
  const cacheA = path.join(BASE, 'same-a', 'cache'); const cacheB = path.join(BASE, 'same-b', 'cache');
  const at = path.join(BASE, 'same', 'proj');
  repo(at, 'first');
  const box = path.join(at, 'box');
  story(box, '2026-11-01-x');
  const first = projectId(at, { cacheDir: cacheA, box });
  T.note(cacheA, { project: first, key: `${first}/2026-11-01-x`, event: 'use', private: false, data: {} });
  fs.rmSync(at, { recursive: true, force: true });
  repo(at, 'second');
  story(box, '2026-11-01-x');
  const second = projectId(at, { cacheDir: cacheA, box });
  assert.notEqual(second, first);
  assert.equal(projectId(at, { cacheDir: cacheB }), second, 'another machine finds the same id for this repo');
  assert.deepEqual(T.load(cacheA).events.map((e) => e.project), [first], 'the old repo keeps its records');
});

test('a repo without a commit uses the path hash; its first commit gives the git id and its records follow', () => {
  const cache = path.join(BASE, 'fresh-cache');
  const root = path.join(BASE, 'fresh');
  fs.mkdirSync(root);
  git(root, 'init', '-q');
  assert.equal(rootCommit(root), null);
  const box = path.join(root, 'docs', 'stories');
  story(box, '2026-11-02-y');
  const before = projectId(root, { cacheDir: cache, box });
  assert.equal(before, checkoutId(root));
  M.noteStory(cache, { project: before, private: false });
  fs.writeFileSync(path.join(root, 'a.txt'), 'a');
  git(root, 'add', 'a.txt'); git(root, 'commit', '-q', '--no-gpg-sign', '-m', 'one');
  const after = projectId(root, { cacheDir: cache, box });
  assert.notEqual(after, before);
  assert.deepEqual(Object.keys(M.load(cache).firstStories), [after]);
  // a folder that is not a repository, or a shallow clone, falls back too
  assert.equal(projectId(path.join(BASE, 'nowhere')), checkoutId(path.join(BASE, 'nowhere')));
  const src = repo(path.join(BASE, 'deep'), 'deep');
  fs.writeFileSync(path.join(src, 'b.txt'), 'b'); git(src, 'add', 'b.txt'); git(src, 'commit', '-q', '--no-gpg-sign', '-m', 'two');
  const shallow = path.join(BASE, 'shallow');
  git(BASE, 'clone', '-q', '--depth', '1', `file://${src}`, shallow);
  assert.equal(projectId(shallow), checkoutId(shallow), 'a shallow clone does not have the root commit');
});

test('an older install\'s taste, measures and profile move to the new id, once, keeping 0600; nothing is lost', () => {
  const cache = path.join(BASE, 'old-cache');
  const root = repo(path.join(BASE, 'old', 'proj'), 'old');
  const box = path.join(root, 'docs', 'storytelling-material');
  const ids = ['2026-11-01-a', '2026-11-02-b'];
  for (const id of ids) story(box, id);
  const old = checkoutId(root);
  // what an older install wrote: everything under the path hash, plus another project's records
  T.note(cache, { project: old, key: `${old}/${ids[0]}`, event: 'use', rank: 1, of: 2, private: false, data: {} });
  T.note(cache, { project: old, key: `${old}/2026-10-01-gone`, event: 'drop', private: false, data: {} });
  T.note(cache, { project: 'ffffffffff', key: 'ffffffffff/2026-11-01-a', event: 'later', private: true, data: {} });
  M.noteStory(cache, { project: old, private: false, now: new Date('2026-11-01T00:00:00Z') });
  M.noteMark(cache, { project: old, key: `${old}/${ids[1]}`, state: 'use', rank: 2, of: 2, private: false });
  const legacyProfile = path.join(cache, 'profiles', `proj-${old}.md`);
  fs.mkdirSync(path.dirname(legacyProfile), { recursive: true });
  fs.writeFileSync(legacyProfile, 'Hồ sơ tôi tự viết.\n', { mode: 0o600 });

  const pid = projectId(root, { cacheDir: cache, box });
  assert.notEqual(pid, old);
  const ev = T.load(cache).events;
  assert.deepEqual(ev.map((e) => e.project), [pid, pid, 'ffffffffff']);
  assert.equal(ev[0].story, storyRef(`${pid}/${ids[0]}`));
  assert.equal(ev[1].story, storyRef(`${old}/2026-10-01-gone`), 'a story no longer in the box keeps its own ref');
  assert.equal(ev[2].story, storyRef('ffffffffff/2026-11-01-a'), 'another project is untouched');
  const m = M.load(cache);
  assert.deepEqual(Object.keys(m.firstStories), [pid]);
  assert.equal(m.firstStories[pid].at, '2026-11-01T00:00:00.000Z');
  assert.deepEqual(m.marks.map((x) => [x.project, x.story]), [[pid, storyRef(`${pid}/${ids[1]}`)]]);
  if (process.platform !== 'win32') {
    for (const f of [T.FILE, M.FILE, FILE]) assert.equal(mode(path.join(cache, f)), 0o600, f);
  }
  // the profile keeps its (hand-written) text under the new name
  const file = profilePath(cache, root);
  assert.equal(path.basename(file), `proj-${pid}.md`);
  assert.equal(fs.existsSync(legacyProfile), false);
  assert.deepEqual([readProfile(file).text, readProfile(file).edited], ['Hồ sơ tôi tự viết.', true]);
  // measures read the same as before the move
  assert.equal(T.measures(T.load(cache), { project: pid }).decisions.used, 1);
  // a second call, or the move run again, changes nothing
  const snap = [T.FILE, M.FILE].map((f) => fs.readFileSync(path.join(cache, f), 'utf8'));
  assert.equal(projectId(root, { cacheDir: cache, box }), pid);
  assert.deepEqual(moveData(cache, old, pid, box), { taste: 0, metrics: 0 });
  assert.deepEqual([T.FILE, M.FILE].map((f) => fs.readFileSync(path.join(cache, f), 'utf8')), snap);
});

test('the id is kept per root: later calls need no git, a re-cloned folder is looked up again', () => {
  const cache = path.join(BASE, 'kept-cache');
  const root = repo(path.join(BASE, 'kept'), 'kept');
  const box = path.join(root, 'box');
  const t0 = process.hrtime.bigint();
  const pid = projectId(root, { cacheDir: cache, box });
  const first = Number(process.hrtime.bigint() - t0) / 1e6;
  const saved = process.env.PATH;
  process.env.PATH = path.join(BASE, 'no-git-here');
  try {
    const t1 = process.hrtime.bigint();
    assert.equal(projectId(root, { cacheDir: cache, box }), pid, 'answered from the kept id, without git');
    const kept = Number(process.hrtime.bigint() - t1) / 1e6;
    assert.ok(kept < first, `kept ${kept}ms, first ${first}ms`);
    assert.equal(projectId(root, { cacheDir: cache }), pid);
    // the folder is gone (moved away): the last id known
    fs.renameSync(root, `${root}-away`);
    assert.equal(projectId(root, { cacheDir: cache }), pid);
  } finally { process.env.PATH = saved; }
  // a new repository at the same path has a new .git: looked up again
  repo(root, 'other');
  assert.notEqual(projectId(root, { cacheDir: cache, box }), pid);
});

test('web UI: links keep the checkout id; taste and decisions are recorded under the project id', () => {
  const base = tmp('dm-pid-ui-');
  const root = repo(path.join(base, 'proj'), 'ui');
  const box = path.join(root, 'docs', 'storytelling-material');
  fs.writeFileSync(path.join(root, '.momentry.json'), '{}\n');
  story(box, '2026-11-03-c');
  const env = { HOME: path.join(base, 'home'), MOMENTRY_CONFIG: path.join(base, 'config', 'config.json'), MOMENTRY_CACHE: path.join(base, 'cache'), XDG_CONFIG_HOME: path.join(base, 'config-home') };
  const ctx = { env, cwd: root };
  const [p] = A.listProjects(ctx);
  assert.equal(p.id, checkoutId(root), 'the same id as before: older links still open');
  const key = `${p.id}/2026-11-03-c`;
  A.markStory(ctx, key, 'use');
  A.getStory(ctx, key);
  assert.ok(A.loadState(env).seen[key], 'per-viewer state stays under the checkout id');
  const pid = projectId(root);
  const ev = T.load(env.MOMENTRY_CACHE).events;
  assert.deepEqual(ev.map((e) => [e.project, e.story, e.event]), [[pid, storyRef(`${pid}/2026-11-03-c`), 'use']]);
  assert.deepEqual(M.load(env.MOMENTRY_CACHE).marks.map((x) => x.project), [pid]);
});
