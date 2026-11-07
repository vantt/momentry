import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { stringify } from '../lib/frontmatter.mjs';
import * as T from '../lib/taste.mjs';
import * as A from '../lib/ui-api.mjs';
import * as Q from '../lib/quarantine.mjs';
import { storyRef } from '../lib/metrics.mjs';
import { projectId } from '../lib/projects.mjs';
import { loadConfig } from '../lib/config.mjs';
import { createUiServer } from '../lib/ui-server.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BIN = path.join(path.resolve(HERE, '..'), 'bin', 'momentry.mjs');
/** Words that must never reach the taste file. */
const SECRET = ['zanzibarquokka', 'Quillfeather', 'Marrowbend', 'Ostrakon', 'Velvetine'];
const BODY = '\n# Zanzibarquokka cache\n\n**Bối cảnh:** API Quillfeather chậm.\n**Chuyện gì xảy ra:** Đổi Map sang LRU.\n**Bài học:** Đo trước.\n**Góc kể:** Marrowbend tưởng cache vô hại.\n';

function sandbox() {
  const base = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'dm-taste-')));
  const env = {
    PATH: process.env.PATH, HOME: path.join(base, 'home'), USERPROFILE: path.join(base, 'home'),
    MOMENTRY_CACHE: path.join(base, 'cache'), MOMENTRY_CONFIG: path.join(base, 'config', 'config.json'), XDG_CONFIG_HOME: path.join(base, 'config-home'),
  };
  const cache = env.MOMENTRY_CACHE;
  const file = path.join(cache, T.FILE);
  const userConfig = (v) => { fs.mkdirSync(path.dirname(env.MOMENTRY_CONFIG), { recursive: true }); fs.writeFileSync(env.MOMENTRY_CONFIG, JSON.stringify(v)); };
  /** A private name list, so edits and notes pass the privacy gate. */
  const names = (extra = {}) => {
    const list = path.join(base, 'names.txt');
    fs.writeFileSync(list, 'Trần Thị Bích Ngọc\n');
    userConfig({ privacy: { sources: [{ type: 'lines', path: list }], ...extra } });
  };
  /** An observed repo with stories of falling strength (first ranks highest), each with an angle. */
  const project = (name, n = 0, data = {}) => {
    const root = path.join(base, name);
    const box = path.join(root, 'docs', 'storytelling-material');
    fs.mkdirSync(path.join(root, '.git'), { recursive: true });
    fs.mkdirSync(box, { recursive: true });
    fs.writeFileSync(path.join(root, '.momentry.json'), '{}\n');
    const ids = [];
    for (let i = 0; i < n; i++) {
      const id = `2026-11-${String(i + 1).padStart(2, '0')}-zanzibarquokka-s${i}`;
      const strong = Math.max(0, 3 - Math.floor(i / 3));
      fs.writeFileSync(path.join(box, `${id}.md`), stringify({
        id, date: id.slice(0, 10), status: 'raw', tension: 'nho_ma_to', stakes: strong, strength: strong, hits: n - i,
        hook: 'Ostrakon hook', angle: 'Marrowbend tưởng cache vô hại', audience: 'Velvetine devs', signals: ['so_truoc_so_sau', 'Quillfeather tín hiệu'],
        hit_by: ['harvest'], captured_by: 'harvest', sessions: ['claude:1a2b3c4d'], completeness: 5, ...data,
      }, BODY));
      ids.push(id);
    }
    return { root, box, ids, ctx: { env, cwd: root }, pid: projectId(root), key: (i) => `${projectId(root)}/${ids[i]}` };
  };
  return { base, env, cache, file, names, userConfig, project };
}

const events = (cache) => T.load(cache).events;

