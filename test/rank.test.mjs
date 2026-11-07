// Ranking rule table (lib/rules/rank.json): exact order of the former fixed key, schema checks, fallback, overrides, explain.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  sortRanked, explain, compileTable, loadRankTable, defaultTable, withOverrides, checkOverrides, rankTable,
  BUILTIN_TABLE, RANK_FILE, warnings,
} from '../lib/rank.mjs';
import { readBox } from '../lib/box.mjs';
import { loadConfig } from '../lib/config.mjs';
import { runConfig } from '../lib/config-cmd.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));
const raw = () => JSON.parse(fs.readFileSync(RANK_FILE, 'utf8'));

// The fixed sort key the table replaced, kept verbatim as the reference order.
const num = (v) => (Number.isInteger(v) ? v : null);
function oldKey(story) {
  const d = story?.data || {};
  const by = Array.isArray(d?.hit_by) ? d.hit_by : [];
  const outsiderOnly = by.includes('outsider') && !by.includes('harvest') && !by.includes('bip');
  const tension = typeof d.tension === 'string' && d.tension ? (d.tension === 'none' ? 1 : 0) : 2;
  const st = num(d.stakes), sg = num(d.strength);
  const sum = st === null || sg === null ? Infinity : -(st + sg);
  const hits = num(d.hits) === null ? Infinity : -d.hits;
  const t = typeof d.date === 'string' ? Date.parse(d.date) : NaN;
  return [outsiderOnly ? 1 : 0, tension, sum, hits, Number.isNaN(t) ? Infinity : -t];
}
function oldSort(stories) {
  const keyed = stories.map((s) => [oldKey(s), s]);
  keyed.sort(([a, x], [b, y]) => {
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
    return String(x.id).localeCompare(String(y.id));
  });
  return keyed.map(([, s]) => s);
}

/** Small deterministic PRNG so a failure reproduces. */
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
}

function randomStory(r, i) {
  const pick = (xs) => xs[Math.floor(r() * xs.length)];
  const d = {};
  const set = (k, xs) => { const v = pick(xs); if (v !== undefined) d[k] = v; };
  set('tension', [undefined, '', 'none', 'none', 'khac', 'nho_ma_to', 'it_ma_nhieu', 3, null]);
  set('stakes', [undefined, 0, 1, 2, 3, 3, 1.5, '2', null]);
  set('strength', [undefined, 0, 1, 2, 3, 0, 2.5, '1']);
  set('hits', [undefined, 0, 1, 1, 2, 5, -1, 1.5, '3']);
  set('date', [undefined, '2026-01-01', '2026-01-02', '2026-01-02', '2026-11-05T10:00:00Z', 'không phải ngày', 20260101]);
  set('hit_by', [undefined, [], ['harvest'], ['outsider'], ['harvest', 'outsider'], ['bip', 'outsider'], ['hotspot', 'outsider'], 'outsider']);
  set('signals', [undefined, [], ['khác'], ['nguyên nhân bất ngờ', 'số trước sau']]);
  set('completeness', [undefined, 0, 4, 7]);
  const id = pick(['a', 'b', 'c', 'B', 'đ', 'z']) + (r() < 0.9 ? `-${i}` : '');
  return { id, data: d };
}

test('rank table: the shipped rules reproduce the former key on the sample stories', () => {
  const samples = readBox(path.join(ROOT, 'docs', 'sample')).filter((s) => !s.error);
  assert.equal(samples.length, 8);
  assert.deepEqual(sortRanked(samples).map((s) => s.id), oldSort(samples).map((s) => s.id));
});

test('rank table: the shipped rules reproduce the former key on random stories with missing fields and ties', () => {
  const r = rng(20261106);
  for (let round = 0; round < 3000; round++) {
    const n = 1 + Math.floor(r() * 12);
    const stories = Array.from({ length: n }, (_, i) => randomStory(r, i));
    const got = sortRanked(stories).map((s) => s.id);
    const want = oldSort(stories).map((s) => s.id);
    assert.deepEqual(got, want, `round ${round}: ${JSON.stringify(stories)}`);
  }
});

