// Scoring (PRD 5.7 steps 7-8). Shuffled order, hits hidden, ids remapped to M<k>.
import { render as renderPrompt } from './prompts.mjs';
import { callJson } from './llm.mjs';
import { validateHookTension, validateStakes } from './validate.mjs';
import { account } from './harvest.mjs';

/** @typedef {{hook: string, tension: string, sides: string[], strength: number}} HookScore */
/** @typedef {{stakes: number, reason: string}} StakesScore */

const oneLine = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

function prepare(clusters, seed) {
  const order = shuffle(clusters, seed);
  const back = new Map(order.map((c, i) => [`M${i + 1}`, c.id]));
  const text = order.map((c, i) => `M${i + 1}. ${oneLine(c.title)}\n   ${oneLine(c.summary)}`).join('\n');
  return { ids: [...back.keys()], back, text };
}

async function step(ctx, opts) {
  try {
    const r = await callJson({ ...(ctx?.llm || {}), ...opts });
    account(ctx, r);
    return r.json;
  } catch (e) { account(ctx, e); throw e; }
}

/**
 * `hook-tension-<a>` over the clusters. Throws (exitCode 4) when the step fails after one retry.
 * @param {import('./cluster.mjs').Cluster[]} clusters @param {import('./config.mjs').Config} cfg
 * @param {{llm?: Partial<import('./llm.mjs').CallOpts>, seed?: number, stats?: object}} [ctx]
 * @returns {Promise<Map<string, HookScore>>} keyed by cluster id
 */
export async function hookTension(clusters, cfg, ctx) {
  ctx ??= {};
  const out = new Map();
  if (!clusters.length) return out;
  const { ids, back, text } = prepare(clusters, ctx.seed);
  const json = await step(ctx, {
    key: 'hook-tension-1', model: cfg.rank.model, timeoutSec: cfg.harvest.timeoutSec,
    prompt: renderPrompt('hook-tension', { stories: text }), validate: (j) => validateHookTension(j, { ids }),
  });
  for (const h of json.hooks) {
    const sides = h.tension === 'none' ? [] : [h.side_a, h.side_b].map(oneLine).filter(Boolean);
    out.set(back.get(h.id), { hook: oneLine(h.hook), tension: h.tension, sides, strength: h.strength });
  }
  return out;
}

/**
 * `stakes-<a>`, variant si (self-inferred main goal), over every cluster of the session (old and new).
 * @param {import('./cluster.mjs').Cluster[]} clusters @param {import('./config.mjs').Config} cfg
 * @param {{llm?: Partial<import('./llm.mjs').CallOpts>, seed?: number, stats?: object}} [ctx]
 * @returns {Promise<{mainGoal: string, map: Map<string, StakesScore>}>}
 */
export async function stakes(clusters, cfg, ctx) {
  ctx ??= {};
  const map = new Map();
  if (!clusters.length) return { mainGoal: '', map };
  const { ids, back, text } = prepare(clusters, ctx.seed);
  const json = await step(ctx, {
    key: 'stakes-1', model: cfg.rank.model, timeoutSec: cfg.harvest.timeoutSec,
    prompt: renderPrompt('stakes', { n: ids.length, stories: text }), validate: (j) => validateStakes(j, { ids }),
  });
  for (const s of json.stakes) map.set(back.get(s.id), { stakes: s.stakes, reason: oneLine(s.reason) });
  return { mainGoal: oneLine(json.main_goal), map };
}

/** Deterministic Fisher-Yates (mulberry32). @template T @param {T[]} arr @param {number} [seed=1] @returns {T[]} */
export function shuffle(arr, seed) {
  const a = [...arr];
  let t = ((seed ?? 1) >>> 0) || 1;
  const rnd = () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