test('snapshot: features only, mapped onto fixed lists; the rank tier comes from the rank table', () => {
  const f = T.snapshot({
    tension: 'Quillfeather tension', stakes: 3, strength: '2', hits: 4, completeness: 6, angle: 'none',
    signals: ['so_truoc_so_sau', 'Marrowbend', 'so_truoc_so_sau'], hit_by: ['outsider', 'Ostrakon'], captured_by: 'human',
    sessions: ['codex:abc', 'claude:x'], hook: 'Velvetine', title: 'zanzibarquokka',
  });
  assert.deepEqual(f, {
    tension: 'other', stakes: 3, strength: null, hits: 4, completeness: 6, outsider_only: true, has_angle: false,
    signals: ['other', 'so_truoc_so_sau'], hit_by: ['other', 'outsider'], captured_by: 'human', host: 'codex', tier: 'outsider_only_with_tension',
  });
  assert.equal(T.snapshot({ tension: 'giup_ma_hai', hit_by: ['harvest'] }).tier, 'harvested_with_tension');
  assert.equal(T.snapshot({ sessions: ['Marrowbend:1'] }).host, 'other');
  assert.equal(T.snapshot(null).tension, null);
});

test('decisions from the web UI and the CLI are recorded with rank and features, and no story text', () => {
  const { env, cache, file, project } = sandbox();
  const p = project('alpha', 4);
  A.markStory(p.ctx, p.key(1), 'use');
  A.markStory(p.ctx, p.key(0), 'drop');
  A.markStory(p.ctx, p.key(3), 'later');
  A.markStory(p.ctx, p.key(3), 'later'); // nothing changed: not recorded
  A.markStory(p.ctx, p.key(1), 'drafted'); // still used, but a later stage: recorded
  A.markStory(p.ctx, p.key(1), 'drafted'); // same stage again: not recorded
  A.markStory(p.ctx, p.key(2), 'published'); // undecided straight to published
  A.markStory(p.ctx, p.key(3), 'unlater'); // back to undecided; taste ranking is off, so the default order
  const r = spawnSync(process.execPath, [BIN, 'mark', p.ids[0], 'use', '--json'], { cwd: p.root, env, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const dry = spawnSync(process.execPath, [BIN, 'mark', p.ids[3], 'drop', '--dry-run', '--json'], { cwd: p.root, env, encoding: 'utf8' });
  assert.equal(dry.status, 0);

  const ev = events(cache);
  assert.deepEqual(ev.map((x) => [x.event, x.rank, x.of]), [
    ['use', 2, 4], ['drop', 1, 4], ['later', 3, 3], ['drafted', 1, 3], ['published', 2, 3], ['open', 3, 3], ['use', 1, 4],
  ]);
  // without taste ranking the wall is the default order, so the default place is the wall place
  assert.ok(ev.every((x) => x.base === x.rank));
  assert.equal(ev[0].project, p.pid);
  assert.equal(ev[0].story, storyRef(p.key(1)));
  assert.equal(ev[0].private, false);
  assert.deepEqual(ev[0].features, {
    tension: 'nho_ma_to', stakes: 3, strength: 3, hits: 3, completeness: 5, outsider_only: false, has_angle: true,
    signals: ['other', 'so_truoc_so_sau'], hit_by: ['harvest'], captured_by: 'harvest', host: 'claude', tier: 'harvested_with_tension',
  });
  const text = fs.readFileSync(file, 'utf8');
  for (const w of [...SECRET, p.root, 'alpha', p.ids[0]]) assert.ok(!text.toLowerCase().includes(w.toLowerCase()), `${w} leaked into the taste file`);
  if (process.platform !== 'win32') assert.equal(fs.statSync(file).mode & 0o777, 0o600);
});

test('edits of the text the model wrote are recorded with the field, only when the text changed', () => {
  const { cache, file, names, project } = sandbox();
  names();
  const p = project('alpha', 2);
  A.editStory(p.ctx, p.key(0), { title: 'Quillfeather mới hẳn' });
  A.editStory(p.ctx, p.key(0), { section: 'lesson', text: 'Ostrakon đo trước khi đổi.' });
  A.editStory(p.ctx, p.key(0), { section: 'lesson', text: 'Ostrakon đo trước khi đổi.' }); // unchanged: not recorded
  assert.deepEqual(events(cache).map((x) => [x.event, x.value, x.rank]), [['edit', 'title', 1], ['edit', 'lesson', 1]]);
  const text = fs.readFileSync(file, 'utf8');
  for (const w of SECRET) assert.ok(!text.toLowerCase().includes(w.toLowerCase()), `${w} leaked`);
});

test('angle check on the story page: kept for the page, recorded as events, taken back with null', () => {
  const { env, cache, project } = sandbox();
  const p = project('alpha', 2);
  let s = A.checkAngle(p.ctx, p.key(0), { verdict: 'tellable' });
  assert.equal(s.verdict, 'tellable');
  assert.equal(s.understood, null);
  s = A.checkAngle(p.ctx, p.key(0), { understood: 'no' });
  assert.deepEqual([s.verdict, s.understood], ['tellable', 'no']);
  s = A.checkAngle(p.ctx, p.key(0), { verdict: 'invented', understood: 'no' }); // understood unchanged: one event
  s = A.checkAngle(p.ctx, p.key(0), { verdict: null });
  assert.equal(A.getStory(p.ctx, p.key(0)).verdict, null);
  assert.equal(A.getStory(p.ctx, p.key(0)).understood, 'no');
  assert.deepEqual(events(cache).map((x) => [x.event, x.value]), [['verdict', 'tellable'], ['understood', 'no'], ['verdict', 'invented'], ['verdict', null]]);
  assert.throws(() => A.checkAngle(p.ctx, p.key(0), { verdict: 'maybe' }), /Unknown answer/);
  assert.throws(() => A.checkAngle(p.ctx, p.key(0), {}), /Pick an answer/);
  const q = project('beta', 1, { angle: 'none' });
  assert.throws(() => A.checkAngle(q.ctx, q.key(0), { verdict: 'tellable' }), (e) => e.status === 409);
  // Use / Later / seen state survives the angle check (one state file)
  A.markStory(p.ctx, p.key(1), 'later');
  A.checkAngle(p.ctx, p.key(1), { verdict: 'no-story' });
  assert.equal(A.getStory(p.ctx, p.key(1)).later, true);
  void env;
});

test('a story the user writes by hand is a missed story; one found by an agent live is not', () => {
  const { env, cache, file, names, project } = sandbox();
  names();
  const p = project('alpha');
  const add = (by, title) => spawnSync(process.execPath, [BIN, 'add', '--title', title, '--note', 'Velvetine p95 xuống 90ms', '--by', by, '--json'], { cwd: p.root, env, encoding: 'utf8' });
  assert.equal(add('human', 'Zanzibarquokka cache').status, 0);
  assert.equal(add('live', 'Ostrakon cache').status, 0);
  return A.addNote(p.ctx, { project: p.pid, title: 'Quillfeather note', note: 'Marrowbend' }).then((r) => {
    assert.equal(r.saved, true);
    const ev = events(cache);
    assert.deepEqual(ev.map((x) => [x.event, x.features.captured_by, x.rank]), [['missed', 'human', null], ['missed', 'human', null]]);
    assert.equal(ev[1].story, storyRef(r.key));
    const text = fs.readFileSync(file, 'utf8');
    for (const w of SECRET) assert.ok(!text.toLowerCase().includes(w.toLowerCase()), `${w} leaked`);
  });
});

test('a held note released to the wall is a missed story too', () => {
  const { cache, names, project } = sandbox();
  names();
  const p = project('alpha');
  const cfg = loadConfig({ cwd: p.root, env: p.ctx.env });
  Q.put(cfg.repo, { id: '2026-11-04-held', data: { date: '2026-11-04', status: 'raw', captured_by: 'human', hit_by: ['bip'] }, body: BODY }, 'unchecked', { cacheDir: cfg.cacheDir });
  const [held] = Q.list(cfg.repo, { cacheDir: cfg.cacheDir });
  assert.equal(A.releaseHeld(p.ctx, { project: p.pid, id: held.id }).released, true);
  const ev = events(cache);
  assert.deepEqual(ev.map((x) => [x.event, x.story, x.features.hit_by]), [['missed', storyRef(`${p.pid}/2026-11-04-held`), ['bip']]]);
});

test('a failed record never blocks the action', () => {
  const { cache, file, names, project } = sandbox();
  names();
  const p = project('alpha', 2);
  fs.mkdirSync(file, { recursive: true }); // the file cannot be written: a directory is in its place
  assert.equal(A.markStory(p.ctx, p.key(0), 'use').status, 'picked');
  assert.equal(A.markStory(p.ctx, p.key(0), 'published').status, 'published');
  assert.equal(A.editStory(p.ctx, p.key(0), { title: 'Mới' }).title, 'Mới');
  assert.equal(A.checkAngle(p.ctx, p.key(0), { verdict: 'tellable' }).verdict, 'tellable');
  assert.ok(fs.statSync(file).isDirectory());
  assert.deepEqual(T.load(cache), { version: T.VERSION, events: [] });
  assert.throws(() => T.note(cache, { project: 'p', key: 'k', event: 'maybe', private: false, data: {} }), /unknown taste event/);
  assert.throws(() => T.note(cache, { project: 'p', key: 'k', event: 'edit', private: false, data: {} }), /bad value/);
  assert.throws(() => T.note(cache, { project: 'p', key: 'k', event: 'use', value: 'x', private: false, data: {} }), /bad value/);
});

test('the file stays small: oldest events go first; a broken or newer file reads as empty', () => {
  const { cache, file } = sandbox();
  const at = (i) => new Date(Date.UTC(2026, 10, 5, 0, 0, i));
  const many = Array.from({ length: T.MAX_EVENTS + 4 }, (_, i) => ({ at: at(i).toISOString(), project: 'aaaaaaaaaa', story: storyRef(`k${i}`), event: 'use', rank: 1, of: 1, private: false, features: {} }));
  fs.mkdirSync(cache, { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ version: 1, events: many }));
  T.note(cache, { project: 'aaaaaaaaaa', key: `k${T.MAX_EVENTS + 4}`, event: 'use', rank: 1, of: 1, private: false, data: {}, now: at(T.MAX_EVENTS + 4) });
  const ev = events(cache);
  assert.equal(ev.at(-1).story, storyRef(`k${T.MAX_EVENTS + 4}`));
  assert.equal(ev.length, T.MAX_EVENTS);
  assert.equal(ev[0].story, storyRef('k5'));
  fs.writeFileSync(file, '{not json');
  assert.deepEqual(T.load(cache), { version: T.VERSION, events: [] });
  fs.writeFileSync(file, JSON.stringify({ version: 2, events: [] }));
  assert.deepEqual(T.load(cache).events, []);
  // a hand-edited record with text in a feature is cleaned on read
  fs.writeFileSync(file, JSON.stringify({ version: 1, events: [{ at: '2026-11-05T00:00:00Z', project: 'p', story: 's', event: 'use', features: { tension: 'Quillfeather', signals: ['Ostrakon'], tier: 'Marrowbend cache!' } }] }));
  const f = T.load(cache).events[0].features;
  assert.deepEqual([f.tension, f.signals, f.tier], ['other', ['other'], null]);
});

/** Records made by hand: `add(i, event, rank, extra)`. */
function record() {
  const t = { version: 1, events: [] };
  let n = 0;
  const add = (story, event, rank, { project = 'aaaaaaaaaa', priv = false, value = null, features = {} } = {}) => t.events.push({
    at: new Date(Date.UTC(2026, 10, 5, 0, 0, n++)).toISOString(), project, story, event, value, rank, of: 20, private: priv,
    features: { tension: null, stakes: null, strength: null, hits: null, completeness: null, outsider_only: false, has_angle: false, signals: [], hit_by: [], captured_by: null, host: null, tier: null, ...features },
  });
  return { t, add };
}

test('measures: top-5 use count and mean rank from the threshold on; drafted keeps the rank it was used at', () => {
  const { t, add } = record();
  for (let i = 0; i < 6; i++) add(`u${i}`, 'use', 1 + (i % 5), { features: { tension: 'nho_ma_to', stakes: 3, signals: ['so_truoc_so_sau'] } });
  add('u0', 'drafted', 30, { features: { tension: 'nho_ma_to', stakes: 3, signals: ['so_truoc_so_sau'] } }); // moved on to drafted: still used at rank 1
  add('d1', 'drop', 3, { features: { tension: 'giup_ma_hai', stakes: 1 } });
  add('d2', 'drop', 2, { features: { tension: 'giup_ma_hai', stakes: 0, signals: ['so_truoc_so_sau'] } });
  add('l1', 'later', 5);
  add('far', 'published', 12, { features: { tension: 'nho_ma_to', stakes: 2 } }); // used, but not from the top 5
  add('o1', 'use', 4); add('o1', 'open', 4); // undone
  add('m1', 'missed', null);
  add('u1', 'edit', 2, { value: 'title' }); add('u2', 'edit', 3, { value: 'angle' }); add('u2', 'edit', 3, { value: 'angle' });
  add('u1', 'verdict', 2, { value: 'tellable' }); add('u1', 'understood', 2, { value: 'yes' });
  let m = T.measures(t);
  assert.deepEqual([m.top5.use, m.top5.later, m.top5.drop, m.top5.decided, m.top5.missing, m.top5.enough, m.top5.rate, m.meanUsedRank], [6, 1, 2, 9, 1, false, null, null]);
  add('u6', 'use', 2, { priv: true, project: 'bbbbbbbbbb' });
  m = T.measures(t);
  assert.deepEqual([m.top5.use, m.top5.decided, m.top5.missing, m.top5.enough], [7, 10, 0, true]);
  assert.equal(m.top5.rate, 0.7);
  // used ranks: 1,2,3,4,5,1 (u0..u5), 12 (far), 2 (u6)
  assert.equal(m.meanUsedRank, (1 + 2 + 3 + 4 + 5 + 1 + 12 + 2) / 8);
  assert.deepEqual(m.decisions, { used: 8, dropped: 2, later: 1 });
  assert.deepEqual(m.features.tension, [
    { id: 'nho_ma_to', used: 7, dropped: 0 }, { id: 'giup_ma_hai', used: 0, dropped: 2 }, { id: 'unknown', used: 1, dropped: 0 },
  ]);
  assert.deepEqual(m.features.signals, [{ id: 'so_truoc_so_sau', used: 6, dropped: 1 }, { id: 'none', used: 2, dropped: 1 }]);
  assert.equal(m.features.stakes.used, (3 * 6 + 2) / 7);
  assert.equal(m.features.stakes.dropped, 0.5);
  assert.equal(m.missed, 1);
  assert.deepEqual([m.edits.total, m.edits.title, m.edits.angle], [3, 1, 2]);
  assert.deepEqual([m.verdicts.tellable, m.verdicts.understood.yes], [1, 1]);

  const shared = T.measures(t, { excludePrivate: true });
  assert.deepEqual([shared.top5.decided, shared.top5.enough, shared.meanUsedRank], [9, false, null], 'private-mode records are left out of a shareable number');
  assert.equal(T.measures(t, { excludePrivate: true, privateProjects: ['aaaaaaaaaa'] }).top5.decided, 0);
  assert.equal(T.measures(t, { project: 'bbbbbbbbbb' }).top5.decided, 1);
});

test('momentry taste prints the two numbers and the feature table; --json carries them', () => {
  const { env, cache, project } = sandbox();
  const p = project('alpha', 1);
  const run = (...a) => spawnSync(process.execPath, [BIN, 'taste', ...a], { cwd: p.root, env, encoding: 'utf8' });
  let r = run();
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Top 5: cần thêm 10 quyết định/);
  const { t, add } = record();
  for (let i = 0; i < 8; i++) add(`u${i}`, 'use', 1 + (i % 5), { project: p.pid, features: { tension: 'nho_ma_to', stakes: 3, signals: ['so_truoc_so_sau'] } });
  add('d1', 'drop', 1, { project: p.pid, features: { tension: 'giup_ma_hai', stakes: 1 } });
  add('d2', 'drop', 2, { project: p.pid, features: { tension: 'giup_ma_hai', stakes: 2 } });
  add('m1', 'missed', null, { project: p.pid });
  add('u1', 'edit', 2, { project: p.pid, value: 'title' });
  add('x1', 'use', 1, { project: 'cccccccccc' });
  fs.mkdirSync(cache, { recursive: true });
  fs.writeFileSync(path.join(cache, T.FILE), JSON.stringify(t));
  r = run();
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Top 5: bạn dùng 9\/11 chuyện đã quyết/);
  assert.match(r.stdout, /Chuyện bạn dùng nằm hạng trung bình 2,4/); // (1+2+3+4+5+1+2+3+1)/9, every project
  assert.match(r.stdout, /nhỏ mà to\s+8\s+0/);
  assert.match(r.stdout, /giúp mà hại\s+0\s+2/);
  assert.match(r.stdout, /Số trước, số sau\s+8\s+0/);
  assert.match(r.stdout, /Stakes trung bình: chuyện dùng 3,0, chuyện bỏ 1,5/);
  assert.match(r.stdout, /momentry bỏ sót\): 1/);
  assert.match(r.stdout, /sửa chữ model viết: 1 \(title 1\)/);
  const j = JSON.parse(run('--repo', p.root, '--json').stdout);
  assert.equal(j.ok, true);
  assert.equal(j.data.project, p.pid);
  assert.deepEqual([j.data.top5.use, j.data.top5.decided, j.data.top5.enough], [8, 10, true]);
  assert.equal(j.data.missed, 1);
  const bad = run('--repo', path.join(p.root, 'nope'), '--json');
  assert.equal(bad.status, 1);
  assert.equal(JSON.parse(bad.stdout).error.code, 'not-git');
});

