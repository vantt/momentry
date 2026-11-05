// Data behind the web UI. Every read and write goes through the modules the CLI uses (box, config, ledger,
// quarantine, privacy, doctor, hosts); this file only gathers and reshapes. Text returned here is plain English
// for people: no exit codes, no internal names.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { loadConfig, cacheDir as cacheDirOf, REPO_FILE } from './config.mjs';
import { readBox, readStory, titleOf, whatHappened, STATUSES, ID_RE } from './box.mjs';
import { stringify } from './frontmatter.mjs';
import { sortRanked } from './rank.mjs';
import { angleOf } from './angle.mjs';
import * as Ledger from './ledger.mjs';
import * as Metrics from './metrics.mjs';
import * as Projects from './projects.mjs';
import * as Q from './quarantine.mjs';
import * as P from './privacy.mjs';
import { gitRoot, repoName } from './repo.mjs';
import { splitList, paths } from './paths.mjs';
import { writeAtomic, selfCommand } from './install.mjs';
import { show as showConfig, write as writeConfig, privacyAdd, privacyNames, privacyRemove, setProjectBudget, setPrivateProject, setProjectBox, MACHINE } from './config-cmd.mjs';
import { describeSchema, SCHEMA } from './config-schema.mjs';
import { VERSION, ROOT } from './version.mjs';
import { sourceOf, addStory, noteFirstStory } from './pipeline.mjs';
import { localDate } from './story.mjs';
import * as claudeSrc from './sources/claude.mjs';
import * as codexSrc from './sources/codex.mjs';
import * as piSrc from './sources/pi.mjs';
import * as agySrc from './sources/agy.mjs';

const BIN = path.join(ROOT, 'bin', 'momentry.mjs');
const STATE_FILE = 'ui-state.json';
const oneLine = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const asList = (v) => (Array.isArray(v) ? v : v == null || v === '' ? [] : [v]);

/** A failure the UI shows as is: plain English, with an HTTP status. */
export class UiError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

// ---------- words people see ----------

/** The twist a story turns on, in plain words (never the internal tension code). */
export const TWISTS = {
  nho_ma_to: 'Tiny cause, big effect',
  giup_ma_hai: 'The help that hurt',
  tuong_ma_hoa_ra: 'Everyone thought otherwise',
  hop_ma_tan: 'Good parts, bad mix',
  cam_ma_van_lot: 'Blocked, yet it got through',
  it_ma_nhieu: 'Spent little, got a lot',
  khac: 'An unexpected turn',
};

/** Story status in plain words. */
export const STATUS_WORDS = { raw: 'New', picked: 'Picked', drafted: 'Drafted', published: 'Published', dropped: 'Dropped' };

/** Story sections: key, label in the file, label on screen. */
export const SECTIONS = [
  ['context', 'Bối cảnh', 'Context'],
  ['what', 'Chuyện gì xảy ra', 'What happened'],
  ['lesson', 'Bài học', 'Lesson'],
  ['artefact', 'Artefact', 'Artefact'],
  ['outsider', 'Góc người ngoài', 'How an outsider sees it'],
];

const HOST_WORDS = { claude: 'Claude Code', codex: 'Codex', pi: 'pi', omp: 'omp', agy: 'Antigravity' };

// ---------- projects ----------

export const { projectId } = Projects;

