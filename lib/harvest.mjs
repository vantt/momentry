// Harvest + coverage + fill loop (PRD 5.4, 5.5).
import { render as renderPrompt } from './prompts.mjs';
import { render as renderText } from './reduce.mjs';
import { format as formatHotspots } from './hotspots.mjs';
import { callJson } from './llm.mjs';
import { validateHarvest } from './validate.mjs';

/**
 * @typedef {object} RawStory
 * @property {string} id        `r<n>-c<k>-S<i>` (run, chunk, index)
 * @property {number} run
 * @property {number} chunk
 * @property {string} title
 * @property {string[]} signals
 * @property {number[]} lines   source line numbers
 * @property {string} context
 * @property {string} what_happened
 * @property {string} lesson
 * @property {string} artefact
 */

/** @typedef {{id: string, verdict: 'story'|'skip', story_title?: string, reason?: string}} HotspotAnswer */

/**
 * Shared per-call accounting for pipeline steps: `ctx.stats = {usd, secs, failed: string[], calls}`.
 * @param {any} ctx @param {{usd?: number|null, secs?: number}} r
 */
export function account(ctx, r) {
  const st = ctx?.stats;
  if (!st) return;
  if (r?.usd != null) st.usd = (st.usd ?? 0) + r.usd;
  st.secs = (st.secs ?? 0) + (r?.secs ?? 0);
  st.calls = (st.calls ?? 0) + 1;
}

/** Line refs from the model (812, "L812", "[L812-L820]") -> sorted unique positive ints. @param {any[]} refs @returns {number[]} */
export function toLineNumbers(refs) {
  const out = new Set();
  for (const r of Array.isArray(refs) ? refs : []) {
    if (Number.isInteger(r) && r > 0) out.add(r);
    else if (typeof r === 'string') for (const m of r.matchAll(/\d+/g)) { const n = Number(m[0]); if (n > 0) out.add(n); }
  }
  return [...out].sort((a, b) => a - b);
}

const str = (v) => (typeof v === 'string' ? v.trim() : '');

function toStories(json, run, k, start) {
  return (json.stories || []).map((s, i) => ({
    id: `r${run}-c${k}-S${start + i + 1}`, run, chunk: k,
    title: str(s.title), signals: Array.isArray(s.signals) ? s.signals.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim()) : [],
    lines: toLineNumbers(s.lines), context: str(s.context), what_happened: str(s.what_happened),
    lesson: str(s.lesson), artefact: str(s.artefact),
  }));
}

function toAnswers(json, known) {
  const out = [];
  for (const h of Array.isArray(json.hotspots) ? json.hotspots : []) {
    if (!h || !known.has(h.id) || (h.verdict !== 'story' && h.verdict !== 'skip')) continue;
    out.push({ id: h.id, verdict: h.verdict, ...(h.story_title ? { story_title: String(h.story_title) } : {}), ...(h.reason ? { reason: String(h.reason) } : {}) });
  }
  return out;
}

/**
 * One harvest run on one chunk: call `harvest-c<k>-r<n>`, then fill loop `harvest-fill-c<k>-r<n>-f<m>` up to
 * cfg.harvest.fillRetries for hotspots without a valid verdict. The main call failing throws (exitCode 4);
 * a failing fill call ends the loop and is reported in `fillFailed`.
 * @param {import('./reduce.mjs').Chunk} chunk
 * @param {import('./hotspots.mjs').Hotspot[]} hotspots  only those owned by this chunk
 * @param {import('./config.mjs').Config} cfg
 * @param {{run: number, llm?: Partial<import('./llm.mjs').CallOpts>, stats?: object}} ctx
 * @returns {Promise<{stories: RawStory[], answers: HotspotAnswer[], missing: string[], usd: number|null, secs: number, fillCalls: number, fillFailed: boolean}>}
 */
export async function harvest(chunk, hotspots, cfg, ctx) {
  const run = ctx.run, k = chunk.k;
  const transcript = renderText(chunk.entries).text;
  const known = new Set(hotspots.map((h) => h.id));
  const hotspotIds = [...known];
  const base = { ...(ctx.llm || {}), model: cfg.harvest.model, timeoutSec: cfg.harvest.timeoutSec };
  let usd = null, secs = 0;
  const add = (r) => { if (r.usd != null) usd = (usd ?? 0) + r.usd; secs += r.secs ?? 0; account(ctx, r); };

  const prompt = renderPrompt('harvest', { transcript, hotspots: formatHotspots(hotspots) || '(không có)' });
  let r;
  try {
    r = await callJson({ ...base, key: `harvest-c${k}-r${run}`, prompt, validate: (j) => validateHarvest(j, { hotspotIds }) });
  } catch (e) { add(e); throw e; }
  add(r);
  const stories = toStories(r.json, run, k, 0);
  const answers = toAnswers(r.json, known);

  let missing = coverage(hotspots, answers);
  let fillCalls = 0, fillFailed = false;
  for (let m = 1; missing.length && m <= cfg.harvest.fillRetries; m++) {
    const want = hotspots.filter((h) => missing.includes(h.id));
    const fillPrompt = renderPrompt('harvest-fill', { transcript, hotspots: formatHotspots(want) });
    fillCalls++;
    let f;
    try {
      f = await callJson({ ...base, key: `harvest-fill-c${k}-r${run}-f${m}`, prompt: fillPrompt, validate: (j) => validateHarvest(j, { hotspotIds }) });
    } catch (e) { add(e); fillFailed = true; break; }
    add(f);
    stories.push(...toStories(f.json, run, k, stories.length));
    const got = new Set(answers.map((a) => a.id));
    for (const a of toAnswers(f.json, known)) if (!got.has(a.id)) { answers.push(a); got.add(a.id); }
    missing = coverage(hotspots, answers);
  }
  return { stories, answers, missing, usd, secs, fillCalls, fillFailed };
}

/** Hotspot ids without a valid verdict. @param {import('./hotspots.mjs').Hotspot[]} hotspots @param {HotspotAnswer[]} answers @returns {string[]} */
export function coverage(hotspots, answers) {
  const ok = new Set((answers || []).filter((a) => a && (a.verdict === 'story' || a.verdict === 'skip')).map((a) => a.id));
  return hotspots.map((h) => h.id).filter((id) => !ok.has(id));
}
