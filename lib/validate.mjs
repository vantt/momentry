// Output validators (PRD 5.5, DM.4/DM.5). Each returns a list of error messages; [] = valid.
import { TENSIONS, SPINE_SLOTS } from './box.mjs';

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
 * stories[] need title, what_happened, lines; hotspots[] must be objects. Missing answers and answers with an unknown
 * id or verdict are NOT errors here: harvest drops them and the fill loop asks again (`input` names the ids asked).
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
  // An answer with an unknown id or verdict is dropped by harvest and its hotspot goes to the fill loop like an
  // unanswered one; rejecting the reply would throw away every valid story of the window with it.
  json.hotspots.forEach((h, i) => {
    if (!isObj(h)) errs.push(`hotspots[${i}]: không phải object`);
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

/**
 * Longest angle, audience, none-reason and spine slot the step accepts (the prompt asks for 2–4 sentences, a short
 * phrase, and one sentence per slot).
 */
export const ANGLE_MAX = Object.freeze({ angle: 900, audience: 150, reason: 300, slot: 300 });

/** Evidence token of the `context` slot that points at the project profile instead of a transcript line. */
export const PROFILE_REF = 'profile';

/** One evidence line: 812, "812", "L812" or "[L812]" -> 812; anything else (ranges, words) -> null. @param {any} x */
export function evidenceLine(x) {
  if (Number.isInteger(x)) return x > 0 ? x : null;
  const m = isStr(x) ? /^\s*\[?L?(\d+)\]?\s*$/i.exec(x) : null;
  return m && Number(m[1]) > 0 ? Number(m[1]) : null;
}

/** True for an empty spine slot: absent, null, "", or an object whose text and evidence are both empty. */
export function emptySlot(v) {
  if (v == null || v === '') return true;
  if (!isObj(v)) return false;
  return !nonEmpty(v.text) && (!Array.isArray(v.evidence) || !v.evidence.length);
}

/** Evidence of a line list given to the model; `profile` only where `allowProfile`. */
function badEvidence(list, given, allowProfile) {
  return list.filter((x) => {
    if (allowProfile && isStr(x) && x.trim().toLowerCase() === PROFILE_REF) return false;
    const n = evidenceLine(x);
    return n === null || !given.has(n);
  });
}

/**
 * Story spine: an object with the slots of SPINE_SLOTS; each slot empty or `{text, evidence}` with evidence from the
 * given lines (`context` may also cite `profile` when a project profile was given). Unknown keys are ignored.
 * @param {any} spine @param {Set<number>} given @param {boolean} hasProfile @returns {string[]}
 */
function validateSpine(spine, given, hasProfile) {
  if (!isObj(spine)) return ['thiếu spine (object với các ô context, want, obstacle, turn, action, outcome, takeaway)'];
  const errs = [];
  for (const slot of SPINE_SLOTS) {
    const v = spine[slot];
    if (emptySlot(v)) continue;
    if (!isObj(v)) { errs.push(`spine.${slot}: phải là {text, evidence} hoặc null`); continue; }
    if (!nonEmpty(v.text)) errs.push(`spine.${slot}: thiếu text (để trống thì trả null)`);
    else if (v.text.length > ANGLE_MAX.slot) errs.push(`spine.${slot}: text dài quá ${ANGLE_MAX.slot} ký tự`);
    if (!Array.isArray(v.evidence) || !v.evidence.length) { errs.push(`spine.${slot}: evidence phải là mảng số dòng không rỗng`); continue; }
    const bad = badEvidence(v.evidence, given, slot === 'context' && hasProfile);
    if (bad.length) errs.push(`spine.${slot}: evidence ngoài các dòng đã đưa: ${bad.slice(0, 5).map((x) => JSON.stringify(x)).join(', ')}`);
  }
  return errs;
}

/** Filled spine slots, 0–7. @param {any} spine @returns {number} */
export function completeness(spine) {
  return isObj(spine) ? SPINE_SLOTS.filter((k) => !emptySlot(spine[k])).length : 0;
}

/**
 * Story angle with its spine: either `{none: true, reason, spine}` or `{angle, audience, evidence, spine}`. Every
 * evidence line is one of the lines given to the model (`input.lines`: excerpt and session requests).
 * @param {any} json @param {{lines: number[], profile?: boolean}} input @returns {string[]}
 */
export function validateAngle(json, input) {
  if (!isObj(json)) return ['đầu ra không phải JSON object'];
  const given = new Set(input?.lines ?? []);
  const errs = validateSpine(json.spine, given, !!input?.profile);
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
  const bad = badEvidence(json.evidence, given, false);
  if (bad.length) errs.push(`evidence ngoài các dòng đã đưa: ${bad.slice(0, 5).map((x) => JSON.stringify(x)).join(', ')}`);
  return errs;
}

/** Longest project profile and none-reason (the prompt asks for 3–5 sentences). */
export const PROFILE_MAX = Object.freeze({ profile: 1200, reason: 300 });

/** Project profile: `{profile}` or `{none: true, reason}` when the documents do not say what the project is. @param {any} json @returns {string[]} */
export function validateProfile(json) {
  if (!isObj(json)) return ['đầu ra không phải JSON object'];
  if (json.none === true) {
    if (!nonEmpty(json.reason)) return ['none: thiếu reason'];
    return json.reason.length > PROFILE_MAX.reason ? [`none: reason dài quá ${PROFILE_MAX.reason} ký tự`] : [];
  }
  if (!nonEmpty(json.profile)) return ['thiếu profile'];
  return json.profile.length > PROFILE_MAX.profile ? [`profile dài quá ${PROFILE_MAX.profile} ký tự`] : [];
}
