// Metric math for the eval harness: rank quality against labels, per-step model cost, run-to-run difference.
// Pure functions, no I/O (definitions: scripts/eval/README.md).
import { matches, storyText } from './labels.mjs';

/**
 * @typedef {object} LabelHit
 * @property {string} name @property {boolean} t
 * @property {number|null} rank   best (smallest) 1-based rank of a matching story, null when none matches
 * @property {number[]} ranks     every matching rank
 */

/**
 * @typedef {object} RankMetrics
 * @property {number} stories        N, length of the ranked list
 * @property {number} labels         expected stories in the label file
 * @property {number} found          labels with at least one matching story
 * @property {number|null} recall    found / labels
 * @property {number|null} p5        stories in the top min(5, N) matching any label, divided by min(5, N)
 * @property {number|null} p10       same for 10
 * @property {number} tLabels        labels flagged `t`
 * @property {number} tFound
 * @property {number|null} tMeanRank mean best rank of found `t` labels
 * @property {number} half           ceil(N / 2)
 * @property {number} tTopHalf       `t` labels whose best rank <= half (DM.5 wants all of them)
 * @property {LabelHit[]} perLabel
 */

const ratio = (a, b) => (b > 0 ? a / b : null);

function precisionAt(relevant, k) {
  const n = Math.min(k, relevant.length);
  return n ? relevant.slice(0, n).filter(Boolean).length / n : null;
}

/**
 * @param {{id: string, data?: object, body?: string}[]} ranked  best first
 * @param {import('./labels.mjs').Label[]} labels
 * @returns {RankMetrics}
 */
export function rankMetrics(ranked, labels) {
  const texts = ranked.map((s) => storyText(s));
  const relevant = ranked.map(() => false);
  const perLabel = labels.map((l) => {
    const ranks = [];
    ranked.forEach((s, i) => { if (matches(s, l, texts[i])) { ranks.push(i + 1); relevant[i] = true; } });
    return { name: l.name, t: l.t, rank: ranks[0] ?? null, ranks };
  });
  const N = ranked.length;
  const half = Math.ceil(N / 2);
  const t = perLabel.filter((x) => x.t);
  const tFoundRanks = t.filter((x) => x.rank != null).map((x) => x.rank);
  return {
    stories: N, labels: labels.length, found: perLabel.filter((x) => x.rank != null).length,
    recall: ratio(perLabel.filter((x) => x.rank != null).length, labels.length),
    p5: precisionAt(relevant, 5), p10: precisionAt(relevant, 10),
    tLabels: t.length, tFound: tFoundRanks.length,
    tMeanRank: tFoundRanks.length ? tFoundRanks.reduce((a, b) => a + b, 0) / tFoundRanks.length : null,
    half, tTopHalf: tFoundRanks.filter((r) => r <= half).length, perLabel,
  };
}

/** Steps in pipeline order; `fill` is the harvest fill loop, `profile` the project profile the angle step opens with. */
export const STEPS = ['harvest', 'fill', 'cluster', 'outsider', 'hook-tension', 'stakes', 'profile', 'angle'];

/** Orders of the ranked list the harness can measure: the default rank (lib/rank.mjs) or story completeness first. */
export const RANK_BY = Object.freeze(['default', 'completeness']);

/**
 * The ranked list re-ordered by `completeness` (filled spine slots, 0–7) high to low, the default rank breaking ties;
 * stories the angle step never looked at come last, in default order. Measures "rank by completeness" without
 * changing the product's ranking key. @template {{data?: Record<string, any>}} T @param {T[]} ranked @returns {T[]}
 */
export function byCompleteness(ranked) {
  const c = (s) => (Number.isInteger(s?.data?.completeness) ? s.data.completeness : -1);
  return ranked.map((s, i) => ({ s, i })).sort((a, b) => c(b.s) - c(a.s) || a.i - b.i).map((x) => x.s);
}

/** Pipeline step of a fake-llm key (`harvest-fill-c1-r1-f1-retry` -> `fill`); unknown keys -> `other`. @param {string} key */
export function stepOf(key) {
  const k = String(key).replace(/-retry$/, '');
  if (k.startsWith('harvest-fill-')) return 'fill';
  for (const s of STEPS) if (k === s || k.startsWith(`${s}-`)) return s;
  return 'other';
}

