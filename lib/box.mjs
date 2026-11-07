// Story box on disk (PRD 6.6): one `YYYY-MM-DD-slug-xxxx.md` per story (older files `YYYY-MM-DD-slug.md`), id = file
// name without `.md`.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { parse, stringify } from './frontmatter.mjs';
import { TENSION_IDS } from './vocab.mjs';
import { assignCodes, resolveCodes, takenCodes, freeCode, normalizeCode, storedCode, oldCodes, withCode, withMovedCode, CODE_RE } from './story-code.mjs';

export const STATUSES = ['raw', 'picked', 'drafted', 'published', 'dropped'];
/** Tension types, `none` included, from lib/rules/story-vocab.json (the prompts list the same ones). */
export const TENSIONS = [...TENSION_IDS];
export const CAPTURED_BY = ['live', 'harvest', 'human'];
export const HIT_BY = ['hotspot', 'harvest', 'outsider', 'bip', 'live', 'human'];
export const PRIVACY = ['checked', 'unchecked'];
/** Fields the machine updates only while `status: raw`. */
export const MACHINE_FIELDS = ['hook', 'tension', 'sides', 'strength', 'stakes', 'hits', 'runs'];
/** List fields a merge may append to (deduped). */
export const APPEND_FIELDS = ['sessions', 'signals', 'hit_by', 'lines'];
export const LIST_FIELDS = ['signals', 'links', 'threads', 'sessions', 'hit_by', 'lines', 'sides', 'aliases', 'old_codes'];
export const OUTSIDER_LABEL = '**Góc người ngoài:**';
/** Body line of the story angle (lib/angle.mjs); its text mirrors frontmatter `angle`. */
export const ANGLE_LABEL = '**Góc kể:**';
/** Frontmatter `angle` of a story the angle step looked at and found no tellable turn in. */
export const ANGLE_NONE = 'none';
/**
 * Slots of the story spine the angle step fills (lib/angle.mjs): who and what project, what they wanted, what stood in
 * the way, the turn (believed vs turned out), what they did, where it ended (numbers), what a listener can use.
 */
export const SPINE_SLOTS = Object.freeze(['context', 'want', 'obstacle', 'turn', 'action', 'outcome', 'takeaway']);
/** Frontmatter keys of one spine slot: its text and its evidence refs (`<sid>#L<n>`, or `profile`). */
export const spineKeys = (slot) => ({ text: `spine_${slot}`, lines: `spine_${slot}_lines` });
const SPINE_KEY_RE = /^spine_[a-z]+(?:_lines)?$/;

export const ID_RE = /^\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * @typedef {object} BoxStory
 * @property {string} id      file name without .md
 * @property {string} file    base name
 * @property {string} path    absolute path
 * @property {Record<string, any>} data  frontmatter ({} when unreadable)
 * @property {string} body
 * @property {string|null} error  parse error message
 */

/**
 * @typedef {object} MergePatch
 * @property {Partial<Record<'sessions'|'signals'|'hit_by'|'lines', string[]>>} [append]
 * @property {{runs?: number, hits?: number}} [add]   increments, only while status is raw
 * @property {Partial<Record<'hook'|'tension'|'sides'|'strength'|'stakes', any>>} [set]  only while status is raw
 * @property {string} [outsider]  text after "**Góc người ngoài:**"; added only if the section is absent
 * @property {'unchecked'} [privacy]  downgrades the file's privacy label (append not checked)
 * @property {{angle: string, audience?: string, spine?: Record<string, {text: string, lines: string[]}>, completeness?: number, replace?: boolean}} [angle]
 *   story angle, `angle: 'none'` when there is no tellable turn, with its spine (filled slots only) and the number of
 *   filled slots; written only while the story has no angle yet, or with `replace`. Any status.
 */

const asList = (v) => (Array.isArray(v) ? v : v === undefined || v === null || v === '' ? [] : [v]);

/** @param {string} file @returns {BoxStory} */
export function readStoryFile(file) {
  const id = path.basename(file, '.md');
  const base = { id, file: path.basename(file), path: path.resolve(file), data: {}, body: '', error: null };
  try {
    return { ...base, ...parse(fs.readFileSync(file, 'utf8')) };
  } catch (e) {
    return { ...base, error: e.message };
  }
}

