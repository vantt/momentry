// Who a project is, on every machine (docs/prd.md "Danh tính dự án").
//
// Two ids, both 10 hex characters:
// - checkout id: hash of the repo root path. A folder on this machine: the web UI's URLs and its per-viewer state
//   (<cache>/ui-state.json) use it, so two checkouts of one repo on one machine stay two rows, and nothing in it is
//   ever merged across machines.
// - project id: hash of the repo's root commit (the oldest commit, the same in every clone, whatever the folder,
//   name or remote). What may later be gathered from several machines is keyed by it: taste events (<cache>/taste.json),
//   measures (<cache>/metrics.json) and the project profile file. A repo without a commit yet, a shallow clone (its
//   oldest commit is not the root), or a folder git cannot read falls back to the checkout id.
//
// The project id of a root is kept in <cache>/project-ids.json with the identity of its `.git` (device and inode), so
// a later call costs one stat and one small read instead of a git process. A fallback is looked up again every time,
// so a first commit is noticed at once.
//
// Moving data: an older install keyed everything by the path hash. The first time a write-side caller (one that knows
// the story folder) asks for the id of a root, data still under the path hash, or under an earlier fallback id of
// that root, is moved to the new id: project ids and story refs in taste.json and metrics.json. Profile files are moved
// by lib/project-profile.mjs. An id that came from another root commit is never moved: that is another repository
// that once lived at the same path.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { writeAtomic } from './install.mjs';
import { storyRef } from './metrics.mjs';
import { readBox } from './box.mjs';

export const FILE = 'project-ids.json';
export const ID_RE = /^[0-9a-f]{10}$/;

/** @typedef {{id: string, from: 'git'|'path', git: string}} IdEntry  git: device:inode of `<root>/.git` */

const hash = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 10);
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

/** Id of one checkout on this machine (hash of the root path): web UI URLs and per-viewer state. @param {string} root */
export const checkoutId = (root) => hash(path.resolve(root));

/** Git variables that would point git at another repository than `-C root`. */
const GIT_REDIRECTS = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY', 'GIT_COMMON_DIR', 'GIT_NAMESPACE'];

function git(root, args) {
  const env = { ...process.env };
  for (const k of GIT_REDIRECTS) delete env[k];
  // a broken `.git` in root must not make git use a repository above it
  env.GIT_CEILING_DIRECTORIES = path.dirname(root);
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000, windowsHide: true, env });
}

/**
 * The root commit of the repo at `root` (the smallest sha when history has several), or null: no commit yet, a
 * shallow clone, not a repository, or no git.
 * @param {string} root @returns {string|null}
 */
export function rootCommit(root) {
  try {
    if (git(root, ['rev-parse', '--is-shallow-repository']).trim() === 'true') return null;
    const shas = git(root, ['rev-list', '--max-parents=0', 'HEAD']).split('\n').map((s) => s.trim()).filter((s) => /^[0-9a-f]{40,64}$/.test(s)).sort();
    return shas[0] ?? null;
  } catch { return null; }
}

/** Device and inode of `<root>/.git` (a new clone or worktree at the same path gets a new one), or null. */
function gitStamp(root) {
  try {
    const st = fs.statSync(path.join(root, '.git'), { bigint: true });
    return `${st.dev}:${st.ino}`;
  } catch { return null; }
}

/** @param {string} cacheDir @returns {Record<string, IdEntry>} */
function loadIds(cacheDir) {
  let v;
  try { v = JSON.parse(fs.readFileSync(path.join(cacheDir, FILE), 'utf8')); } catch { return {}; }
  const out = {};
  for (const [root, e] of Object.entries(isObj(v?.roots) ? v.roots : {})) {
    if (isObj(e) && ID_RE.test(e.id) && (e.from === 'git' || e.from === 'path') && typeof e.git === 'string') out[root] = { id: e.id, from: e.from, git: e.git };
  }
  return out;
}

function saveIds(cacheDir, roots) {
  fs.mkdirSync(cacheDir, { recursive: true, mode: 0o700 });
  writeAtomic(path.join(cacheDir, FILE), `${JSON.stringify({ version: 1, roots }, null, 2)}\n`, 0o600);
}

