// Story angle (PRD 5.2 step 13): the tellable turn of a ranked story (what people believed, what turned out true, why
// a listener should care), from the story file plus the transcript lines around its `lines` refs. One call per story.
import { render as renderPrompt } from './prompts.mjs';
import { renderEntry } from './reduce.mjs';
import { callJson } from './llm.mjs';
import { validateAngle, evidenceLine } from './validate.mjs';
import { account } from './harvest.mjs';
import { sortRanked } from './rank.mjs';
import { ANGLE_LABEL, ANGLE_NONE } from './box.mjs';

export { ANGLE_NONE };
/** Entries kept on each side of a referenced line; shrinks (2, 1, 0) until the excerpt fits EXCERPT_MAX_CHARS. */
const RADII = [2, 1, 0];
/** About 7.5k tokens of transcript per call (reduce.mjs: 3.2 chars per token). */
export const EXCERPT_MAX_CHARS = 24000;

const oneLine = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

/** True once the step has looked at the story: a tellable angle or `angle: none`. @param {Record<string, any>} data */
export function hasAngle(data) {
  return typeof data?.angle === 'string' && data.angle.trim() !== '';
}

/** The tellable angle, or null (absent or `none`). @param {Record<string, any>} data @returns {string|null} */
export function angleOf(data) {
  return hasAngle(data) && data.angle.trim() !== ANGLE_NONE ? oneLine(data.angle) : null;
}

/**
 * Stories the step should look at: the top `topN` of the ranking (or exactly `ids`), dropped and unreadable files
 * left out, and stories that already have an angle (or `none`) skipped unless `force`.
 * @template {{id: string, data: Record<string, any>, error?: string|null}} T
 * @param {T[]} stories @param {{topN: number, force?: boolean, ids?: string[]|null}} o @returns {T[]}
 */
export function pickStories(stories, { topN, force = false, ids = null }) {
  const ok = stories.filter((s) => !s.error && s.data?.status !== 'dropped');
  const chosen = ids ? sortRanked(ok.filter((s) => ids.includes(s.id))) : sortRanked(ok).slice(0, topN);
  return chosen.filter((s) => force || !hasAngle(s.data));
}

/**
 * Session with the most line refs (first seen on a tie) and its line numbers, from `lines: [<sid>#L<n>, ...]`.
 * A story merged from several sessions is told from its main one; line numbers of different sessions never mix.
 * @param {any} lines @returns {{sid: string, nums: number[]}|null}
 */
export function mainSession(lines) {
  const by = new Map();
  for (const ref of Array.isArray(lines) ? lines : []) {
    const m = /^(.+)#L(\d+)$/.exec(String(ref));
    if (!m || Number(m[2]) < 1) continue;
    if (!by.has(m[1])) by.set(m[1], new Set());
    by.get(m[1]).add(Number(m[2]));
  }
  let best = null;
  for (const [sid, set] of by) if (!best || set.size > best.nums.length) best = { sid, nums: [...set].sort((a, b) => a - b) };
  return best;
}

/**
 * Reduced transcript lines around each referenced line (never the whole session): the entry holding the line plus
 * `radius` entries each side; gaps are marked `…`. The radius shrinks until the text fits `maxChars`, then it is cut.
 * `lines` lists the `[Lnnn]` tags present in the text, the only line numbers the model may cite.
 * @param {import('./sources/claude.mjs').Entry[]} entries one session, in transcript order @param {number[]} nums
 * @param {{maxChars?: number}} [o] @returns {{text: string, lines: number[]}|null}
 */
export function excerpt(entries, nums, { maxChars = EXCERPT_MAX_CHARS } = {}) {
  if (!entries?.length || !nums?.length) return null;
  const at = [];
  for (const n of nums) {
    let j = -1;
    for (let i = 0; i < entries.length && entries[i].L <= n; i++) j = i;
    if (j >= 0) at.push(j);
  }
  if (!at.length) return null;
  for (const radius of RADII) {
    const keep = new Set();
    for (const j of at) for (let k = Math.max(0, j - radius); k <= Math.min(entries.length - 1, j + radius); k++) keep.add(k);
    const out = [];
    let prev = null;
    for (const i of [...keep].sort((a, b) => a - b)) {
      const line = renderEntry(entries[i]);
      if (!line) continue;
      if (prev !== null && i !== prev + 1) out.push('…');
      out.push(line);
      prev = i;
    }
    let text = out.join('\n');
    if (text.length > maxChars && radius !== RADII.at(-1)) continue;
    if (text.length > maxChars) text = `${text.slice(0, maxChars)} …`;
    const lines = [...new Set([...text.matchAll(/^\[L(\d+)\]/gm)].map((m) => Number(m[1])))];
    return lines.length ? { text, lines } : null;
  }
  return null;
}

/** Body without the angle line, so a forced redo is not anchored on the old angle. @param {string} body */
export function bodyWithoutAngle(body) {
  return String(body ?? '').split('\n').filter((l) => !l.startsWith(ANGLE_LABEL)).join('\n');
}

/** Story block of the prompt: scores and sides the ranking steps wrote, then the body. */
function storyText(story) {
  const d = story.data || {};
  const sides = Array.isArray(d.sides) && d.sides.length ? ` (${d.sides.map(oneLine).join(' / ')})` : '';
  return [
    ...(d.hook ? [`hook: ${oneLine(d.hook)}`] : []),
    ...(d.tension ? [`tension: ${d.tension}${sides}`] : []),
    ...(Number.isInteger(d.stakes) ? [`stakes: ${d.stakes}/3`] : []),
    bodyWithoutAngle(story.body).trim(),
  ].join('\n');
}

/**
 * @typedef {{none: true, reason: string} | {none?: false, angle: string, audience: string, evidence: number[]}} AngleResult
 */

/**
 * `angle-<k>`: one model call for one story. Throws (exitCode 4) when the call or its validation fails after one retry.
 * @param {{id: string, data: Record<string, any>, body: string}} story @param {{text: string, lines: number[]}} ex
 * @param {import('./config.mjs').Config} cfg
 * @param {{key: string, llm?: Partial<import('./llm.mjs').CallOpts>, stats?: object}} ctx
 * @returns {Promise<AngleResult>}
 */
export async function angleOne(story, ex, cfg, ctx) {
  let r;
  try {
    r = await callJson({
      ...(ctx.llm || {}), key: ctx.key, model: cfg.angle.model, timeoutSec: cfg.harvest.timeoutSec,
      prompt: renderPrompt('angle', { story: storyText(story), excerpt: ex.text }),
      validate: (j) => validateAngle(j, { lines: ex.lines }),
    });
  } catch (e) { account(ctx, e); throw e; }
  account(ctx, r);
  const j = r.json;
  if (j.none === true) return { none: true, reason: oneLine(j.reason) };
  return { angle: oneLine(j.angle), audience: oneLine(j.audience), evidence: [...new Set(j.evidence.map(evidenceLine))].sort((a, b) => a - b) };
}

/**
 * Merge patch that writes a result into a story (lib/box.mjs mergeInto): `angle` + `audience` and the body line, or
 * `angle: none`. `replace` lets a forced redo overwrite an earlier angle; otherwise an existing one is kept.
 * @param {AngleResult} res @param {{replace?: boolean}} [o] @returns {import('./box.mjs').MergePatch}
 */
export function anglePatch(res, { replace = false } = {}) {
  const angle = res.none ? { angle: ANGLE_NONE } : { angle: res.angle, audience: res.audience };
  return { angle: replace ? { ...angle, replace: true } : angle };
}
