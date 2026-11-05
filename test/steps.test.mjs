// harvest, cluster, score, outsider, story, rank (PRD 5.4-5.9, 6.6) with invented --fake-llm outputs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { harvest, coverage } from '../lib/harvest.mjs';
import { cluster, checkPartition, resolveBoxTarget, countHits } from '../lib/cluster.mjs';
import { hookTension, stakes, shuffle } from '../lib/score.mjs';
import { applyOutsider } from '../lib/outsider.mjs';
import { buildStory, mergePatch, renderBody } from '../lib/story.mjs';
import { rankKey, sortRanked } from '../lib/rank.mjs';
import { writeNew, mergeInto, readStory } from '../lib/box.mjs';
import { chunk } from '../lib/reduce.mjs';

const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), `dm-${p}-`));
const ok = (obj) => ({ type: 'result', is_error: false, total_cost_usd: 0.01, duration_ms: 100, result: typeof obj === 'string' ? obj : JSON.stringify(obj) });
function fakeDir(files) {
  const d = tmp('fake');
  for (const [k, v] of Object.entries(files)) fs.writeFileSync(path.join(d, `${k}.json`), JSON.stringify(v === 'error' ? { type: 'result', is_error: true, result: 'x' } : ok(v)));
  return d;
}
const cfg = (over = {}) => ({
  harvest: { runs: 1, model: 'haiku', fillRetries: 1, maxInputTokens: 150000, timeoutSec: 5, ...over.harvest },
  rank: { model: 'sonnet' }, outsider: { enabled: true, model: 'sonnet' },
});
const ctxOf = (fakeDir, extra = {}) => ({ llm: { fakeDir }, stats: { usd: null, secs: 0, failed: [], calls: 0 }, ...extra });

const entries = [
  { L: 10, ts: '2026-01-10T09:00:00Z', kind: 'user', text: 'đo 40 → 12' },
  { L: 11, ts: '2026-01-10T09:01:00Z', kind: 'result', text: 'Exit code 1', isError: true, exitCode: 1 },
  { L: 20, ts: '2026-01-10T09:02:00Z', kind: 'tool', op: 'shell', text: 'git reset --hard' },
];
const HS = [{ id: 'H10', kind: 'metricPair', L: 10, Lend: 10, signals: [] }, { id: 'H11', kind: 'nonzeroExit', L: 11, Lend: 11, signals: [] }, { id: 'H20', kind: 'gitReversal', L: 20, Lend: 20, signals: [] }];
const chunk1 = { k: 1, entries, owns: new Set([10, 11, 20]), fromLine: 10, toLine: 20 };
const st = (title, lines, what = 'chuyện') => ({ title, signals: ['khác'], lines, context: 'c', what_happened: what, lesson: 'l', artefact: 'a' });
const ans = (...ids) => ids.map((id) => ({ id, verdict: 'story', story_title: 't' }));

test('harvest: all hotspots answered -> no fill call', async () => {
  const d = fakeDir({ 'harvest-c1-r1': { stories: [st('A', ['L10', '[L11-L12]'])], hotspots: ans('H10', 'H11', 'H20') } });
  const r = await harvest(chunk1, HS, cfg(), ctxOf(d, { run: 1 }));
  assert.deepEqual(r.missing, []);
  assert.equal(r.fillCalls, 0);
  assert.equal(r.stories[0].id, 'r1-c1-S1');
  assert.deepEqual(r.stories[0].lines, [10, 11, 12]);
  assert.equal(r.usd, 0.01);
});

test('harvest: missing hotspots -> harvest-fill with exactly those ids; still missing after the last fill', async () => {
  const save = tmp('prompts');
  const d = fakeDir({
    'harvest-c1-r1': { stories: [st('A', [10])], hotspots: ans('H10') },
    'harvest-fill-c1-r1-f1': { stories: [st('B', [20])], hotspots: ans('H20') },
  });
  const r = await harvest(chunk1, HS, cfg(), { ...ctxOf(d, { run: 1 }), llm: { fakeDir: d, runDir: save } });
  const fillPrompt = fs.readFileSync(path.join(save, 'harvest-fill-c1-r1-f1.prompt.txt'), 'utf8');
  const listed = fillPrompt.split('<hotspots>')[1];
  assert.match(listed, /H11/); assert.match(listed, /H20/); assert.doesNotMatch(listed, /H10/);
  assert.deepEqual(r.missing, ['H11']);
  assert.deepEqual(r.stories.map((s) => s.id), ['r1-c1-S1', 'r1-c1-S2']);
  assert.equal(coverage(HS, r.answers).length, 1);
});

