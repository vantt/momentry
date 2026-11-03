// Config loading (PRD 6.5). Precedence: flags > env > <repo>/.momentry.json > user config > defaults.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gitRoot, repoName } from './repo.mjs';

/** Exit codes (PRD 7.2). */
export const EXIT = Object.freeze({ OK: 0, USAGE: 1, CHECK: 2, UNCHECKED: 3, LLM: 4, LOCKED: 5 });

export const REPO_FILE = '.momentry.json';

export const DEFAULTS = Object.freeze({
  box: 'docs/storytelling-material',
  repo: null,
  harvest: { runs: 1, model: 'haiku', fillRetries: 1, maxInputTokens: 150000, timeoutSec: 600 },
  rank: { model: 'sonnet' },
  outsider: { enabled: true, model: 'sonnet' },
  scan: { quietMinutes: 30, maxSessions: 3, maxFailures: 3 },
  privacy: { sources: [], allowFile: null, allowUnchecked: false },
  lock: { staleSec: 3600 },
});

/** Keys honoured only from user config or env, never from the repo file. */
export const USER_ONLY = ['privacy.sources', 'privacy.allowUnchecked'];

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
 * @property {{quietMinutes:number, maxSessions:number, maxFailures:number}} scan  maxSessions: cap per hook-run scan
 * @property {{sources:object[], allowFile:string|null, allowUnchecked:boolean}} privacy
 * @property {{staleSec:number}} lock
 * @property {string|null} fakeLlm     dir for --fake-llm / MOMENTRY_FAKE_LLM
 * @property {string[]} ignored        repo-file keys dropped because they are user-only
 */

const home = (env) => env.HOME || os.homedir();

/** @param {NodeJS.ProcessEnv} [env] */
export function cacheDir(env = process.env) {
  return env.MOMENTRY_CACHE ? path.resolve(env.MOMENTRY_CACHE) : path.join(home(env), '.cache', 'momentry');
}

/** @param {NodeJS.ProcessEnv} [env] */
export function userConfigPath(env = process.env) {
  return env.MOMENTRY_CONFIG ? path.resolve(env.MOMENTRY_CONFIG) : path.join(home(env), '.config', 'momentry', 'config.json');
}

/** mkdir -p with mode 0700 (PRD 6.3). @param {string} dir @returns {string} */
export function ensurePrivateDir(dir) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

function usageError(msg) {
  const e = new Error(msg);
  e.exitCode = EXIT.USAGE;
  return e;
}

function readJson(file) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw usageError(`không đọc được cấu hình ${file}: ${e.message}`);
  }
  try {
    const v = JSON.parse(text);
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('phải là object');
    return v;
  } catch (e) { throw usageError(`cấu hình hỏng ${file}: ${e.message}`); }
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
  if (!Number.isInteger(n) || n < min) throw usageError(`${name} phải là số nguyên ≥ ${min}: ${v}`);
  return n;
}

function parseSources(raw) {
  const s = raw.trim();
  if (!s) return [];
  if (s.startsWith('[')) {
    try { return JSON.parse(s); } catch (e) { throw usageError(`MOMENTRY_PRIVACY_SOURCES hỏng: ${e.message}`); }
  }
  return s.split(':').filter(Boolean).map((p) => ({ type: 'lines', path: p }));
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
  if (repoRoot) {
    const repoCfg = expand(readJson(path.join(repoRoot, REPO_FILE)) || {});
    for (const k of USER_ONLY) if (dropKey(repoCfg, k)) ignored.push(k);
    cfg = merge(cfg, repoCfg);
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
  cfg.scan.quietMinutes = toInt(cfg.scan.quietMinutes, 'scan.quietMinutes');
  cfg.scan.maxSessions = toInt(cfg.scan.maxSessions, 'scan.maxSessions');
  cfg.scan.maxFailures = toInt(cfg.scan.maxFailures, 'scan.maxFailures', 1);
  cfg.lock.staleSec = toInt(cfg.lock.staleSec, 'lock.staleSec', 1);
  if (!Array.isArray(cfg.privacy.sources)) throw usageError('privacy.sources phải là mảng');
  cfg.privacy.allowUnchecked = cfg.privacy.allowUnchecked === true;
  cfg.outsider.enabled = cfg.outsider.enabled !== false;
  if (typeof cfg.box !== 'string' || !cfg.box) throw usageError('box phải là chuỗi');

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
    privacy: { ...cfg.privacy, allowFile },
    fakeLlm: fakeLlm ? path.resolve(cwd, fakeLlm) : null,
    ignored,
  };
}

/**
 * A repo is observed when it has `.momentry.json` at its root or is listed in MOMENTRY_REPOS (`:`-separated).
 * @param {string} repoRoot @param {NodeJS.ProcessEnv} [env]
 */
export function isObserved(repoRoot, env = process.env) {
  if (!repoRoot) return false;
  if (fs.existsSync(path.join(repoRoot, REPO_FILE))) return true;
  const real = (p) => { try { return fs.realpathSync(p); } catch { return path.resolve(p); } };
  const root = real(repoRoot);
  return (env.MOMENTRY_REPOS || '').split(':').filter(Boolean).some((p) => real(p) === root);
}
