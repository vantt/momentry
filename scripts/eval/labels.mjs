// Label files for the eval harness and the deterministic story <-> label match (format: scripts/eval/README.md).
import fs from 'node:fs';
import { stripDiacritics } from '../../lib/viet.mjs';
import { ANGLE_LABEL } from '../../lib/box.mjs';

/**
 * @typedef {object} Label
 * @property {string} name        slug column (or title), for display only
 * @property {boolean} t          truly notable
 * @property {string[]} keywords  slug form; a trailing `*` means prefix match on the last word
 * @property {string[]} slugs     slug hints matched against the story id
 * @property {[number, number][]} lines  transcript line ranges, inclusive
 * @property {number} min         keywords needed for a keyword-only match (default min(2, keywords))
 */

const TRUE = new Set(['x', 'yes', 'y', 'true', '1', 't']);
const FALSE = new Set(['', 'no', 'n', 'false', '0', '-']);
const list = (v) => String(v ?? '').split(',').map((s) => s.trim()).filter(Boolean);

/** Slug form of any text: no diacritics, lowercase, words joined by `-` ("Tìm kiếm  tiếng Việt" -> "tim-kiem-tieng-viet"). */
export function slugAll(s) {
  return stripDiacritics(String(s ?? '')).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).join('-');
}

/** Keyword in slug form; `foo*` keeps the star. @param {string} k */
export function normKeyword(k) {
  const star = /\*\s*$/.test(k);
  const s = slugAll(String(k).replace(/\*\s*$/, ''));
  return s && star ? `${s}*` : s;
}

/** "1363-1364, 2344" -> [[1363, 1364], [2344, 2344]]. @param {string} v @param {string} where */
export function parseRanges(v, where) {
  return list(v).map((part) => {
    const m = /^L?(\d+)(?:\s*[-–]\s*L?(\d+))?$/.exec(part);
    if (!m) throw new Error(`${where}: dòng sai khuôn: ${part}`);
    const a = Number(m[1]), b = Number(m[2] ?? m[1]);
    if (b < a) throw new Error(`${where}: khoảng dòng ngược: ${part}`);
    return [a, b];
  });
}

/**
 * Builds a validated Label from the raw cells. @param {Record<string, string>} raw keys: slug, title, lines, keywords, t, min
 * @param {string} where @returns {Label}
 */
export function makeLabel(raw, where) {
  const keywords = list(raw.keywords).map(normKeyword).filter(Boolean);
  const slugs = list(raw.slug).map(slugAll).filter(Boolean);
  if (!keywords.length && !slugs.length) throw new Error(`${where}: cần keywords hoặc slug`);
  const tv = String(raw.t ?? '').trim().toLowerCase();
  if (!TRUE.has(tv) && !FALSE.has(tv)) throw new Error(`${where}: cột t phải là x hoặc trống: ${raw.t}`);
  const min = raw.min == null || String(raw.min).trim() === '' ? Math.max(1, Math.min(2, keywords.length)) : Number(raw.min);
  if (!Number.isInteger(min) || min < 1 || min > Math.max(1, keywords.length)) throw new Error(`${where}: min phải là số nguyên 1..${keywords.length}: ${raw.min}`);
  return {
    name: String(raw.slug || raw.title || keywords.join(' ')).trim(), t: TRUE.has(tv), keywords, slugs,
    lines: parseRanges(raw.lines, where), min,
  };
}

/** Header cell -> field. Vietnamese and English names both work. */
const COLUMNS = { slug: 'slug', 'tieu-de': 'title', title: 'title', dong: 'lines', lines: 'lines', keywords: 'keywords', t: 't', min: 'min' };
const cells = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());

/**
 * Label file: optional `---` frontmatter (ignored), then a markdown table whose header names the columns
 * (`slug`, `tiêu đề`, `dòng`, `keywords`, `t`, optional `min`; others such as `#` and `lý do` are ignored).
 * Every body row is one expected story. Text outside the table is ignored.
 * @param {string} text @param {string} [file] @returns {Label[]}
 */
