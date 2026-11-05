// Transcript reduction and chunking (PRD 6.2). Render rules ported from harness/reduce.mjs.
import { blocked, nonzeroExit } from './hotspots.mjs';

/**
 * @typedef {object} Chunk
 * @property {number} k                 1-based chunk index (used in fake-llm keys `-c<k>`)
 * @property {import('./sources/claude.mjs').Entry[]} entries  includes the overlap with the previous chunk
 * @property {Set<number>} owns         entry L values this chunk owns (overlap belongs to the first chunk containing it)
 * @property {number} fromLine
 * @property {number} toLine
 */

const CHARS_PER_TOKEN = 3.2;
const cut = (s, n) => (s.length > n ? s.slice(0, n) + ` …[+${s.length - n}]` : s);
const oneLine = s => s.replace(/\s+/g, ' ').trim();

/** Chars/3.2. @param {string|number} textOrChars @returns {number} */
export function approxTokens(textOrChars) {
  const n = typeof textOrChars === 'number' ? textOrChars : String(textOrChars ?? '').length;
  return Math.round(n / CHARS_PER_TOKEN);
}

/**
 * One reduced line `[Lnnn] USER|AGENT|TOOL|RESULT: ...` (limits: USER 2500, AGENT 2000, TOOL 300 one line,
 * RESULT first 2 lines ≤250 or last 3 lines ≤500 on non-zero exit; cut marked `…[+n]`).
 * @param {import('./sources/claude.mjs').Entry} e @returns {string}
 */
export function renderEntry(e) {
  const text = String(e.text ?? '');
  switch (e.kind) {
    case 'user': return `[L${e.L}] USER: ${cut(text.trim(), 2500)}`;
    case 'assistant': return `[L${e.L}] AGENT: ${cut(text.trim(), 2000)}`;
    case 'tool': return `[L${e.L}] TOOL ${e.name || e.op || 'tool'}: ${cut(oneLine(text), 300)}`;
    case 'result': {
      const ls = text.split('\n').filter(s => s.trim());
      const err = nonzeroExit(e) ?? blocked(e);
      const keep = err ? ls.slice(-3) : ls.slice(0, 2);
      return `[L${e.L}] RESULT${err ? ' (' + err + ')' : ''}: ${cut(keep.map(oneLine).join(' | '), err ? 500 : 250)}`;
    }
    default: return '';
  }
}

/** @param {import('./sources/claude.mjs').Entry[]} entries @returns {{text: string, approxTokens: number}} */
export function render(entries) {
  const text = entries.map(renderEntry).filter(Boolean).join('\n');
  return { text, approxTokens: approxTokens(text) };
}

/**
 * Splits on Entry boundaries so each chunk's rendered text ≤ maxTokens; consecutive chunks overlap by `overlap` entries.
 * The overlap shrinks when it alone would not leave room for a new entry; every chunk adds at least one new entry.
 * @param {import('./sources/claude.mjs').Entry[]} entries @param {number} maxTokens @param {number} [overlap=20]
 * @returns {Chunk[]}
 */
export function chunk(entries, maxTokens, overlap = 20) {
  const n = entries.length;
  const pre = [0];
  for (let i = 0; i < n; i++) {
    const r = renderEntry(entries[i]);
    pre.push(pre[i] + (r ? r.length + 1 : 0));
  }
  const fits = (s, e) => (pre[e] - pre[s] - 1) / CHARS_PER_TOKEN <= maxTokens;
  const chunks = [];
  const owned = new Set();
  let i = 0;
  while (i < n) {
    let s = chunks.length ? Math.max(0, i - Math.max(0, overlap)) : i;
    while (s < i && !fits(s, i + 1)) s++;
    let e = i + 1;
    while (e < n && fits(s, e + 1)) e++;
    const part = entries.slice(s, e);
    const owns = new Set();
    for (const x of part) if (!owned.has(x.L)) { owns.add(x.L); owned.add(x.L); }
    chunks.push({ k: chunks.length + 1, entries: part, owns, fromLine: part[0].L, toLine: part[part.length - 1].L });
    i = e;
  }
  return chunks;
}
