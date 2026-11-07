import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { stringify } from '../lib/frontmatter.mjs';
import * as T from '../lib/taste.mjs';
import * as P from '../lib/taste-rank.mjs';
import * as A from '../lib/ui-api.mjs';
import { sortRanked } from '../lib/rank.mjs';
import { loadConfig } from '../lib/config.mjs';
import { projectId } from '../lib/projects.mjs';

const BIN = path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), 'bin', 'momentry.mjs');
/** Words that must never reach the taste output. */
const SECRET = ['zanzibarquokka', 'Quillfeather', 'Marrowbend'];

const feat = (o = {}) => T.snapshot({ tension: 'nho_ma_to', stakes: 2, strength: 2, hits: 1, hit_by: ['harvest'], ...o });
const at = (i) => new Date(Date.UTC(2026, 10, 1, 0, i)).toISOString();

/**
 * Verdicts where the "reversed decision" signal is used and everything else dropped, whatever the default position:
 * the used stories sit low in the default order, so the default order ranks them badly.
 */
function signalTaste(n = 30, { from = 0 } = {}) {
  return Array.from({ length: n }, (_, i) => {
    const y = i % 2 === 0 ? 1 : 0;
    return { y, base: y ? 6 + (i % 5) : 1 + (i % 5), at: at(from + i), features: feat(y ? { signals: ['dao_quyet_dinh'] } : { signals: ['so_truoc_so_sau'] }) };
  });
}

/** Default-ordered stories: s0 strongest; the ones in `marked` carry the "reversed decision" signal. */
function stories(n, marked = []) {
  const list = Array.from({ length: n }, (_, i) => ({
    id: `2026-11-0${(i % 9) + 1}-s${i}`, data: { tension: 'nho_ma_to', stakes: 3, strength: Math.max(0, 3 - i), hits: n - i, hit_by: ['harvest'], signals: marked.includes(i) ? ['dao_quyet_dinh'] : ['so_truoc_so_sau'] },
  }));
  return sortRanked(list);
}

test('personal ranking waits for 20 verdicts with 5 used and 5 dropped, and says what is missing', () => {
  const ex = signalTaste(30);
  const few = P.learn(ex.slice(0, 19));
  assert.equal(few.active, false);
  assert.equal(few.reason, 'few');
  assert.deepEqual(few.needed, { verdicts: 1, used: 0, dropped: 0 });
  const used = ex.filter((e) => e.y === 1), dropped = ex.filter((e) => e.y === 0);
  const fewUsed = P.learn([...used.slice(0, 4), ...dropped, ...dropped.map((e) => ({ ...e, at: at(100 + e.base) }))]);
  assert.equal(fewUsed.reason, 'few');
  assert.deepEqual(fewUsed.needed, { verdicts: 0, used: 1, dropped: 0 });
  // later, open and verdicts without a default place are not learned from
  assert.equal(P.learn([...ex.slice(0, 19), { y: null, base: 1, at: at(99), features: feat() }, { y: 1, base: null, at: at(98), features: feat() }]).reason, 'few');
  const on = P.learn(ex.slice(0, 20));
  assert.equal(on.active, true);
  assert.deepEqual(on.counts, { verdicts: 20, used: 10, dropped: 10 });
});

test('taste record: the latest decision per story; use, drafted, published are used, drop dropped, later and open skipped', () => {
  const ev = (story, event, rank, base) => ({ at: at(rank * 10 + story.length), project: 'p', story, event, value: null, rank, of: 9, base, private: true, features: feat() });
  const ex = P.examplesOf({ version: 1, events: [
    ev('a', 'use', 2, 3), ev('a', 'drafted', 1, 1), ev('b', 'drop', 4, null), ev('c', 'use', 5, 5), ev('c', 'open', 5, 5),
    ev('d', 'later', 1, 1), ev('e', 'published', 7, 7), ev('f', 'edit', 1, 1),
  ] });
  assert.deepEqual(ex.map((e) => [e.y, e.base]), [[1, 1], [0, 4], [1, 7]]); // b: no default place recorded, so its wall rank
});

