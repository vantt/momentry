// Ranking (PRD 5.9). No threshold; only order changes. The rules are a table looked up at run time (rules/rank.json):
// ordered tiers, score adjustments inside a tier, tie-breakers. Conditions use a fixed feature vocabulary computed
// here; there are no free expressions. Measured on replayed captures of 8 labelled sessions:
// docs/experiments/2026-11-05-ranking/README.md. How to change a rule: docs/development.md.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

/** The shipped rule table. */
export const RANK_FILE = fileURLToPath(new URL('../rules/rank.json', import.meta.url));

const int = (v) => (Number.isInteger(v) ? v : null);
const text = (v) => (typeof v === 'string' && v ? v : null);
const list = (v) => (Array.isArray(v) ? v.map(String) : []);

/**
 * Found only by the outsider step: `hit_by` has `outsider` but neither `harvest` nor `bip`. Such stories retell a
 * practice from the outside angle; no harvest run caught them as an event, and few are truly notable.
 * A later harvest that merges into the story appends `harvest` and lifts it back.
 * @param {Record<string, any>} d
 */
function outsiderOnly(d) {
  const by = Array.isArray(d?.hit_by) ? d.hit_by : [];
  return by.includes('outsider') && !by.includes('harvest') && !by.includes('bip');
}

/**
 * Features a rule may name, computed from a story's frontmatter. A value that is absent or of the wrong type is
 * null (missing): every condition on a missing value is false, an adjustment on it leaves the story unscored
 * (last in its tier), a tie-breaker on it sorts the story last.
 * kind: number (integers; `date` is ms since epoch), string, bool (never missing), set (string list, never missing).
 * @type {Record<string, {kind: 'number'|'string'|'bool'|'set', get: (d: Record<string, any>) => any}>}
 */
export const FEATURES = Object.freeze({
  tension: { kind: 'string', get: (d) => text(d.tension) },
  stakes: { kind: 'number', get: (d) => int(d.stakes) },
  strength: { kind: 'number', get: (d) => int(d.strength) },
  hits: { kind: 'number', get: (d) => int(d.hits) },
  completeness: { kind: 'number', get: (d) => int(d.completeness) },
  date: { kind: 'number', get: (d) => { const t = typeof d.date === 'string' ? Date.parse(d.date) : NaN; return Number.isNaN(t) ? null : t; } },
  outsider_only: { kind: 'bool', get: outsiderOnly },
  has_angle: { kind: 'bool', get: (d) => typeof d.angle === 'string' && d.angle.trim() !== '' && d.angle.trim() !== 'none' },
  captured_by: { kind: 'string', get: (d) => text(d.captured_by) },
  signals: { kind: 'set', get: (d) => list(d.signals) },
  hit_by: { kind: 'set', get: (d) => list(d.hit_by) },
});

/** Operators each feature kind accepts. `in`: the value is one of a list; for a set, any member is. */
const OPS = Object.freeze({
  number: ['<', '<=', '=', '!=', '>=', '>', 'in'],
  string: ['=', '!=', 'in'],
  bool: ['=', '!='],
  set: ['in'],
});
const ALL_OPS = [...new Set(Object.values(OPS).flat())];
const ID = /^[a-z][a-z0-9_]*$/;
const TOP_KEYS = ['version', 'about', 'tiers', 'adjust', 'tiebreak'];

/**
 * @typedef {{feature: string, op: string, value: any}} Condition
 * @typedef {{id: string, when: Condition[], why: string, evidence: string}} Tier
 * @typedef {{id: string, when: Condition[], feature: string|null, weight: number, why: string, evidence: string}} Adjust
 * @typedef {{feature: string, dir: 'asc'|'desc'}} Tiebreak
 * @typedef {{tiers: Tier[], adjust: Adjust[], tiebreak: Tiebreak[], disabled: string[]}} RankTable
 */

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const scalarOk = (kind, v) => (kind === 'bool' ? typeof v === 'boolean' : kind === 'number' ? typeof v === 'number' && Number.isFinite(v) : typeof v === 'string');

