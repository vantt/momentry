// What the user does with stories, with the story's features at that moment, kept in one small file in the cache
// dir (<cache>/taste.json) and never sent anywhere. It is the record a ranking that follows the user's own taste can
// later learn from, and what `momentry taste` and the Health screen count today.
// The file holds features only: no title, hook, angle text, section text, story id or path. Projects are project ids
// (lib/project-id.mjs, the same on every machine), stories a hash of their key (lib/metrics.mjs storyRef), and every
// free-text-like feature is mapped onto a fixed list (unknown values become `other`), so a story's words cannot reach
// the file.
// Every record carries `private` (the project was in private mode when it happened), so a number that may be shared
// later can leave those projects out (`measures(t, {excludePrivate: true})`), as lib/metrics.mjs does.
// Writes are read-modify-write without a lock, like metrics.json: two events in the same instant can drop one.
import fs from 'node:fs';
import path from 'node:path';
import { writeAtomic } from './install.mjs';
import { FEATURES, explain, defaultTable } from './rank.mjs';
import { VOCAB } from './vocab.mjs';
import { CAPTURED_BY, HIT_BY } from './box.mjs';
import { storyRef, MIN_TOP5, TOP } from './metrics.mjs';

export const FILE = 'taste.json';
export const VERSION = 1;
/** Events kept (oldest dropped first); bounds the file to a few hundred KB. */
export const MAX_EVENTS = 2000;
export { MIN_TOP5, TOP };

/** Decisions: Use / Later / Drop / back to undecided (`open`), and the two later stages a used story moves to. */
export const DECISIONS = Object.freeze(['use', 'later', 'drop', 'open', 'drafted', 'published']);
/** Decisions that count as using the story. */
export const USED = Object.freeze(['use', 'drafted', 'published']);
/** Angle check on a story page: tells as a story / true but no story / has details the session does not have. */
export const VERDICTS = Object.freeze(['tellable', 'no-story', 'invented']);
/** "Clear after reading, no need to ask more?" */
export const ANSWERS = Object.freeze(['yes', 'no']);
/** Parts of a story the user can rewrite: the text the model wrote. */
export const EDIT_FIELDS = Object.freeze(['title', 'hook', 'angle', 'context', 'what', 'lesson', 'artefact', 'outsider']);
/**
 * Event kinds. `edit`: the user rewrote a part (value: the field). `verdict`: angle check (value: a VERDICTS id, null
 * when taken back). `understood`: the second angle question (value: yes/no/null). `missed`: the user wrote the story
 * by hand (quick note, momentry-bip), so momentry had not found it.
 */
export const EVENTS = Object.freeze([...DECISIONS, 'edit', 'verdict', 'understood', 'missed']);
const VALUES = { edit: EDIT_FIELDS, verdict: VERDICTS, understood: ANSWERS };
/** Agent hosts a session id may start with (`claude:1a2b3c4d`). */
const HOSTS = ['claude', 'codex', 'pi', 'omp', 'agy'];

const TENSIONS = new Set(VOCAB.tensions.map((t) => t.id));
const SIGNALS = new Set(VOCAB.signals.map((s) => s.id));

/**
 * @typedef {{tension: string|null, stakes: number|null, strength: number|null, hits: number|null,
 *   completeness: number|null, outsider_only: boolean, has_angle: boolean, signals: string[], hit_by: string[],
 *   captured_by: string|null, host: string|null, tier: string|null}} Features
 * @typedef {{at: string, project: string, story: string, event: string, value: string|null, rank: number|null,
 *   of: number|null, base: number|null, private: boolean, features: Features}} TasteEvent
 *   rank: place on the wall as shown; base: place in the default order (no taste), which personal ranking learns on
 * @typedef {{version: 1, events: TasteEvent[]}} Taste
 */

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const isTime = (v) => typeof v === 'string' && !Number.isNaN(Date.parse(v));
const posInt = (v) => (Number.isInteger(v) && v > 0 ? v : null);
const int = (v) => (Number.isInteger(v) ? v : null);
const known = (v, list) => (v === null || v === undefined || v === '' ? null : list.has(v) ? v : 'other');
const ID = /^[a-z][a-z0-9_]*$/;

/**
 * Features of a story's frontmatter, computed with the ranking's own feature code (lib/rank.mjs FEATURES), plus the
 * agent host of its first session and the rank tier it sits in. Tension, signals, hit_by and captured_by are mapped
 * onto their fixed lists.
 * @param {Record<string, any>|null|undefined} data @param {import('./rank.mjs').RankTable} [table] @returns {Features}
 */
