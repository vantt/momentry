// Config loading (PRD 6.5). Precedence: flags > env > <repo>/.momentry.json > user config > defaults; a story folder
// chosen for one project on this machine (lib/projects.mjs) sits between env and the repo file. Whether gathering is
// paused comes from the machine's project list only.
import fs from 'node:fs';
import path from 'node:path';
import { gitRoot, repoName } from './repo.mjs';
import { paths, splitList } from './paths.mjs';
import { read as readProjects, find as findProject } from './projects.mjs';

/**
 * Exit codes (PRD 7.2), the same for every command:
 * 0 ok; 1 failed or problems found (FAIL, CHECK); 2 usage error; 3 privacy check skipped (no blocklist);
 * 4 model failed; 5 session locked; 10 `update --check` found a newer version.
 */
export const EXIT = Object.freeze({ OK: 0, FAIL: 1, CHECK: 1, USAGE: 2, UNCHECKED: 3, LLM: 4, LOCKED: 5, UPDATE: 10 });

export const REPO_FILE = '.momentry.json';

/** Prompt cache choices for model calls (`llm.promptCache`, applied in lib/llm.mjs callEnv). */
export const PROMPT_CACHES = Object.freeze(['off', '5m', '1h', 'auto']);

export const DEFAULTS = Object.freeze({
  box: 'docs/storytelling-material',
  repo: null,
  harvest: { runs: 1, model: 'haiku', fillRetries: 1, maxInputTokens: 150000, timeoutSec: 600 },
  rank: { model: 'sonnet' },
  outsider: { enabled: true, model: 'haiku' },
  angle: { enabled: true, model: 'haiku', topN: 10, profileModel: 'haiku' },
  llm: { promptCache: 'off' },
  scan: { quietMinutes: 30, maxSessions: 3, maxFailures: 3 },
  privacy: { sources: [], allowFile: null, allowUnchecked: false },
  lock: { staleSec: 3600 },
  budget: { dailyUsd: 3 },
  ui: { tailscale: true },
});

/** Keys honoured only from user config or env, never from the repo file. */
export const USER_ONLY = ['privacy.sources', 'privacy.allowUnchecked', 'budget.dailyUsd', 'budget.projects', 'privacy.privateProjects', 'ui.tailscale'];

/**
 * @typedef {object} Config
 * @property {string} cwd
 * @property {string|null} repoRoot
 * @property {string|null} repo        repo name written into stories
 * @property {string|null} box         absolute box dir
 * @property {string} cacheDir         ~/.cache/momentry or MOMENTRY_CACHE
 * @property {boolean} observed
 * @property {{runs:number, model:string, fillRetries:number, maxInputTokens:number, timeoutSec:number}} harvest
 * @property {{model:string}} rank
 * @property {{enabled:boolean, model:string}} outsider
 * @property {{enabled:boolean, model:string, topN:number, profileModel:string}} angle  story angle of the top topN stories
 *   after ranking; profileModel writes the project profile the angle opens with (lib/project-profile.mjs)
 * @property {{promptCache:'off'|'5m'|'1h'|'auto'}} llm  prompt cache of every model call (lib/llm.mjs callEnv)
 * @property {{quietMinutes:number, maxSessions:number, maxFailures:number}} scan  maxSessions: cap per hook-run scan
 * @property {{sources:object[], allowFile:string|null, allowUnchecked:boolean}} privacy
 * @property {{staleSec:number}} lock
 * @property {{dailyUsd:number, projectUsd:number|null}} budget  daily caps for automatic (hook) reads, all repos and
 *   this repo (user config `budget.projects[<repo root>]`, never from the repo file); 0 = none
 * @property {string|null} fakeLlm     dir for --fake-llm / MOMENTRY_FAKE_LLM
 * @property {string[]} ignored        repo-file keys dropped because they are user-only
 * @property {boolean} privateMode     repo listed in the user's privacy.privateProjects: kept out of drafts and shared labels
 * @property {boolean} paused          gathering paused for this repo on this machine (project list only, never a repo file)
 * @property {string|null} resumedAt   when gathering was last turned back on (ISO), or null
 */

/** @param {NodeJS.ProcessEnv} [env] */
export function cacheDir(env = process.env) {
  return paths(env).cache;
}