function hasRemote(root) {
  try { return /^\[remote /m.test(fs.readFileSync(path.join(root, '.git', 'config'), 'utf8')); } catch { return false; }
}

/**
 * Every project on the machine's project list (lib/projects.mjs; an older install's list is filled from its session
 * ledger on first read), plus the repo the UI was started from and repos in MOMENTRY_REPOS when they are not listed
 * yet, so they can be turned on. Projects keep their own box and config; nothing is mixed. A listed folder that is
 * gone stays in the list, marked `missing`, until it is removed. Observed first, missing last.
 * @param {{env: NodeJS.ProcessEnv, cwd: string}} o
 */
export function listProjects({ env, cwd }) {
  /** @type {import('./projects.mjs').ProjectList|null} */
  let list = null;
  try { list = Projects.load(env); } catch { /* broken list: each project shows the reason through its config */ }
  const roots = new Map(Object.entries(list?.projects ?? {}));
  for (const p of [cwd, ...splitList(env.MOMENTRY_REPOS)]) {
    const r = p && fs.existsSync(p) ? gitRoot(p) : null;
    if (r && !Projects.find(list, r)) roots.set(path.resolve(r), null);
  }
  return [...roots].map(([root, entry]) => projectInfo(root, env, entry))
    .sort((a, b) => Number(b.observed) - Number(a.observed) || Number(a.missing) - Number(b.missing) || a.name.localeCompare(b.name));
}

/** @param {string} root @param {NodeJS.ProcessEnv} env @param {import('./projects.mjs').ProjectEntry|null} [entry] */
function projectInfo(root, env, entry = null) {
  const base = { id: projectId(root), root, name: entry?.name ?? repoName(root), observed: false, paused: entry?.paused === true, missing: false, box: null, boxExists: false, error: null, remote: false };
  if (!fs.existsSync(path.join(root, '.git'))) {
    // moved, deleted, or no longer a git repository: nothing in the folder can be read
    const box = entry?.box ?? null;
    return { ...base, missing: true, box, boxExists: !!box && fs.existsSync(box), error: `The folder of this project is gone (${root}). If you moved it, open momentry in the new place to add it again.` };
  }
  base.remote = hasRemote(root);
  try {
    const cfg = loadConfig({ cwd: root, env });
    return { ...base, name: cfg.repo || base.name, observed: cfg.observed, paused: cfg.paused, box: cfg.box, boxExists: fs.existsSync(cfg.box), boxInRepo: !path.relative(root, cfg.box).startsWith('..') };
  } catch (e) {
    return { ...base, error: `The settings file of this project cannot be read: ${e.message}` };
  }
}

/** A listed project by id, as shown (may be missing or broken). */
function findProject(ctx, id) {
  const p = /^[0-9a-f]{10}$/.test(String(id)) ? listProjects(ctx).find((x) => x.id === id) : null;
  if (!p) throw new UiError('That project is not on this machine any more.', 404);
  return p;
}

/** @returns {{project: object, cfg: import('./config.mjs').Config}} */
function projectById(ctx, id) {
  const p = findProject(ctx, id);
  if (p.error) throw new UiError(p.error, 409);
  return { project: p, cfg: loadConfig({ cwd: p.root, env: ctx.env }) };
}

// ---------- per-viewer state (later, seen) ----------

export function loadState(env) {
  try {
    const v = JSON.parse(fs.readFileSync(path.join(cacheDirOf(env), STATE_FILE), 'utf8'));
    return { later: v.later ?? {}, seen: v.seen ?? {}, setupDone: !!v.setupDone };
  } catch { return { later: {}, seen: {}, setupDone: false }; }
}

function saveState(env, st) {
  const dir = cacheDirOf(env);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  writeAtomic(path.join(dir, STATE_FILE), `${JSON.stringify(st, null, 2)}\n`, 0o600);
}

// ---------- stories ----------

/** 1–3 stars from stakes × strength (each 0–3). */
export function starsOf(d) {
  const st = Number.isInteger(d.stakes) ? d.stakes : null;
  const sg = Number.isInteger(d.strength) ? d.strength : null;
  if (st === null || sg === null) return 1;
  const p = st * sg;
  return p >= 6 ? 3 : p >= 2 ? 2 : 1;
}

function cardOf(project, s, st) {
  const key = `${project.id}/${s.id}`;
  const d = s.data || {};
  return {
    key, id: s.id, project: project.id, projectName: project.name,
    title: titleOf(s.body) || s.id, summary: oneLine(whatHappened(s.body)).slice(0, 240),
    angle: angleOf(d), audience: angleOf(d) && typeof d.audience === 'string' ? oneLine(d.audience) || null : null,
    date: d.date ?? null, status: d.status ?? 'raw', statusWord: STATUS_WORDS[d.status ?? 'raw'] ?? d.status,
    signals: asList(d.signals).map(String), twist: TWISTS[d.tension] ?? null, stars: starsOf(d),
    threads: asList(d.threads).map(String), later: !!st.later[key], seen: !!st.seen[key],
    byHand: d.captured_by === 'human' || d.captured_by === 'live', error: s.error ? 'This story file has a formatting problem.' : null,
  };
}

/** Ranked cards of every observed project, best first. */
export function listStories(ctx) {
  const st = loadState(ctx.env);
  const rows = [];
  for (const p of listProjects(ctx)) {
    if (!p.observed || p.error || !p.boxExists) continue;
    for (const s of readBox(p.box)) rows.push({ id: s.id, data: s.data, card: cardOf(p, s, st) });
  }
  return personalize(sortRanked(rows)).map((r, i) => ({ ...r.card, rank: i + 1 }));
}

const USED = new Set(['picked', 'drafted', 'published']);
/** Labels needed before the wall starts to follow the user's own choices. */
export const MIN_LABELS = 3;

/**
 * Moves new stories toward the kind the user keeps using and away from the kind they drop, learned on this machine
 * from Use/Drop only (signals and twist). The machine order stays the base: a story moves at most a few places.
 * Decided stories keep their place. Nothing is sent anywhere.
 * @template {{data: Record<string, any>, card: any}} T @param {T[]} ranked @returns {T[]}
 */
export function personalize(ranked) {
  const used = ranked.filter((r) => USED.has(r.data.status));
  const dropped = ranked.filter((r) => r.data.status === 'dropped');
  if (used.length + dropped.length < MIN_LABELS) return ranked;
  const tally = (rows) => {
    const m = new Map();
    for (const r of rows) for (const k of [...asList(r.data.signals).map((x) => `s:${x}`), ...(r.data.tension && r.data.tension !== 'none' ? [`t:${r.data.tension}`] : [])]) m.set(k, (m.get(k) ?? 0) + 1);
    return m;
  };
  const plus = tally(used), minus = tally(dropped);
  const prefOf = (r) => {
    const keys = [...asList(r.data.signals).map((x) => `s:${x}`), ...(r.data.tension && r.data.tension !== 'none' ? [`t:${r.data.tension}`] : [])];
    const v = keys.reduce((a, k) => a + Math.sign((plus.get(k) ?? 0) - (minus.get(k) ?? 0)), 0);
    return Math.max(-2, Math.min(2, v));
  };
  const keyed = ranked.map((r, i) => {
    const pref = (r.data.status ?? 'raw') === 'raw' ? prefOf(r) : 0;
    return { r: { ...r, card: { ...r.card, forYou: pref > 0 } }, key: i - 1.5 * pref, i };
  });
  keyed.sort((a, b) => a.key - b.key || a.i - b.i);
  return keyed.map((k) => k.r);
}

/** Splits a body into its preamble and labelled segments (`**Label:** text`), keeping each segment's raw text. */
export function splitBody(body) {
  const re = /^\*\*([^*\n]+):\*\*[ \t]?/gm;
  const marks = [...String(body).matchAll(re)];
  if (!marks.length) return { pre: body, parts: [] };
  const parts = marks.map((m, i) => {
    const end = i + 1 < marks.length ? marks[i + 1].index : body.length;
    return { label: m[1].trim(), raw: body.slice(m.index, end), text: body.slice(m.index + m[0].length, end).trim() };
  });
  return { pre: body.slice(0, marks[0].index), parts };
}

function sectionsOf(body) {
  const { parts } = splitBody(body);
  const out = {};
  for (const [key, label] of SECTIONS) out[key] = parts.find((p) => p.label === label)?.text ?? '';
  return out;
}

/**
 * New body with one section replaced (empty text removes it), or the title line replaced. Other text is kept byte for byte.
 * @param {string} body @param {{title?: string, section?: string, text?: string}} edit
 */
export function editBody(body, edit) {
  if (edit.title !== undefined) {
    const t = oneLine(edit.title);
    if (!t) throw new UiError('A story needs a title.');
    return /^#\s+.+$/m.test(body) ? body.replace(/^#\s+.+$/m, `# ${t}`) : `\n# ${t}\n\n${body.replace(/^\n+/, '')}`;
  }
  const sec = SECTIONS.find(([k]) => k === edit.section);
  if (!sec) throw new UiError('Unknown part of the story.');
  const label = sec[1];
  const text = String(edit.text ?? '').trim();
  if (/^\*\*[^*\n]+:\*\*/m.test(text)) throw new UiError('A line cannot start with a bold label like **Note:**; that would split the story into a new part.');
  const { pre, parts } = splitBody(body);
  // keep the spacing the file already uses between parts (one newline, or a blank line)
  const gap = parts.some((p) => /\n\s*\n$/.test(p.raw)) ? '\n\n' : '\n';
  const at = parts.findIndex((p) => p.label === label);
  if (at >= 0) parts[at] = { ...parts[at], raw: text ? `**${label}:** ${text}${parts[at].raw.match(/\s*$/)[0] || '\n'}` : '' };
  else if (text) {
    const raw = `**${label}:** ${text}${gap}`;
    // insert before the first known section that comes after this one, else at the end
    const order = SECTIONS.map((s) => s[1]);
    const after = parts.findIndex((p) => order.indexOf(p.label) > order.indexOf(label));
    const item = { label, raw };
    if (after >= 0) parts.splice(after, 0, item); else {
      const last = parts.at(-1);
      if (last && !last.raw.endsWith('\n')) last.raw += '\n';
      if (last && gap === '\n\n' && !/\n\s*\n$/.test(last.raw)) last.raw += '\n';
      parts.push({ ...item, raw: raw.replace(/\s*$/, '\n') });
    }
  }
  let out = pre;
  if (parts.length && pre && !pre.endsWith('\n')) out += '\n';
  return out + parts.map((p) => p.raw).join('');
}

function storyFile(ctx, key) {
  const [pid, id, ...rest] = String(key).split('/');
  if (rest.length || !ID_RE.test(String(id))) throw new UiError('That story is not in the folder any more.', 404);
  const { project, cfg } = projectById(ctx, pid);
  const s = readStory(cfg.box, id);
  if (!s) throw new UiError('That story is not in the folder any more.', 404);
  if (s.error) throw new UiError('This story file has a formatting problem; open it in an editor to fix it.', 409);
  return { project, cfg, s };
}

/** Full story for the reader: sections, labels, links in the same project. */
export function getStory(ctx, key, { markSeen = true } = {}) {
  const { project, cfg, s } = storyFile(ctx, key);
  const st = loadState(ctx.env);
  if (markSeen && !st.seen[key]) { st.seen[key] = new Date().toISOString(); saveState(ctx.env, st); }
  const d = s.data;
  const links = asList(d.links).map(String).map((id) => {
    const t = ID_RE.test(id) ? readStory(cfg.box, id) : null;
    return { key: `${project.id}/${id}`, title: t && !t.error ? titleOf(t.body) || id : id, exists: !!t };
  });
  return {
    ...cardOf(project, s, st), sections: sectionsOf(s.body),
    sectionLabels: Object.fromEntries(SECTIONS.map(([k, , words]) => [k, words])),
    links, sessions: asList(d.sessions).map(String), lines: asList(d.lines).map(String),
    file: s.path, statuses: STATUSES.map((v) => ({ value: v, word: STATUS_WORDS[v] })),
    hasSource: asList(d.lines).length > 0,
  };
}

function writeStory(ctx, cfg, s, data, body) {
  const blocklist = P.loadBlocklist(cfg.privacy.sources, { env: ctx.env });
  if (blocklist) {
    const found = P.checkStory({ data, body }, s.id, blocklist, P.loadAllow(cfg.privacy.allowFile));
    if (found.length) throw new UiError(`Not saved: the text contains a name on your private list (${found.map((v) => P.mask(v.term)).join(', ')}). Reword it, or remove the name from the list in Privacy.`, 422);
  } else if (!cfg.privacy.allowUnchecked) {
    throw new UiError('Not saved: there is no private name list yet, so the text cannot be checked. Add names in Privacy first.', 409);
  }
  writeAtomic(s.path, stringify(data, body));
}

/** Edits the title or one section; the file stays a plain markdown file. */
export function editStory(ctx, key, edit) {
  const { cfg, s } = storyFile(ctx, key);
  const body = editBody(s.body, edit);
  if (body !== s.body) writeStory(ctx, cfg, s, s.data, body);
  return getStory(ctx, key, { markSeen: false });
}

/**
 * Use / Later / Drop and the status picker. use → picked, drop → dropped, restore → raw; later is kept on this
 * machine only (the story file does not change).
 */
export function markStory(ctx, key, action) {
  const st = loadState(ctx.env);
  const { project, cfg, s } = storyFile(ctx, key);
  const status = { use: 'picked', drop: 'dropped', restore: 'raw' }[action] ?? (STATUSES.includes(action) ? action : null);
  if (action !== 'later' && action !== 'unlater' && !status) throw new UiError('Unknown action.');
  const before = decisionOf(s.data.status, !!st.later[key]);
  const { rank, of } = wallRank(ctx, key);
  if (action === 'later') st.later[key] = new Date().toISOString();
  else if (action === 'unlater') delete st.later[key];
  if (status) {
    if (status !== 'raw' && status !== 'picked') delete st.later[key];
    if (s.data.status !== status) writeAtomic(s.path, stringify({ ...s.data, status }, s.body));
  }
  saveState(ctx.env, st);
  const after = decisionOf(status ?? s.data.status, !!st.later[key]);
  if (after !== before) {
    try { Metrics.noteMark(cfg.cacheDir, { project: project.id, key, state: after, rank, of, private: cfg.privateMode }); } catch { /* a measure never blocks a decision */ }
  }
  return getStory(ctx, key, { markSeen: false });
}

/** A story's decision: use (picked, drafted, published), drop, later, or open. */
const decisionOf = (status, later) => (USED.has(status) ? 'use' : status === 'dropped' ? 'drop' : later ? 'later' : 'open');

/**
 * Where a story sits on the wall as the Stories screen shows it by default (all projects, best first, dropped
 * stories hidden), before a decision changes anything. `of`: stories on that wall.
 */
function wallRank(ctx, key) {
  const wall = listStories(ctx).filter((c) => c.status !== 'dropped' || c.key === key);
  const i = wall.findIndex((c) => c.key === key);
  return { rank: i < 0 ? null : i + 1, of: wall.length };
}

/** Stories grouped by shared `threads`; a series needs at least two stories. */
export function listSeries(ctx) {
  const by = new Map();
  for (const c of listStories(ctx)) {
    for (const t of c.threads) {
      const k = `${c.project}/${t}`;
      if (!by.has(k)) by.set(k, { key: k, name: t, project: c.project, projectName: c.projectName, stories: [] });
      by.get(k).stories.push(c);
    }
  }
  return [...by.values()].filter((s) => s.stories.length > 1).map((s) => ({ ...s, title: s.name.replace(/[-_]+/g, ' ').replace(/^./, (c) => c.toUpperCase()), stories: s.stories.sort((a, b) => String(a.date).localeCompare(String(b.date))) }))
    .sort((a, b) => b.stories.length - a.stories.length || a.name.localeCompare(b.name));
}

const READERS = { claude: claudeSrc, codex: codexSrc, pi: piSrc, omp: piSrc, agy: agySrc };

/**
 * The conversation lines a story came from, read from the transcript on this machine (never stored or sent).
 * @returns {{sessions: {sid: string, host: string, available: boolean, entries: object[]}[]}}
 */
export function storySource(ctx, key) {
  const { s } = storyFile(ctx, key);
  const ledger = Ledger.load(cacheDirOf(ctx.env));
  const want = new Map();
  for (const ref of asList(s.data.lines).map(String)) {
    const m = /^(.+)#L(\d+)$/.exec(ref);
    if (!m) continue;
    if (!want.has(m[1])) want.set(m[1], []);
    want.get(m[1]).push(Number(m[2]));
  }
  const sessions = [];
  for (const [sid, lines] of want) {
    const host = HOST_WORDS[sid.split(':')[0]] ?? 'agent';
    const file = ledger.sessions[sid]?.transcriptPath;
    if (!file || !fs.existsSync(file)) { sessions.push({ sid, host, available: false, entries: [] }); continue; }
    const reader = READERS[sourceOf(file)] ?? claudeSrc;
    // a few lines of context around each marked line, merged into windows
    const wins = [];
    for (const L of [...new Set(lines)].sort((a, b) => a - b)) {
      const w = { from: Math.max(1, L - 2), to: L + 2 };
      const last = wins.at(-1);
      if (last && w.from <= last.to + 1) last.to = Math.max(last.to, w.to); else wins.push(w);
    }
    const marked = new Set(lines);
    const entries = [];
    for (const w of wins.slice(0, 40)) {
      let got = [];
      try { got = reader.readEntries(file, { fromLine: w.from, toLine: w.to }); } catch { got = []; }
      if (entries.length && got.length) entries.push({ gap: true });
      for (const e of got) {
        const text = String(e.text ?? '');
        entries.push({ L: e.L, kind: e.kind, name: e.name ?? null, marked: marked.has(e.L), text: text.length > 1500 ? `${text.slice(0, 1500)}…` : text });
      }
    }
    sessions.push({ sid, host, available: true, entries: entries.slice(0, 400) });
  }
  return { sessions };
}

// ---------- quick note ----------

export async function addNote(ctx, { project: pid, title, note }) {
  const { cfg } = projectById(ctx, pid);
  if (!cfg.observed) throw new UiError('Turn this project on first.');
  if (!oneLine(title) && !oneLine(note)) throw new UiError('Write a title or a few words about what happened.');
  const r = await addStory({ cfg, title: oneLine(title) || undefined, note: String(note ?? '').trim(), by: 'human', env: ctx.env });
  if (r.where === 'box') return { saved: true, key: `${pid}/${r.id}`, message: 'Saved to your wall.' };
  if (r.where === 'quarantine') {
    return { saved: false, held: true, message: r.exitCode === 3
      ? 'Held back on this machine: there is no private name list yet, so it could not be checked. Add names in Privacy, then release it.'
      : 'Held back on this machine: it contains a name on your private list. You can find it in Privacy.' };
  }
  throw new UiError('The note could not be saved.');
}

// ---------- privacy ----------

export function privacyView(ctx) {
  const projects = listProjects(ctx).filter((p) => p.observed && !p.error);
  const { file, names } = privacyNames(ctx);
  let ledger = { sessions: {} };
  try { ledger = Ledger.load(cacheDirOf(ctx.env)); } catch { /* none */ }
  const held = [];
  for (const p of projects) {
    for (const it of Q.list(p.name, { cacheDir: cacheDirOf(ctx.env) })) {
      held.push({
        id: it.id, project: p.id, projectName: p.name, at: it.at,
        title: titleOf(it.story?.body ?? '') || it.storyId || it.id,
        reason: it.reason === 'unchecked' ? 'There was no private name list when it was written, so it could not be checked.' : `It contains a name on your private list (in ${[...new Set((it.violations ?? []).map((v) => v.field))].join(', ') || 'the text'}).`,
        canRelease: true,
      });
    }
  }
  const sent = [];
  for (const [sid, s] of Object.entries(ledger.sessions)) {
    const p = projects.find((x) => x.root === path.resolve(s.repoRoot ?? ''));
    for (const h of s.harvests ?? []) {
      sent.push({ at: h.at, sid, host: HOST_WORDS[sid.split(':')[0]] ?? 'agent', projectName: p?.name ?? (s.repoRoot ? repoName(s.repoRoot) : 'unknown'), from: h.fromLine, to: h.toLine, ok: h.status !== 'failed' });
    }
  }
  sent.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  let cfg = null;
  try { cfg = loadConfig({ cwd: ctx.cwd, env: ctx.env }); } catch { /* broken user config shows in Health */ }
  const privateProjects = projects.filter((p) => { try { return loadConfig({ cwd: p.root, env: ctx.env }).privateMode; } catch { return false; } }).map((p) => ({ id: p.id, name: p.name }));
  return { privateProjects, names, namesFile: file, otherLists: Math.max(0, (cfg?.privacy.sources.length ?? 0) - (cfg?.privacy.sources.some((x) => path.resolve(String(x?.path ?? '')) === path.resolve(file)) ? 1 : 0)), held, sent: sent.slice(0, 100), sentTotal: sent.length };
}

export function addNames(ctx, names) {
  const list = asList(names).map((n) => oneLine(n)).filter(Boolean);
  if (!list.length) throw new UiError('Type at least one name.');
  return privacyAdd({ cwd: ctx.cwd, env: ctx.env, names: list });
}

export function removeName(ctx, name) {
  return privacyRemove({ env: ctx.env, names: [name] });
}

export function releaseHeld(ctx, { project: pid, id }) {
  const { project, cfg } = projectById(ctx, pid);
  const blocklist = P.loadBlocklist(cfg.privacy.sources, { env: ctx.env });
  if (!blocklist) throw new UiError('Add at least one name to your private list first, so the story can be checked.', 409);
  let r;
  try { r = Q.release(project.name, id, blocklist, { cacheDir: cfg.cacheDir, box: cfg.box, allow: P.loadAllow(cfg.privacy.allowFile) }); } catch (e) {
    throw new UiError(/không có chuyện bị giữ|id sai/.test(e.message) ? 'That held story is not there any more.' : 'It could not be released. Run Health to check the project.', 409);
  }
  if (!r.released) return { released: false, message: `Still held: it contains ${r.violations.map((v) => P.mask(v.term)).join(', ')}.` };
  if (r.created) noteFirstStory(cfg, r.capturedBy);
  return { released: true, message: 'Released to your wall.' };
}

// ---------- cost ----------

const mondayOf = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };

