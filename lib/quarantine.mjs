// Stories held outside the repo (PRD 6.7): <cacheDir>/quarantine/<repo>/, mode 0700, files 0600.
import fs from 'node:fs';
import path from 'node:path';
import { ensurePrivateDir } from './config.mjs';
import { ID_RE, readStory, uniqueId, writeNew, mergeInto } from './box.mjs';
import { checkStory, checkPatch } from './privacy.mjs';

/**
 * @typedef {object} QuarantineItem
 * @property {string} id        held key (file name without .json); equals the intended story id unless taken
 * @property {string} storyId   intended story id
 * @property {'violation'|'unchecked'} reason
 * @property {string} at        ISO time
 * @property {{data: Record<string, any>, body: string}} story
 * @property {{field: string, kind: string}[]} [violations]  no terms stored
 * @property {import('./box.mjs').MergePatch} [patch]        when the held item is an append to an existing file
 * @property {string} [target]  existing story id for a held patch
 */

const KEY_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const safe = (s) => String(s || 'unknown').replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^[._]+/, '') || 'unknown';
const dirOf = (repo, cacheDir) => path.join(cacheDir, 'quarantine', safe(repo));
/** Folder holding a repo's held stories. @param {string} repo @param {string} cacheDir */
export const heldDir = dirOf;

/**
 * Stores a story (or patch) that may not enter the repo. Never overwrites: a taken key gets `-2`, `-3`...
 * @param {string} repo repo name @param {{id: string, data: Record<string, any>, body: string, patch?: object, target?: string}} story
 * @param {'violation'|'unchecked'} reason
 * @param {{cacheDir: string, violations?: {field: string, kind: string}[]}} opts
 * @returns {string} path of the held file
 */
export function put(repo, story, reason, opts) {
  if (!opts?.cacheDir) throw new Error('quarantine.put cần cacheDir');
  if (reason !== 'violation' && reason !== 'unchecked') throw new Error(`lý do sai: ${reason}`);
  const dir = ensurePrivateDir(dirOf(repo, opts.cacheDir));
  fs.chmodSync(dir, 0o700);
  const base = safe(story.id || story.target);
  const item = {
    storyId: story.id || null,
    reason,
    at: new Date().toISOString(),
    story: { data: story.data || {}, body: story.body || '' },
    violations: (opts.violations || []).map((v) => ({ field: v.field, kind: v.kind })),
  };
  if (story.patch) item.patch = story.patch;
  if (story.target) item.target = story.target;
  for (let n = 1; ; n++) {
    const id = n === 1 ? base : `${base}-${n}`;
    const file = path.join(dir, `${id}.json`);
    try {
      fs.writeFileSync(file, JSON.stringify({ id, ...item }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
      return file;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
    }
  }
}

function readItem(file) {
  try {
    const it = JSON.parse(fs.readFileSync(file, 'utf8'));
    return it && typeof it === 'object' ? { ...it, id: path.basename(file, '.json') } : null;
  } catch {
    return null;
  }
}

/** Held items, oldest first; unreadable files are skipped. @param {string} repo @param {{cacheDir: string}} opts @returns {QuarantineItem[]} */
export function list(repo, opts) {
  const dir = dirOf(repo, opts.cacheDir);
  let names;
  try { names = fs.readdirSync(dir); } catch (e) { if (e.code === 'ENOENT') return []; throw e; }
  return names
    .filter((n) => n.endsWith('.json'))
    .map((n) => readItem(path.join(dir, n)))
    .filter(Boolean)
    .sort((a, b) => String(a.at).localeCompare(String(b.at)) || a.id.localeCompare(b.id));
}

/**
 * Re-runs the privacy check; on pass writes into the box (new file or merge) and removes the held item.
 * A held patch whose target no longer exists is an error (never written as an empty new story).
 * Throws when the id is unknown, or with exitCode 3 when `blocklist` is null.
 * @param {string} repo @param {string} id @param {import('./privacy.mjs').Blocklist} blocklist
 * @param {{cacheDir: string, box: string, allow?: Set<string>}} opts
 * @returns {{released: boolean, violations: import('./privacy.mjs').Violation[], path?: string, created?: boolean, capturedBy?: string|null}}
 *   created: a new story was written (not a patch merged into an existing one)
 */
export function release(repo, id, blocklist, opts) {
  if (!blocklist) {
    const e = new Error('bỏ qua kiểm riêng tư: không có nguồn chặn');
    e.exitCode = 3;
    throw e;
  }
  if (!KEY_RE.test(String(id))) throw new Error(`id sai: ${id}`);
  const file = path.join(dirOf(repo, opts.cacheDir), `${id}.json`);
  const item = fs.existsSync(file) ? readItem(file) : null;
  if (!item) throw new Error(`không có chuyện bị giữ: ${id}`);

  if (item.patch && item.target) {
    if (!readStory(opts.box, item.target)) throw new Error(`chuyện đích ${item.target} không còn trong hộp; xoá bản vá bị giữ ${id} bằng tay nếu không cần`);
    const violations = checkPatch(item.patch, blocklist, opts.allow);
    if (violations.length) return { released: false, violations };
    mergeInto(opts.box, item.target, item.patch);
    fs.rmSync(file, { force: true });
    return { released: true, violations: [], path: path.join(opts.box, `${item.target}.md`) };
  }

  const wanted = item.storyId && ID_RE.test(item.storyId) ? item.storyId : null;
  if (!wanted) throw new Error(`chuyện bị giữ ${id} không có id hợp lệ để ghi`);
  const storyId = uniqueId(opts.box, wanted);
  const data = { ...item.story.data, privacy: 'checked' };
  const story = { data, body: item.story.body || '' };
  const violations = checkStory(story, storyId, blocklist, opts.allow);
  if (violations.length) return { released: false, violations };
  const out = writeNew(opts.box, { id: storyId, ...story });
  fs.rmSync(file, { force: true });
  return { released: true, violations: [], path: out, created: true, capturedBy: data.captured_by ?? null };
}
