// Local measures, kept in one small file in the cache dir (<cache>/metrics.json) and never sent anywhere:
//   - when momentry was installed on this machine, and when the first story found by momentry landed in a box,
//     so the time from install to the first story can be told;
//   - each Use / Later / Drop decision with the rank the story had on the wall at that moment, so the share of top-5
//     stories the user decides to use can be told.
// The file holds no titles, ids or paths: projects are hashed ids (as in the web UI) and stories a hash of their key.
// Every record carries `private` (the project was in private mode when it happened), so a number that may be shared
// later can leave those projects out (`measures(m, {excludePrivate: true})`).
// Writes are read-modify-write without a lock, like projects.json: two decisions in the same instant can drop one.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { paths } from './paths.mjs';
import { writeAtomic } from './install.mjs';

export const FILE = 'metrics.json';
/** Decisions kept (oldest dropped first); a story counts once (its latest decision), so this bounds the file. */
export const MAX_MARKS = 1000;
/** Decided top-5 stories needed before the Use rate is shown. */
export const MIN_TOP5 = 10;
export const TOP = 5;
/** Decision states; `open` = undecided again (Undo, restore, un-later). */
export const STATES = ['use', 'later', 'drop', 'open'];

/**
 * @typedef {object} Metrics
 * @property {1} version
 * @property {{at: string|null, known: boolean, via: 'install'|'init', noted: string}|null} install
 *   known: false when momentry was already in use before measuring began (its install time is not on record)
 * @property {Record<string, {at: string, private: boolean}>} firstStories  per project id: first story found by momentry
 * @property {{at: string, project: string, story: string, state: string, rank: number|null, of: number, private: boolean}[]} marks
 */

const empty = () => ({ version: 1, install: null, firstStories: {}, marks: [] });
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const isTime = (v) => typeof v === 'string' && !Number.isNaN(Date.parse(v));

/** Hash of a story key (`<project id>/<story id>`): stable, without the title words the story id carries. */
export const storyRef = (key) => crypto.createHash('sha256').update(String(key)).digest('hex').slice(0, 12);

/** The file's content, normalised; a missing or unreadable file reads as empty. @param {string} cacheDir @returns {Metrics} */
export function load(cacheDir) {
  let v;
  try { v = JSON.parse(fs.readFileSync(path.join(cacheDir, FILE), 'utf8')); } catch { return empty(); }
  if (!isObj(v)) return empty();
  const m = empty();
  const i = v.install;
  if (isObj(i) && typeof i.known === 'boolean' && isTime(i.noted) && (i.known ? isTime(i.at) : i.at === null)) {
    m.install = { at: i.at, known: i.known, via: i.via === 'init' ? 'init' : 'install', noted: i.noted };
  }
  for (const [p, f] of Object.entries(isObj(v.firstStories) ? v.firstStories : {})) {
    if (/^[0-9a-f]{10}$/.test(p) && isObj(f) && isTime(f.at)) m.firstStories[p] = { at: f.at, private: f.private === true };
  }
  for (const x of Array.isArray(v.marks) ? v.marks : []) {
    if (!isObj(x) || !isTime(x.at) || !STATES.includes(x.state) || typeof x.project !== 'string' || typeof x.story !== 'string') continue;
    const rank = Number.isInteger(x.rank) && x.rank > 0 ? x.rank : null;
    m.marks.push({ at: x.at, project: x.project, story: x.story, state: x.state, rank, of: Number.isInteger(x.of) ? x.of : 0, private: x.private === true });
  }
  m.marks = m.marks.slice(-MAX_MARKS);
  return m;
}

function save(cacheDir, m) {
  fs.mkdirSync(cacheDir, { recursive: true, mode: 0o700 });
  writeAtomic(path.join(cacheDir, FILE), `${JSON.stringify(m)}\n`, 0o600);
}

/** Signs that momentry ran on this machine before: its session ledger, UI state or project list. */
function usedBefore(env) {
  const p = paths(env);
  return ['ledger.json', 'ui-state.json'].some((f) => fs.existsSync(path.join(p.cache, f))) || fs.existsSync(p.projects);
}