export function snapshot(data, table = defaultTable()) {
  const d = isObj(data) ? data : {};
  const f = (name) => FEATURES[name].get(d);
  const sessions = Array.isArray(d.sessions) ? d.sessions : [];
  const host = typeof sessions[0] === 'string' && sessions[0].includes(':') ? sessions[0].split(':')[0] : null;
  let tier = null;
  try { tier = explain({ id: '', data: d }, table).tier?.id ?? null; } catch { /* a broken table never blocks a record */ }
  return clean({
    tension: f('tension'), stakes: f('stakes'), strength: f('strength'), hits: f('hits'), completeness: f('completeness'),
    outsider_only: f('outsider_only'), has_angle: f('has_angle'), signals: f('signals'), hit_by: f('hit_by'),
    captured_by: f('captured_by'), host, tier,
  });
}

/** Features with every value on its fixed list or of its type; used on write and on read. @returns {Features} */
function clean(x) {
  const v = isObj(x) ? x : {};
  const set = (xs, list) => [...new Set((Array.isArray(xs) ? xs : []).filter((s) => typeof s === 'string' && s).map((s) => (list.has(s) ? s : 'other')))].sort();
  return {
    tension: known(typeof v.tension === 'string' ? v.tension : null, TENSIONS),
    stakes: int(v.stakes), strength: int(v.strength), hits: int(v.hits), completeness: int(v.completeness),
    outsider_only: v.outsider_only === true, has_angle: v.has_angle === true,
    signals: set(v.signals, SIGNALS), hit_by: set(v.hit_by, new Set(HIT_BY)),
    captured_by: known(typeof v.captured_by === 'string' ? v.captured_by : null, new Set(CAPTURED_BY)),
    host: known(typeof v.host === 'string' ? v.host : null, new Set(HOSTS)),
    // a tier id is a rule id of the shipped table (a-z0-9_), never story text
    tier: typeof v.tier === 'string' && ID.test(v.tier) && v.tier.length <= 64 ? v.tier : null,
  };
}

const empty = () => ({ version: VERSION, events: [] });

/** The file's content, normalised; a missing or unreadable file reads as empty. @param {string} cacheDir @returns {Taste} */
export function load(cacheDir) {
  let v;
  try { v = JSON.parse(fs.readFileSync(path.join(cacheDir, FILE), 'utf8')); } catch { return empty(); }
  if (!isObj(v) || v.version !== VERSION) return empty();
  const t = empty();
  for (const x of Array.isArray(v.events) ? v.events : []) {
    if (!isObj(x) || !isTime(x.at) || !EVENTS.includes(x.event) || typeof x.project !== 'string' || typeof x.story !== 'string') continue;
    const value = VALUES[x.event]?.includes(x.value) ? x.value : null;
    if (x.event === 'edit' && value === null) continue;
    t.events.push({ at: x.at, project: x.project, story: x.story, event: x.event, value, rank: posInt(x.rank), of: posInt(x.of), base: posInt(x.base), private: x.private === true, features: clean(x.features) });
  }
  t.events = t.events.slice(-MAX_EVENTS);
  return t;
}

function save(cacheDir, t) {
  fs.mkdirSync(cacheDir, { recursive: true, mode: 0o700 });
  writeAtomic(path.join(cacheDir, FILE), `${JSON.stringify(t)}\n`, 0o600);
}

/**
 * Records one event with the story's features at that moment. Throws on an unknown event or value (a caller bug);
 * callers wrap it so a failed record never blocks what the user did.
 * @param {string} cacheDir
 * @param {{project: string, key: string, event: string, value?: string|null, rank?: number|null, of?: number|null,
 *   base?: number|null, private: boolean, data: Record<string, any>, table?: import('./rank.mjs').RankTable, now?: Date}} o
 *   key: `<project id>/<story id>`, stored hashed
 */
