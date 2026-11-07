// Short story codes (`M-XXXX`) for CLI, web UI, chat and [[wiki links]]; the story id (file name) stays the key.
//
// Rule (docs/prd.md, "Mã chuyện"):
// - candidate k of a story id = the first 20 bits of sha256(id) for k = 0, of sha256(`${id}#${k}`) for k ≥ 1, as 4
//   Crockford base32 characters (0-9 A-Z without I L O U), prefixed `M-`;
// - a code written in the file (`code: M-XXXX`) is authoritative once written, even if it differs from candidate 0;
// - a story without a stored code takes, in id order (oldest first), its first candidate not already held by a stored
//   code, a former code (`old_codes`) or an earlier story of the same box.
// A new story gets its first candidate not held by any story already in the box, written at creation, so it never
// moves an older story's code.
// Two files storing the same code (two machines each gave it to a different story, met after a git pull): the
// story with the smaller id keeps it; each other one takes its first free candidate after the stories above, and
// `check` reports it until `check --fix` writes the move, keeping the code it lost in `old_codes` (not in `aliases`,
// where Obsidian would find two files). A lookup by a code another story stores or once stored is ambiguous.
import crypto from 'node:crypto';

export const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const CODE_PREFIX = 'M-';
export const CODE_RE = /^M-[0-9A-HJKMNP-TV-Z]{4}$/;
const LOOSE_RE = /^(?:M-)?([0-9A-Z]{4})$/;
/** Candidates tried before giving up; 2^20 codes per box, so this is never reached by a real box. */
const MAX_ATTEMPTS = 100000;

/** Candidate `attempt` (0, 1, 2...) of a story id. @param {string} id @param {number} [attempt] @returns {string} */
export function candidateCode(id, attempt = 0) {
  const h = crypto.createHash('sha256').update(attempt ? `${id}#${attempt}` : String(id)).digest();
  const bits = ((h[0] << 16) | (h[1] << 8) | h[2]) >>> 4; // first 20 bits
  let out = '';
  for (let shift = 15; shift >= 0; shift -= 5) out += CODE_ALPHABET[(bits >>> shift) & 31];
  return CODE_PREFIX + out;
}

/**
 * Canonical `M-XXXX` of user input: any case, with or without `M-`, spaces trimmed; Crockford look-alikes read as
 * digits (I, L → 1; O → 0). Null when it is not a code.
 * @param {unknown} input @returns {string|null}
 */
export function normalizeCode(input) {
  if (typeof input !== 'string') return null;
  const m = LOOSE_RE.exec(input.trim().toUpperCase());
  if (!m) return null;
  const code = CODE_PREFIX + m[1].replace(/[IL]/g, '1').replace(/O/g, '0');
  return CODE_RE.test(code) ? code : null;
}

/** Stored code of a story's frontmatter when it is well formed, else null. @param {Record<string, any>|undefined} data */
export const storedCode = (data) => (typeof data?.code === 'string' && CODE_RE.test(data.code) ? data.code : null);

/** First candidate of `id` not in `taken`. @param {string} id @param {Set<string>} taken @returns {string} */
export function freeCode(id, taken) {
  for (let k = 0; k < MAX_ATTEMPTS; k++) {
    const c = candidateCode(id, k);
    if (!taken.has(c)) return c;
  }
  throw new Error(`không tìm được mã chuyện trống cho ${id}`);
}

/** Well-formed former codes of a story (`old_codes`). @param {Record<string, any>|undefined} data @returns {string[]} */
export const oldCodes = (data) => (Array.isArray(data?.old_codes) ? data.old_codes.filter((c) => typeof c === 'string' && CODE_RE.test(c)) : []);

const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * Code of every story of one box, by the rule above. Input order does not matter.
 * @param {{id: string, data?: Record<string, any>}[]} stories @returns {Map<string, string>} id → code
 */
export function assignCodes(stories) {
  return resolveCodes(stories).codes;
}

/**
 * Codes of a box by the rule above, with the stories that lose a stored code to a story with a smaller id.
 * @param {{id: string, data?: Record<string, any>}[]} stories
 * @returns {{codes: Map<string, string>, moved: {id: string, from: string, to: string, keeper: string}[]}}
 */
export function resolveCodes(stories) {
  const sorted = [...stories].sort(byId);
  const codes = new Map();
  const holder = new Map();
  const losers = [];
  const lost = new Set();
  for (const s of sorted) {
    const c = storedCode(s.data);
    if (!c) continue;
    if (holder.has(c)) { losers.push(s); lost.add(s.id); continue; }
    holder.set(c, s.id);
    codes.set(s.id, c);
  }
  const taken = new Set(holder.keys());
  for (const s of sorted) for (const c of oldCodes(s.data)) taken.add(c);
  const give = (s) => { const c = freeCode(s.id, taken); codes.set(s.id, c); taken.add(c); return c; };
  // stories without a code first, so a move never shifts the code they already show
  for (const s of sorted) if (!codes.has(s.id) && !lost.has(s.id)) give(s);
  const moved = losers.map((s) => { const from = storedCode(s.data); return { id: s.id, from, to: give(s), keeper: holder.get(from) }; });
  return { codes, moved };
}

/** Every code new stories must not take: assigned, stored (also a duplicate) and former codes. @param {{id: string, data?: Record<string, any>}[]} stories */
export function takenCodes(stories) {
  const out = new Set(assignCodes(stories).values());
  for (const s of stories) {
    const c = storedCode(s.data);
    if (c) out.add(c);
    for (const o of oldCodes(s.data)) out.add(o);
  }
  return out;
}

/**
 * Frontmatter with `code` and `aliases` (the code added once, so Obsidian resolves [[M-XXXX]]) right after `id`
 * when present, else first. Other keys keep their order. @param {Record<string, any>} data @param {string} code
 */
export function withCode(data, code) {
  const { id, code: _c, aliases, ...rest } = data;
  const list = aliasList(aliases);
  return {
    ...(id !== undefined ? { id } : {}),
    code,
    aliases: list.includes(code) ? list : [...list, code],
    ...rest,
  };
}

const aliasList = (v) => (Array.isArray(v) ? v : v === undefined || v === null || v === '' ? [] : [v]);

/**
 * Frontmatter of a story moved off a code another story keeps: `code` set to the new one, the lost code taken out of
 * `aliases` and added to `old_codes` (right after `aliases`), so a lookup by it reports both stories instead of
 * opening one. @param {Record<string, any>} data @param {string} code
 */
export function withMovedCode(data, code) {
  const lost = storedCode(data);
  const { old_codes: _o, aliases, ...rest } = data;
  const moved = withCode({ ...rest, aliases: aliasList(aliases).filter((a) => a !== lost) }, code);
  const old = [...new Set([...oldCodes(data), ...(lost && lost !== code ? [lost] : [])])];
  const out = {};
  for (const [k, v] of Object.entries(moved)) {
    out[k] = v;
    if (k === 'aliases' && old.length) out.old_codes = old;
  }
  return out;
}