/**
 * @typedef {object} CallUsage
 * @property {string} key @property {string} step
 * @property {number} usd @property {number} secs
 * @property {number} tokIn   input + cache write + cache read
 * @property {number} tokOut
 * @property {number} cacheRead
 */

const n0 = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** Usage of one saved `claude -p --output-format json` output. @param {string} key @param {any} raw parsed JSON @returns {CallUsage} */
export function callUsage(key, raw) {
  const u = raw?.usage || {};
  const cacheRead = n0(u.cache_read_input_tokens);
  return {
    key, step: stepOf(key), usd: n0(raw?.total_cost_usd), secs: n0(raw?.duration_ms) / 1000,
    tokIn: n0(u.input_tokens) + n0(u.cache_creation_input_tokens) + cacheRead, tokOut: n0(u.output_tokens), cacheRead,
  };
}

/**
 * @typedef {{calls: number, tokIn: number, tokOut: number, usd: number, secs: number, share: number|null}} StepCost
 */

/**
 * Sums calls per step (STEPS order, then `other`), plus `total`; `share` = step USD / total USD.
 * @param {CallUsage[]} calls @returns {Record<string, StepCost>}
 */
export function stepCosts(calls) {
  const out = {};
  const blank = () => ({ calls: 0, tokIn: 0, tokOut: 0, usd: 0, secs: 0, share: null });
  for (const s of [...STEPS, 'other']) out[s] = blank();
  const total = blank();
  for (const c of calls) {
    for (const t of [out[c.step] ?? (out[c.step] = blank()), total]) {
      t.calls++; t.tokIn += c.tokIn; t.tokOut += c.tokOut; t.usd += c.usd; t.secs += c.secs;
    }
  }
  for (const [k, v] of Object.entries(out)) { if (!v.calls) delete out[k]; else v.share = ratio(v.usd, total.usd); }
  out.total = { ...total, share: total.calls ? 1 : null };
  return out;
}

/** Adds step tables (sessions -> one table). @param {Record<string, StepCost>[]} tables @returns {Record<string, StepCost>} */
export function addStepCosts(tables) {
  const out = {};
  for (const tb of tables) {
    for (const [k, v] of Object.entries(tb)) {
      const t = (out[k] ??= { calls: 0, tokIn: 0, tokOut: 0, usd: 0, secs: 0, share: null });
      t.calls += v.calls; t.tokIn += v.tokIn; t.tokOut += v.tokOut; t.usd += v.usd; t.secs += v.secs;
    }
  }
  const total = out.total?.usd ?? 0;
  for (const v of Object.values(out)) v.share = ratio(v.usd, total);
  return out;
}

const delta = (a, b) => (a == null || b == null ? null : b - a);

/**
 * Difference between two captures of one session (b - a). `labelAgreement`: share of labels whose found / not-found
 * status is the same in both; `tTopHalfAgreement`: same for "`t` label in the top half".
 * @param {{stories: number, usd: number|null, secs: number|null, rank?: RankMetrics|null}} a @param {typeof a} b
 */
export function runDiff(a, b) {
  const out = { stories: delta(a.stories, b.stories), usd: delta(a.usd, b.usd), secs: delta(a.secs, b.secs) };
  if (!a.rank || !b.rank) return out;
  const ra = a.rank, rb = b.rank;
  const same = (f) => ra.perLabel.filter((x, i) => f(x, ra) === f(rb.perLabel[i], rb)).length;
  const tIdx = ra.perLabel.map((x, i) => (x.t ? i : -1)).filter((i) => i >= 0);
  const inHalf = (x, r) => x.rank != null && x.rank <= r.half;
  return {
    ...out, recall: delta(ra.recall, rb.recall), p5: delta(ra.p5, rb.p5), p10: delta(ra.p10, rb.p10),
    tMeanRank: delta(ra.tMeanRank, rb.tMeanRank), tTopHalf: delta(ra.tTopHalf, rb.tTopHalf),
    labelAgreement: ratio(same((x) => x.rank != null), ra.perLabel.length),
    tTopHalfAgreement: ratio(tIdx.filter((i) => inHalf(ra.perLabel[i], ra) === inHalf(rb.perLabel[i], rb)).length, tIdx.length),
  };
}

/** Mean of the non-null values, null when none. @param {(number|null|undefined)[]} xs */
export function mean(xs) {
  const v = xs.filter((x) => typeof x === 'number' && Number.isFinite(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}