test('Health shows the taste line once there are enough top-5 decisions, else how many more it needs', async () => {
  const { env, cache, project } = sandbox();
  const p = project('alpha', 1);
  assert.deepEqual(A.tasteLine(env), { enough: false, used: 0, decided: 0, missing: 10, meanUsedRank: null });
  const { t, add } = record();
  for (let i = 0; i < 7; i++) add(`u${i}`, 'use', 1 + (i % 5));
  add('d1', 'drop', 4); add('d2', 'later', 5);
  fs.mkdirSync(cache, { recursive: true });
  fs.writeFileSync(path.join(cache, T.FILE), JSON.stringify(t));
  assert.deepEqual(A.tasteLine(env), { enough: false, used: 7, decided: 9, missing: 1, meanUsedRank: null });
  add('d3', 'drop', 1);
  fs.writeFileSync(path.join(cache, T.FILE), JSON.stringify(t));
  const line = A.tasteLine(env);
  assert.deepEqual([line.enough, line.used, line.decided, line.missing], [true, 7, 10, 0]);
  assert.equal(line.meanUsedRank, (1 + 2 + 3 + 4 + 5 + 1 + 2) / 7);
  const h = await A.healthView(p.ctx);
  assert.deepEqual(h.taste, line);
});

function request(port, { method = 'GET', path: p, headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path: p, headers: { host: `127.0.0.1:${port}`, ...headers } }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    if (body) req.end(JSON.stringify(body)); else req.end();
  });
}