/** The id of `root` worked out now. @returns {IdEntry} */
function resolve(root) {
  const sha = rootCommit(root);
  return sha ? { id: hash(`git-root:${sha}`), from: 'git', git: gitStamp(root) ?? '' } : { id: checkoutId(root), from: 'path', git: gitStamp(root) ?? '' };
}

/**
 * The project id of a repo root (see the top of this file).
 * - no `cacheDir`: worked out every time (a git process);
 * - `cacheDir`: the kept id when `.git` is the same as when it was kept; otherwise worked out, and nothing written;
 * - `cacheDir` and `box`: as above, and a new or changed id is kept, after moving the data of the root's earlier id
 *   (story refs of the stories in `box`).
 * @param {string} root @param {{cacheDir?: string|null, box?: string|null}} [o] @returns {string}
 */
export function projectId(root, { cacheDir = null, box = null } = {}) {
  const key = path.resolve(root);
  if (!cacheDir) return resolve(key).id;
  const roots = loadIds(cacheDir);
  const kept = roots[key];
  const stamp = gitStamp(key);
  if (kept && (stamp === null || (kept.from === 'git' && kept.git === stamp))) return kept.id; // folder gone: the last id known
  if (!kept && stamp === null) return checkoutId(key);
  const now = resolve(key);
  if (!box) return now.id;
  if (kept && kept.id === now.id && kept.git === now.git && kept.from === now.from) return now.id;
  // data under the path hash (older installs) or an earlier fallback of this root moves; another root commit does not
  const before = kept ? (kept.from === 'path' ? kept.id : null) : checkoutId(key);
  if (before && before !== now.id) moveData(cacheDir, before, now.id, box);
  saveIds(cacheDir, { ...loadIds(cacheDir), [key]: now });
  return now.id;
}

/** Drops what is kept for a root (its project is being removed from this machine). @param {string} cacheDir @param {string} root */
export function forgetRoot(cacheDir, root) {
  const roots = loadIds(cacheDir);
  const key = path.resolve(root);
  if (!roots[key]) return false;
  delete roots[key];
  saveIds(cacheDir, roots);
  return true;
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

/**
 * Moves every record of project `from` to project `to` in taste.json and metrics.json: the project id, and the story
 * ref of each story now in `box` (a story ref hashes `<project id>/<story id>`). Refs of stories no longer in the box
 * stay as they are (still one ref per story). Files keep mode 0600; a file that does not parse is left alone (its
 * own reader treats it as empty). Running it again changes nothing.
 * @param {string} cacheDir @param {string} from @param {string} to @param {string} box
 * @returns {{taste: number, metrics: number}} records moved
 */
export function moveData(cacheDir, from, to, box) {
  const refs = new Map();
  for (const s of readBox(box)) refs.set(storyRef(`${from}/${s.id}`), storyRef(`${to}/${s.id}`));
  const moveRecords = (list) => {
    let n = 0;
    for (const x of Array.isArray(list) ? list : []) {
      if (!isObj(x) || x.project !== from) continue;
      x.project = to;
      if (typeof x.story === 'string' && refs.has(x.story)) x.story = refs.get(x.story);
      n++;
    }
    return n;
  };
  const out = { taste: 0, metrics: 0 };
  const tasteFile = path.join(cacheDir, 'taste.json');
  const t = readJson(tasteFile);
  if (isObj(t) && (out.taste = moveRecords(t.events))) writeAtomic(tasteFile, `${JSON.stringify(t)}\n`, 0o600);
  const metricsFile = path.join(cacheDir, 'metrics.json');
  const m = readJson(metricsFile);
  if (isObj(m)) {
    out.metrics = moveRecords(m.marks);
    const firsts = isObj(m.firstStories) ? m.firstStories : null;
    if (firsts?.[from]) {
      // the earlier of the two first stories is the first
      const a = firsts[from], b = firsts[to];
      if (!b || !(Date.parse(b.at) <= Date.parse(a.at))) firsts[to] = a;
      delete firsts[from];
      out.metrics++;
    }
    if (out.metrics) writeAtomic(metricsFile, `${JSON.stringify(m)}\n`, 0o600);
  }
  return out;
}
