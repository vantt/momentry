// `momentry config path|show|get|set|unset|default|privacy-add`: the binary owns the defaults and validates every edit.
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULTS, REPO_FILE, USER_ONLY, loadConfig, userConfigPath } from './config.mjs';
import { gitRoot } from './repo.mjs';
import { CliError, usageError } from './cli-output.mjs';
import { didYouMean } from './commands.mjs';
import { writeAtomic } from './install.mjs';
import { paths } from './paths.mjs';
import { validate, SCHEMA } from './config-schema.mjs';

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

/** Dotted leaf keys of DEFAULTS (arrays are leaves). */
export const KEYS = (function flat(o, pre = '') {
  return Object.entries(o).flatMap(([k, v]) => (isObj(v) ? flat(v, `${pre}${k}.`) : [`${pre}${k}`]));
})(DEFAULTS);

/** Env vars that set a key. */
const ENV_OF = { box: 'MOMENTRY_BOX', 'privacy.sources': 'MOMENTRY_PRIVACY_SOURCES', 'privacy.allowUnchecked': 'MOMENTRY_ALLOW_UNCHECKED' };

function readObj(file) {
  try {
    const v = JSON.parse(fs.readFileSync(file, 'utf8'));
    return isObj(v) ? v : {};
  } catch { return {}; }
}

/** Value of a dotted key in a raw config object (nested or dotted spelling). */
function lookup(obj, key) {
  if (Object.hasOwn(obj, key)) return { found: true, value: obj[key] };
  let t = obj;
  for (const p of key.split('.')) {
    if (!isObj(t) || !Object.hasOwn(t, p)) return { found: false };
    t = t[p];
  }
  return { found: true, value: t };
}

function checkKey(key) {
  if (KEYS.includes(key)) return;
  const near = didYouMean(key, KEYS);
  throw new CliError(`khoá lạ: ${key}`, { code: 'config-unknown-key', why: near ? `ý bạn là ${near}?` : `khoá hợp lệ: ${KEYS.join(', ')}`, fix: near ? `momentry config get ${near}` : 'momentry config default' });
}

/** Effective values with the layer that set each one. */
export function show({ cwd, env, repo }) {
  const cfg = loadConfig({ cwd, env, flags: { repo } });
  const user = readObj(userConfigPath(env));
  const root = gitRoot(path.resolve(cwd, repo || '.'));
  const repoCfg = root ? readObj(path.join(root, REPO_FILE)) : {};
  const values = {};
  for (const key of KEYS) {
    let source = 'mặc định';
    if (lookup(user, key).found) source = 'người dùng';
    if (!USER_ONLY.includes(key) && lookup(repoCfg, key).found) source = 'repo';
    if (ENV_OF[key] && env[ENV_OF[key]] !== undefined) source = `env ${ENV_OF[key]}`;
    values[key] = { value: lookup(cfg, key).value ?? null, source };
  }
  return { file: userConfigPath(env), repoFile: root ? path.join(root, REPO_FILE) : null, values };
}

function parseValue(raw) {
  try { return JSON.parse(raw); } catch { return raw; }
}

function setIn(obj, key, value) {
  delete obj[key];
  const parts = key.split('.');
  let t = obj;
  for (const p of parts.slice(0, -1)) t = isObj(t[p]) ? t[p] : (t[p] = {});
  if (value === undefined) delete t[parts.at(-1)]; else t[parts.at(-1)] = value;
  // drop now-empty parents
  (function prune(o) { for (const [k, v] of Object.entries(o)) if (isObj(v)) { prune(v); if (!Object.keys(v).length) delete o[k]; } })(obj);
  return obj;
}

/**
 * set (value !== undefined) or unset a key, validating the value against the schema and the whole result with the
 * config loader before it replaces the file. scope 'user' (default) writes the user config; scope 'project' writes
 * `<repo>/.momentry.json` and refuses user-only keys (a repo must never turn off the privacy net).
 * @param {{cwd: string, env: NodeJS.ProcessEnv, key: string, value?: any, dryRun?: boolean, scope?: 'user'|'project', repo?: string, parsed?: boolean}} o
 *   parsed: value is already a JS value (UI), not command-line text
 * @returns {{file: string, before: object, after: object, changed: boolean}}
 */