/** Spend from the ledger: this week, last 8 weeks, by project and by session. */
export function costView(ctx, now = new Date()) {
  let ledger = { sessions: {} };
  try { ledger = Ledger.load(cacheDirOf(ctx.env)); } catch { /* none */ }
  const week0 = mondayOf(now);
  const weeks = Array.from({ length: 8 }, (_, i) => { const d = new Date(week0); d.setDate(d.getDate() - 7 * (7 - i)); return { start: localDate(d), usd: 0 }; });
  const byProject = new Map();
  const sessions = [];
  let total = 0, unknown = 0;
  for (const [sid, s] of Object.entries(ledger.sessions)) {
    const name = s.repoRoot ? repoName(s.repoRoot) : 'unknown';
    let sum = 0, last = null;
    for (const h of Ledger.spendItems(s)) {
      if (typeof h.usd !== 'number') { unknown++; continue; }
      const t = new Date(h.at);
      sum += h.usd; total += h.usd;
      if (!last || h.at > last) last = h.at;
      const i = 7 - Math.floor((week0 - mondayOf(t)) / (7 * 86400000));
      if (i >= 0 && i < 8) weeks[i].usd += h.usd;
    }
    if (!Ledger.spendItems(s).length) continue;
    byProject.set(name, (byProject.get(name) ?? 0) + sum);
    sessions.push({ sid, host: HOST_WORDS[sid.split(':')[0]] ?? 'agent', projectName: name, usd: sum, last, reads: (s.harvests ?? []).length });
  }
  sessions.sort((a, b) => String(b.last).localeCompare(String(a.last)));
  let budget = null;
  try { budget = loadConfig({ cwd: ctx.cwd, env: ctx.env }).budget.dailyUsd; } catch { /* broken config shows in Health */ }
  const wait = Ledger.waiting(cacheDirOf(ctx.env));
  return {
    today: Ledger.spentOn(ledger, localDate(now)), budget, waiting: Object.values(wait).reduce((a, b) => a + b, 0),
    thisWeek: weeks[7].usd, lastWeek: weeks[6].usd, total, weeks, unknownReads: unknown,
    byProject: [...byProject].map(([name, usd]) => ({ name, usd })).sort((a, b) => b.usd - a.usd),
    sessions: sessions.slice(0, 50),
    measures: Metrics.localMeasures(ctx.env),
  };
}