/** Checks one condition; `date` values may be written as date strings. @returns {Condition} */
function condition(c, where, errs) {
  if (!isObj(c)) { errs.push(`${where}: điều kiện phải là {feature, op, value}`); return null; }
  const extra = Object.keys(c).filter((k) => !['feature', 'op', 'value'].includes(k));
  if (extra.length) errs.push(`${where}: khoá lạ ${extra.join(', ')}`);
  const f = FEATURES[c.feature];
  if (!f) { errs.push(`${where}: đặc trưng lạ ${JSON.stringify(c.feature)} (có: ${Object.keys(FEATURES).join(', ')})`); return null; }
  if (!ALL_OPS.includes(c.op)) { errs.push(`${where}: phép so lạ ${JSON.stringify(c.op)} (có: ${ALL_OPS.join(' ')})`); return null; }
  if (!OPS[f.kind].includes(c.op)) { errs.push(`${where}: ${c.feature} không dùng được với ${c.op} (chỉ ${OPS[f.kind].join(' ')})`); return null; }
  const kind = f.kind === 'set' ? 'string' : f.kind;
  const norm = (v) => (c.feature === 'date' && typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? Date.parse(v) : v);
  if (c.op === 'in') {
    const vals = Array.isArray(c.value) ? c.value.map(norm) : null;
    if (!vals?.length || !vals.every((v) => scalarOk(kind, v))) { errs.push(`${where}: ${c.feature} in cần một mảng ${kind} không rỗng`); return null; }
    return { feature: c.feature, op: c.op, value: vals };
  }
  const v = norm(c.value);
  if (!scalarOk(kind, v)) { errs.push(`${where}: ${c.feature} ${c.op} cần giá trị ${kind}, nhận ${JSON.stringify(c.value)}`); return null; }
  return { feature: c.feature, op: c.op, value: v };
}

function conditions(when, where, errs) {
  if (when === undefined) return [];
  if (!Array.isArray(when)) { errs.push(`${where}: when phải là mảng`); return []; }
  return when.map((c, i) => condition(c, `${where} when[${i}]`, errs)).filter(Boolean);
}

/** id, why and evidence of a tier or adjustment; ids are unique over the whole table. */
function ruleHead(r, where, seen, errs) {
  if (!isObj(r)) { errs.push(`${where}: luật phải là object`); return null; }
  const id = r.id;
  if (typeof id !== 'string' || !ID.test(id)) { errs.push(`${where}: id ${JSON.stringify(id)} phải dạng a-z0-9_`); return null; }
  if (seen.has(id)) errs.push(`luật ${id}: id lặp`);
  seen.add(id);
  for (const k of ['why', 'evidence']) if (typeof r[k] !== 'string' || !r[k].trim()) errs.push(`luật ${id}: thiếu ${k}`);
  return id;
}

/**
 * Validates a raw table (parsed rules/rank.json) and returns it in run-time form, or the list of errors, each
 * naming the rule it is about.
 * @param {any} raw @returns {{table: RankTable|null, errors: string[]}}
 */