test('harvest: main call failing twice throws exitCode 4; fill failure only flags', async () => {
  const d = fakeDir({ 'harvest-c1-r1': 'error', 'harvest-c1-r1-retry': 'error' });
  await assert.rejects(harvest(chunk1, HS, cfg(), ctxOf(d, { run: 1 })), (e) => e.exitCode === 4);
  const d2 = fakeDir({ 'harvest-c1-r1': { stories: [], hotspots: [] } });
  const r = await harvest(chunk1, HS, cfg(), ctxOf(d2, { run: 1 }));
  assert.equal(r.fillFailed, true);
  assert.equal(r.missing.length, 3);
});

test('coverage ignores invalid verdicts', () => {
  assert.deepEqual(coverage(HS, [{ id: 'H10', verdict: 'maybe' }, { id: 'H11', verdict: 'skip' }]), ['H10', 'H20']);
});

const raw = (id, run, chunk, extra = {}) => ({ id, run, chunk, title: id, signals: [], lines: [10], context: '', what_happened: `w ${id}`, lesson: '', artefact: '', ...extra });

test('cluster: runs=1, one chunk, no existing -> one cluster per story, no call', async () => {
  const cs = await cluster([raw('r1-c1-S1', 1, 1), raw('r1-c1-S2', 1, 1)], [], cfg(), ctxOf(tmp('empty'), { chunks: 1, runs: 1 }));
  assert.equal(cs.length, 2);
  assert.deepEqual(cs.map((c) => c.hits), [1, 1]);
});

test('cluster: wrong partition -> cluster-2; wrong again -> singles and failed', async () => {
  const stories = [raw('r1-c1-S1', 1, 1), raw('r2-c1-S1', 2, 1), raw('r1-c2-S1', 1, 2)];
  const good = { clusters: [{ title: 'T', summary: 's', signals: [], members: ['r1-c1-S1', 'r2-c1-S1', 'r1-c2-S1'] }] };
  const bad = { clusters: [{ title: 'T', summary: 's', signals: [], members: ['r1-c1-S1'] }] };
  let ctx = ctxOf(fakeDir({ 'cluster-1': bad, 'cluster-2': good }), { chunks: 2, runs: 2 });
  let cs = await cluster(stories, [], cfg(), ctx);
  assert.equal(cs.length, 1);
  assert.equal(cs[0].hits, 2, 'hits counts distinct runs, not chunks');
  assert.deepEqual(ctx.stats.failed, []);
  ctx = ctxOf(fakeDir({ 'cluster-1': bad, 'cluster-2': bad }), { chunks: 2, runs: 2 });
  cs = await cluster(stories, [], cfg(), ctx);
  assert.equal(cs.length, 3);
  assert.deepEqual(ctx.stats.failed, ['cluster']);
});

test('cluster with existing box stories; resolveBoxTarget picks the smallest box id', async () => {
  const existing = [
    { id: '2026-01-10-b', data: { lines: ['claude:x#L5'] }, body: '\n# B\n\n**Chuyện gì xảy ra:** bb\n' },
    { id: '2026-01-10-a', data: {}, body: '\n# A\n\n**Chuyện gì xảy ra:** aa\n' },
  ];
  const d = fakeDir({ 'cluster-1': { clusters: [{ title: 'T', summary: 's', signals: [], members: ['r1-c1-S1', 'box:2026-01-10-b', 'box:2026-01-10-a'] }] } });
  const save = tmp('p');
  const cs = await cluster([raw('r1-c1-S1', 1, 1)], existing, cfg(), { ...ctxOf(d, { chunks: 1, runs: 1 }), llm: { fakeDir: d, runDir: save } });
  assert.equal(resolveBoxTarget(cs[0]), '2026-01-10-a');
  assert.equal(cs[0].hits, 1);
  const p = fs.readFileSync(path.join(save, 'cluster-1.prompt.txt'), 'utf8');
  assert.match(p, /box:2026-01-10-b \| B \| bb \| lines L5/);
  assert.deepEqual(checkPartition(['a', 'b'], [{ members: ['a', 'a'] }]), ['a nằm trong cụm 1 và 1', 'thiếu b']);
  assert.equal(countHits(['x', 'box:y'], new Map([['x', { run: 3 }]])), 1);
  assert.equal(resolveBoxTarget({ members: ['r1'] }), null);
});

