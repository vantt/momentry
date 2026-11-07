// Personal ranking: a small model learned on this machine from what the user did with stories (<cache>/taste.json,
// lib/taste.mjs), added on top of the default ranking (lib/rank.mjs). No model call, nothing sent anywhere.
//
// Model: logistic regression P(use) = σ(b + base + Σ w_k·x_k). `base` is the default ranking as a score, −ln(default
// position), a fixed offset; the weights w have a Gaussian prior centred on 0 (L2, LAMBDA), so with few or mixed
// verdicts they stay near 0 and the order stays the default one. A weight is in the units of `base`: +ln 2 (0.69) is
// worth halving a story's default position. Personal order sorts by base + Σ w_k·x_k, the default order breaking ties.
//
// Features (from the snapshot taste.json keeps, so learning and ranking read the same fixed lists): one indicator per
// tension id and per signal id, `outsider_only`, `has_angle`, and the numbers stakes, strength, hits, completeness
// standardised on the training verdicts. A missing value adds nothing (neutral).
//
// Verdicts: per story the latest decision counts (as `measures` in lib/taste.mjs): use, drafted, published = used
// (1), drop = dropped (0). Later, open, edits, angle checks and hand-written stories are not learned from. A verdict
// needs the story's default position at that moment (`base`, else its wall `rank`). Every project counts, private
// ones too: the model never leaves the machine.
//
// Safeguards: on only after MIN_VERDICTS verdicts with MIN_USED used and MIN_DROPPED dropped; the newest HOLDOUT share
// of used and of dropped verdicts is held out, and when the model learned on the rest orders them worse than the
// default order (pairwise, AUC) the default order stays. One place in the top 5 (EXPLORE_AT) goes to the best story
// of the default order the taste has not put in the top 4, so the taste never shuts out what it has not seen.
import fs from 'node:fs';
import path from 'node:path';
import { sortRanked } from './rank.mjs';
import { load, FILE, USED, snapshot } from './taste.mjs';
import { VOCAB } from './vocab.mjs';

export const MIN_VERDICTS = 20;
export const MIN_USED = 5;
export const MIN_DROPPED = 5;
/** Share of the newest used and of the newest dropped verdicts held out to check the model against the default. */
export const HOLDOUT = 0.2;
/** Strength of the prior pulling every weight to 0. */
export const LAMBDA = 1;
/** 1-based place in the top 5 kept for the default order. */
export const EXPLORE_AT = 5;
/** Smallest |points| that counts as taste moving a story or as a reason. */
const MIN_POINTS = 0.05;
const NUMBERS = ['stakes', 'strength', 'hits', 'completeness'];

/**
 * @typedef {{y: 0|1, base: number, at: string, features: import('./taste.mjs').Features}} Example
 *   base: 1-based default position of the story when the verdict was made
 * @typedef {{b: number, w: Record<string, number>, mean: Record<string, number>, sd: Record<string, number>}} Fit
 * @typedef {{active: boolean, reason: 'off'|'few'|'worse'|'on', counts: {verdicts: number, used: number, dropped: number},
 *   needed: {verdicts: number, used: number, dropped: number}, check: {heldOut: number, auc: number|null, aucDefault: number|null}|null,
 *   fit: Fit|null}} Model
 */

/** Feature vector of a snapshot, before standardising: sparse name -> value; missing values are left out. */
function raw(f) {
  const x = {};
  if (f.tension) x[`tension=${f.tension}`] = 1;
  for (const s of f.signals) x[`signal=${s}`] = 1;
  if (f.outsider_only) x.outsider_only = 1;
  if (f.has_angle) x.has_angle = 1;
  for (const k of NUMBERS) if (f[k] !== null && f[k] !== undefined) x[k] = f[k];
  return x;
}

/** Standardised vector: numbers as (v − mean) / sd of the training verdicts, so a missing number sits at the mean. */
function vec(f, fit) {
  const x = raw(f);
  for (const k of NUMBERS) if (k in x) x[k] = (x[k] - fit.mean[k]) / fit.sd[k];
  return x;
}

/** Points the taste adds to a story, per feature (only features with a weight). */
function contributions(f, fit) {
  const x = vec(f, fit);
  const out = [];
  for (const [k, v] of Object.entries(x)) if (fit.w[k]) out.push({ feature: k, points: fit.w[k] * v });
  return out;
}

