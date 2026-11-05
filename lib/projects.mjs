// The projects momentry works in on this machine: <config dir>/projects.json, keyed by repo root.
// Whether a repo is observed still comes from `<repo>/.momentry.json` or MOMENTRY_REPOS; the list is what the UI
// shows (a moved or deleted folder stays listed until removed) and holds a story folder chosen for this machine only,
// so a path of this machine never has to go into the repo file.
// Writes are read-modify-write without a lock: two commands registering at the same moment can drop one entry, and
// the next command run in that repo adds it back.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { paths, splitList } from './paths.mjs';
import { gitRoot, repoName, realOr } from './repo.mjs';
import { writeAtomic } from './install.mjs';
import * as Ledger from './ledger.mjs';

/**
 * @typedef {object} ProjectEntry
 * @property {string} name        project name when last seen (shown when the folder is gone)
 * @property {string|null} added  when it was added (ISO)
 * @property {string} [box]       absolute story folder chosen for this machine; wins over the repo and user config
 */
/** @typedef {{version: 1, projects: Record<string, ProjectEntry>}} ProjectList */

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

/** Short stable id of a project (hash of its root), used by the web UI and the local measures. @param {string} root */
export const projectId = (root) => crypto.createHash('sha256').update(path.resolve(root)).digest('hex').slice(0, 10);

/** @param {NodeJS.ProcessEnv} [env] */
export const listFile = (env = process.env) => paths(env).projects;

function broken(file, why) {
  const e = new Error(`danh sách dự án hỏng ${file}: ${why}`);
  e.exitCode = 1;
  e.fix = `sửa tay hoặc xoá ${file} (momentry tạo lại từ sổ phiên)`;
  return e;
}

/** Checks a parsed file and normalises it; entries that cannot be a project are left out. */
function normalise(v, file) {
  if (!isObj(v) || (v.projects !== undefined && !isObj(v.projects))) throw broken(file, 'phải là object {"projects": {...}}');
  /** @type {ProjectList} */
  const list = { version: 1, projects: {} };
  for (const [root, e] of Object.entries(v.projects ?? {})) {
    if (!path.isAbsolute(root) || !isObj(e)) continue;
    const key = path.resolve(root);
    /** @type {ProjectEntry} */
    const entry = { name: typeof e.name === 'string' && e.name ? e.name : repoName(key), added: typeof e.added === 'string' ? e.added : null };
    if (e.box !== undefined) {
      if (typeof e.box !== 'string' || !e.box.trim()) throw broken(file, `box của ${root} phải là đường dẫn`);
      entry.box = path.resolve(key, e.box);
    }
    list.projects[key] = entry;
  }
  return list;
}

/**
 * The list as it is on disk, without changing anything. Null when there is no file yet; throws on a broken file.
 * @param {NodeJS.ProcessEnv} [env] @returns {ProjectList|null}
 */
export function read(env = process.env) {
  const file = listFile(env);
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw broken(file, e.message);
  }
  let v;
  try { v = JSON.parse(text); } catch (e) { throw broken(file, e.message); }
  return normalise(v, file);
}

function save(env, list) {
  const file = listFile(env);
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  writeAtomic(file, `${JSON.stringify(list, null, 2)}\n`, 0o600);
}

/**
 * The list, created on first use from what an older install already knows: the repos of the sessions in the ledger
 * and MOMENTRY_REPOS (folders that still exist). Created once; a project removed later is not brought back.
 * @param {NodeJS.ProcessEnv} [env] @returns {ProjectList}
 */
export function load(env = process.env) {
  const have = read(env);
  if (have) return have;
  /** @type {ProjectList} */
  const list = { version: 1, projects: {} };
  const added = new Date().toISOString();
  const add = (p) => {
    const r = typeof p === 'string' && p && fs.existsSync(p) ? gitRoot(p) : null;
    if (r && !find(list, r)) list.projects[path.resolve(r)] = { name: repoName(r), added };
  };
  let sessions = {};
  try { sessions = Ledger.load(paths(env).cache).sessions; } catch { /* unreadable ledger: nothing to bring over */ }
  for (const s of Object.values(sessions)) add(s?.repoRoot);
  for (const p of splitList(env.MOMENTRY_REPOS)) add(p);
  save(env, list);
  return list;
}

/**
 * The entry of a repo root (same path, or the same real path), with its key as `root`; null if not listed.
 * @param {ProjectList|null} list @param {string} root @returns {(ProjectEntry & {root: string})|null}
 */
export function find(list, root) {
  if (!list || !root) return null;
  const key = path.resolve(root);
  if (list.projects[key]) return { ...list.projects[key], root: key };
  const real = realOr(key);
  for (const [r, e] of Object.entries(list.projects)) if (realOr(r) === real) return { ...e, root: r };
  return null;
}

/** Story folder chosen for this machine for a repo root, or null. Throws on a broken list. */
export function boxOf(env, root) {
  return find(read(env), root)?.box ?? null;
}

function update(env, root, change) {
  const list = load(env);
  const key = find(list, root)?.root ?? path.resolve(root);
  const before = list.projects[key];
  const next = change({ name: repoName(key), added: new Date().toISOString(), ...before });
  if (JSON.stringify(next) !== JSON.stringify(before)) {
    list.projects[key] = next;
    save(env, list);
  }
  return next;
}

/**
 * Adds a project, or refreshes its name; writes only when something changed.
 * @param {NodeJS.ProcessEnv} env @param {string} root @param {{name?: string|null}} [o] @returns {ProjectEntry}
 */
export function remember(env, root, { name } = {}) {
  return update(env, root, (e) => ({ ...e, name: name || e.name }));
}

/**
 * Sets (absolute path) or clears (null) the story folder chosen for this machine; adds the project if needed.
 * @param {NodeJS.ProcessEnv} env @param {string} root @param {string|null} box @returns {ProjectEntry}
 */
export function setBox(env, root, box) {
  if (box !== null && (typeof box !== 'string' || !path.isAbsolute(box))) throw new TypeError('box must be an absolute path or null');
  return update(env, root, ({ box: _old, ...e }) => (box ? { ...e, box: path.resolve(box) } : e));
}

/** Removes a project from the list; true if it was there. @param {NodeJS.ProcessEnv} env @param {string} root */
export function forget(env, root) {
  const list = read(env);
  const hit = find(list, root);
  if (!hit) return false;
  delete list.projects[hit.root];
  save(env, list);
  return true;
}
