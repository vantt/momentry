import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateHarvest, validateCluster, validateHookTension, validateStakes, validateOutsider } from '../lib/validate.mjs';

const story = (o = {}) => ({ title: 'T', signals: [], lines: ['L12', 15, '[L20]'], context: '', what_happened: 'W', lesson: '', artefact: '', ...o });

test('validateHarvest', () => {
  const ids = { hotspotIds: ['H12', 'H40'] };
  assert.deepEqual(validateHarvest({ stories: [story()], hotspots: [{ id: 'H12', verdict: 'story' }, { id: 'H40', verdict: 'skip', reason: 'r' }] }, ids), []);
  assert.deepEqual(validateHarvest({ stories: [] }, ids), [], 'missing hotspot answers go to the fill loop');
  assert.deepEqual(validateHarvest({ stories: [], hotspots: [{ id: 'H12', verdict: 'skip' }] }, ids), []);
  const e = validateHarvest({
    stories: [story({ title: '' }), story({ what_happened: undefined }), story({ lines: [] }), story({ lines: [null] }), 'x'],
    hotspots: [{ id: 'H99', verdict: 'story' }, { id: 'H40', verdict: 'maybe' }],
  }, ids);
  for (const re of [/stories\[0\]: thiếu title/, /stories\[1\]: thiếu what_happened/, /stories\[2\]: thiếu lines/, /stories\[3\]: lines/,
    /stories\[4\]: không phải object/, /id lạ "H99"/, /verdict "maybe"/]) assert.ok(e.some(m => re.test(m)), re);
  assert.match(validateHarvest([], ids)[0], /không phải JSON object/);
  assert.match(validateHarvest({}, ids)[0], /thiếu mảng "stories"/);
  assert.match(validateHarvest({ stories: [], hotspots: {} }, ids)[0], /không phải mảng/);
});

test('validateCluster', () => {
  const ids = { ids: ['r1-c1-S1', 'r1-c1-S2', 'box:2026-01-10-a'] };
  const c = (o = {}) => ({ title: 'T', summary: 'S', signals: [], members: ['r1-c1-S1'], ...o });
  assert.deepEqual(validateCluster({ clusters: [c(), c({ members: ['r1-c1-S2', 'box:2026-01-10-a'] })] }, ids), []);
  const e = validateCluster({ clusters: [c({ members: ['r9-c1-S1'] }), c({ members: [] }), c({ title: '' }), c({ signals: 'x' })] }, ids);
  assert.equal(e.length, 4);
  assert.match(e[0], /id lạ "r9-c1-S1"/);
});

test('validateHookTension', () => {
  const ids = { ids: ['M1', 'M2'] };
  const h = (id, o = {}) => ({ id, hook: 'h', tension: 'none', side_a: '', side_b: '', strength: 0, ...o });
  assert.deepEqual(validateHookTension({ hooks: [h('M2', { tension: 'nho_ma_to', strength: 3 }), h('M1')] }, ids), []);
  const e = validateHookTension({ hooks: [h('M1', { tension: 'loai_moi' }), h('M1', { strength: 4 }), h('M7', { strength: 1.5 })] }, ids);
  for (const re of [/tension "loai_moi" ngoài danh sách/, /strength 4 ngoài 0-3/, /strength 1.5/, /id lạ "M7"/, /id M1 lặp/, /thiếu id M2/])
    assert.ok(e.some(m => re.test(m)), re);
});

test('validateStakes', () => {
  const ids = { ids: ['M1', 'M2'] };
  const s = (id, o = {}) => ({ id, stakes: 2, reason: 'r', ...o });
  assert.deepEqual(validateStakes({ main_goal: 'g', stakes: [s('M1'), s('M2', { stakes: 0 })] }, ids), []);
  const e = validateStakes({ stakes: [s('M1', { stakes: 5 }), s('M3', { reason: 1 })] }, ids);
  for (const re of [/thiếu main_goal/, /stakes 5 ngoài 0-3/, /thiếu reason/, /id lạ "M3"/, /thiếu id M2/]) assert.ok(e.some(m => re.test(m)), re);
});

test('validateOutsider', () => {
  const ids = { ids: ['K1', 'K2'] };
  const o = (x = {}) => ({ what: 'w', common_practice: 'c', gap: 'g', lines: [12], already_picked: null, ...x });
  assert.deepEqual(validateOutsider({ outsider: [o(), o({ already_picked: 'K2' }), o({ already_picked: '', lines: [] })] }, ids), []);
  const e = validateOutsider({ outsider: [o({ already_picked: 'S9' }), o({ what: '' }), o({ lines: 'L1' }), o({ gap: undefined })] }, ids);
  assert.equal(e.length, 4);
  assert.match(e[0], /already_picked lạ "S9"/);
});