test('learned taste moves the kind of story the user uses up, with a reason in words; the fit is deterministic', () => {
  const ex = signalTaste(30);
  const m = P.learn(ex);
  assert.equal(m.reason, 'on');
  assert.ok(m.fit.w['signal=dao_quyet_dinh'] > 0.3, JSON.stringify(m.fit.w));
  assert.ok(m.check.auc >= m.check.aucDefault);
  const shuffled = [...ex].reverse();
  assert.deepEqual(P.learn(shuffled), m);
  const ranked = stories(8, [6]);
  const own = P.personalOrder(ranked, m);
  assert.ok(own.indexOf(ranked[6]) < 6, own.map((s) => s.id).join(','));
  assert.deepEqual([...own].sort((a, b) => a.id.localeCompare(b.id)), [...ranked].sort((a, b) => a.id.localeCompare(b.id)), 'nothing hidden');
  assert.deepEqual(P.personalOrder(ranked, m), own);
  const why = P.tasteWhy(ranked[6], ranked, own, m);
  assert.equal(why.from, 7);
  assert.ok(why.to < 7);
  assert.match(why.line, /bạn hay dùng chuyện có tín hiệu "Đảo quyết định có lý do"/);
  assert.match(P.reasonText('signal=dao_quyet_dinh', 1, 'en'), /You often use stories with the signal/);
  assert.equal(P.topWeights(m)[0].feature, 'signal=dao_quyet_dinh');
});

test('without an active model the order is the default one, exactly', () => {
  const ranked = stories(12, [3, 9]);
  for (const m of [null, P.learn(signalTaste(10)), { active: false, reason: 'off', fit: null }]) {
    const own = P.personalOrder(ranked, m);
    assert.notEqual(own, ranked);
    assert.deepEqual(own, ranked);
    assert.equal(P.tasteWhy(ranked[0], ranked, own, m), null);
  }
  assert.equal(P.personalModel({ cacheDir: '/nonexistent', rank: { personal: false } }).reason, 'off');
  assert.equal(P.personalModel({ cacheDir: '/nonexistent', rank: {} }).reason, 'off');
});

test('the model falls back to the default order when it ranks the newest verdicts worse', () => {
  // first the signal is used, then (the newest 20 %) it is dropped and the rest used
  const old = signalTaste(40);
  const flipped = Array.from({ length: 10 }, (_, i) => {
    const y = i % 2 === 0 ? 1 : 0;
    return { y, base: 3, at: at(100 + i), features: feat({ signals: [y ? 'so_truoc_so_sau' : 'dao_quyet_dinh'] }) };
  });
  const m = P.learn([...old, ...flipped]);
  assert.equal(m.reason, 'worse');
  assert.equal(m.active, false);
  assert.ok(m.check.auc < m.check.aucDefault);
  assert.deepEqual(P.personalOrder(stories(8, [6]), m), stories(8, [6]));
});

test('one top-5 place stays with the best default story the taste did not put in the top 4', () => {
  const m = P.learn(signalTaste(40));
  const ranked = stories(10, [4, 5, 6, 7, 8, 9]);
  const own = P.personalOrder(ranked, m);
  assert.ok(!own.slice(0, 4).includes(ranked[0]), 'the taste pushed the default first out of the top 4');
  assert.equal(own[4], ranked[0]);
  const why = P.tasteWhy(ranked[0], ranked, own, m);
  assert.equal(why.explore, true);
  assert.match(why.line, /Chỗ khám phá/);
  assert.notDeepEqual(P.personalOrder(ranked, m, { explore: false })[4], ranked[0]);
  // short lists have no such place
  assert.equal(P.personalOrder(stories(3, [2]), m).length, 3);
});