const tasteScore = (f, fit) => contributions(f, fit).reduce((a, c) => a + c.points, 0);
const baseScore = (pos) => -Math.log(pos);
const sigmoid = (z) => (z >= 0 ? 1 / (1 + Math.exp(-z)) : Math.exp(z) / (1 + Math.exp(z)));

/** Solves A·x = g (A symmetric positive definite, small) by Gaussian elimination with partial pivoting. */
function solve(A, g) {
  const n = g.length;
  const M = A.map((row, i) => [...row, g[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    const d = M[c][c];
    if (Math.abs(d) < 1e-12) return null;
    for (let r = c + 1; r < n; r++) {
      const k = M[r][c] / d;
      if (k) for (let j = c; j <= n; j++) M[r][j] -= k * M[c][j];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let j = r + 1; j < n; j++) s -= M[r][j] * x[j];
    x[r] = s / M[r][r];
  }
  return x;
}

/**
 * Fits the weights by Newton's method (deterministic: same verdicts in the same order give the same fit).
 * @param {Example[]} ex @param {number} [lambda] @returns {Fit}
 */
export function fit(ex, lambda = LAMBDA) {
  const mean = {}, sd = {};
  for (const k of NUMBERS) {
    const v = ex.map((e) => e.features[k]).filter((x) => x !== null && x !== undefined);
    const m = v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
    const s = v.length ? Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length) : 0;
    mean[k] = m;
    sd[k] = s > 0 ? s : 1;
  }
  const pre = { b: 0, w: {}, mean, sd };
  const xs = ex.map((e) => vec(e.features, pre));
  const names = [...new Set(xs.flatMap((x) => Object.keys(x)))].sort();
  const n = names.length + 1;
  const rows = xs.map((x) => [1, ...names.map((k) => x[k] ?? 0)]);
  const off = ex.map((e) => baseScore(e.base));
  // the intercept gets a tiny prior so a one-sided set still has a finite fit
  const reg = [1e-6, ...names.map(() => lambda)];
  let th = new Array(n).fill(0);
  for (let it = 0; it < 100; it++) {
    const g = th.map((t, j) => reg[j] * t);
    const H = th.map((_, i) => th.map((__, j) => (i === j ? reg[i] : 0)));
    rows.forEach((r, i) => {
      const p = sigmoid(off[i] + r.reduce((a, v, j) => a + v * th[j], 0));
      const q = p * (1 - p);
      for (let a = 0; a < n; a++) {
        if (!r[a]) continue;
        g[a] += (p - ex[i].y) * r[a];
        for (let c = 0; c < n; c++) if (r[c]) H[a][c] += q * r[a] * r[c];
      }
    });
    const step = solve(H, g);
    if (!step) break;
    th = th.map((t, j) => t - step[j]);
    if (Math.max(...step.map(Math.abs)) < 1e-9) break;
  }
  const w = {};
  names.forEach((k, j) => { if (Math.abs(th[j + 1]) > 1e-9) w[k] = th[j + 1]; });
  return { b: th[0], w, mean, sd };
}

/** Share of (used, dropped) pairs a score orders right; ties count half. null without both kinds. */
export function auc(ex, score) {
  const pos = ex.filter((e) => e.y === 1).map(score), neg = ex.filter((e) => e.y === 0).map(score);
  if (!pos.length || !neg.length) return null;
  let s = 0;
  for (const p of pos) for (const q of neg) s += p > q ? 1 : p === q ? 0.5 : 0;
  return s / (pos.length * neg.length);
}

/** Oldest first; a full order, so the input order never changes the fit. */
function byTime(a, b) {
  if (a.at !== b.at) return a.at < b.at ? -1 : 1;
  if (a.base !== b.base) return a.base - b.base;
  if (a.y !== b.y) return a.y - b.y;
  const x = JSON.stringify(a.features), y = JSON.stringify(b.features);
  return x < y ? -1 : x > y ? 1 : 0;
}

/**
 * Learns the personal model from verdicts, with the thresholds and the held-out check. Deterministic.
 * @param {Example[]} examples
 * @param {{lambda?: number, check?: boolean}} [o] check: false skips the held-out check (measurement only)
 * @returns {Model}
 */
export function learn(examples, { lambda = LAMBDA, check: guard = true } = {}) {
  const ex = examples.filter((e) => (e.y === 0 || e.y === 1) && Number.isFinite(e.base) && e.base >= 1).slice().sort(byTime);
  const used = ex.filter((e) => e.y === 1), dropped = ex.filter((e) => e.y === 0);
  const counts = { verdicts: ex.length, used: used.length, dropped: dropped.length };
  const needed = { verdicts: Math.max(0, MIN_VERDICTS - ex.length), used: Math.max(0, MIN_USED - used.length), dropped: Math.max(0, MIN_DROPPED - dropped.length) };
  if (needed.verdicts || needed.used || needed.dropped) return { active: false, reason: 'few', counts, needed, check: null, fit: null };
  const cut = (xs) => xs.length - Math.max(1, Math.ceil(xs.length * HOLDOUT));
  const train = [...used.slice(0, cut(used)), ...dropped.slice(0, cut(dropped))].sort(byTime);
  const held = [...used.slice(cut(used)), ...dropped.slice(cut(dropped))].sort(byTime);
  const f = fit(train, lambda);
  const check = {
    heldOut: held.length,
    auc: auc(held, (e) => baseScore(e.base) + tasteScore(e.features, f)),
    aucDefault: auc(held, (e) => baseScore(e.base)),
  };
  if (guard && check.auc < check.aucDefault) return { active: false, reason: 'worse', counts, needed, check, fit: null };
  return { active: true, reason: 'on', counts, needed, check, fit: fit(ex, lambda) };
}

/**
 * Verdicts in a taste record: the latest decision per story, used or dropped, with its default position.
 * @param {import('./taste.mjs').Taste} t @returns {Example[]}
 */
export function examplesOf(t) {
  const last = new Map();
  for (const x of t.events) {
    if (!['use', 'drop', 'later', 'open', 'drafted', 'published'].includes(x.event)) continue;
    last.set(`${x.project}/${x.story}`, x);
  }
  const out = [];
  for (const x of last.values()) {
    const y = USED.includes(x.event) ? 1 : x.event === 'drop' ? 0 : null;
    const base = x.base ?? x.rank;
    if (y === null || base === null) continue;
    out.push({ y, base, at: x.at, features: x.features });
  }
  return out;
}

const memo = new Map();
/**
 * The personal model for a loaded config: off unless `rank.personal` is true, else learned from <cache>/taste.json
 * (kept in memory while the file is unchanged).
 * @param {{cacheDir: string, rank?: {personal?: boolean}}} cfg @returns {Model}
 */
export function personalModel(cfg) {
  const off = { active: false, reason: /** @type {'off'} */ ('off'), counts: { verdicts: 0, used: 0, dropped: 0 }, needed: { verdicts: MIN_VERDICTS, used: MIN_USED, dropped: MIN_DROPPED }, check: null, fit: null };
  if (cfg?.rank?.personal !== true) return off;
  const file = path.join(cfg.cacheDir, FILE);
  let stamp = 'none';
  try { const s = fs.statSync(file); stamp = `${s.mtimeMs}:${s.size}`; } catch { /* no record yet */ }
  const hit = memo.get(file);
  if (hit?.stamp === stamp) return hit.model;
  const model = learn(examplesOf(load(cfg.cacheDir)));
  memo.set(file, { stamp, model });
  return model;
}

/**
 * Stories in personal order: `ranked` is the default order (best first). Without an active model the same order,
 * as a new array. With one: by default score plus taste points, then one place in the top 5 for the default order.
 * @template {{id: string, data: Record<string, any>}} T @param {T[]} ranked @param {Model} model
 * @param {{explore?: boolean}} [o] explore: false drops the place kept for the default order (measurement only)
 * @returns {T[]}
 */
export function personalOrder(ranked, model, { explore = true } = {}) {
  if (!model?.active) return ranked.slice();
  const keyed = ranked.map((s, i) => ({ s, i, k: baseScore(i + 1) + tasteScore(snapshot(s.data), model.fit) }));
  keyed.sort((a, b) => b.k - a.k || a.i - b.i);
  const order = keyed.map((x) => x.s);
  if (!explore || order.length < EXPLORE_AT) return order;
  const top = new Set(order.slice(0, EXPLORE_AT - 1));
  const pick = ranked.find((s) => !top.has(s));
  const rest = order.slice(EXPLORE_AT - 1).filter((s) => s !== pick);
  return [...order.slice(0, EXPLORE_AT - 1), pick, ...rest];
}

/**
 * Default order then personal order. @template {{id: string, data: Record<string, any>}} T
 * @param {T[]} stories @param {import('./rank.mjs').RankTable|undefined} table @param {Model} model @returns {T[]}
 */
export function rankStories(stories, table, model) {
  return personalOrder(sortRanked(stories, table), model);
}

const tensionWord = (id, en) => {
  const t = VOCAB.tensions.find((x) => x.id === id);
  return (en ? t?.label_en : t?.label) ?? id;
};
const signalWord = (id) => VOCAB.signals.find((x) => x.id === id)?.label ?? id;
const NUMBER_WORDS = { stakes: 'stakes', strength: 'strength', hits: 'hits', completeness: 'completeness' };

/**
 * One reason in words. `vi` for the CLI, English for the web UI.
 * @param {string} feature @param {number} points @param {'vi'|'en'} lang
 */
export function reasonText(feature, points, lang = 'vi') {
  const up = points > 0;
  const [k, v] = feature.split('=');
  if (lang === 'en') {
    const verb = up ? 'You often use' : 'You often drop';
    if (k === 'tension') return `${verb} stories of the kind "${tensionWord(v, true)}"`;
    if (k === 'signal') return `${verb} stories with the signal "${signalWord(v)}"`;
    if (k === 'outsider_only') return `${verb} stories only the outsider read found`;
    if (k === 'has_angle') return `${verb} stories with a story angle`;
    return `${verb} stories with this ${NUMBER_WORDS[k] ?? k}`;
  }
  const verb = up ? 'bạn hay dùng' : 'bạn hay bỏ';
  if (k === 'tension') return `${verb} chuyện giằng xé "${tensionWord(v, false)}"`;
  if (k === 'signal') return `${verb} chuyện có tín hiệu "${signalWord(v)}"`;
  if (k === 'outsider_only') return `${verb} chuyện chỉ bước outsider tìm ra`;
  if (k === 'has_angle') return `${verb} chuyện có góc kể`;
  return `${verb} chuyện có ${NUMBER_WORDS[k] ?? k} như thế này`;
}

/**
 * Why taste moved a story: default and personal position, the taste points and the features behind them, biggest
 * first, in the direction it moved; `explore` when it holds the place kept for the default order.
 * @param {{id: string, data: Record<string, any>}} story @param {{id: string}[]} ranked default order
 * @param {{id: string}[]} personal personal order @param {Model} model
 * @returns {{from: number, to: number, points: number, explore: boolean, reasons: {feature: string, points: number, text: string}[], line: string}|null}
 *   null without an active model
 */
export function tasteWhy(story, ranked, personal, model) {
  if (!model?.active) return null;
  const from = ranked.indexOf(story) + 1, to = personal.indexOf(story) + 1;
  const parts = contributions(snapshot(story.data), model.fit);
  const points = parts.reduce((a, c) => a + c.points, 0);
  const dir = Math.sign(points);
  const reasons = Math.abs(points) < MIN_POINTS ? [] : parts.filter((c) => Math.sign(c.points) === dir && Math.abs(c.points) >= MIN_POINTS)
    .sort((a, b) => Math.abs(b.points) - Math.abs(a.points) || a.feature.localeCompare(b.feature)).slice(0, 2)
    .map((c) => ({ feature: c.feature, points: c.points, text: reasonText(c.feature, c.points, 'vi') }));
  const explore = to === EXPLORE_AT && personal.length >= EXPLORE_AT && !personal.slice(0, EXPLORE_AT - 1).includes(story) && ranked.find((s) => !personal.slice(0, EXPLORE_AT - 1).includes(s)) === story;
  let line;
  if (explore) line = `Chỗ khám phá: chuyện đầu bảng mặc định mà gu chưa đưa lên top ${EXPLORE_AT - 1}`;
  else if (!reasons.length || from === to) line = to === from ? 'Gu của bạn không đổi chỗ chuyện này' : `Gu của bạn đẩy chuyện khác ${to < from ? 'xuống' : 'lên'}, chuyện này từ hạng ${from} sang ${to}`;
  else line = `Gu của bạn đưa chuyện này từ hạng ${from} ${to < from ? 'lên' : 'xuống'} ${to}: ${reasons.map((r) => r.text).join('; ')}`;
  return { from, to, points, explore, reasons, line };
}

/**
 * The learned weights, biggest first, with words. @param {Model} model @param {number} [n]
 * @returns {{feature: string, weight: number, text: string}[]}
 */
export function topWeights(model, n = 5) {
  if (!model?.fit) return [];
  return Object.entries(model.fit.w).filter(([, w]) => Math.abs(w) >= MIN_POINTS)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]) || a[0].localeCompare(b[0])).slice(0, n)
    .map(([feature, weight]) => ({ feature, weight, text: reasonText(feature, weight, 'vi') }));
}