export function compileTable(raw) {
  const errs = [];
  if (!isObj(raw)) return { table: null, errors: ['bảng xếp hạng phải là JSON object'] };
  const extra = Object.keys(raw).filter((k) => !TOP_KEYS.includes(k));
  if (extra.length) errs.push(`khoá lạ: ${extra.join(', ')}`);
  if (raw.version !== 1) errs.push(`version phải là 1, nhận ${JSON.stringify(raw.version)}`);
  if (!Array.isArray(raw.tiers) || !raw.tiers.length) errs.push('tiers phải là mảng không rỗng');
  if (!Array.isArray(raw.adjust)) errs.push('adjust phải là mảng');
  if (!Array.isArray(raw.tiebreak)) errs.push('tiebreak phải là mảng');
  if (errs.length) return { table: null, errors: errs };
  const seen = new Set();
  const tiers = raw.tiers.map((r, i) => {
    const id = ruleHead(r, `tiers[${i}]`, seen, errs);
    if (!id) return null;
    const bad = Object.keys(r).filter((k) => !['id', 'when', 'why', 'evidence'].includes(k));
    if (bad.length) errs.push(`luật ${id}: khoá lạ ${bad.join(', ')}`);
    return { id, when: conditions(r.when, `luật ${id}`, errs), why: r.why, evidence: r.evidence };
  });
  const adjust = raw.adjust.map((r, i) => {
    const id = ruleHead(r, `adjust[${i}]`, seen, errs);
    if (!id) return null;
    const bad = Object.keys(r).filter((k) => !['id', 'when', 'feature', 'weight', 'why', 'evidence'].includes(k));
    if (bad.length) errs.push(`luật ${id}: khoá lạ ${bad.join(', ')}`);
    let feature = null;
    if (r.feature !== undefined) {
      if (FEATURES[r.feature]?.kind !== 'number') errs.push(`luật ${id}: feature phải là đặc trưng số (${Object.keys(FEATURES).filter((k) => FEATURES[k].kind === 'number').join(', ')}), nhận ${JSON.stringify(r.feature)}`);
      else feature = r.feature;
    }
    if (typeof r.weight !== 'number' || !Number.isFinite(r.weight)) errs.push(`luật ${id}: weight phải là số, nhận ${JSON.stringify(r.weight)}`);
    return { id, when: conditions(r.when, `luật ${id}`, errs), feature, weight: r.weight, why: r.why, evidence: r.evidence };
  });
  const tiebreak = raw.tiebreak.map((t, i) => {
    const m = typeof t === 'string' ? /^([a-z_]+) (asc|desc)$/.exec(t) : null;
    if (!m || !(m[1] === 'id' || FEATURES[m[1]]?.kind === 'number')) { errs.push(`tiebreak[${i}]: ${JSON.stringify(t)} phải là "<đặc trưng số hoặc id> asc|desc"`); return null; }
    return { feature: m[1], dir: /** @type {'asc'|'desc'} */ (m[2]) };
  });
  if (errs.length) return { table: null, errors: errs };
  return { table: Object.freeze({ tiers, adjust, tiebreak, disabled: [] }), errors: [] };
}

/** Built-in table, the same rules as rules/rank.json; used when that file is missing or broken. */
export const BUILTIN_TABLE = /** @type {RankTable} */ (compileTable({
  version: 1,
  tiers: [
    { id: 'harvested_with_tension', when: [{ feature: 'outsider_only', op: '=', value: false }, { feature: 'tension', op: '!=', value: 'none' }], why: 'built-in', evidence: 'lib/rank.mjs' },
    { id: 'harvested_no_tension', when: [{ feature: 'outsider_only', op: '=', value: false }, { feature: 'tension', op: '=', value: 'none' }], why: 'built-in', evidence: 'lib/rank.mjs' },
    { id: 'harvested_unscored', when: [{ feature: 'outsider_only', op: '=', value: false }], why: 'built-in', evidence: 'lib/rank.mjs' },
    { id: 'outsider_only_with_tension', when: [{ feature: 'tension', op: '!=', value: 'none' }], why: 'built-in', evidence: 'lib/rank.mjs' },
    { id: 'outsider_only_no_tension', when: [{ feature: 'tension', op: '=', value: 'none' }], why: 'built-in', evidence: 'lib/rank.mjs' },
    { id: 'outsider_only_unscored', when: [], why: 'built-in', evidence: 'lib/rank.mjs' },
  ],
  adjust: [
    { id: 'stakes', feature: 'stakes', weight: 1, why: 'built-in', evidence: 'lib/rank.mjs' },
    { id: 'strength', feature: 'strength', weight: 1, why: 'built-in', evidence: 'lib/rank.mjs' },
  ],
  tiebreak: ['hits desc', 'date desc', 'id asc'],
}).table);