test('score: hook-tension and stakes map M ids back, shuffled deterministically', async () => {
  const clusters = [{ id: 'C1', title: 'a', summary: 'x' }, { id: 'C2', title: 'b', summary: 'y' }];
  const d = fakeDir({
    'hook-tension-1': { hooks: [{ id: 'M1', hook: 'h1', tension: 'none', side_a: 'q', side_b: '', strength: 0 }, { id: 'M2', hook: 'h2', tension: 'nho_ma_to', side_a: 'bé', side_b: 'to', strength: 3 }] },
    'stakes-1': { main_goal: 'g', stakes: [{ id: 'M1', stakes: 1, reason: 'r' }, { id: 'M2', stakes: 3, reason: 'r' }] },
  });
  const order = shuffle(clusters, 1).map((c) => c.id);
  const h = await hookTension(clusters, cfg(), ctxOf(d));
  assert.equal(h.get(order[1]).tension, 'nho_ma_to');
  assert.deepEqual(h.get(order[1]).sides, ['bé', 'to']);
  assert.deepEqual(h.get(order[0]).sides, [], 'none -> no sides');
  const s = await stakes(clusters, cfg(), ctxOf(d));
  assert.equal(s.mainGoal, 'g');
  assert.equal(s.map.get(order[1]).stakes, 3);
  assert.deepEqual(shuffle([1, 2, 3, 4, 5], 7), shuffle([1, 2, 3, 4, 5], 7));
  assert.deepEqual(shuffle([1, 2, 3, 4, 5], 7).sort(), [1, 2, 3, 4, 5]);
});

test('score: stakes = 5 then a good retry passes; unknown tension twice fails with exitCode 4', async () => {
  const clusters = [{ id: 'C1', title: 'a', summary: 'x' }];
  const d = fakeDir({
    'stakes-1': { main_goal: 'g', stakes: [{ id: 'M1', stakes: 5, reason: 'r' }] },
    'stakes-1-retry': { main_goal: 'g', stakes: [{ id: 'M1', stakes: 2, reason: 'r' }] },
    'hook-tension-1': { hooks: [{ id: 'M1', hook: 'h', tension: 'la', strength: 1 }] },
    'hook-tension-1-retry': { hooks: [{ id: 'M9', hook: 'h', tension: 'none', strength: 0 }] },
  });
  assert.equal((await stakes(clusters, cfg(), ctxOf(d))).map.get('C1').stakes, 2);
  await assert.rejects(hookTension(clusters, cfg(), ctxOf(d)), (e) => e.exitCode === 4);
});

test('applyOutsider: picked item adds angle, null item becomes a new cluster', () => {
  const cs = applyOutsider([{ id: 'C1', title: 't', summary: 's', signals: [], members: ['r1-c1-S1'], hits: 1 }], [
    { what: 'w1', common_practice: 'cp', gap: 'g', lines: [3], already_picked: 'C1' },
    { what: 'w2', common_practice: 'cp2', gap: 'g2', lines: [7], already_picked: null },
  ]);
  assert.deepEqual(cs[0].hitBy, ['outsider']);
  assert.equal(cs[1].id, 'O1');
  assert.equal(cs[1].title, 'w2');
  assert.equal(cs[1].summary, 'w2 cp2');
  assert.deepEqual(cs[1].members, []);
});

const sctx = {
  sid: 'claude:0a1b2c3d', source: 'claude', repo: 'demo', runs: 2, harvestDate: '2026-02-02',
  hotspots: [{ id: 'H40', kind: 'nonzeroExit', L: 40, Lend: 42 }, { id: 'H90', kind: 'bip', L: 90, Lend: 90 }],
  answers: [{ id: 'H40', verdict: 'story' }],
};