test('rank table: lib/rules/rank.json is valid and holds the same rules as the built-in fallback', () => {
  const { table, errors } = compileTable(raw());
  assert.deepEqual(errors, []);
  const shape = (t) => ({ tiers: t.tiers.map((x) => [x.id, x.when]), adjust: t.adjust.map((x) => [x.id, x.when, x.feature, x.weight]), tiebreak: t.tiebreak });
  assert.deepEqual(shape(table), shape(BUILTIN_TABLE));
  for (const rule of [...table.tiers, ...table.adjust]) {
    assert.ok(rule.why.length > 10, `${rule.id} why`);
    assert.ok(fs.existsSync(path.join(ROOT, rule.evidence)), `${rule.id} evidence ${rule.evidence}`);
  }
});

test('rank table: schema errors name the rule', () => {
  const bad = (edit) => { const t = raw(); edit(t); return compileTable(t).errors.join('\n'); };
  assert.match(bad((t) => { t.tiers[0].when[0].feature = 'mood'; }), /harvested_with_tension.*đặc trưng lạ "mood"/);
  assert.match(bad((t) => { t.tiers[1].when[0].op = '=='; }), /harvested_no_tension.*phép so lạ "=="/);
  assert.match(bad((t) => { t.tiers[0].when[1].op = '>'; }), /harvested_with_tension.*tension không dùng được với >/);
  assert.match(bad((t) => { t.tiers[0].when[1].value = 3; }), /harvested_with_tension.*cần giá trị string/);
  assert.match(bad((t) => { t.tiers[0].when.push({ feature: 'signals', op: 'in', value: [] }); }), /signals in cần một mảng string không rỗng/);
  assert.match(bad((t) => { t.tiers[0].when.push({ feature: 'stakes', op: '>=', value: 2, extra: 1 }); }), /khoá lạ extra/);
  assert.match(bad((t) => { t.adjust[0].weight = 'nhiều'; }), /luật stakes: weight phải là số/);
  assert.match(bad((t) => { t.adjust[1].feature = 'tension'; }), /luật strength: feature phải là đặc trưng số/);
  assert.match(bad((t) => { t.adjust[1].id = 'stakes'; }), /luật stakes: id lặp/);
  assert.match(bad((t) => { delete t.adjust[0].evidence; }), /luật stakes: thiếu evidence/);
  assert.match(bad((t) => { t.adjust[0].expr = 'stakes*2'; }), /luật stakes: khoá lạ expr/);
  assert.match(bad((t) => { t.tiebreak.push('tension desc'); }), /tiebreak\[3\]/);
  assert.match(bad((t) => { t.tiers = []; }), /tiers phải là mảng không rỗng/);
  assert.match(bad((t) => { t.version = 2; }), /version phải là 1/);
  // a date condition may be written as a date
  const ok = raw();
  ok.tiers[0].when.push({ feature: 'date', op: '>=', value: '2026-01-01' });
  assert.equal(compileTable(ok).table.tiers[0].when[2].value, Date.parse('2026-01-01'));
});

test('rank table: a broken or missing file falls back to the built-in table and warns once', (t) => {
  const seen = [];
  const sink = warnings.sink;
  warnings.sink = (m) => seen.push(m);
  t.after(() => { warnings.sink = sink; });
  const d = tmp('dm-rank-');
  const broken = path.join(d, 'rank.json');
  const t1 = raw(); t1.adjust[0].weight = null;
  fs.writeFileSync(broken, JSON.stringify(t1));
  const a = loadRankTable(broken);
  assert.equal(a.table, BUILTIN_TABLE);
  assert.match(a.errors[0], /luật stakes: weight phải là số/);
  loadRankTable(broken);
  assert.equal(seen.length, 1, 'same problem warned once');
  assert.match(seen[0], /dùng bảng có sẵn/);
  fs.writeFileSync(broken, '{ not json');
  assert.equal(loadRankTable(broken).table, BUILTIN_TABLE);
  assert.equal(loadRankTable(path.join(d, 'none.json')).table, BUILTIN_TABLE);
  assert.equal(seen.length, 3);
  const samples = readBox(path.join(ROOT, 'docs', 'sample')).filter((s) => !s.error);
  assert.deepEqual(sortRanked(samples, BUILTIN_TABLE).map((s) => s.id), oldSort(samples).map((s) => s.id));
});