function sandbox() {
  const base = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'dm-taste-rank-')));
  const env = {
    PATH: process.env.PATH, HOME: path.join(base, 'home'), USERPROFILE: path.join(base, 'home'),
    MOMENTRY_CACHE: path.join(base, 'cache'), MOMENTRY_CONFIG: path.join(base, 'config', 'config.json'), XDG_CONFIG_HOME: path.join(base, 'config-home'),
  };
  const root = path.join(base, 'alpha');
  const box = path.join(root, 'docs', 'storytelling-material');
  fs.mkdirSync(path.join(root, '.git'), { recursive: true });
  fs.mkdirSync(box, { recursive: true });
  fs.writeFileSync(path.join(root, '.momentry.json'), '{}\n');
  for (const s of stories(8, [6])) {
    fs.writeFileSync(path.join(box, `${s.id}.md`), stringify({ id: s.id, date: s.id.slice(0, 10), status: 'raw', hook: 'Zanzibarquokka hook', ...s.data, signals: [...s.data.signals, 'Quillfeather'] }, '\n# Marrowbend\n'));
  }
  // verdicts in another project: taste is learned across every project
  fs.mkdirSync(env.MOMENTRY_CACHE, { recursive: true });
  const events = signalTaste(30).map((e, i) => ({ at: e.at, project: 'cccccccccc', story: `s${String(i).padStart(11, '0')}`, event: e.y ? 'use' : 'drop', value: null, rank: e.base, of: 20, base: e.base, private: false, features: e.features }));
  fs.writeFileSync(path.join(env.MOMENTRY_CACHE, T.FILE), JSON.stringify({ version: 1, events }));
  const setPersonal = (v) => { fs.mkdirSync(path.dirname(env.MOMENTRY_CONFIG), { recursive: true }); fs.writeFileSync(env.MOMENTRY_CONFIG, JSON.stringify({ rank: { personal: v } })); };
  const run = (...a) => spawnSync(process.execPath, [BIN, ...a], { cwd: root, env, encoding: 'utf8' });
  return { env, root, run, setPersonal, ctx: { env, cwd: root } };
}

test('rank.personal: off by default and from the user config only; on, list --rank, the wall and taste follow it', () => {
  const s = sandbox();
  assert.equal(loadConfig({ cwd: s.root, env: s.env }).rank.personal, false);
  fs.writeFileSync(path.join(s.root, '.momentry.json'), JSON.stringify({ rank: { personal: true } }));
  assert.equal(loadConfig({ cwd: s.root, env: s.env }).rank.personal, false, 'a repo file cannot turn it on');
  fs.writeFileSync(path.join(s.root, '.momentry.json'), '{}\n');

  const list = () => JSON.parse(s.run('list', '--rank', '--json').stdout).data;
  const off = list();
  assert.deepEqual(off.map((r) => r.id), stories(8, [6]).map((x) => x.id));
  assert.ok(off.every((r) => !('taste' in r.why)));
  const wallOff = A.listStories(s.ctx);
  assert.deepEqual(wallOff.map((c) => c.id), off.map((r) => r.id));
  assert.ok(wallOff.every((c) => c.rank === c.baseRank && !c.forYou));
  let t = s.run('taste');
  assert.match(t.stdout, /Xếp theo gu: tắt/);

  assert.equal(s.run('config', 'set', 'rank.personal', 'true').status, 0);
  const on = list();
  const moved = on.findIndex((r) => r.id === off[6].id);
  assert.ok(moved < 6, on.map((r) => r.id).join(','));
  assert.match(on[moved].why.taste.line, /Đảo quyết định có lý do/);
  assert.ok(on[moved].why.tier, 'the default explanation stays');
  const wall = A.listStories(s.ctx);
  assert.deepEqual(wall.map((c) => c.id), on.map((r) => r.id));
  const card = wall.find((c) => c.id === off[6].id);
  assert.equal(card.forYou, true);
  assert.equal(card.baseRank, 7);
  assert.match(card.tasteWhy, /You often use stories with the signal/);

  t = s.run('taste');
  assert.match(t.stdout, /Xếp theo gu: đang bật, học từ 30 chuyện đã quyết \(dùng 15, bỏ 15\)/);
  assert.match(t.stdout, /bạn hay dùng chuyện có tín hiệu "Đảo quyết định có lý do"/);
  const j = s.run('taste', '--json');
  const data = JSON.parse(j.stdout).data.personal;
  assert.deepEqual([data.enabled, data.active, data.reason], [true, true, 'on']);
  for (const w of SECRET) assert.ok(!j.stdout.toLowerCase().includes(w.toLowerCase()), `${w} leaked into taste output`);

  assert.equal(s.run('config', 'set', 'rank.personal', 'false').status, 0);
  assert.deepEqual(list().map((r) => r.id), off.map((r) => r.id));
});

test('a decision on the wall records the story\'s place in the default order next to its wall place', () => {
  const s = sandbox();
  s.setPersonal(true);
  const wall = A.listStories(s.ctx);
  const card = wall.find((c) => c.rank !== c.baseRank);
  assert.ok(card, 'the taste moved a story');
  A.markStory(s.ctx, card.key, 'use');
  const last = T.load(s.env.MOMENTRY_CACHE).events.at(-1);
  assert.equal(last.event, 'use');
  assert.equal(last.project, projectId(s.root));
  assert.deepEqual([last.rank, last.base], [card.rank, card.baseRank]);
});