const warned = new Set();
/** Where load and override problems go; each message once per process. Tests replace it. */
export const warnings = { sink: (/** @type {string} */ m) => process.stderr.write(`momentry: ${m}\n`) };
function warnOnce(m) {
  if (warned.has(m)) return;
  warned.add(m);
  warnings.sink(m);
}

/**
 * Reads and validates a rule table file. A missing or broken file gives the built-in table and a warning naming
 * the bad rules.
 * @param {string} [file] @returns {{table: RankTable, errors: string[]}}
 */
export function loadRankTable(file = RANK_FILE) {
  let raw;
  try { raw = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) {
    const errors = [`không đọc được ${file}: ${e.message}`];
    warnOnce(`${errors[0]}; dùng bảng xếp hạng có sẵn`);
    return { table: BUILTIN_TABLE, errors };
  }
  const { table, errors } = compileTable(raw);
  if (table) return { table, errors: [] };
  warnOnce(`bảng xếp hạng ${file} sai (${errors.join('; ')}); dùng bảng có sẵn`);
  return { table: BUILTIN_TABLE, errors };
}

let shipped = null;
/** The shipped table, read once. @returns {RankTable} */
export function defaultTable() {
  shipped ??= loadRankTable().table;
  return shipped;
}

/**
 * Problems with user overrides: `weights` maps an adjustment id to a number, `disabled` lists tier or adjustment
 * ids. Overrides never add conditions.
 * @param {{weights?: any, disabled?: any}} o @param {RankTable} [table] @returns {string[]}
 */
export function checkOverrides(o, table = defaultTable()) {
  const errs = [];
  const adjustIds = table.adjust.map((r) => r.id);
  const allIds = [...table.tiers.map((r) => r.id), ...adjustIds];
  if (o?.weights != null) {
    if (!isObj(o.weights)) errs.push('rank.weights phải là object {id luật: số}');
    else for (const [id, w] of Object.entries(o.weights)) {
      if (!adjustIds.includes(id)) errs.push(`rank.weights.${id}: không có luật điều chỉnh ${id} (có: ${adjustIds.join(', ')})`);
      else if (typeof w !== 'number' || !Number.isFinite(w)) errs.push(`rank.weights.${id}: trọng số phải là số, nhận ${JSON.stringify(w)}`);
    }
  }
  if (o?.disabled != null) {
    if (!Array.isArray(o.disabled)) errs.push('rank.disabled phải là mảng id luật');
    else for (const id of o.disabled) if (!allIds.includes(id)) errs.push(`rank.disabled: không có luật ${JSON.stringify(id)} (có: ${allIds.join(', ')})`);
  }
  return errs;
}

/**
 * The table with user overrides applied. Overrides that name no rule (a rule removed in a newer version) or carry a
 * bad value are skipped with a warning; the rest still apply.
 * @param {{weights?: Record<string, number>, disabled?: string[]}|null|undefined} o @param {RankTable} [table]
 * @returns {RankTable}
 */
export function withOverrides(o, table = defaultTable()) {
  if (!o || (!o.weights && !o.disabled)) return table;
  const errs = checkOverrides(o, table);
  if (errs.length) warnOnce(`bỏ qua cấu hình xếp hạng sai: ${errs.join('; ')}`);
  const weights = isObj(o.weights) ? o.weights : {};
  const disabled = Array.isArray(o.disabled) ? o.disabled.filter((x) => typeof x === 'string') : [];
  const ok = (id, w) => typeof w === 'number' && Number.isFinite(w) && table.adjust.some((r) => r.id === id);
  const adjust = table.adjust.map((r) => (ok(r.id, weights[r.id]) ? { ...r, weight: weights[r.id] } : r));
  return Object.freeze({ ...table, adjust, disabled });
}