// ---------- health ----------

const CHECK_WORDS = {
  'node.version': ['Node.js', 'momentry needs Node.js 20 or newer.'],
  'git.present': ['Git', 'Git is needed to find your projects.'],
  'claude.present': ['Claude Code', 'Stories are found through your own Claude Code login. Install Claude Code and log in once.'],
  'config.valid': ['Settings file', 'Your settings file cannot be read.'],
  'privacy.sources': ['Private name list', 'Without a list of private names, new stories are held back on this machine instead of going to your wall. Add names in Privacy.'],
  'repo.observed': ['Project turned on', 'This project is not turned on yet.'],
  'project.paused': ['Gathering stories', 'Paused on this machine: no new stories are gathered from this project. Its stories stay readable. Turn "Gather stories" back on in Settings.'],
  'box.exists': ['Story folder', 'The story folder does not exist yet.'],
  'cache.private': ['Private working folder', 'The working folder should be readable only by you.'],
  'install.path': ['Install', 'The momentry command is not where your terminal looks for it.'],
};

/** Health per project (the first project when none is given), with a plain-English line and a fix button where possible. */
export async function healthView(ctx, { project: pid, fix = false } = {}) {
  const D = await import('./doctor.mjs');
  const { buildChecks } = await import('./checks.mjs');
  const all = listProjects(ctx);
  const p = pid ? all.find((x) => x.id === pid) : all.find((x) => x.observed) ?? all.find((x) => !x.missing);
  if (pid && !p) throw new UiError('That project is not on this machine any more.', 404);
  if (p?.missing) throw new UiError(p.error, 409);
  const dctx = { cwd: p?.root ?? ctx.cwd, env: ctx.env, repo: p?.root, platform: process.platform, prefix: selfCommand(ctx.env), connect: false };
  const checks = buildChecks(dctx);
  const r = await D.run(checks, dctx, { fix, creates: fix });
  const hosts = await import('./hosts.mjs');
  const agents = hosts.HOST_NAMES.filter((n) => hosts.detect(n, ctx.env)).map((n) => {
    const i = hosts.inspect(n, dctx.prefix, ctx.env);
    return { name: n, label: hosts.LABELS[n], ok: i.status === 'ok', words: i.status === 'ok' ? 'Connected' : i.status === 'missing' ? 'Not connected yet' : 'Needs repair' };
  });
  return {
    project: p ? { id: p.id, name: p.name, paused: p.paused } : null,
    ok: r.ok,
    fixed: r.changes.length,
    checks: r.results.map((c, i) => ({ c, i })).filter(({ c }) => !c.code.startsWith('host.')).map(({ c, i }) => {
      const [title, why] = CHECK_WORDS[c.code] ?? [c.title, ''];
      return { code: c.code, title, status: c.status, important: c.critical, why: c.status === 'ok' || c.status === 'skip' ? '' : why, detail: c.detail, canFix: !!checks[i].apply && c.status !== 'ok' && c.status !== 'skip' };
    }),
    agents,
  };
}

