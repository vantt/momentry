// Clustering (PRD 5.7 step 6).
import { render as renderPrompt } from './prompts.mjs';
import { callJson } from './llm.mjs';
import { validateCluster } from './validate.mjs';
import { whatHappened, titleOf } from './box.mjs';
import { logEvent } from './log.mjs';
import { account } from './harvest.mjs';

/**
 * @typedef {object} Cluster
 * @property {string} id         `C<k>` (or `O<k>` for outsider-born clusters)
 * @property {string} title
 * @property {string} summary
 * @property {string[]} signals
 * @property {string[]} members  RawStory ids and/or `box:<storyId>`
 * @property {number} hits       distinct runs among members
 * @property {string[]} [hitBy]  extra hit_by marks (e.g. 'outsider')
 * @property {object} [outsider] attached OutsiderItem
 */

const BOX = 'box:';
const cut = (s, n) => (s.length > n ? s.slice(0, n) + '…' : s);
const oneLine = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const lineNo = (ref) => String(ref).match(/#?L(\d+)$/)?.[1];

/** Cluster built from an existing box story (summary = "Chuyện gì xảy ra"). @param {import('./box.mjs').BoxStory} s @returns {Cluster} */
export function boxCluster(s) {
  return {
    id: `${BOX}${s.id}`, title: titleOf(s.body) || s.id, summary: whatHappened(s.body),
    signals: Array.isArray(s.data.signals) ? s.data.signals.map(String) : [], members: [`${BOX}${s.id}`], hits: 0,
  };
}

/** @param {import('./harvest.mjs').RawStory} s @returns {Cluster} */
function single(s) {
  return { id: `C:${s.id}`, title: s.title, summary: s.what_happened, signals: [...s.signals], members: [s.id], hits: 1 };
}

/**
 * Calls `cluster-<a>` unless there is at most one run, one chunk and no existing story (then one cluster per story).
 * Model failure or a wrong partition twice -> `fallback` (line overlap with old stories, else one cluster per story),
 * logged; `ctx.stats.failed` gets 'cluster'.
 * @param {import('./harvest.mjs').RawStory[]} stories
 * @param {import('./box.mjs').BoxStory[]} existing  stories of the same session already in the box
 * @param {import('./config.mjs').Config} cfg
 * @param {{chunks: number, runs?: number, llm?: Partial<import('./llm.mjs').CallOpts>, stats?: object, cacheDir?: string}} ctx  cacheDir: where to log (none = no log)
 * @returns {Promise<Cluster[]>}
 */
export async function cluster(stories, existing, cfg, ctx) {
  const byId = new Map(stories.map((s) => [s.id, s]));
  const runs = ctx.runs ?? cfg.harvest.runs;
  const singles = () => fallback(stories, existing);
  if (!stories.length) return existing.map(boxCluster);
  if (runs <= 1 && (ctx.chunks ?? 1) <= 1 && !existing.length) return singles();

  const ids = [...stories.map((s) => s.id), ...existing.map((s) => `${BOX}${s.id}`)];
  const rows = [
    ...stories.map((s) => `${s.id} | ${oneLine(s.title)} | ${cut(oneLine(s.what_happened), 350)} | lines ${s.lines.map((n) => `L${n}`).join(', ')}`),
    ...existing.map((s) => {
      const c = boxCluster(s);
      const ls = (Array.isArray(s.data.lines) ? s.data.lines : []).map(lineNo).filter(Boolean).map((n) => `L${n}`);
      return `${c.id} | ${oneLine(c.title)} | ${cut(oneLine(c.summary), 350)} | lines ${ls.join(', ')}`;
    }),
  ];
  const prompt = renderPrompt('cluster', { n: ids.length, r: Math.max(1, runs), stories: rows.join('\n') });
  const base = { ...(ctx.llm || {}), model: cfg.rank.model, timeoutSec: cfg.harvest.timeoutSec, prompt, validate: (j) => validateCluster(j, { ids }) };

  const log = (ev, f) => ctx.cacheDir && logEvent(ev, f, { cacheDir: ctx.cacheDir });
  for (const a of [1, 2]) {
    let r;
    try { r = await callJson({ ...base, key: `cluster-${a}` }); } catch (e) {
      account(ctx, e);
      ctx.stats?.failed.push('cluster');
      log('cluster.failed', { attempt: a, error: e });
      return singles();
    }
    account(ctx, r);
    const errs = checkPartition(ids, r.json.clusters);
    if (!errs.length) {
      return r.json.clusters.map((c, i) => ({
        id: `C${i + 1}`, title: oneLine(c.title), summary: String(c.summary ?? '').trim(),
        signals: (c.signals || []).filter((x) => typeof x === 'string').map((x) => x.trim()).filter(Boolean),
        members: [...c.members], hits: countHits(c.members, byId),
      }));
    }
    log('cluster.partition', { attempt: a, errors: errs.length });
  }
  ctx.stats?.failed.push('cluster');
  return singles();
}

/**
 * Partition without the model. A raw story whose lines intersect the lines of an existing box story joins that
 * story's cluster (largest overlap, then smallest id), so re-harvested lines merge instead of making `-2` files.
 * Other raw stories stay single.
 * @param {import('./harvest.mjs').RawStory[]} stories @param {import('./box.mjs').BoxStory[]} existing
 * @returns {Cluster[]}
 */
export function fallback(stories, existing) {
  const byId = new Map(stories.map((s) => [s.id, s]));
  const boxes = existing.map((s) => ({
    c: boxCluster(s),
    lines: new Set((Array.isArray(s.data.lines) ? s.data.lines : []).map(lineNo).filter(Boolean).map(Number)),
  }));
  const out = [];
  for (const s of stories) {
    let best = null, bestN = 0;
    for (const b of boxes) {
      const n = (s.lines || []).filter((l) => b.lines.has(Number(l))).length;
      if (n > bestN || (n > 0 && n === bestN && b.c.id < best.c.id)) { best = b; bestN = n; }
    }
    if (best) best.c.members.push(s.id); else out.push(single(s));
  }
  for (const b of boxes) b.c.hits = countHits(b.c.members, byId);
  return [...out, ...boxes.map((b) => b.c)];
}

/** Every id in exactly one cluster; returns error messages. @param {string[]} ids @param {{members: string[]}[]} clusters @returns {string[]} */
export function checkPartition(ids, clusters) {
  const want = new Set(ids);
  const seen = new Map();
  const errs = [];
  for (const [i, c] of (clusters || []).entries()) {
    for (const m of c?.members || []) {
      if (!want.has(m)) errs.push(`cụm ${i + 1}: id lạ ${m}`);
      else if (seen.has(m)) errs.push(`${m} nằm trong cụm ${seen.get(m) + 1} và ${i + 1}`);
      else seen.set(m, i);
    }
  }
  for (const id of want) if (!seen.has(id)) errs.push(`thiếu ${id}`);
  return errs;
}

/** Smallest `box:` id (lexicographic) among members, without prefix; null if none. @param {Cluster} cluster @returns {string|null} */
export function resolveBoxTarget(cluster) {
  const ids = (cluster?.members || []).filter((m) => m.startsWith(BOX)).map((m) => m.slice(BOX.length)).sort();
  return ids[0] ?? null;
}

/** Distinct runs among members (box: ids ignored). @param {string[]} members @param {Map<string, import('./harvest.mjs').RawStory>} byId @returns {number} */
export function countHits(members, byId) {
  const runs = new Set();
  for (const m of members || []) { const s = byId.get(m); if (s) runs.add(s.run); }
  return runs.size;
}