/** Table for a loaded config: the shipped table with `rank.weights` and `rank.disabled`. @param {{rank?: any}|null} [cfg] */
export function rankTable(cfg) {
  return withOverrides(cfg?.rank ? { weights: cfg.rank.weights, disabled: cfg.rank.disabled } : null);
}

function holds(c, v) {
  if (v === null) return false;
  if (Array.isArray(v)) return c.value.some((x) => v.includes(x));
  switch (c.op) {
    case '<': return v < c.value;
    case '<=': return v <= c.value;
    case '=': return v === c.value;
    case '!=': return v !== c.value;
    case '>=': return v >= c.value;
    case '>': return v > c.value;
    case 'in': return c.value.includes(v);
    default: return false;
  }
}

/**
 * Where a story stands: tier (index into table.tiers, tiers.length when none matches), score (null when an
 * adjustment that fired has no value) and the adjustments that fired.
 */
function place(story, table) {
  const d = story?.data || {};
  const cache = new Map();
  const f = (name) => { if (!cache.has(name)) cache.set(name, FEATURES[name].get(d)); return cache.get(name); };
  const on = (r) => !table.disabled.includes(r.id) && r.when.every((c) => holds(c, f(c.feature)));
  let tier = table.tiers.findIndex(on);
  if (tier < 0) tier = table.tiers.length;
  const fired = [];
  let score = 0;
  for (const r of table.adjust) {
    if (!on(r)) continue;
    const value = r.feature ? f(r.feature) : null;
    const points = r.feature ? (value === null ? null : r.weight * value) : r.weight;
    fired.push({ id: r.id, feature: r.feature, value, weight: r.weight, points });
    score = score === null || points === null ? null : score + points;
  }
  const ties = table.tiebreak.map((t) => (t.feature === 'id' ? String(story.id) : f(t.feature)));
  return { tier, score, fired, ties };
}

/** Missing last, then higher (desc) or lower (asc) first. */
function cmpValue(a, b, dir) {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  const lt = typeof a === 'string' ? a.localeCompare(b) < 0 : a < b;
  const gt = typeof a === 'string' ? a.localeCompare(b) > 0 : a > b;
  if (!lt && !gt) return 0;
  return (dir === 'asc') === lt ? -1 : 1;
}

/**
 * New array, best first; nothing dropped. Tier, then score (higher first, unscored last), then the tie-breakers,
 * then id.
 * @template {{id: string, data: Record<string, any>}} T @param {T[]} stories @param {RankTable} [table] @returns {T[]}
 */
export function sortRanked(stories, table = defaultTable()) {
  const keyed = stories.map((s) => [place(s, table), s]);
  keyed.sort(([a, x], [b, y]) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    const s = cmpValue(a.score, b.score, 'desc');
    if (s) return s;
    for (let i = 0; i < table.tiebreak.length; i++) {
      const c = cmpValue(a.ties[i], b.ties[i], table.tiebreak[i].dir);
      if (c) return c;
    }
    return String(x.id).localeCompare(String(y.id));
  });
  return keyed.map(([, s]) => s);
}

/**
 * Why a story sits where it does: its tier (null when no tier matches) and the adjustments that fired with their
 * points; `score` is null when one of them had no value (the story sorts last in its tier).
 * @param {{id: string, data: Record<string, any>}} story @param {RankTable} [table]
 * @returns {{tier: {id: string, rank: number, why: string}|null, score: number|null, adjust: {id: string, feature: string|null, value: number|null, weight: number, points: number|null}[]}}
 */
export function explain(story, table = defaultTable()) {
  const p = place(story, table);
  const t = table.tiers[p.tier];
  return { tier: t ? { id: t.id, rank: p.tier + 1, why: t.why } : null, score: p.score, adjust: p.fired };
}