/** @param {NodeJS.ProcessEnv} [env] */
export function userConfigPath(env = process.env) {
  return paths(env).configFile;
}

/** mkdir -p with mode 0700 (PRD 6.3). @param {string} dir @returns {string} */
export function ensurePrivateDir(dir) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

function configError(msg) {
  const e = new Error(msg);
  e.exitCode = EXIT.FAIL;
  return e;
}

function readJson(file) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw configError(`không đọc được cấu hình ${file}: ${e.message}`);
  }
  try {
    const v = JSON.parse(text);
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('phải là object');
    return v;
  } catch (e) { throw configError(`cấu hình hỏng ${file}: ${e.message}`); }
}

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

/** Expands dotted keys ("harvest.runs": 3) into nested objects. */
function expand(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) {
    const parts = k.split('.');
    let t = out;
    for (const p of parts.slice(0, -1)) t = isObj(t[p]) ? t[p] : (t[p] = {});
    const last = parts.at(-1);
    t[last] = isObj(v) ? merge(isObj(t[last]) ? t[last] : {}, expand(v)) : v;
  }
  return out;
}

function merge(a, b) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = isObj(v) && isObj(out[k]) ? merge(out[k], v) : v;
  return out;
}

function dropKey(obj, dotted) {
  const parts = dotted.split('.');
  let t = obj;
  for (const p of parts.slice(0, -1)) { if (!isObj(t[p])) return false; t = t[p]; }
  if (!(parts.at(-1) in t)) return false;
  delete t[parts.at(-1)];
  return true;
}

function toInt(v, name, min = 0) {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isInteger(n) || n < min) throw configError(`${name} phải là số nguyên ≥ ${min}: ${v}`);
  return n;
}

function parseSources(raw) {
  const s = raw.trim();
  if (!s) return [];
  if (s.startsWith('[')) {
    try { return JSON.parse(s); } catch (e) { throw configError(`MOMENTRY_PRIVACY_SOURCES hỏng: ${e.message}`); }
  }
  return splitList(s).map((p) => ({ type: 'lines', path: p }));
}

/**
 * @param {{cwd?:string, env?:NodeJS.ProcessEnv, flags?:Record<string, any>}} [opts]
 *   flags use CLI names: box, repo, runs, 'no-outsider', 'quiet-minutes', 'fake-llm'
 * @returns {Config}
 */
