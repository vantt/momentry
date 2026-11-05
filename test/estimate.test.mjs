// Dry-run cost estimate against real spend measured on eight sessions (numbers only, no transcript content).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimateUsd, angleCallUsd } from '../lib/pipeline.mjs';
import { DEFAULTS } from '../lib/config.mjs';
import { callUsd } from '../lib/llm.mjs';

const cfgOf = (over = {}) => {
  const c = structuredClone(DEFAULTS);
  for (const [k, v] of Object.entries(over)) { const [a, b] = k.split('.'); c[a][b] = v; }
  return c;
};

/** [approxTokens of the window, real USD]: one-chunk windows, sonnet outsider, 1-hour cache writes, thinking left to the model. */
const OLD_DEFAULTS = [[112228, 1.123], [91394, 0.825], [91394, 0.915], [53807, 0.502], [64046, 0.695], [56460, 0.530],
  [99560, 1.101], [92346, 0.959], [81961, 0.786]];

// Both real-spend tables were measured before the story angle step existed, so they are compared without it.
test('estimateUsd: within 20% of real spend under the old defaults', () => {
  const cfg = cfgOf({ 'outsider.model': 'sonnet', 'llm.promptCache': '1h', 'angle.enabled': false });
  for (const [tokens, real] of OLD_DEFAULTS) {
    const est = estimateUsd([tokens], cfg);
    assert.ok(Math.abs(real / est - 1) <= 0.2, `${tokens} token: estimate ${est.toFixed(3)} vs real ${real}`);
  }
});

/** Same windows under the current defaults (haiku outsider, no prompt cache). Harvest thinking varies run to run, so
 * single windows spread more; the low one is a run where the harvest model did not think. */
const NEW_DEFAULTS = [[112228, 0.376], [91394, 0.201], [53807, 0.101], [64046, 0.231], [56460, 0.108], [99560, 0.374],
  [92346, 0.361], [81961, 0.308]];

test('estimateUsd: current defaults, mean within 10% of real spend', () => {
  const cfg = cfgOf({ 'angle.enabled': false });
  const ratios = NEW_DEFAULTS.map(([tokens, real]) => real / estimateUsd([tokens], cfg));
  const mean = ratios.reduce((a, b) => a + b, 0) / ratios.length;
  assert.ok(Math.abs(mean - 1) <= 0.1, `mean real/estimate ${mean.toFixed(2)}`);
  for (const r of ratios) assert.ok(r >= 0.6 && r <= 1.25, `real/estimate ${r.toFixed(2)}`);
});

test('estimateUsd: cache, models, runs and chunks move the estimate the right way', () => {
  const base = estimateUsd([90000], cfgOf());
  assert.ok(estimateUsd([90000], cfgOf({ 'llm.promptCache': '1h' })) > base);
  assert.ok(estimateUsd([90000], cfgOf({ 'outsider.model': 'sonnet' })) > base);
  assert.ok(estimateUsd([90000], cfgOf({ 'outsider.enabled': false })) < base);
  assert.ok(estimateUsd([90000], cfgOf({ 'harvest.runs': 2 })) > base);
  // a window that fits haiku's cheap prompt size costs far less than one past it
  assert.ok(estimateUsd([50000], cfgOf()) * 2 < estimateUsd([70000], cfgOf()));
  // two chunks: harvest + outsider twice, one cluster call, scoring once
  const c = cfgOf({ 'angle.enabled': false });
  const scoring = callUsd('sonnet', 7500, 2500) + callUsd('sonnet', 7500, 1500);
  const cluster = callUsd('sonnet', 4000 + 2 * 4500, 2 * 1000);
  const twice = 2 * (estimateUsd([45000], c) - scoring) + cluster + scoring;
  assert.ok(Math.abs(estimateUsd([45000, 45000], c) - twice) < 1e-9);
  assert.equal(estimateUsd([], c), 0);
});

/** Angle calls measured on two sessions (40 calls): USD per session for 10 stories, per model. */
test('estimateUsd: the story angle step adds topN calls, near the measured cost', () => {
  const off = estimateUsd([90000], cfgOf({ 'angle.enabled': false }));
  for (const [model, real] of [['haiku', 0.0166], ['sonnet', 0.210]]) {
    const cfg = cfgOf({ 'angle.model': model });
    assert.ok(Math.abs(angleCallUsd(cfg) * 10 / real - 1) <= 0.15, `${model}: ${(angleCallUsd(cfg) * 10).toFixed(4)} vs ${real}`);
    assert.ok(Math.abs(estimateUsd([90000], cfg) - off - 10 * angleCallUsd(cfg)) < 1e-9);
  }
  assert.equal(estimateUsd([90000], cfgOf({ 'angle.topN': 0 })), off);
});
