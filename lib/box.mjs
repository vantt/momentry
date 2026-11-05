// Story box on disk (PRD 6.6): one `YYYY-MM-DD-slug.md` per story, id = file name without `.md`.
import fs from 'node:fs';
import path from 'node:path';
import { parse, stringify } from './frontmatter.mjs';

export const STATUSES = ['raw', 'picked', 'drafted', 'published', 'dropped'];
export const TENSIONS = ['nho_ma_to', 'giup_ma_hai', 'tuong_ma_hoa_ra', 'hop_ma_tan', 'cam_ma_van_lot', 'it_ma_nhieu', 'khac', 'none'];
export const CAPTURED_BY = ['live', 'harvest', 'human'];
export const HIT_BY = ['hotspot', 'harvest', 'outsider', 'bip', 'live', 'human'];
export const PRIVACY = ['checked', 'unchecked'];
/** Fields the machine updates only while `status: raw`. */
export const MACHINE_FIELDS = ['hook', 'tension', 'sides', 'strength', 'stakes', 'hits', 'runs'];
/** List fields a merge may append to (deduped). */
export const APPEND_FIELDS = ['sessions', 'signals', 'hit_by', 'lines'];
export const LIST_FIELDS = ['signals', 'links', 'threads', 'sessions', 'hit_by', 'lines', 'sides'];
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
 * Creates a new story file; never overwrites (throws EEXIST). `data.id` is set to `story.id` and put first.
 * @param {string} dir @param {{id: string, data: Record<string, any>, body: string}} story @returns {string} path
 */
export function writeNew(dir, story) {
  if (!ID_RE.test(story.id)) throw new Error(`id sai khuôn: ${story.id}`);
  fs.mkdirSync(dir, { recursive: true });
  const { id: _drop, ...rest } = story.data;
  const file = path.join(dir, `${story.id}.md`);
  writeAtomic(file, stringify({ id: story.id, ...rest }, story.body), true);
  return file;
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
  if (d.completeness !== undefined && !(Number.isInteger(d.completeness) && d.completeness >= 0 && d.completeness <= SPINE_SLOTS.length)) err('completeness', `phải là số nguyên 0..${SPINE_SLOTS.length}, gặp ${d.completeness}`);
  return out;
}

/**
 * Shape + id + link checks. Links must point to an existing story id in the same box.
 * @param {BoxStory[]} stories all stories of the box (link targets)
 * @param {Set<string>} [only] restrict reported files to these ids (e.g. `check --staged`)
 * @returns {{file: string, field: string, msg: string}[]}
 */
export function checkBox(stories, only) {
  const ids = new Set(stories.map((s) => s.id));
  const out = [];
  for (const s of stories) {
    if (only && !only.has(s.id)) continue;
    for (const e of checkShape(s)) out.push({ file: s.file, ...e });
    if (s.error || !Array.isArray(s.data.links)) continue;
    for (const l of s.data.links) {
      if (l === s.id) out.push({ file: s.file, field: 'links', msg: 'tự trỏ vào chính nó' });
      else if (!ids.has(String(l))) out.push({ file: s.file, field: 'links', msg: `link gãy: ${l}` });
    }
  }
  return out;
}
