// Privacy gate (PRD 6.7, DM.2). The blocklist lives in memory only, never written to disk.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { nfc, stripDiacritics, toTelex } from './viet.mjs';

/**
 * @typedef {{type: 'vault-titles', path: string}
 *   | {type: 'json-fields', path: string, fields: string[]}
 *   | {type: 'lines', path: string, proper?: boolean}} PrivacySource
 */

/**
 * @typedef {object} Blocklist
 * @property {{term: string, forms: string[], proper: boolean, source: string}[]} terms
 *   forms = variants(term) after normalisation; `proper` allows single-word matches
 */

/**
 * @typedef {object} Violation
 * @property {string} field   frontmatter key, 'body', 'slug', 'note', 'title', 'append.lines', 'append.outsider'...
 * @property {string} term    matched blocked term (in memory only; print with mask(), never log)
 * @property {'exact'|'plain'|'telex'} kind  which variant matched
 */

const WORD_RE = /[\p{L}\p{M}\p{N}]+/gu;
const RANK = { exact: 0, plain: 1, telex: 2 };
const MIN_SINGLE = 3; // a single proper word shorter than this is ignored (would match everywhere)

const tokens = (s) => nfc(s).toLowerCase().match(WORD_RE) || [];
const norm = (s) => tokens(s).join(' ');

/** The 3 normalised forms of a term: with diacritics, without, Telex (duplicates dropped). @param {string} term @returns {string[]} */
export function variants(term) {
  const exact = norm(term);
  if (!exact) return [];
  return [...new Set([exact, norm(stripDiacritics(exact)), norm(toTelex(exact))])];
}

function expandHome(p, env) {
  const home = env.HOME || os.homedir();
  return p === '~' ? home : p.startsWith('~/') ? path.join(home, p.slice(2)) : p;
}

function vaultTitles(dir) {
  if (!fs.statSync(dir).isDirectory()) throw new Error('not a directory');
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) { if (!/^[_.]/.test(e.name)) walk(path.join(d, e.name)); }
      else if (e.name.toLowerCase().endsWith('.md')) out.push(e.name.slice(0, -3));
    }
  };
  walk(dir);
  return out;
}

function jsonFields(file, fields) {
  const want = new Set(fields || []);
  const out = [];
  const strings = (v) => {
    if (typeof v === 'string') {
      out.push(v);
      if (/[\\/]/.test(v) || /\.\w{1,5}$/.test(v)) out.push(path.basename(v.replace(/\\/g, '/')).replace(/\.\w{1,5}$/, ''));
    } else if (Array.isArray(v)) v.forEach(strings);
    else if (v && typeof v === 'object') Object.values(v).forEach(strings);
  };
  const walk = (v) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) want.has(k) ? strings(x) : walk(x);
    }
  };
  walk(JSON.parse(fs.readFileSync(file, 'utf8')));
  return out;
}