// ---------- agents (setup) ----------

export async function agentsView(ctx) {
  const hosts = await import('./hosts.mjs');
  const prefix = selfCommand(ctx.env);
  return hosts.HOST_NAMES.map((n) => {
    const found = hosts.detect(n, ctx.env);
    const i = found ? hosts.inspect(n, prefix, ctx.env) : null;
    return { name: n, label: hosts.LABELS[n], found, connected: i?.status === 'ok', profiles: i?.targets ?? 0, needsRepair: !!i && !['ok', 'missing'].includes(i.status) };
  });
}

export async function connectAgents(ctx, names) {
  const hosts = await import('./hosts.mjs');
  const prefix = selfCommand(ctx.env);
  const done = [], failed = [];
  for (const n of asList(names)) {
    if (!hosts.HOST_NAMES.includes(n) || !hosts.detect(n, ctx.env)) { failed.push({ name: n, why: 'Not found on this machine.' }); continue; }
    try { hosts.apply(n, { prefix, env: ctx.env }); done.push(n); } catch (e) { failed.push({ name: hosts.LABELS[n], why: e.message }); }
  }
  return { done, failed, agents: await agentsView(ctx) };
}

// ---------- project actions ----------

/**
 * Turns a project on: same steps as `init` without touching agents (repo file + story folder, then the project list),
 * plus optional gitignore.
 */