/** Stories in `dir` whose name matches the id pattern (README.md and others ignored). @param {string} dir @returns {BoxStory[]} */
export function readBox(dir) {
  let names;
  try { names = fs.readdirSync(dir); } catch (e) { if (e.code === 'ENOENT') return []; throw e; }
  return names
    .filter((n) => n.endsWith('.md') && ID_RE.test(n.slice(0, -3)))
    .sort()
    .map((n) => readStoryFile(path.join(dir, n)));
}

/** @param {string} dir @param {string} id @returns {BoxStory|null} */
export function readStory(dir, id) {
  const file = path.join(dir, `${id}.md`);
  return fs.existsSync(file) ? readStoryFile(file) : null;
}

/**
 * Last part of a new story id, so two machines (two sessions) never make the same file name for the same title on
 * the same day, which git could not merge: 4 hex characters of a hash of the session id, or random for a story with
 * no session. Stories of one session share it; a clash inside one box still gets `-2`.
 * @param {string|null|undefined} sid @returns {string}
 */
export function originTag(sid) {
  return sid ? crypto.createHash('sha256').update(String(sid)).digest('hex').slice(0, 4) : crypto.randomBytes(2).toString('hex');
}

/** First free id among `base`, `base-2`, `base-3`... @param {string} dir @param {string} base `YYYY-MM-DD-slug` */
export function uniqueId(dir, base, taken = new Set()) {
  for (let n = 1; ; n++) {
    const id = n === 1 ? base : `${base}-${n}`;
    if (!taken.has(id) && !fs.existsSync(path.join(dir, `${id}.md`))) return id;
  }
}

