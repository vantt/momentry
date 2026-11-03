// Build story files from scored clusters (PRD 6.6). Script only, no model.
import { OUTSIDER_LABEL } from './box.mjs';
import { outsiderText } from './outsider.mjs';

/**
 * @typedef {object} StoryCtx
 * @property {string} sid                 e.g. claude:0a1b2c3d
 * @property {'claude'|'codex'} source
 * @property {string} repo
 * @property {number} runs                successful harvest runs of this window
 * @property {import('./hotspots.mjs').Hotspot[]} hotspots
 * @property {import('./harvest.mjs').HotspotAnswer[]} answers
 * @property {string} harvestDate         YYYY-MM-DD fallback when no ts
 */

/** @typedef {{hook?: import('./score.mjs').HookScore, stakes?: import('./score.mjs').StakesScore}} ClusterScores */

const pad = (n) => String(n).padStart(2, '0');
/** Local YYYY-MM-DD of a Date or ISO string. */
export function localDate(d) {
  const t = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(t.getTime())) return null;
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
}

const uniq = (xs) => [...new Set(xs)];
const SOURCE_LABEL = { claude: 'chat Claude', codex: 'chat Codex' };

function lineNumbers(cluster, members) {
  return uniq([...members.flatMap((m) => m.lines || []), ...(cluster.lines || [])]).filter((n) => Number.isInteger(n) && n > 0).sort((a, b) => a - b);
}

function hitBy(cluster, members, lines, ctx) {
  const out = [];
  const storyHs = new Set((ctx.answers || []).filter((a) => a.verdict === 'story').map((a) => a.id));
  const inside = (h) => lines.some((n) => n >= h.L && n <= h.Lend);
  if ((ctx.hotspots || []).some((h) => h.kind !== 'bip' && storyHs.has(h.id) && inside(h))) out.push('hotspot');
  if (members.length) out.push('harvest');
  if ((cluster.hitBy || []).includes('outsider') || cluster.outsider) out.push('outsider');
  if ((ctx.hotspots || []).some((h) => h.kind === 'bip' && inside(h))) out.push('bip');
  return out;
}

function scoreFields(scores) {
  const out = {};
  if (scores?.hook) Object.assign(out, { hook: scores.hook.hook, tension: scores.hook.tension, sides: [...scores.hook.sides], strength: scores.hook.strength });
  if (scores?.stakes) out.stakes = scores.stakes.stakes;
  return out;
}

/**
 * New story: body from the member with the longest what_happened; date from ts of the smallest line (local date);
 * lines = union, deduped, sorted, as `<sid>#L<n>`; hit_by/hits/runs per PRD 6.6 table. `captured_by: harvest`.
 * `privacy` is left for the caller.
 * @param {import('./cluster.mjs').Cluster} cluster @param {import('./harvest.mjs').RawStory[]} members
 * @param {ClusterScores} scores @param {Map<number, import('./sources/claude.mjs').Entry>} entriesByL @param {StoryCtx} ctx
 * @returns {{title: string, data: Record<string, any>, body: string}}  (id is assigned by the caller)
 */
export function buildStory(cluster, members, scores, entriesByL, ctx) {
  const rep = members.reduce((a, b) => ((b.what_happened || '').length > (a?.what_happened || '').length ? b : a), null);
  const title = (cluster.title || rep?.title || '').trim() || 'Chuyện chưa đặt tên';
  const lines = lineNumbers(cluster, members);
  const firstTs = lines.map((n) => entriesByL?.get(n)?.ts).find(Boolean);
  const date = (firstTs && localDate(firstTs)) || ctx.harvestDate;
  const sc = scoreFields(scores);
  const data = {
    date, repo: ctx.repo, status: 'raw',
    signals: uniq([...members.flatMap((m) => m.signals || []), ...(cluster.signals || [])]),
    source: `${SOURCE_LABEL[ctx.source] || 'chat'}, ${ctx.sid}`,
    sessions: [ctx.sid], captured_by: 'harvest', hit_by: hitBy(cluster, members, lines, ctx),
    lines: lines.map((n) => `${ctx.sid}#L${n}`),
    hook: sc.hook, tension: sc.tension, sides: sc.sides, strength: sc.strength, stakes: sc.stakes,
    hits: Math.min(cluster.hits ?? 0, ctx.runs), runs: ctx.runs,
    privacy: undefined, links: [], threads: [],
  };
  const body = rep
    ? renderBody({ title, context: rep.context, what_happened: rep.what_happened, lesson: rep.lesson, artefact: rep.artefact, outsider: outsiderText(cluster.outsider) })
    : renderBody({ title, what_happened: cluster.outsider ? [].concat(cluster.outsider)[0].what : cluster.summary, outsider: outsiderText(cluster.outsider) });
  return { title, data, body };
}

/**
 * Patch for merging a cluster into an existing story: append sessions/signals/hit_by/lines; add.runs = ctx.runs and
 * add.hits = runs of this window that caught it (only when the cluster has new harvest members); set = machine scores;
 * outsider section text if any.
 * @param {import('./box.mjs').BoxStory} old @param {import('./cluster.mjs').Cluster} cluster
 * @param {import('./harvest.mjs').RawStory[]} members @param {ClusterScores} scores @param {StoryCtx} ctx
 * @returns {import('./box.mjs').MergePatch}
 */
export function mergePatch(old, cluster, members, scores, ctx) {
  const patch = {};
  if (members.length || cluster.outsider) {
    const lines = lineNumbers(cluster, members);
    patch.append = {
      sessions: [ctx.sid],
      signals: uniq([...members.flatMap((m) => m.signals || [])]),
      hit_by: hitBy(cluster, members, lines, ctx),
      lines: lines.map((n) => `${ctx.sid}#L${n}`),
    };
  }
  if (members.length) patch.add = { runs: ctx.runs, hits: Math.min(cluster.hits ?? 0, ctx.runs) };
  const set = scoreFields(scores);
  if (Object.keys(set).length) patch.set = set;
  const text = outsiderText(cluster.outsider);
  if (text && !String(old?.body || '').includes(OUTSIDER_LABEL)) patch.outsider = text;
  return patch;
}

const oneLine = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

/**
 * Body text: `\n# title\n\n**Bối cảnh:** ...\n**Chuyện gì xảy ra:** ...\n**Bài học:** ...\n**Artefact:** ...` (+ outsider).
 * Empty sections omitted.
 * @param {{title: string, context?: string, what_happened?: string, lesson?: string, artefact?: string, outsider?: string}} parts
 * @returns {string}
 */
export function renderBody(parts) {
  const rows = [
    ['**Bối cảnh:**', parts.context], ['**Chuyện gì xảy ra:**', parts.what_happened], ['**Bài học:**', parts.lesson],
    ['**Artefact:**', parts.artefact], [OUTSIDER_LABEL, parts.outsider],
  ].filter(([, v]) => oneLine(v)).map(([k, v]) => `${k} ${oneLine(v)}\n`);
  return `\n# ${oneLine(parts.title)}\n\n${rows.join('')}`;
}