export async function turnOn(ctx, { root, keepOutOfGit }) {
  const r = gitRoot(path.resolve(ctx.cwd, String(root ?? '')));
  if (!r) throw new UiError('That folder is not inside a git repository.');
  const D = await import('./doctor.mjs');
  const { buildChecks } = await import('./checks.mjs');
  const dctx = { cwd: r, env: ctx.env, repo: r, platform: process.platform, prefix: selfCommand(ctx.env), connect: false };
  await D.run(buildChecks(dctx).filter((c) => ['repo.observed', 'box.exists'].includes(c.code)), dctx, { fix: true, creates: true });
  if (keepOutOfGit) ignoreBox(r, ctx.env);
  const info = projectInfo(r, ctx.env);
  if (info.observed) {
    try { Projects.remember(ctx.env, r, { name: info.name }); } catch (e) { throw new UiError(`The project is on, but the list of projects could not be saved: ${e.message}`, 500); }
  }
  return info;
}

/** Adds the story folder to the repo's .gitignore (once). */
export function ignoreBox(root, env) {
  const cfg = loadConfig({ cwd: root, env });
  const rel = path.relative(root, cfg.box).split(path.sep).join('/');
  if (!rel || rel.startsWith('..')) return false;
  const file = path.join(root, '.gitignore');
  let text = '';
  try { text = fs.readFileSync(file, 'utf8'); } catch { /* new file */ }
  const line = `/${rel}/`;
  if (text.split(/\r?\n/).some((l) => [line, `${rel}/`, rel, `/${rel}`].includes(l.trim()))) return false;
  fs.writeFileSync(file, `${text}${text && !text.endsWith('\n') ? '\n' : ''}# momentry stories stay on this machine\n${line}\n`);
  return true;
}