function lineTerms(file) {
  return fs.readFileSync(file, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
}

/**
 * Builds the blocklist from configured sources. Returns null when `sources` is empty, any source is unreadable
 * or of unknown type, or no term at all comes out (caller treats null as "unchecked", PRD 6.7).
 * `~` in paths expands to HOME.
 * @param {PrivacySource[]} sources @param {{env?: NodeJS.ProcessEnv}} [opts] @returns {Blocklist|null}
 */
export function loadBlocklist(sources, opts = {}) {
  const env = opts.env || process.env;
  if (!Array.isArray(sources) || !sources.length) return null;
  const byForm = new Map();
  try {
    sources.forEach((src, i) => {
      if (!src || typeof src.path !== 'string') throw new Error('bad source');
      const file = path.resolve(expandHome(src.path, env));
      let raw;
      let proper = false;
      if (src.type === 'vault-titles') raw = vaultTitles(file);
      else if (src.type === 'json-fields') raw = jsonFields(file, src.fields);
      else if (src.type === 'lines') { raw = lineTerms(file); proper = src.proper === true; }
      else throw new Error('unknown source type');
      for (const term of raw) {
        const forms = variants(term);
        if (!forms.length) continue;
        const prev = byForm.get(forms[0]);
        if (prev) { prev.proper ||= proper; continue; }
        byForm.set(forms[0], { term: nfc(term).trim(), forms, proper, source: `${src.type}#${i}` });
      }
    });
  } catch {
    return null;
  }
  return byForm.size ? { terms: [...byForm.values()] } : null;
}

/** Reads `.privacy-allow` (one term per line, `#` comments). Missing file -> empty set. @param {string|null} file @returns {Set<string>} */
export function loadAllow(file) {
  if (!file) return new Set();
  try {
    return new Set(lineTerms(file));
  } catch (e) {
    if (e.code === 'ENOENT' || e.code === 'ENOTDIR') return new Set();
    throw e;
  }
}

const titleCased = (s) => s.trim().split(/\s+/).every((w) => /^\p{Lu}/u.test(w));

const indexCache = new WeakMap();
function indexOf(blocklist) {
  let ix = indexCache.get(blocklist);
  if (ix) return ix;
  ix = { map: new Map(), maxN: 0 };
  for (const t of blocklist.terms) {
    const words = t.forms[0].split(' ').length;
    if (words < 2 && (!t.proper || t.forms[0].length < MIN_SINGLE)) continue;
    // Tiếng Việt: một chữ là một âm tiết, nên tên note 2 chữ ("Câu hỏi", "Cửa sổ") thường là từ chung.
    // Chỉ chặn cụm 2 chữ khi nguồn là tên riêng hoặc mọi chữ đều viết hoa (dạng tên người, tên riêng).
    if (words === 2 && !t.proper && !titleCased(t.term)) continue;
    t.forms.forEach((f, k) => {
      const kind = k === 0 ? 'exact' : f === norm(stripDiacritics(t.forms[0])) ? 'plain' : 'telex';
      if (!ix.map.has(f)) ix.map.set(f, []);
      ix.map.get(f).push({ t, kind });
      ix.maxN = Math.max(ix.maxN, f.split(' ').length);
    });
  }
  indexCache.set(blocklist, ix);
  return ix;
}

const allowCache = new WeakMap();
function allowForms(allow) {
  if (!allow || !allow.size) return null;
  let set = allowCache.get(allow);
  if (!set) {
    set = new Set();
    for (const a of allow) for (const f of variants(a)) set.add(f);
    allowCache.set(allow, set);
  }
  return set;
}

/**
 * Word-boundary match of every blocked form against normalised `text` and its diacritic-free form.
 * Single words only reported for `proper` sources; allowlisted terms never reported. One violation per term.
 * @param {string} text @param {Blocklist} blocklist @param {Set<string>} [allow] @returns {Violation[]} (field = '')
 */
export function check(text, blocklist, allow) {
  if (!text || !blocklist) return [];
  const ix = indexOf(blocklist);
  if (!ix.map.size) return [];
  const allowed = allowForms(allow);
  const exact = tokens(text);
  const plain = exact.map((w) => stripDiacritics(w));
  const best = new Map();
  const hit = (gram, plainSide) => {
    for (const { t, kind } of ix.map.get(gram) || []) {
      const k = plainSide && kind === 'exact' ? 'plain' : kind;
      const cur = best.get(t);
      if (!cur || RANK[k] < RANK[cur]) best.set(t, k);
    }
  };
  for (const seq of [exact, plain]) {
    const plainSide = seq === plain;
    if (plainSide && plain.every((w, i) => w === exact[i])) break;
    for (let i = 0; i < seq.length; i++) {
      let gram = '';
      for (let n = 0; n < ix.maxN && i + n < seq.length; n++) {
        gram = n ? `${gram} ${seq[i + n]}` : seq[i];
        hit(gram, plainSide);
      }
    }
  }
  const out = [];
  for (const [t, kind] of best) {
    if (allowed && t.forms.some((f) => allowed.has(f))) continue;
    out.push({ field: '', term: t.term, kind });
  }
  return out;
}

function textsOf(v) {
  if (typeof v === 'string') return [v];
  if (Array.isArray(v)) return v.flatMap(textsOf);
  return [];
}

// Fixed section labels of the box template (PRD 6.6) are tool text, not story content.
const LABEL_RE = /\*\*(?:Bối cảnh|Chuyện gì xảy ra|Bài học|Artefact|Góc người ngoài):\*\*/gu;

function checkFields(entries, blocklist, allow) {
  const out = [];
  for (const [field, value] of entries) {
    const text = textsOf(value).join('\n');
    for (const v of check(text, blocklist, allow)) out.push({ ...v, field });
  }
  return out;
}

/**
 * Checks every text field of frontmatter and body, plus the slug.
 * @param {{data: Record<string, any>, body: string}} story @param {string} slug file id or slug
 * @param {Blocklist} blocklist @param {Set<string>} [allow] @returns {Violation[]}
 */
export function checkStory(story, slug, blocklist, allow) {
  return checkFields([
    ...Object.entries(story?.data || {}),
    ['body', nfc(story?.body || '').replace(LABEL_RE, '\n')],
    ['slug', slug || ''],
  ], blocklist, allow);
}

/**
 * Checks what a merge would append to an existing file (lines, outsider section, appended lists, set values).
 * @param {import('./box.mjs').MergePatch} patch @param {Blocklist} blocklist @param {Set<string>} [allow] @returns {Violation[]}
 */
export function checkPatch(patch, blocklist, allow) {
  if (!patch) return [];
  return checkFields([
    ...Object.entries(patch.append || {}).map(([k, v]) => [`append.${k}`, v]),
    ...Object.entries(patch.set || {}).map(([k, v]) => [`set.${k}`, v]),
    ['append.outsider', patch.outsider || ''],
  ], blocklist, allow);
}

/** Masked display: first char + length, e.g. "x… (11)". @param {string} term @returns {string} */
export function mask(term) {
  const chars = [...nfc(term).trim()];
  return chars.length ? `${chars[0]}… (${chars.length})` : '… (0)';
}