function writeAtomic(file, text, exclusive) {
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, text, { flag: 'wx' });
  try {
    if (exclusive) fs.linkSync(tmp, file); // fails with EEXIST, never overwrites
    else fs.renameSync(tmp, file);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

/**
 * Creates a new story file; never overwrites (throws EEXIST). `data.id` is set to `story.id` and put first, followed
 * by `code` (the first candidate no story in the box holds, lib/story-code.mjs) and `aliases: [code]`.
 * @param {string} dir @param {{id: string, data: Record<string, any>, body: string}} story @returns {string} path
 */
export function writeNew(dir, story) {
  if (!ID_RE.test(story.id)) throw new Error(`id sai khuôn: ${story.id}`);
  fs.mkdirSync(dir, { recursive: true });
  const { id: _drop, code: _code, ...rest } = story.data;
  const code = freeCode(story.id, takenCodes(readBox(dir)));
  const file = path.join(dir, `${story.id}.md`);
  writeAtomic(file, stringify(withCode({ id: story.id, ...rest }, code), story.body), true);
  return file;
}

/** Code of every story of a box (stored, else computed). @param {BoxStory[]} stories @returns {Map<string, string>} id → code */
export const codesOf = (stories) => assignCodes(stories);

/**
 * Error for a code more than one story of the box has a claim on: it holds it, stores it too (two machines, not fixed
 * yet), or held it before a move (`old_codes`). `check` reports a duplicate; the ids or the current codes still work.
 */
export class AmbiguousCodeError extends Error {
  /** @param {string} code @param {string[]} ids @param {string[]} [notes] one per id, how it relates to the code */
  constructor(code, ids, notes = []) {
    super(`mã ${code} trùng ở ${ids.length} chuyện: ${ids.map((id, i) => (notes[i] ? `${id} (${notes[i]})` : id)).join(', ')}`);
    this.name = 'AmbiguousCodeError';
    this.code = 'ambiguous-code';
    this.storyCode = code;
    this.ids = ids;
  }
}

/** True when `ref` has the shape of a story id or a story code. @param {unknown} ref */
export const isStoryRef = (ref) => typeof ref === 'string' && (ID_RE.test(ref) || normalizeCode(ref) !== null);

/**
 * A story by id (`YYYY-MM-DD-slug`) or by code (`M-XXXX`, any case, `M-` optional), with its code. Null when no story
 * matches or `ref` is neither. Throws AmbiguousCodeError when another story than the one holding the code stores it
 * too or stored it before (the user may mean either); with only one story behind the code, that story.
 * @param {string} dir @param {string} ref @returns {{story: BoxStory, code: string}|null}
 */
export function findStory(dir, ref) {
  const r = typeof ref === 'string' ? ref.trim() : '';
  const code = ID_RE.test(r) ? null : normalizeCode(r);
  if (!ID_RE.test(r) && !code) return null;
  const all = readBox(dir);
  const codes = codesOf(all);
  if (!code) {
    const story = all.find((s) => s.id === r);
    return story ? { story, code: codes.get(story.id) } : null;
  }
  const holder = all.find((s) => codes.get(s.id) === code);
  const others = all.filter((s) => s !== holder && (storedCode(s.data) === code || oldCodes(s.data).includes(code)));
  const related = [...(holder ? [holder] : []), ...others];
  if (related.length > 1) {
    const note = (s) => (s === holder ? 'giữ mã' : storedCode(s.data) === code ? `ghi trùng, check --fix chuyển sang ${codes.get(s.id)}` : `mã cũ, nay là ${codes.get(s.id)}`);
    throw new AmbiguousCodeError(code, related.map((s) => s.id), related.map(note));
  }
  return related.length ? { story: related[0], code: codes.get(related[0].id) } : null;
}

/**
 * Writes `code` and `aliases` into stories of the box that lack them (the codes they already resolve to, so nothing
 * moves), and adds a stored code missing from `aliases`. A story storing a code a story with a smaller id stores too
 * moves to the code the rule gives it (lib/story-code.mjs), the lost code going to `old_codes`. Unreadable files are
 * left alone.
 * @param {string} dir @param {{dryRun?: boolean}} [opts]
 * @returns {{id: string, code: string, from?: string, keeper?: string}[]} stories written (or to write); `from` and
 *   `keeper` for a moved code
 */
export function backfillCodes(dir, { dryRun = false } = {}) {
  const all = readBox(dir);
  const { codes, moved } = resolveCodes(all);
  const moves = new Map(moved.map((m) => [m.id, m]));
  const out = [];
  for (const s of all) {
    if (s.error) continue;
    const code = codes.get(s.id);
    const m = moves.get(s.id);
    if (m) {
      if (!dryRun) writeAtomic(s.path, stringify(withMovedCode(s.data, code), s.body), false);
      out.push({ id: s.id, code, from: m.from, keeper: m.keeper });
      continue;
    }
    const aliases = Array.isArray(s.data.aliases) ? s.data.aliases : [];
    if (storedCode(s.data) === code && aliases.includes(code)) continue;
    if (s.data.code !== undefined && !storedCode(s.data)) continue; // malformed stored code: `check` reports it, a person fixes it
    if (!dryRun) writeAtomic(s.path, stringify(withCode(s.data, code), s.body), false);
    out.push({ id: s.id, code });
  }
  return out;
}

/**
 * Writes an angle: frontmatter `angle` and `audience` (`angle: none` drops `audience`), the spine slots
 * (`spine_<slot>`, `spine_<slot>_lines`) and `completeness`, replacing older ones, and the body line `**Góc kể:** ...`
 * right under the title, replacing an older one (none removes it). Mutates `data`; returns the body.
 * @param {Record<string, any>} data @param {string} body @param {NonNullable<MergePatch['angle']>} a @returns {string}
 */
function setAngle(data, body, a) {
  const none = a.angle === ANGLE_NONE;
  data.angle = a.angle;
  if (none || !a.audience) delete data.audience;
  else data.audience = a.audience;
  for (const k of Object.keys(data)) if (SPINE_KEY_RE.test(k) || k === 'completeness') delete data[k];
  for (const slot of SPINE_SLOTS) {
    const v = a.spine?.[slot];
    if (!v?.text) continue;
    const k = spineKeys(slot);
    data[k.text] = v.text;
    data[k.lines] = [...(v.lines ?? [])];
  }
  if (Number.isInteger(a.completeness)) data.completeness = a.completeness;
  const lines = String(body).split('\n').filter((l) => !l.startsWith(ANGLE_LABEL));
  if (none) return lines.join('\n');
  const line = `${ANGLE_LABEL} ${a.angle}`;
  const h = lines.findIndex((l) => /^#\s/.test(l));
  if (h < 0) return [line, ...lines].join('\n');
  const rest = lines.slice(h + 1);
  const skip = rest[0] === '' ? 1 : 0;
  return [...lines.slice(0, h + 1), '', line, ...rest.slice(skip)].join('\n');
}

/**
 * Applies a merge patch: appends lists (dedup), updates machine fields only when status is raw,
 * adds the outsider section if missing. Never touches status, links, threads. Writes only on change.
 * @param {string} dir @param {string} id @param {MergePatch} patch
 * @returns {{changed: boolean, data: Record<string, any>, body: string}}
 */
export function mergeInto(dir, id, patch) {
  const s = readStory(dir, id);
  if (!s) throw new Error(`không có chuyện ${id}`);
  if (s.error) throw new Error(`${id}: ${s.error}`);
  const data = { ...s.data };
  let body = s.body;

  for (const k of APPEND_FIELDS) {
    const add = asList(patch.append?.[k]);
    if (!add.length) continue;
    const cur = asList(data[k]);
    const next = [...cur];
    for (const v of add) if (!next.includes(v)) next.push(v);
    if (next.length !== cur.length || !Array.isArray(data[k])) data[k] = next;
  }

  if ((data.status ?? 'raw') === 'raw') {
    for (const [k, v] of Object.entries(patch.set || {})) {
      if (MACHINE_FIELDS.includes(k) && v !== undefined) data[k] = v;
    }
    for (const k of ['runs', 'hits']) {
      const inc = patch.add?.[k];
      if (inc) data[k] = (Number.isInteger(data[k]) ? data[k] : 0) + inc;
    }
  }

  // safety label, not a user field: an unchecked append downgrades the whole file
  if (patch.privacy === 'unchecked') data.privacy = 'unchecked';

  if (patch.outsider && !body.includes(OUTSIDER_LABEL)) {
    if (body && !body.endsWith('\n')) body += '\n';
    body += `${OUTSIDER_LABEL} ${patch.outsider}\n`;
  }

  const hadAngle = typeof data.angle === 'string' && data.angle.trim() !== '';
  if (patch.angle && (patch.angle.replace || !hadAngle)) body = setAngle(data, body, patch.angle);

  const before = stringify(s.data, s.body);
  const after = stringify(data, body);
  if (after !== before) writeAtomic(s.path, after, false);
  return { changed: after !== before, data, body };
}

/** @param {string} dir @param {string} sid e.g. `claude:0a1b2c3d` @returns {BoxStory[]} */
export function storiesOfSession(dir, sid) {
  return readBox(dir).filter((s) => asList(s.data.sessions).includes(sid));
}

/** Text of the "**Chuyện gì xảy ra:**" paragraph (used as cluster summary for `box:` ids). @param {string} body */
export function whatHappened(body) {
  const m = body.match(/\*\*Chuyện gì xảy ra:\*\*\s*([\s\S]*?)(?=\n\*\*[^*\n]+:\*\*|\n#|$)/);
  return m ? m[1].trim() : body.replace(/^\s*#.*\n/, '').trim();
}

/** First `# ` heading of the body. @param {string} body */
export function titleOf(body) {
  const m = body.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : '';
}

/**
 * Shape checks for one story (frontmatter only). @param {BoxStory} s @returns {{field: string, msg: string}[]}
 */
export function checkShape(s) {
  if (s.error) return [{ field: '-', msg: `frontmatter hỏng: ${s.error}` }];
  const d = s.data;
  const out = [];
  const err = (field, msg) => out.push({ field, msg });
  const int03 = (k) => d[k] !== undefined && !(Number.isInteger(d[k]) && d[k] >= 0 && d[k] <= 3) && err(k, `phải là 0-3, gặp ${d[k]}`);
  const inSet = (k, set) => d[k] !== undefined && !set.includes(d[k]) && err(k, `giá trị lạ: ${d[k]}`);

  if (!ID_RE.test(s.id)) err('id', `tên file sai khuôn: ${s.file}`);
  if (d.id !== undefined && d.id !== s.id) err('id', `id "${d.id}" khác tên file "${s.id}"`);
  if (d.date === undefined) err('date', 'thiếu');
  else if (typeof d.date !== 'string' || !DATE_RE.test(d.date)) err('date', `phải là YYYY-MM-DD, gặp ${d.date}`);
  if (d.status === undefined) err('status', 'thiếu');
  else inSet('status', STATUSES);
  for (const k of LIST_FIELDS) if (d[k] !== undefined && !Array.isArray(d[k])) err(k, 'phải là danh sách [...]');
  inSet('captured_by', CAPTURED_BY);
  inSet('tension', TENSIONS);
  inSet('privacy', PRIVACY);
  for (const v of asList(Array.isArray(d.hit_by) ? d.hit_by : [])) if (!HIT_BY.includes(v)) err('hit_by', `giá trị lạ: ${v}`);
  int03('strength');
  int03('stakes');
  for (const k of ['hits', 'runs']) if (d[k] !== undefined && !(Number.isInteger(d[k]) && d[k] >= 0)) err(k, `phải là số nguyên ≥ 0, gặp ${d[k]}`);
  if (Number.isInteger(d.hits) && Number.isInteger(d.runs) && d.hits > d.runs) err('hits', `hits ${d.hits} > runs ${d.runs}`);
  for (const k of ['hook', 'source', 'angle', 'audience']) if (d[k] !== undefined && typeof d[k] !== 'string') err(k, 'phải là chuỗi');
  for (const slot of SPINE_SLOTS) {
    const k = spineKeys(slot);
    if (d[k.text] !== undefined && typeof d[k.text] !== 'string') err(k.text, 'phải là chuỗi');
    if (d[k.lines] !== undefined && !(Array.isArray(d[k.lines]) && d[k.lines].every((x) => typeof x === 'string'))) err(k.lines, 'phải là danh sách chuỗi');
  }
  if (d.code !== undefined && !(typeof d.code === 'string' && CODE_RE.test(d.code))) err('code', `phải là M- và 4 ký tự 0-9 A-Z (không I L O U), gặp ${d.code}`);
  if (Array.isArray(d.old_codes)) for (const c of d.old_codes) if (!(typeof c === 'string' && CODE_RE.test(c))) err('old_codes', `mỗi mục phải là mã M-XXXX, gặp ${c}`);
  if (d.completeness !== undefined && !(Number.isInteger(d.completeness) && d.completeness >= 0 && d.completeness <= SPINE_SLOTS.length)) err('completeness', `phải là số nguyên 0..${SPINE_SLOTS.length}, gặp ${d.completeness}`);
  return out;
}

/**
 * Shape + id + link + code checks. Links must point to an existing story id in the same box; a stored code another
 * story with a smaller id stores too is reported on the story that gives it up, with the code it moves to.
 * @param {BoxStory[]} stories all stories of the box (link targets)
 * @param {Set<string>} [only] restrict reported files to these ids (e.g. `check --staged`)
 * @returns {{file: string, field: string, msg: string}[]}
 */
export function checkBox(stories, only) {
  const ids = new Set(stories.map((s) => s.id));
  const moves = new Map(resolveCodes(stories).moved.map((m) => [m.id, m]));
  const out = [];
  for (const s of stories) {
    if (only && !only.has(s.id)) continue;
    for (const e of checkShape(s)) out.push({ file: s.file, ...e });
    const m = moves.get(s.id);
    if (m) out.push({ file: s.file, field: 'code', msg: `mã ${m.from} trùng với ${m.keeper}; id nhỏ hơn giữ mã, chuyện này chuyển sang ${m.to} (momentry check --fix)` });
    if (s.error || !Array.isArray(s.data.links)) continue;
    for (const l of s.data.links) {
      if (l === s.id) out.push({ file: s.file, field: 'links', msg: 'tự trỏ vào chính nó' });
      else if (!ids.has(String(l))) out.push({ file: s.file, field: 'links', msg: `link gãy: ${l}` });
    }
  }
  return out;
}