export function loadConfig({ cwd = process.cwd(), env = process.env, flags = {} } = {}) {
  const base = path.resolve(cwd, flags.repo || '.');
  const repoRoot = gitRoot(base);

  let cfg = structuredClone(DEFAULTS);
  cfg = merge(cfg, expand(readJson(userConfigPath(env)) || {}));

  const ignored = [];
  /** @type {import('./projects.mjs').ProjectEntry|null} */
  let own = null;
  if (repoRoot) {
    const repoCfg = expand(readJson(path.join(repoRoot, REPO_FILE)) || {});
    for (const k of USER_ONLY) if (dropKey(repoCfg, k)) ignored.push(k);
    cfg = merge(cfg, repoCfg);
    try { own = findProject(readProjects(env), repoRoot); } catch (e) { throw configError(e.message); }
    if (own?.box) cfg.box = own.box;
  }

  if (env.MOMENTRY_BOX) cfg.box = env.MOMENTRY_BOX;
  if (env.MOMENTRY_PRIVACY_SOURCES !== undefined) cfg.privacy.sources = parseSources(env.MOMENTRY_PRIVACY_SOURCES);
  if (env.MOMENTRY_ALLOW_UNCHECKED === '1') cfg.privacy.allowUnchecked = true;
  let fakeLlm = env.MOMENTRY_FAKE_LLM || null;

  if (flags.box) cfg.box = path.resolve(cwd, flags.box);
  if (flags.runs !== undefined) cfg.harvest.runs = flags.runs;
  if (flags['no-outsider']) cfg.outsider.enabled = false;
  if (flags['quiet-minutes'] !== undefined) cfg.scan.quietMinutes = flags['quiet-minutes'];
  if (flags['fake-llm']) fakeLlm = flags['fake-llm'];

  cfg.harvest.runs = toInt(cfg.harvest.runs, 'harvest.runs', 1);
  cfg.harvest.fillRetries = toInt(cfg.harvest.fillRetries, 'harvest.fillRetries');
  cfg.harvest.maxInputTokens = toInt(cfg.harvest.maxInputTokens, 'harvest.maxInputTokens', 1000);
  cfg.harvest.timeoutSec = toInt(cfg.harvest.timeoutSec, 'harvest.timeoutSec', 1);
  if (!PROMPT_CACHES.includes(cfg.llm.promptCache)) throw configError(`llm.promptCache phải là một trong ${PROMPT_CACHES.join(', ')}: ${cfg.llm.promptCache}`);
  cfg.scan.quietMinutes = toInt(cfg.scan.quietMinutes, 'scan.quietMinutes');
  cfg.scan.maxSessions = toInt(cfg.scan.maxSessions, 'scan.maxSessions');
  cfg.scan.maxFailures = toInt(cfg.scan.maxFailures, 'scan.maxFailures', 1);
  cfg.lock.staleSec = toInt(cfg.lock.staleSec, 'lock.staleSec', 1);
  cfg.budget.dailyUsd = Number(cfg.budget.dailyUsd);
  if (!Number.isFinite(cfg.budget.dailyUsd) || cfg.budget.dailyUsd < 0) throw configError(`budget.dailyUsd phải là số ≥ 0: ${cfg.budget.dailyUsd}`);
  const perRepo = isObj(cfg.budget.projects) && repoRoot ? cfg.budget.projects[repoRoot] : undefined;
  if (perRepo !== undefined && (typeof perRepo !== 'number' || !Number.isFinite(perRepo) || perRepo < 0)) throw configError(`budget.projects["${repoRoot}"] phải là số ≥ 0: ${perRepo}`);
  cfg.budget = { dailyUsd: cfg.budget.dailyUsd, projectUsd: perRepo ?? null };
  // private mode: this repo's stories never go into drafts or shared labels (user config only)
  const priv = cfg.privacy.privateProjects;
  if (priv !== undefined && !Array.isArray(priv)) throw configError('privacy.privateProjects phải là mảng đường dẫn repo');
  const privateMode = !!repoRoot && (priv ?? []).some((p) => path.resolve(String(p)) === path.resolve(repoRoot));
  if (!Array.isArray(cfg.privacy.sources)) throw configError('privacy.sources phải là mảng');
  cfg.privacy.allowUnchecked = cfg.privacy.allowUnchecked === true;
  cfg.outsider.enabled = cfg.outsider.enabled !== false;
  cfg.angle.enabled = cfg.angle.enabled !== false;
  cfg.angle.topN = toInt(cfg.angle.topN, 'angle.topN');
  if (typeof cfg.box !== 'string' || !cfg.box) throw configError('box phải là chuỗi');

  const anchor = repoRoot || path.resolve(cwd);
  const box = path.resolve(anchor, cfg.box);
  const allowFile = cfg.privacy.allowFile ? path.resolve(anchor, cfg.privacy.allowFile) : path.join(box, '.privacy-allow');

  return {
    ...cfg,
    cwd: path.resolve(cwd),
    repoRoot,
    repo: cfg.repo || (repoRoot ? repoName(repoRoot) : null),
    box,
    cacheDir: cacheDir(env),
    observed: repoRoot ? isObserved(repoRoot, env) : false,
    privateMode,
    paused: own?.paused === true,
    resumedAt: own?.resumed ?? null,
    privacy: { ...cfg.privacy, allowFile },
    fakeLlm: fakeLlm ? path.resolve(cwd, fakeLlm) : null,
    ignored,
  };
}

/**
 * A repo is observed when it has `.momentry.json` at its root or is listed in MOMENTRY_REPOS (`:`-separated, `;` on Windows).
 * @param {string} repoRoot @param {NodeJS.ProcessEnv} [env]
 */
export function isObserved(repoRoot, env = process.env) {
  if (!repoRoot) return false;
  if (fs.existsSync(path.join(repoRoot, REPO_FILE))) return true;
  const real = (p) => { try { return fs.realpathSync(p); } catch { return path.resolve(p); } };
  const root = real(repoRoot);
  return splitList(env.MOMENTRY_REPOS).some((p) => real(p) === root);
}