export function parseLabels(text, file = 'labels') {
  const out = [];
  let cols = null;
  const lines = String(text).split(/\r?\n/);
  let i = 0;
  if (lines[0]?.trim() === '---') { i = lines.findIndex((l, k) => k > 0 && l.trim() === '---') + 1; if (i === 0) throw new Error(`${file}: frontmatter không đóng`); }
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim().startsWith('|')) { cols = null; continue; }
    const row = cells(line);
    if (!cols) {
      const names = row.map((c) => COLUMNS[slugAll(c)] ?? null);
      if (names.includes('keywords') && names.includes('t')) cols = names;
      continue;
    }
    if (row.every((c) => /^:?-+:?$/.test(c))) continue;
    const raw = {};
    cols.forEach((f, k) => { if (f) raw[f] = row[k] ?? ''; });
    out.push(makeLabel(raw, `${file}:${i + 1}`));
  }
  return out;
}

/** @param {string} file @returns {Label[]} */
export function loadLabels(file) {
  return parseLabels(fs.readFileSync(file, 'utf8'), file);
}

/** Verdicts of the angle check on the review page, saved in `<data>/angle-labels/<session>.json`. */
export const ANGLE_VERDICTS = Object.freeze({ tellable: 'kể được', 'no-story': 'không ra chuyện', invented: 'bịa' });

/** The review page's second question on an angle, answered có / không, saved next to the verdict as `understood`. */
export const UNDERSTOOD_QUESTION = 'Đọc xong hiểu được, không cần hỏi thêm?';
export const UNDERSTOOD = Object.freeze({ yes: 'có', no: 'không' });

/**
 * Counts per verdict of an angle-check file `{session, stories: {<story id>: {verdict?, understood?, angle, at}}}`,
 * plus `understood: {yes, no}`; null when the file is missing or unreadable.
 * @param {string} file @returns {(Record<string, number> & {understood: {yes: number, no: number}})|null}
 */
export function angleCheckCounts(file) {
  let j;
  try { j = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
  if (!j || typeof j !== 'object' || !j.stories || typeof j.stories !== 'object') return null;
  const n = Object.fromEntries(Object.keys(ANGLE_VERDICTS).map((k) => [k, 0]));
  const understood = { yes: 0, no: 0 };
  for (const v of Object.values(j.stories)) {
    if (v && Object.hasOwn(n, v.verdict)) n[v.verdict]++;
    if (v && Object.hasOwn(understood, v.understood)) understood[v.understood]++;
  }
  return { ...n, understood };
}

/**
 * Story text the keywords are matched against, in slug form wrapped in `-`: hook and body (title, sections). The
 * story angle line is left out, and the spine lives in frontmatter only (never read here), so adding angles and
 * spines never changes which labels a story matches.
 */
export function storyText(story) {
  const d = story?.data || {};
  const body = String(story?.body ?? '').split('\n').filter((l) => !l.startsWith(ANGLE_LABEL)).join('\n');
  return `-${slugAll([d.hook, body].filter(Boolean).join(' '))}-`;
}

/** Slug part of a story id (date prefix dropped). @param {string} id */
export const idSlug = (id) => String(id ?? '').replace(/^\d{4}-\d{2}-\d{2}-/, '');

/** Line numbers of a story (`<sid>#L812` refs). */
export function storyLines(story) {
  const ls = Array.isArray(story?.data?.lines) ? story.data.lines : [];
  return ls.map((r) => Number(/#?L(\d+)$/.exec(String(r))?.[1])).filter((n) => n > 0);
}

const hasKeyword = (text, kw) => (kw.endsWith('*') ? text.includes(`-${kw.slice(0, -1)}`) : text.includes(`-${kw}-`));

/**
 * Story matches label when any of:
 * 1. a slug hint is a substring of the story id's slug;
 * 2. at least `label.min` keywords occur as whole words in the story text (diacritics and case ignored);
 * 3. a story line falls inside a label range and at least one keyword occurs.
 * @param {{id: string, data?: object, body?: string}} story @param {Label} label @param {string} [text] precomputed storyText
 */
export function matches(story, label, text) {
  const slug = idSlug(story.id);
  if (label.slugs.some((s) => slug.includes(s))) return true;
  const t = text ?? storyText(story);
  const n = label.keywords.filter((k) => hasKeyword(t, k)).length;
  if (n >= label.min && n > 0) return true;
  if (!n || !label.lines.length) return false;
  return storyLines(story).some((x) => label.lines.some(([a, b]) => x >= a && x <= b));
}