export function write({ cwd, env, key, value, dryRun, scope = 'user', repo, parsed = false }) {
  checkKey(key);
  let file = userConfigPath(env);
  if (scope === 'project') {
    if (USER_ONLY.includes(key)) throw new CliError(`${key} chỉ đặt được trong cấu hình người dùng`, { code: 'config-user-only', fix: `momentry config set ${key} …` });
    const root = gitRoot(path.resolve(cwd, repo || '.'));
    if (!root) throw new CliError('không ở trong git repo', { code: 'not-git', fix: 'cd vào repo cần sửa' });
    file = path.join(root, REPO_FILE);
  }
  let text = null;
  try { text = fs.readFileSync(file, 'utf8'); } catch (e) { if (e.code !== 'ENOENT') throw new CliError(`không đọc được ${file}: ${e.message}`); }
  let before = {};
  if (text !== null && text.trim()) {
    try { before = JSON.parse(text); } catch (e) { throw new CliError(`${file} hỏng: ${e.message}`, { fix: `sửa tay ${file}` }); }
  }
  let next = value === undefined ? undefined : parsed ? value : parseValue(value);
  if (!parsed && next !== undefined) {
    const type = SCHEMA[key]?.type;
    if (type === 'string' && typeof next !== 'string') next = String(value);
    if (type === 'bool' && (next === 1 || next === 0)) next = next === 1;
  }
  const bad = validate(key, next);
  if (bad) throw new CliError(`giá trị không hợp lệ cho ${key}: ${bad}`, { code: 'config-invalid', why: bad, fix: `momentry config get ${key}` });
  const after = setIn(structuredClone(before), key, next);
  const changed = JSON.stringify(after) !== JSON.stringify(before);
  if (!changed || dryRun) return { file, before, after, changed };
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: scope === 'project' ? undefined : 0o700 });
  if (scope === 'user') {
    const probe = `${file}.check-${process.pid}`;
    fs.writeFileSync(probe, JSON.stringify(after));
    try {
      loadConfig({ cwd, env: { ...env, MOMENTRY_CONFIG: probe } });
    } catch (e) {
      throw new CliError(`giá trị không hợp lệ cho ${key}: ${e.message}`, { code: 'config-invalid', fix: `momentry config get ${key}` });
    } finally { fs.rmSync(probe, { force: true }); }
  }
  writeAtomic(file, `${JSON.stringify(after, null, 2)}\n`, text === null ? (scope === 'project' ? 0o644 : 0o600) : undefined);
  return { file, before, after, changed };
}

/**
 * Adds names to the default blocklist file (<config dir>/names.txt, one per line, created 0600) and makes sure
 * privacy.sources lists it. One command an agent can run once the user said which names to block.
 * @returns {{file: string, added: string[], sourceAdded: boolean}}
 */