test('rank overrides: weights and disabled change the order; bad ones are named and skipped', (t) => {
  const seen = [];
  const sink = warnings.sink;
  warnings.sink = (m) => seen.push(m);
  t.after(() => { warnings.sink = sink; });
  const s = (id, d) => ({ id, data: { hits: 1, date: '2026-01-02', hit_by: ['harvest'], ...d } });
  const stories = [
    s('strong-hook', { tension: 'khac', stakes: 0, strength: 3 }),
    s('turning-point', { tension: 'khac', stakes: 2, strength: 0 }),
    s('none-turning', { tension: 'none', stakes: 3, strength: 0 }),
  ];
  assert.deepEqual(sortRanked(stories).map((x) => x.id), ['strong-hook', 'turning-point', 'none-turning']);
  assert.deepEqual(sortRanked(stories, withOverrides({ weights: { stakes: 2 } })).map((x) => x.id), ['turning-point', 'strong-hook', 'none-turning']);
  // with both tension tiers off, every harvested story ranks by score alone
  const flat = withOverrides({ disabled: ['harvested_with_tension', 'harvested_no_tension'] });
  assert.deepEqual(sortRanked(stories, flat).map((x) => x.id), ['none-turning', 'strong-hook', 'turning-point']);
  assert.deepEqual(sortRanked(stories, withOverrides({ disabled: ['strength'] })).map((x) => x.id), ['turning-point', 'strong-hook', 'none-turning']);
  assert.deepEqual(defaultTable().disabled, [], 'overrides never change the shipped table');

  assert.deepEqual(checkOverrides({ weights: { stakes: 2 }, disabled: ['strength'] }), []);
  assert.match(checkOverrides({ weights: { nope: 2 } })[0], /rank\.weights\.nope: không có luật điều chỉnh nope/);
  assert.match(checkOverrides({ weights: { harvested_with_tension: 2 } })[0], /không có luật điều chỉnh/, 'a tier has no weight');
  assert.match(checkOverrides({ weights: { stakes: '2' } })[0], /trọng số phải là số/);
  assert.match(checkOverrides({ disabled: ['gone'] })[0], /rank\.disabled: không có luật "gone"/);
  assert.match(checkOverrides({ disabled: 'stakes' })[0], /phải là mảng/);

  const mixed = withOverrides({ weights: { stakes: 2, gone: 5 }, disabled: ['gone'] });
  assert.equal(mixed.adjust.find((r) => r.id === 'stakes').weight, 2, 'valid overrides still apply');
  assert.equal(seen.length, 1);
  assert.match(seen[0], /gone/);
});