/**
 * Records the install time once. `fresh`: the caller knows this is a first install (no install marker before).
 * A machine that already used momentry gets `known: false` and no time: its real install time is not on record,
 * and the time of this update or `init` would understate the wait for the first story.
 * @param {NodeJS.ProcessEnv} env @param {{fresh: boolean, via: 'install'|'init', now?: Date}} o
 * @returns {Metrics['install']} what is on record after the call
 */
export function noteInstall(env, { fresh, via, now = new Date() }) {
  const cacheDir = paths(env).cache;
  const m = load(cacheDir);
  if (m.install) return m.install;
  const known = fresh && !usedBefore(env);
  m.install = { at: known ? now.toISOString() : null, known, via, noted: now.toISOString() };
  save(cacheDir, m);
  return m.install;
}

/**
 * Records the first story momentry found for a project (notes typed by the user do not count).
 * @param {string} cacheDir @param {{project: string, private: boolean, capturedBy?: string|null, now?: Date}} o
 */
export function noteStory(cacheDir, { project, private: priv, capturedBy, now = new Date() }) {
  if (capturedBy === 'human') return;
  const m = load(cacheDir);
  if (m.firstStories[project]) return;
  m.firstStories[project] = { at: now.toISOString(), private: !!priv };
  save(cacheDir, m);
}

/**
 * Records a decision on a story with the rank it had when the user decided.
 * @param {string} cacheDir
 * @param {{project: string, key: string, state: string, rank: number|null, of: number, private: boolean, now?: Date}} o
 */
export function noteMark(cacheDir, { project, key, state, rank, of, private: priv, now = new Date() }) {
  if (!STATES.includes(state)) throw new TypeError(`unknown decision state: ${state}`);
  const m = load(cacheDir);
  m.marks.push({ at: now.toISOString(), project, story: storyRef(key), state, rank: Number.isInteger(rank) && rank > 0 ? rank : null, of, private: !!priv });
  m.marks = m.marks.slice(-MAX_MARKS);
  save(cacheDir, m);
}

/**
 * The two numbers, from what is on record.
 * - Time to first story: from the install time to the earliest first story of any project. Unknown when the
 *   install time is not on record; `waiting` until a story arrives.
 * - Top-5 Use rate: every story's latest decision counts once; among stories whose latest decision is Use, Later or
 *   Drop and that were ranked 1–5 on the wall when it was made, the share decided Use. Shown from MIN_TOP5 such
 *   stories on; `rate` is null below that.
 * @param {Metrics} m
 * @param {{excludePrivate?: boolean, privateProjects?: Iterable<string>}} [o]  excludePrivate: leave out records made
 *   in private mode and projects in `privateProjects` (project ids in private mode now)
 */
export function measures(m, { excludePrivate = false, privateProjects = [] } = {}) {
  const hidden = new Set(privateProjects);
  const keep = (project, priv) => !excludePrivate || (!priv && !hidden.has(project));

  const install = m.install ? { known: m.install.known, at: m.install.at } : { known: false, at: null };
  const firsts = Object.entries(m.firstStories).filter(([p, f]) => keep(p, f.private)).map(([, f]) => f.at).sort();
  const first = firsts[0] ?? null;
  let firstStory;
  if (!install.known) firstStory = { state: 'unknown', at: first, seconds: null };
  else if (!first) firstStory = { state: 'waiting', at: null, seconds: null };
  else firstStory = { state: 'measured', at: first, seconds: Math.max(0, Math.round((Date.parse(first) - Date.parse(install.at)) / 1000)) };

  const latest = new Map();
  for (const x of m.marks) if (keep(x.project, x.private)) latest.set(`${x.project}/${x.story}`, x);
  const n = { use: 0, later: 0, drop: 0 };
  for (const x of latest.values()) if (x.state !== 'open' && x.rank !== null && x.rank <= TOP) n[x.state]++;
  const decided = n.use + n.later + n.drop;
  const enough = decided >= MIN_TOP5;
  return { install, firstStory, top5: { ...n, decided, needed: MIN_TOP5, enough, rate: enough ? n.use / decided : null } };
}

/** Measures read from the cache dir of `env` (local view: private projects included). @param {NodeJS.ProcessEnv} env */
export const localMeasures = (env) => measures(load(paths(env).cache));
