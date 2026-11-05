// Outsider step (PRD 5.8 step 9). Separate call (outsider.model, haiku by default), runs right after clustering.
import { render as renderPrompt } from './prompts.mjs';
import { callJson } from './llm.mjs';
import { validateOutsider } from './validate.mjs';
import { account, toLineNumbers } from './harvest.mjs';

/**
 * @typedef {object} OutsiderItem
 * @property {string} what
 * @property {string} common_practice
 * @property {string} gap
 * @property {number[]} lines
 * @property {string|null} already_picked  cluster id, or null for a new cluster
 */

const oneLine = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

/**
 * `outsider-<a>` with the reduced window text and cluster titles (ids shown as K<k>, mapped back).
 * Returns [] when outsider.enabled is false. Throws (exitCode 4) when the step fails after one retry.
 * @param {string} reducedText @param {import('./cluster.mjs').Cluster[]} clusters @param {import('./config.mjs').Config} cfg
 * @param {{llm?: Partial<import('./llm.mjs').CallOpts>, stats?: object, key?: string}} [ctx]
 * @returns {Promise<OutsiderItem[]>}
 */
export async function outsider(reducedText, clusters, cfg, ctx) {
  ctx ??= {};
  if (!cfg.outsider.enabled) return [];
  const back = new Map(clusters.map((c, i) => [`K${i + 1}`, c.id]));
  const list = clusters.map((c, i) => `K${i + 1}. ${oneLine(c.title)}`).join('\n') || '(chưa có)';
  const ids = [...back.keys()];
  let r;
  try {
    r = await callJson({
      ...(ctx.llm || {}), key: ctx.key || 'outsider-1', model: cfg.outsider.model, timeoutSec: cfg.harvest.timeoutSec,
      prompt: renderPrompt('outsider', { transcript: reducedText, clusters: list }), validate: (j) => validateOutsider(j, { ids }),
    });
  } catch (e) { account(ctx, e); throw e; }
  account(ctx, r);
  return r.json.outsider.map((o) => ({
    what: oneLine(o.what), common_practice: oneLine(o.common_practice), gap: oneLine(o.gap),
    lines: toLineNumbers(o.lines), already_picked: o.already_picked ? back.get(o.already_picked) ?? null : null,
  }));
}

/**
 * Attaches items to their cluster (hitBy += outsider; several items on one cluster are joined) and turns
 * `already_picked: null` items into new clusters `O<k>` (title = what, summary = what + common_practice,
 * hitBy = [outsider], members = [], lines = item lines).
 * @param {import('./cluster.mjs').Cluster[]} clusters @param {OutsiderItem[]} items @returns {import('./cluster.mjs').Cluster[]}
 */
export function applyOutsider(clusters, items) {
  const out = clusters.map((c) => ({ ...c }));
  const byId = new Map(out.map((c) => [c.id, c]));
  let k = 0;
  for (const it of items || []) {
    const c = it.already_picked ? byId.get(it.already_picked) : null;
    if (c) {
      c.hitBy = [...new Set([...(c.hitBy || []), 'outsider'])];
      c.outsider = c.outsider ? [].concat(c.outsider, it) : it;
      continue;
    }
    k++;
    out.push({
      id: `O${k}`, title: it.what, summary: `${it.what} ${it.common_practice}`.trim(), signals: [], members: [],
      hits: 0, hitBy: ['outsider'], outsider: it, lines: [...(it.lines || [])],
    });
  }
  return out;
}

/** Text after "**Góc người ngoài:**" for one or several items. @param {OutsiderItem|OutsiderItem[]|undefined} o @returns {string} */
export function outsiderText(o) {
  const items = [].concat(o || []);
  return items.map((it) => {
    const parts = [];
    if (it.common_practice) parts.push(`cách làm phổ biến là ${it.common_practice.replace(/[.\s]+$/, '')}`);
    if (it.gap) parts.push(`ở đây khác ở ${it.gap.replace(/[.\s]+$/, '')}`);
    else if (it.what) parts.push(`ở đây: ${it.what.replace(/[.\s]+$/, '')}`);
    return parts.join('; ') + '.';
  }).filter((s) => s !== '.').join(' ');
}