export function note(cacheDir, { project, key, event, value = null, rank = null, of = null, base = null, private: priv, data, table, now = new Date() }) {
  if (!EVENTS.includes(event)) throw new TypeError(`unknown taste event: ${event}`);
  if (VALUES[event] ? !(VALUES[event].includes(value) || (value === null && event !== 'edit')) : value !== null) throw new TypeError(`bad value for ${event}: ${value}`);
  const t = load(cacheDir);
  t.events.push({ at: now.toISOString(), project: String(project), story: storyRef(key), event, value, rank: posInt(rank), of: posInt(of), base: posInt(base), private: !!priv, features: snapshot(data, table) });
  t.events = t.events.slice(-MAX_EVENTS);
  save(cacheDir, t);
}

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/**
 * What the record says about the user's taste.
 * - Per story, the latest decision counts. Drafted and published count as Use. The rank that counts is the one the
 *   story had when its decision last changed (moving a used story on to drafted keeps the rank it was used at).
 * - top5: among stories whose decision is Use, Later or Drop and that were ranked 1–5 then, how many were used.
 *   Shown from MIN_TOP5 such stories on (`enough`); `needed` says how many more decisions that takes.
 * - meanUsedRank: the mean rank of used stories, null until `enough`.
 * - features: for stories decided Use or Drop, counts per tension and per signal, and the mean stakes of each side,
 *   from the features the story had at its latest decision.
 * - missed: stories the user wrote by hand; edits: rewrites per field; verdicts: latest angle check per story.
 * @param {Taste} t
 * @param {{excludePrivate?: boolean, privateProjects?: Iterable<string>, project?: string|null}} [o]
 *   excludePrivate: leave out records made in private mode and projects in `privateProjects` (project ids in private
 *   mode now); project: only this project id
 */
export function measures(t, { excludePrivate = false, privateProjects = [], project = null } = {}) {
  const hidden = new Set(privateProjects);
  const keep = (x) => (!project || x.project === project) && (!excludePrivate || (!x.private && !hidden.has(x.project)));
  const stories = new Map();
  const edits = Object.fromEntries(EDIT_FIELDS.map((f) => [f, 0]));
  const missed = new Set();
  let editCount = 0;
  for (const x of t.events) {
    if (!keep(x)) continue;
    const k = `${x.project}/${x.story}`;
    if (!stories.has(k)) stories.set(k, { state: null, rank: null, features: x.features, verdict: null, understood: null });
    const s = stories.get(k);
    if (DECISIONS.includes(x.event)) {
      s.features = x.features;
      const state = USED.includes(x.event) ? 'use' : x.event;
      if (state !== s.state) s.rank = x.rank;
      s.state = state;
    } else if (x.event === 'edit') { edits[x.value]++; editCount++; } else if (x.event === 'verdict') s.verdict = x.value;
    else if (x.event === 'understood') s.understood = x.value;
    else if (x.event === 'missed') missed.add(k);
  }
  const all = [...stories.values()];
  const n = { use: 0, later: 0, drop: 0 };
  for (const s of all) if (s.state && s.state !== 'open' && s.rank !== null && s.rank <= TOP) n[s.state]++;
  const decided = n.use + n.later + n.drop;
  const enough = decided >= MIN_TOP5;
  const usedRanks = all.filter((s) => s.state === 'use' && s.rank !== null).map((s) => s.rank);

  const used = all.filter((s) => s.state === 'use'), dropped = all.filter((s) => s.state === 'drop');
  const tally = (pick) => {
    const m = new Map();
    for (const [side, rows] of [['used', used], ['dropped', dropped]]) {
      for (const s of rows) for (const id of pick(s.features)) {
        if (!m.has(id)) m.set(id, { id, used: 0, dropped: 0 });
        m.get(id)[side]++;
      }
    }
    return [...m.values()].sort((a, b) => b.used + b.dropped - (a.used + a.dropped) || a.id.localeCompare(b.id));
  };
  const stakesOf = (rows) => mean(rows.map((s) => s.features.stakes).filter((v) => v !== null));
  const verdicts = Object.fromEntries(VERDICTS.map((v) => [v, 0]));
  const understood = { yes: 0, no: 0 };
  for (const s of all) {
    if (s.verdict) verdicts[s.verdict]++;
    if (s.understood) understood[s.understood]++;
  }
  return {
    top5: { ...n, decided, needed: MIN_TOP5, missing: Math.max(0, MIN_TOP5 - decided), enough, rate: enough ? n.use / decided : null },
    meanUsedRank: enough ? mean(usedRanks) : null,
    decisions: { used: used.length, dropped: dropped.length, later: all.filter((s) => s.state === 'later').length },
    features: {
      tension: tally((f) => [f.tension ?? 'unknown']),
      signals: tally((f) => (f.signals.length ? f.signals : ['none'])),
      stakes: { used: stakesOf(used), dropped: stakesOf(dropped) },
    },
    missed: missed.size,
    edits: { total: editCount, ...edits },
    verdicts: { ...verdicts, understood },
  };
}