export function privacyAdd({ cwd, env, names, dryRun }) {
  const file = path.join(paths(env).config, 'names.txt');
  let have = [];
  try { have = fs.readFileSync(file, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter(Boolean); } catch { /* new file */ }
  const added = [...new Set(names.map((n) => String(n).trim()).filter(Boolean))].filter((n) => !have.includes(n));
  const user = readObj(userConfigPath(env));
  const sources = lookup(user, 'privacy.sources').value;
  const list = Array.isArray(sources) ? sources : [];
  const sourceAdded = !list.some((s) => s?.type === 'lines' && path.resolve(String(s.path ?? '').replace(/^~(?=$|[\\/])/, env.HOME || env.USERPROFILE || '')) === path.resolve(file));
  if (dryRun) return { file, added, sourceAdded };
  if (added.length) {
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    writeAtomic(file, `${[...have, ...added].join('\n')}\n`, 0o600);
  }
  if (sourceAdded) write({ cwd, env, key: 'privacy.sources', value: JSON.stringify([...list, { type: 'lines', path: file }]) });
  return { file, added, sourceAdded };
}

/**
 * Sets (usd ≥ 0) or clears (null) a project's own daily budget in the user config, keyed by its repo root.
 * Kept out of the repo file so a cloned repo cannot raise what it may spend.
 */
export function setProjectBudget({ env, root, usd }) {
  if (usd !== null && (typeof usd !== 'number' || !Number.isFinite(usd) || usd < 0)) throw new CliError('ngân sách phải là số ≥ 0', { code: 'config-invalid', why: 'The budget must be a number of at least 0' });
  const file = userConfigPath(env);
  const before = readObj(file);
  const after = structuredClone(before);
  after.budget = isObj(after.budget) ? after.budget : {};
  after.budget.projects = isObj(after.budget.projects) ? after.budget.projects : {};
  if (usd === null) delete after.budget.projects[root]; else after.budget.projects[root] = usd;
  if (!Object.keys(after.budget.projects).length) delete after.budget.projects;
  if (!Object.keys(after.budget).length) delete after.budget;
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  writeAtomic(file, `${JSON.stringify(after, null, 2)}\n`, fs.existsSync(file) ? undefined : 0o600);
  return { file };
}

/** Turns private mode on or off for a repo root, in the user config only (a repo cannot turn it off). */
export function setPrivateProject({ env, root, on }) {
  const file = userConfigPath(env);
  const after = structuredClone(readObj(file));
  after.privacy = isObj(after.privacy) ? after.privacy : {};
  const list = (Array.isArray(after.privacy.privateProjects) ? after.privacy.privateProjects : []).filter((p) => path.resolve(String(p)) !== path.resolve(root));
  if (on) list.push(root);
  if (list.length) after.privacy.privateProjects = list; else delete after.privacy.privateProjects;
  if (!Object.keys(after.privacy).length) delete after.privacy;
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  writeAtomic(file, `${JSON.stringify(after, null, 2)}\n`, fs.existsSync(file) ? undefined : 0o600);
  return { file };
}

/** Names in the default blocklist file (<config dir>/names.txt). @returns {{file: string, names: string[]}} */
export function privacyNames({ env }) {
  const file = path.join(paths(env).config, 'names.txt');
  let names = [];
  try { names = fs.readFileSync(file, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter(Boolean); } catch { /* none yet */ }
  return { file, names };
}

/** Removes names from the default blocklist file; privacy.sources keeps pointing at it. @returns {{file: string, removed: string[]}} */
export function privacyRemove({ env, names, dryRun }) {
  const { file, names: have } = privacyNames({ env });
  const drop = new Set(names.map((n) => String(n).trim()));
  const removed = have.filter((n) => drop.has(n));
  if (removed.length && !dryRun) writeAtomic(file, `${have.filter((n) => !drop.has(n)).join('\n')}\n`, 0o600);
  return { file, removed };
}

/** @returns {{lines: string[], data: any}} */
export function runConfig(positionals, { cwd, env, repo, dryRun }) {
  const [sub, key, value] = positionals;
  const need = (n) => { if (positionals.length !== n) throw usageError(`config ${sub} cần ${n - 1} đối số`, { fix: 'momentry config --help' }); };
  switch (sub) {
    case 'path': need(1); return { lines: [userConfigPath(env)], data: { file: userConfigPath(env) } };
    case 'default': need(1); return { lines: [JSON.stringify(DEFAULTS, null, 2)], data: DEFAULTS };
    case 'show': {
      need(1);
      const s = show({ cwd, env, repo });
      const w = Math.max(...KEYS.map((k) => k.length));
      return { lines: [`# ${s.file}${s.repoFile ? ` + ${s.repoFile}` : ''}`, ...KEYS.map((k) => `${k.padEnd(w)}  ${JSON.stringify(s.values[k].value)}  (${s.values[k].source})`)], data: s };
    }
    case 'get': {
      need(2); checkKey(key);
      const v = show({ cwd, env, repo }).values[key];
      return { lines: [JSON.stringify(v.value)], data: { key, ...v } };
    }
    case 'set': case 'unset': {
      need(sub === 'set' ? 3 : 2);
      const r = write({ cwd, env, key, value: sub === 'set' ? value : undefined, dryRun });
      const what = !r.changed ? `không đổi: ${key}` : dryRun ? `sẽ ghi ${r.file}:\n${JSON.stringify(r.after, null, 2)}` : `${sub === 'set' ? 'đã đặt' : 'đã xoá'} ${key} trong ${r.file}`;
      return { lines: [what], data: { file: r.file, key, changed: r.changed, config: r.after } };
    }
    case 'privacy-add': {
      if (positionals.length < 2) throw usageError('config privacy-add cần ít nhất một tên', { fix: 'momentry config privacy-add "Tên Người" "tên-dự-án-riêng"' });
      const r = privacyAdd({ cwd, env, names: positionals.slice(1), dryRun });
      return { lines: [dryRun ? `sẽ thêm ${r.added.length} tên vào ${r.file}${r.sourceAdded ? ' và khai báo nó trong privacy.sources' : ''}` : `đã thêm ${r.added.length} tên vào ${r.file}${r.sourceAdded ? '; privacy.sources đã trỏ tới file này' : ''}`], data: r };
    }
    default:
      throw usageError(`config: lệnh con lạ: ${sub}`, { why: 'dùng path, show, get, set, unset, default hoặc privacy-add', fix: 'momentry config show' });
  }
}