export function isIgnored(root, box) {
  const rel = path.relative(root, box).split(path.sep).join('/');
  try { return fs.readFileSync(path.join(root, '.gitignore'), 'utf8').split(/\r?\n/).some((l) => [`/${rel}/`, `${rel}/`, rel, `/${rel}`].includes(l.trim())); } catch { return false; }
}

/** All stories of a project as one markdown file. */
export function exportProject(ctx, pid) {
  const { project, cfg } = projectById(ctx, pid);
  const parts = readBox(cfg.box).filter((s) => !s.error).map((s) => `<!-- ${s.id} -->\n${stringify(s.data, s.body).trim()}\n`);
  return { name: `${project.name}-stories.md`, text: `# ${project.name}: stories\n\n${parts.join('\n---\n\n')}` };
}

/**
 * Deletes every momentry trace of one project: story folder, held stories, session history, the repo file and its
 * place on the project list. Needs the project name typed back. A project whose folder is gone can be removed too
 * (what is left of it: a story folder outside the repo, held stories, history, the list entry).
 */
export function deleteProject(ctx, { project: pid, confirm }) {
  const project = findProject(ctx, pid);
  if (project.error && !project.missing) throw new UiError(project.error, 409);
  if (String(confirm ?? '').trim() !== project.name) throw new UiError(`Type ${project.name} to confirm.`);
  const cacheDir = cacheDirOf(ctx.env);
  const box = project.missing ? project.box : loadConfig({ cwd: project.root, env: ctx.env }).box;
  const removed = [], kept = [];
  if (box) {
    // only story files are removed; the folder goes too when nothing else is left in it
    for (const st of readBox(box)) { fs.rmSync(st.path, { force: true }); removed.push(st.path); }
    const rel = path.relative(project.root, box);
    const ownFolder = rel && !rel.startsWith('..') && !path.isAbsolute(rel);
    try { if (ownFolder && fs.readdirSync(box).length === 0) fs.rmdirSync(box); else if (fs.existsSync(box)) kept.push(box); } catch { /* gone */ }
  }
  // held stories are filed by project name: another project with the same name shares the folder
  const twins = listProjects(ctx).filter((p) => p.id !== project.id && p.name === project.name);
  const qdir = Q.heldDir(project.name, cacheDir);
  if (twins.length) kept.push(qdir);
  else if (fs.existsSync(qdir)) { fs.rmSync(qdir, { recursive: true, force: true }); removed.push(qdir); }
  const ledger = Ledger.load(cacheDir);
  let forgot = 0;
  for (const [sid, s] of Object.entries(ledger.sessions)) if (s.repoRoot && path.resolve(s.repoRoot) === project.root) { Ledger.forget(ledger, sid); forgot++; }
  const hadRepo = !!ledger.repos?.[project.root];
  if (hadRepo) delete ledger.repos[project.root];
  if (forgot || hadRepo) Ledger.save(ledger, cacheDir);
  const repoFile = path.join(project.root, REPO_FILE);
  if (fs.existsSync(repoFile)) { fs.rmSync(repoFile); removed.push(repoFile); }
  try { Projects.forget(ctx.env, project.root); } catch (e) { throw new UiError(`The project data is deleted, but it could not be taken off the list of projects: ${e.message}`, 500); }
  return { removed: removed.length, kept, forgotSessions: forgot };
}

// ---------- settings ----------

export function settingsView(ctx) {
  const user = showConfig({ cwd: ctx.cwd, env: ctx.env });
  const projects = listProjects(ctx).filter((p) => p.observed && !p.error).map((p) => {
    const s = showConfig({ cwd: p.root, env: ctx.env, repo: p.root });
    // the loader resolves the story folder to an absolute path; people set it relative to the repo
    const box = s.values.box;
    if (box?.value && path.isAbsolute(box.value) && !path.relative(p.root, box.value).startsWith('..')) s.values.box = { ...box, value: path.relative(p.root, box.value).split(path.sep).join('/') };
    // a folder chosen for this project on this machine is, for the screen, a value set for this project
    if (s.values.box?.source === MACHINE) s.values.box = { ...s.values.box, source: 'repo' };
    let own = null, priv = false;
    try { const c = loadConfig({ cwd: p.root, env: ctx.env }); own = c.budget.projectUsd; priv = c.privateMode; } catch { /* shown in Health */ }
    return { privateMode: priv, paused: p.paused, id: p.id, name: p.name, root: p.root, box: p.box, boxInRepo: p.boxInRepo, ignored: p.box ? isIgnored(p.root, p.box) : false, remote: p.remote, values: s.values, budget: own };
  });
  const st = loadState(ctx.env);
  // projects whose folder is gone: shown only so they can be removed
  const missing = listProjects(ctx).filter((p) => p.missing).map((p) => ({ id: p.id, name: p.name, root: p.root, error: p.error }));
  return { schema: describeSchema(), user: user.values, userFile: user.file, projects, missing, version: VERSION, setupDone: st.setupDone };
}

export function saveSetting(ctx, { key, value, scope = 'user', project: pid }) {
  if (scope !== 'user' && scope !== 'project') throw new UiError('Unknown settings level.');
  if (scope === 'project' && SCHEMA[key]?.tier !== 'project') throw new UiError('That setting is the same for every project.');
  const where = scope === 'project' ? projectById(ctx, pid).project.root : ctx.cwd;
  try {
    // a story folder outside the repo is kept on this machine, never in the repo file (see setProjectBox)
    if (scope === 'project' && key === 'box') setProjectBox({ env: ctx.env, root: where, box: value });
    else writeConfig({ cwd: where, env: ctx.env, key, value: value === null ? undefined : value, scope, repo: where, parsed: true });
  } catch (e) { throw new UiError(e.why || e.message); }
  return settingsView(ctx);
}