test('buildStory: body from longest what_happened, date from ts of the first line, lines union sorted', () => {
  const members = [
    raw('r1-c1-S1', 1, 1, { lines: [41, 12], what_happened: 'ngắn', signals: ['a'] }),
    raw('r2-c1-S3', 2, 1, { lines: [12, 90], what_happened: 'dài hơn hẳn', context: 'ctx2', signals: ['b', 'a'] }),
  ];
  const byL = new Map([[12, { L: 12, ts: '2026-01-09T10:00:00Z' }], [41, { L: 41, ts: '2026-01-11T10:00:00Z' }]]);
  const c = { id: 'C1', title: 'Tiêu đề cụm', summary: 's', signals: [], members: members.map((m) => m.id), hits: 2 };
  const scores = { hook: { hook: 'h', tension: 'nho_ma_to', sides: ['x', 'y'], strength: 3 }, stakes: { stakes: 2, reason: 'r' } };
  const b = buildStory(c, members, scores, byL, sctx);
  assert.match(b.body, /^\n# Tiêu đề cụm\n\n\*\*Bối cảnh:\*\* ctx2\n\*\*Chuyện gì xảy ra:\*\* dài hơn hẳn\n/);
  assert.equal(b.data.date, new Date('2026-01-09T10:00:00Z').toLocaleDateString('sv-SE'));
  assert.deepEqual(b.data.lines, ['claude:0a1b2c3d#L12', 'claude:0a1b2c3d#L41', 'claude:0a1b2c3d#L90']);
  assert.deepEqual(b.data.hit_by, ['hotspot', 'harvest', 'bip']);
  assert.deepEqual(b.data.signals, ['a', 'b']);
  assert.equal(b.data.hits, 2); assert.equal(b.data.runs, 2);
  assert.equal(b.data.tension, 'nho_ma_to'); assert.equal(b.data.stakes, 2);
  assert.equal(b.data.source, 'chat Claude, claude:0a1b2c3d');
  const noTs = buildStory(c, members, {}, new Map(), sctx);
  assert.equal(noTs.data.date, '2026-02-02');
  assert.equal(noTs.data.hook, undefined);
});

test('buildStory: outsider-born cluster; renderBody omits empty sections', () => {
  const [o] = applyOutsider([], [{ what: 'Việc trơn tru', common_practice: 'làm tay', gap: 'tự động', lines: [5], already_picked: null }]);
  const b = buildStory(o, [], {}, new Map(), { ...sctx, hotspots: [], answers: [] });
  assert.deepEqual(b.data.hit_by, ['outsider']);
  assert.equal(b.data.hits, 0);
  assert.match(b.body, /\*\*Chuyện gì xảy ra:\*\* Việc trơn tru\n\*\*Góc người ngoài:\*\* cách làm phổ biến là làm tay; ở đây khác ở tự động\.\n$/);
  assert.doesNotMatch(b.body, /Bài học/);
  assert.equal(renderBody({ title: 'T' }), '\n# T\n\n');
});

test('mergePatch over several windows keeps hits <= runs; status != raw keeps machine fields', () => {
  const dir = tmp('box');
  const c = { id: 'C1', title: 'T', summary: 's', signals: [], members: ['r1-c1-S1', 'r2-c1-S1'], hits: 2 };
  const m = [raw('r1-c1-S1', 1, 1, { lines: [40] }), raw('r2-c1-S1', 2, 1, { lines: [41] })];
  const b = buildStory(c, m, {}, new Map(), sctx);
  writeNew(dir, { id: '2026-01-10-t', data: b.data, body: b.body });
  for (const [runs, hits] of [[3, 1], [1, 1], [2, 0]]) {
    const old = readStory(dir, '2026-01-10-t');
    const mem = hits ? [raw('r1-c1-S9', 1, 1, { lines: [100 + runs] })] : [];
    const p = mergePatch(old, { ...c, members: mem.map((x) => x.id), hits }, mem, { stakes: { stakes: 1, reason: '' } }, { ...sctx, runs });
    mergeInto(dir, '2026-01-10-t', p);
  }
  const s = readStory(dir, '2026-01-10-t');
  assert.equal(s.data.runs, 2 + 3 + 1, 'runs only grows for windows with new members');
  assert.equal(s.data.hits, 2 + 1 + 1);
  assert.ok(s.data.hits <= s.data.runs);
  assert.equal(s.data.stakes, 1);
  assert.ok(s.data.lines.includes('claude:0a1b2c3d#L103'));
  fs.writeFileSync(s.path, fs.readFileSync(s.path, 'utf8').replace('status: raw', 'status: picked'));
  const old = readStory(dir, '2026-01-10-t');
  mergeInto(dir, '2026-01-10-t', mergePatch(old, c, m, { stakes: { stakes: 3, reason: '' } }, sctx));
  const after = readStory(dir, '2026-01-10-t');
  assert.equal(after.data.stakes, 1);
  assert.equal(after.data.runs, 6);
  assert.equal(after.data.status, 'picked');
});

test('mergePatch adds the outsider section only when absent', () => {
  const c = { id: 'C1', members: [], hits: 0, outsider: { what: 'w', common_practice: 'cp', gap: 'g', lines: [] } };
  assert.match(mergePatch({ body: '\n# T\n' }, c, [], {}, sctx).outsider, /cách làm phổ biến là cp/);
  assert.equal(mergePatch({ body: '**Góc người ngoài:** có rồi' }, c, [], {}, sctx).outsider, undefined);
  assert.deepEqual(mergePatch({ body: '' }, { id: 'C2', members: [], hits: 0 }, [], {}, sctx), {});
});

test('rank: tension != none first, then stakes + strength, hits, newer date; missing fields last', () => {
  const s = (id, d) => ({ id, data: d });
  const stories = [
    s('old-sample', { date: '2026-01-01', status: 'raw' }),
    s('none-high', { tension: 'none', stakes: 3, strength: 3, hits: 5, date: '2026-01-02' }),
    s('t-low', { tension: 'nho_ma_to', stakes: 1, strength: 1, hits: 1, date: '2026-01-02' }),
    s('t-high', { tension: 'khac', stakes: 3, strength: 2, hits: 1, date: '2026-01-02' }),
    s('t-high-hits', { tension: 'khac', stakes: 2, strength: 3, hits: 3, date: '2026-01-01' }),
    s('t-high-newer', { tension: 'khac', stakes: 3, strength: 2, hits: 1, date: '2026-01-05' }),
    s('t-nostakes', { tension: 'khac', strength: 3, hits: 9 }),
  ];
  assert.deepEqual(sortRanked(stories).map((x) => x.id), ['t-high-hits', 't-high-newer', 't-high', 't-low', 't-nostakes', 'none-high', 'old-sample']);
  assert.equal(rankKey(stories[0])[1], 2);
  assert.equal(sortRanked(stories).length, stories.length);
});

test('rank: a zero on one axis does not erase the other (sum, not product)', () => {
  const s = (id, d) => ({ id, data: { hits: 1, date: '2026-01-02', ...d } });
  const stories = [
    s('none-side', { tension: 'none', stakes: 0, strength: 0 }),
    s('none-turning-point', { tension: 'none', stakes: 2, strength: 0 }),
    s('t-weak', { tension: 'khac', stakes: 1, strength: 1 }),
    s('t-side-strong', { tension: 'khac', stakes: 0, strength: 3 }),
  ];
  assert.deepEqual(sortRanked(stories).map((x) => x.id), ['t-side-strong', 't-weak', 'none-turning-point', 'none-side']);
});

test('rank: stories found only by the outsider step go after every other story', () => {
  const s = (id, d) => ({ id, data: { hits: 1, date: '2026-01-02', ...d } });
  const stories = [
    s('outsider-only', { tension: 'khac', stakes: 3, strength: 3, hits: 0, hit_by: ['outsider'] }),
    s('outsider-hotspot', { tension: 'khac', stakes: 3, strength: 3, hits: 0, hit_by: ['hotspot', 'outsider'] }),
    s('harvest-outsider', { tension: 'khac', stakes: 1, strength: 1, hit_by: ['harvest', 'outsider'] }),
    s('harvest-none', { tension: 'none', stakes: 0, strength: 0, hit_by: ['harvest'] }),
    s('bip-outsider', { tension: 'none', stakes: 0, strength: 0, hit_by: ['bip', 'outsider'] }),
    s('manual', { date: '2026-01-01', status: 'raw' }),
  ];
  assert.deepEqual(sortRanked(stories).map((x) => x.id),
    ['harvest-outsider', 'bip-outsider', 'harvest-none', 'manual', 'outsider-hotspot', 'outsider-only']);
  assert.equal(rankKey(stories[0])[0], 1);
  assert.equal(rankKey(stories[5])[0], 0);
});

test('chunked hits: same run in two chunks counts once', async () => {
  const many = Array.from({ length: 60 }, (_, i) => ({ L: i + 1, ts: null, kind: 'user', text: 'x'.repeat(400) }));
  assert.ok(chunk(many, 3000).length > 1);
  assert.equal(countHits(['r1-c1-S1', 'r1-c2-S1'], new Map([['r1-c1-S1', { run: 1 }], ['r1-c2-S1', { run: 1 }]])), 1);
});
