// Output validators (PRD 5.5, DM.4/DM.5). Each returns a list of error messages; [] = valid.
import { TENSIONS } from './box.mjs';

const isObj = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const isStr = x => typeof x === 'string';
const nonEmpty = x => isStr(x) && x.trim() !== '';
const isScore = x => Number.isInteger(x) && x >= 0 && x <= 3;
/** A line ref the model may write: 812, "812", "L812", "[L812]", "L812-L820". */
const isLineRef = x => (Number.isInteger(x) && x > 0) || (isStr(x) && /\d/.test(x));

function root(json, key, errs) {
  if (!isObj(json)) { errs.push('đầu ra không phải JSON object'); return null; }
  if (!Array.isArray(json[key])) { errs.push(`thiếu mảng "${key}"`); return null; }
  return json[key];
}

/** Every input id exactly once, no unknown id. */
function exactlyOnce(items, ids, key, errs) {
  const want = new Set(ids);
  const seen = new Set();
  for (const [i, it] of items.entries()) {
    const id = it?.id;
    if (!want.has(id)) errs.push(`${key}[${i}]: id lạ ${JSON.stringify(id)}`);
    else if (seen.has(id)) errs.push(`${key}[${i}]: id ${id} lặp`);
    else seen.add(id);
  }
  for (const id of want) if (!seen.has(id)) errs.push(`${key}: thiếu id ${id}`);
}

/**
 * stories[] need title, what_happened, lines; hotspots[] verdict in story|skip; unknown hotspot ids are errors.
 * Missing ids are NOT errors here (they go to the fill loop).
 * @param {any} json @param {{hotspotIds: string[]}} input @returns {string[]}
 */
export function validateHarvest(json, input) {
  const errs = [];
  const stories = root(json, 'stories', errs);
  if (!stories) return errs;
  stories.forEach((s, i) => {
    if (!isObj(s)) return errs.push(`stories[${i}]: không phải object`);
    if (!nonEmpty(s.title)) errs.push(`stories[${i}]: thiếu title`);
    if (!nonEmpty(s.what_happened)) errs.push(`stories[${i}]: thiếu what_happened`);
    if (!Array.isArray(s.lines) || !s.lines.length) errs.push(`stories[${i}]: thiếu lines`);
    else if (!s.lines.every(isLineRef)) errs.push(`stories[${i}]: lines có phần tử không phải số dòng`);
    if (s.signals != null && !Array.isArray(s.signals)) errs.push(`stories[${i}]: signals không phải mảng`);
  });
  if (json.hotspots == null) return errs;
  if (!Array.isArray(json.hotspots)) return [...errs, '"hotspots" không phải mảng'];
  const known = new Set(input?.hotspotIds ?? []);
  json.hotspots.forEach((h, i) => {
    if (!isObj(h)) return errs.push(`hotspots[${i}]: không phải object`);
    if (!known.has(h.id)) errs.push(`hotspots[${i}]: id lạ ${JSON.stringify(h.id)}`);
    if (h.verdict !== 'story' && h.verdict !== 'skip') errs.push(`hotspots[${i}]: verdict ${JSON.stringify(h.verdict)} ngoài story|skip`);
  });
  return errs;
}

/** clusters[] with title, summary, signals, members; members must be known ids (partition checked by cluster.checkPartition). @param {any} json @param {{ids: string[]}} input @returns {string[]} */
export function validateCluster(json, input) {
  const errs = [];
  const clusters = root(json, 'clusters', errs);
  if (!clusters) return errs;
  const known = new Set(input?.ids ?? []);
  clusters.forEach((c, i) => {
    if (!isObj(c)) return errs.push(`clusters[${i}]: không phải object`);
    if (!nonEmpty(c.title)) errs.push(`clusters[${i}]: thiếu title`);
    if (!isStr(c.summary)) errs.push(`clusters[${i}]: thiếu summary`);
    if (!Array.isArray(c.signals)) errs.push(`clusters[${i}]: signals không phải mảng`);
    if (!Array.isArray(c.members) || !c.members.length) return errs.push(`clusters[${i}]: thiếu members`);
    for (const m of c.members) if (!known.has(m)) errs.push(`clusters[${i}]: id lạ ${JSON.stringify(m)}`);
  });
  return errs;
}

