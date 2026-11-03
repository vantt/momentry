// Hotspots (PRD 5.3). Pure per-Entry detectors ported from harness/reduce.mjs; they look at op/paths, not tool names.
import path from 'node:path';

/**
 * @typedef {'nonzeroExit'|'metricPair'|'gitReversal'|'metaWrite'|'bip'} HotspotKind
 * @typedef {object} Hotspot
 * @property {string} id        `H<L>` of the first line, global across chunks
 * @property {HotspotKind} kind
 * @property {number} L
 * @property {number} Lend      last line after merging same-kind hits ≤ window lines apart
 * @property {string[]} signals short labels, no transcript text
 */

/** result with exitCode ≠ 0 (not null) or isError. @param {import('./sources/claude.mjs').Entry} e @returns {string|null} label */
export function nonzeroExit(e) {
  if (e?.kind !== 'result') return null;
  const bad = Number.isInteger(e.exitCode) && e.exitCode !== 0;
  if (!bad && !e.isError) return null;
  return `exit ${bad ? e.exitCode : 'error'}`;
}

const NUM = String.raw`\d+(?:[.,]\d+)?`;
const PAIR_RE = new RegExp(String.raw`(${NUM})\s*(?:→|->|=>|lên|xuống|thành|tới|to)\s*(${NUM})`, 'i');

/** user/assistant text with a number pair joined by → -> => lên xuống thành tới to; equal pair ignored. @param {import('./sources/claude.mjs').Entry} e @returns {string|null} */
export function metricPair(e) {
  if (e?.kind !== 'assistant' && e?.kind !== 'user') return null;
  const m = String(e.text ?? '').match(PAIR_RE);
  if (!m || m[1] === m[2]) return null;
  return `số ${m[1]}→${m[2]}`;
}

const GIT_RE = /\bgit\s+(reset|revert|rebase|restore|checkout\s+--|commit\s+--amend|push\s+(?:-f|--force))|\bsquash\b/;

/** op shell: git reset/revert/rebase/restore/checkout --/commit --amend/push -f, squash. @param {import('./sources/claude.mjs').Entry} e @returns {string|null} */
export function gitReversal(e) {
  if (e?.kind !== 'tool' || e.op !== 'shell') return null;
  const m = String(e.text ?? '').match(GIT_RE);
  return m ? `git ${m[1] ? m[1].replace(/\s+/g, ' ') : 'squash'}` : null;
}

const META_RE = /(^|\/)(\.claude\/|\.codex\/|\.agents\/|AGENTS\.md|CLAUDE\.md|skills\/|hooks?\/|settings(\.local)?\.json)/;

/** op write to .claude/ .codex/ .agents/ AGENTS.md CLAUDE.md skills/ hooks/ settings*.json. @param {import('./sources/claude.mjs').Entry} e @returns {string|null} */
export function metaWrite(e) {
  if (e?.kind !== 'tool' || e.op !== 'write') return null;
  const hit = (e.paths ?? []).find(p => META_RE.test(String(p).replace(/\\/g, '/')));
  return hit ? `ghi meta ${path.basename(hit)}` : null;
}

/** user entry with bip: true. @param {import('./sources/claude.mjs').Entry} e @returns {string|null} */
export function bipMark(e) {
  return e?.kind === 'user' && e.bip === true ? 'bip' : null;
}

const DETECTORS = [['nonzeroExit', nonzeroExit], ['metricPair', metricPair], ['gitReversal', gitReversal], ['metaWrite', metaWrite], ['bip', bipMark]];

/** All detectors, merged per kind within `window` lines, sorted by L. @param {import('./sources/claude.mjs').Entry[]} entries @param {{window?: number}} [opts] @returns {Hotspot[]} */
export function detect(entries, opts = {}) {
  const window = opts.window ?? 5;
  const hits = [];
  for (const e of entries) for (const [kind, fn] of DETECTORS) {
    const s = fn(e);
    if (s) hits.push({ kind, L: e.L, signal: s });
  }
  hits.sort((a, b) => a.L - b.L);
  const merged = [];
  const last = {};
  for (const h of hits) {
    const prev = last[h.kind];
    if (prev && h.L - prev.Lend <= window) {
      prev.Lend = h.L;
      if (!prev.signals.includes(h.signal)) prev.signals.push(h.signal);
      continue;
    }
    const hs = { id: `H${h.L}`, kind: h.kind, L: h.L, Lend: h.L, signals: [h.signal] };
    merged.push(hs);
    last[h.kind] = hs;
  }
  // two kinds can start on the same line; keep ids unique
  const seen = new Map();
  for (const h of merged) {
    const n = seen.get(h.id) ?? 0;
    seen.set(h.id, n + 1);
    if (n) h.id = `${h.id}${String.fromCharCode(97 + n - 1)}`;
  }
  return merged;
}

/** Prompt text for `{hotspots}`: one line per hotspot `H<L> [L<L>-L<Lend>] signals`. @param {Hotspot[]} hotspots @returns {string} */
export function format(hotspots) {
  return hotspots.map(h => `${h.id} [L${h.L}${h.Lend !== h.L ? '-L' + h.Lend : ''}] ${h.signals.slice(0, 4).join('; ')}`).join('\n');
}