test('rank overrides: from the user config only, validated by config set', () => {
  const d = tmp('dm-rank-cfg-');
  const env = { HOME: d, MOMENTRY_CONFIG: path.join(d, 'c', 'config.json'), XDG_CONFIG_HOME: path.join(d, 'xdg'), MOMENTRY_CACHE: path.join(d, 'cache') };
  assert.deepEqual(loadConfig({ cwd: d, env }).rank, { model: 'sonnet', weights: {}, disabled: [], personal: false });
  runConfig(['set', 'rank.weights.stakes', '2'], { cwd: d, env });
  runConfig(['set', 'rank.disabled', '["outsider_only_unscored"]'], { cwd: d, env });
  assert.deepEqual(JSON.parse(fs.readFileSync(env.MOMENTRY_CONFIG, 'utf8')), { rank: { weights: { stakes: 2 }, disabled: ['outsider_only_unscored'] } });
  assert.deepEqual(runConfig(['get', 'rank.weights.stakes'], { cwd: d, env }).data.value, 2);
  assert.deepEqual(runConfig(['get', 'rank.weights'], { cwd: d, env }).data.value, { stakes: 2 });
  const cfg = loadConfig({ cwd: d, env });
  assert.equal(rankTable(cfg).adjust.find((r) => r.id === 'stakes').weight, 2);
  assert.deepEqual(rankTable(cfg).disabled, ['outsider_only_unscored']);

  assert.throws(() => runConfig(['set', 'rank.weights.nope', '2'], { cwd: d, env }), (e) => /khoá lạ/.test(e.message) && /stakes/.test(e.why));
  assert.throws(() => runConfig(['set', 'rank.weights.stakes', 'nhiều'], { cwd: d, env }), /trọng số phải là số/);
  assert.throws(() => runConfig(['set', 'rank.disabled', '["gone"]'], { cwd: d, env }), /không có luật "gone"/);
  assert.throws(() => runConfig(['set', 'rank.weights', '{"strength": "x"}'], { cwd: d, env }), /trọng số phải là số/);
  runConfig(['unset', 'rank.weights.stakes'], { cwd: d, env });
  assert.deepEqual(JSON.parse(fs.readFileSync(env.MOMENTRY_CONFIG, 'utf8')), { rank: { disabled: ['outsider_only_unscored'] } });

  fs.writeFileSync(env.MOMENTRY_CONFIG, JSON.stringify({ rank: { weights: { stakes: 'x' } } }));
  assert.throws(() => loadConfig({ cwd: d, env }), /rank\.weights phải là object/);
  fs.writeFileSync(env.MOMENTRY_CONFIG, JSON.stringify({ rank: { disabled: 'stakes' } }));
  assert.throws(() => loadConfig({ cwd: d, env }), /rank\.disabled phải là mảng/);
});

test('explain: tier and the points of each adjustment', () => {
  const e = explain({ id: 'x', data: { tension: 'khac', stakes: 2, strength: 3, hit_by: ['harvest'] } });
  assert.deepEqual(e.tier, { id: 'harvested_with_tension', rank: 1, why: defaultTable().tiers[0].why });
  assert.equal(e.score, 5);
  assert.deepEqual(e.adjust, [
    { id: 'stakes', feature: 'stakes', value: 2, weight: 1, points: 2 },
    { id: 'strength', feature: 'strength', value: 3, weight: 1, points: 3 },
  ]);
  const unscored = explain({ id: 'y', data: { tension: 'none', strength: 0, hit_by: ['outsider'] } });
  assert.equal(unscored.tier.id, 'outsider_only_no_tension');
  assert.equal(unscored.score, null, 'missing stakes: last in its tier');
  assert.equal(unscored.adjust[0].points, null);
  assert.equal(explain({ id: 'z', data: {} }, withOverrides({ disabled: ['harvested_unscored', 'outsider_only_unscored'] })).tier, null);
});

test('rank features: set membership, angle and capture conditions', () => {
  const t = raw();
  t.tiers = [
    { id: 'numbers', when: [{ feature: 'signals', op: 'in', value: ['số trước sau'] }], why: 'test', evidence: 'docs/prd.md' },
    { id: 'angled', when: [{ feature: 'has_angle', op: '=', value: true }], why: 'test', evidence: 'docs/prd.md' },
    { id: 'by_hand', when: [{ feature: 'captured_by', op: 'in', value: ['human', 'live'] }], why: 'test', evidence: 'docs/prd.md' },
    { id: 'rest', when: [], why: 'test', evidence: 'docs/prd.md' },
  ];
  const { table, errors } = compileTable(t);
  assert.deepEqual(errors, []);
  const s = (id, d) => ({ id, data: d });
  const stories = [s('a-rest', {}), s('b-none-angle', { angle: 'none' }), s('c-hand', { captured_by: 'human' }), s('d-angle', { angle: 'Ai cũng tưởng…' }), s('e-num', { signals: ['khác', 'số trước sau'] })];
  assert.deepEqual(sortRanked(stories, table).map((x) => x.id), ['e-num', 'd-angle', 'c-hand', 'a-rest', 'b-none-angle']);
});