/** hooks[] for every id exactly once; tension in TENSIONS; strength int 0-3. @param {any} json @param {{ids: string[]}} input @returns {string[]} */
export function validateHookTension(json, input) {
  const errs = [];
  const hooks = root(json, 'hooks', errs);
  if (!hooks) return errs;
  hooks.forEach((h, i) => {
    if (!isObj(h)) return errs.push(`hooks[${i}]: không phải object`);
    if (!isStr(h.hook)) errs.push(`hooks[${i}]: thiếu hook`);
    if (!TENSIONS.includes(h.tension)) errs.push(`hooks[${i}]: tension ${JSON.stringify(h.tension)} ngoài danh sách`);
    if (!isScore(h.strength)) errs.push(`hooks[${i}]: strength ${JSON.stringify(h.strength)} ngoài 0-3`);
    for (const k of ['side_a', 'side_b']) if (h[k] != null && !isStr(h[k])) errs.push(`hooks[${i}]: ${k} không phải chuỗi`);
  });
  exactlyOnce(hooks.filter(isObj), input?.ids ?? [], 'hooks', errs);
  return errs;
}

/** main_goal string; stakes[] for every id exactly once, stakes int 0-3, reason string. @param {any} json @param {{ids: string[]}} input @returns {string[]} */
export function validateStakes(json, input) {
  const errs = [];
  const items = root(json, 'stakes', errs);
  if (!items) return errs;
  if (!isStr(json.main_goal)) errs.push('thiếu main_goal');
  items.forEach((s, i) => {
    if (!isObj(s)) return errs.push(`stakes[${i}]: không phải object`);
    if (!isScore(s.stakes)) errs.push(`stakes[${i}]: stakes ${JSON.stringify(s.stakes)} ngoài 0-3`);
    if (!isStr(s.reason)) errs.push(`stakes[${i}]: thiếu reason`);
  });
  exactlyOnce(items.filter(isObj), input?.ids ?? [], 'stakes', errs);
  return errs;
}

/** outsider[] with what, common_practice, gap, lines; already_picked null or a known cluster id. @param {any} json @param {{ids: string[]}} input @returns {string[]} */
export function validateOutsider(json, input) {
  const errs = [];
  const items = root(json, 'outsider', errs);
  if (!items) return errs;
  const known = new Set(input?.ids ?? []);
  items.forEach((o, i) => {
    if (!isObj(o)) return errs.push(`outsider[${i}]: không phải object`);
    if (!nonEmpty(o.what)) errs.push(`outsider[${i}]: thiếu what`);
    if (!isStr(o.common_practice)) errs.push(`outsider[${i}]: thiếu common_practice`);
    if (!isStr(o.gap)) errs.push(`outsider[${i}]: thiếu gap`);
    if (!Array.isArray(o.lines) || !o.lines.every(isLineRef)) errs.push(`outsider[${i}]: lines không phải mảng số dòng`);
    const p = o.already_picked;
    if (p != null && p !== '' && !known.has(p)) errs.push(`outsider[${i}]: already_picked lạ ${JSON.stringify(p)}`);
  });
  return errs;
}

/** Longest angle, audience and none-reason the step accepts (the prompt asks for 1–3 sentences and a short phrase). */
export const ANGLE_MAX = Object.freeze({ angle: 600, audience: 150, reason: 300 });

/** One evidence line: 812, "812", "L812" or "[L812]" -> 812; anything else (ranges, words) -> null. @param {any} x */
export function evidenceLine(x) {
  if (Number.isInteger(x)) return x > 0 ? x : null;
  const m = isStr(x) ? /^\s*\[?L?(\d+)\]?\s*$/i.exec(x) : null;
  return m && Number(m[1]) > 0 ? Number(m[1]) : null;
}

/**
 * Story angle: either `{none: true, reason}` or `{angle, audience, evidence}` where every evidence line is one of the
 * lines given to the model (`input.lines`). @param {any} json @param {{lines: number[]}} input @returns {string[]}
 */
export function validateAngle(json, input) {
  if (!isObj(json)) return ['đầu ra không phải JSON object'];
  const errs = [];
  if (json.none === true) {
    if (!nonEmpty(json.reason)) errs.push('none: thiếu reason');
    else if (json.reason.length > ANGLE_MAX.reason) errs.push(`none: reason dài quá ${ANGLE_MAX.reason} ký tự`);
    return errs;
  }
  if (json.none != null && json.none !== false) errs.push(`none phải là true hoặc bỏ trống, gặp ${JSON.stringify(json.none)}`);
  for (const k of ['angle', 'audience']) {
    if (!nonEmpty(json[k])) errs.push(`thiếu ${k}`);
    else if (json[k].length > ANGLE_MAX[k]) errs.push(`${k} dài quá ${ANGLE_MAX[k]} ký tự`);
  }
  if (!Array.isArray(json.evidence) || !json.evidence.length) return [...errs, 'evidence phải là mảng số dòng không rỗng'];
  const given = new Set(input?.lines ?? []);
  const bad = json.evidence.filter((x) => { const n = evidenceLine(x); return n === null || !given.has(n); });
  if (bad.length) errs.push(`evidence ngoài các dòng đã đưa: ${bad.slice(0, 5).map((x) => JSON.stringify(x)).join(', ')}`);
  return errs;
}