/** Private mode for one project (user config only). */
export function savePrivateMode(ctx, { project: pid, on }) {
  const { project } = projectById(ctx, pid);
  setPrivateProject({ env: ctx.env, root: project.root, on: !!on });
  return settingsView(ctx);
}

/** Gathering on (true) or paused (false) for one project, on this machine only (the project list, never the repo). */
export function saveGathering(ctx, { project: pid, on }) {
  if (typeof on !== 'boolean') throw new UiError('Say whether to gather stories (on: true or false).');
  const { project } = projectById(ctx, pid);
  try { Projects.setPaused(ctx.env, project.root, !on); } catch (e) { throw new UiError(`The list of projects could not be saved: ${e.message}`, 500); }
  return settingsView(ctx);
}

/** A project's own daily budget (null = use the general one). */
export function saveProjectBudget(ctx, { project: pid, usd }) {
  const { project } = projectById(ctx, pid);
  const v = usd === null || usd === '' || usd === undefined ? null : Number(usd);
  if (v !== null && (!Number.isFinite(v) || v < 0)) throw new UiError('The budget must be a number of at least 0.');
  setProjectBudget({ env: ctx.env, root: project.root, usd: v });
  return settingsView(ctx);
}

export function setGitignore(ctx, { project: pid, on }) {
  const { project, cfg } = projectById(ctx, pid);
  if (on) ignoreBox(project.root, ctx.env);
  else {
    const file = path.join(project.root, '.gitignore');
    const rel = path.relative(project.root, cfg.box).split(path.sep).join('/');
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return settingsView(ctx);
    try {
      const lines = fs.readFileSync(file, 'utf8').split('\n');
      const keep = lines.filter((l) => ![`/${rel}/`, `${rel}/`, rel, `/${rel}`, '# momentry stories stay on this machine'].includes(l.trim()));
      fs.writeFileSync(file, keep.join('\n'));
    } catch { /* no .gitignore */ }
  }
  return settingsView(ctx);
}

export function finishSetup(ctx) {
  const st = loadState(ctx.env);
  st.setupDone = true;
  saveState(ctx.env, st);
  return { setupDone: true };
}

export async function checkUpdate(ctx) {
  const U = await import('./update.mjs');
  try {
    const rel = await U.resolveRelease({ env: ctx.env });
    const d = U.decide(VERSION, rel.version);
    return { current: `v${VERSION}`, latest: rel.version, newer: d === 'update' };
  } catch {
    return { current: `v${VERSION}`, latest: null, newer: false, message: 'Could not reach the release page. Check your connection and try again.' };
  }
}

// ---------- finding stories (background run) ----------

const jobs = new Map();

/** True while a background search runs (the server must not stop for being idle). */
export const busy = () => [...jobs.values()].some((j) => j.state === 'running');

/** Status of the current run for a project, counting session reads recorded since it started. */
export function jobView(ctx, pid) {
  const j = jobs.get(pid);
  if (!j) return { running: false };
  let reads = 0;
  try {
    const ledger = Ledger.load(cacheDirOf(ctx.env));
    for (const s of Object.values(ledger.sessions)) if (s.repoRoot && path.resolve(s.repoRoot) === j.root) reads += (s.harvests ?? []).filter((h) => h.at >= j.startedAt).length;
  } catch { /* ledger busy */ }
  return { running: j.state === 'running', state: j.state, startedAt: j.startedAt, sessionsRead: reads, target: j.max, message: j.message, newStories: j.newStories ?? null };
}

/**
 * Starts `momentry scan --max-sessions N` for a project in the background (one run per project).
 * The CLI owns the work; the UI only watches the ledger and the exit.
 */
export function startFind(ctx, { project: pid, max = 3 }) {
  const { project, cfg } = projectById(ctx, pid);
  if (!cfg.observed) throw new UiError('Turn this project on first.');
  if (jobs.get(pid)?.state === 'running') return jobView(ctx, pid);
  const before = fs.existsSync(cfg.box) ? readBox(cfg.box).length : 0;
  const n = Math.max(1, Math.min(20, Number.parseInt(max, 10) || 3));
  const job = { root: project.root, max: n, state: 'running', startedAt: new Date().toISOString(), message: null };
  jobs.set(pid, job);
  const child = (ctx.spawn ?? spawn)(process.execPath, [BIN, 'scan', '--max-sessions', String(n), '--quiet-minutes', '0', '--repo', project.root, '--json'], { cwd: project.root, env: ctx.env, stdio: ['ignore', 'pipe', 'ignore'] });
  child.stdout?.resume();
  child.on('error', () => { job.state = 'failed'; job.message = 'Could not start the search.'; });
  child.on('close', (code) => {
    const after = fs.existsSync(cfg.box) ? readBox(cfg.box).length : 0;
    job.newStories = Math.max(0, after - before);
    job.state = code === 0 ? 'done' : 'failed';
    job.message = code === 0 ? (job.newStories ? `Found ${job.newStories} new ${job.newStories === 1 ? 'story' : 'stories'}.` : 'Done. No new stories this time.')
      : code === 3 ? 'Some stories were held back because there is no private name list yet. Add names in Privacy.'
        : code === 4 ? 'Claude did not answer. Check that Claude Code is logged in, then try again.'
          : code === 5 ? 'Another search is already reading these sessions. Try again in a few minutes.'
            : 'The search stopped with a problem. Health shows what to fix.';
  });
  return jobView(ctx, pid);
}

/** Bootstrap payload: projects, setup state, counts. */
export function overview(ctx) {
  const projects = listProjects(ctx);
  const st = loadState(ctx.env);
  const stories = listStories(ctx);
  return {
    version: VERSION, setupDone: st.setupDone, projects,
    counts: { stories: stories.length, unread: stories.filter((s) => !s.seen && s.status === 'raw').length },
    configDir: paths(ctx.env).config,
  };
}