test('server: the angle-check buttons save through the API and show on the story', async () => {
  const { cache, project } = sandbox();
  const p = project('alpha', 2);
  const token = 'x'.repeat(32);
  let port = 0;
  const server = createUiServer({ env: p.ctx.env, cwd: p.ctx.cwd, token, port: () => port });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  port = server.address().port;
  try {
    const auth = { 'x-momentry-token': token, 'content-type': 'application/json' };
    const put = (body, k = p.key(0)) => request(port, { method: 'PUT', path: `/api/stories/${k}/angle-check`, headers: auth, body });
    let r = await put({ verdict: 'no-story' });
    assert.equal(r.status, 200, r.body);
    assert.equal(JSON.parse(r.body).verdict, 'no-story');
    r = await put({ understood: 'yes' });
    assert.deepEqual([JSON.parse(r.body).verdict, JSON.parse(r.body).understood], ['no-story', 'yes']);
    const shown = JSON.parse((await request(port, { path: `/api/stories/${p.key(0)}`, headers: auth })).body);
    assert.deepEqual([shown.verdict, shown.understood], ['no-story', 'yes']);
    r = await put({ verdict: 'great' });
    assert.equal(r.status, 400);
    assert.deepEqual(events(cache).map((x) => [x.event, x.value]), [['verdict', 'no-story'], ['understood', 'yes']]);
    const health = JSON.parse((await request(port, { path: '/api/health', headers: auth })).body);
    assert.equal(health.taste.missing, 10);
  } finally {
    server.close();
  }
});
