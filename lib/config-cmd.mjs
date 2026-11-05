// `momentry config path|show|get|set|unset|default|privacy-add`: the binary owns the defaults and validates every edit.
// Every setting changes through here; `--project` reaches the per-project ones with the writers the web UI uses.
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULTS, REPO_FILE, USER_ONLY, loadConfig, userConfigPath, isObserved } from './config.mjs';
import { gitRoot, isInside } from './repo.mjs';
import * as Projects from './projects.mjs';
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
  if (PROJECT_KEYS.includes(key)) throw new CliError(`${key} là cài đặt riêng của từng dự án`, { code: 'config-project-only', why: 'đặt cho repo đang đứng (hoặc --repo DIR) trên máy này', fix: `momentry config get ${key} --project` });
  const near = didYouMean(key, KEYS);
  throw new CliError(`khoá lạ: ${key}`, { code: 'config-unknown-key', why: near ? `ý bạn là ${near}?` : `khoá hợp lệ: ${KEYS.join(', ')}`, fix: near ? `momentry config get ${near}` : 'momentry config default' });
}

/** Source word of a story folder chosen for one project on this machine (kept in the project list). */
export const MACHINE = 'dự án trên máy này';

/** Effective values with the layer that set each one. */
export function show({ cwd, env, repo }) {
  const cfg = loadConfig({ cwd, env, flags: { repo } });
  const user = readObj(userConfigPath(env));
  const root = gitRoot(path.resolve(cwd, repo || '.'));
  const repoCfg = root ? readObj(path.join(root, REPO_FILE)) : {};
  const ownBox = root ? Projects.boxOf(env, root) : null;
  const values = {};
  for (const key of KEYS) {
    let source = 'mặc định';
    if (lookup(user, key).found) source = 'người dùng';
    if (!USER_ONLY.includes(key) && lookup(repoCfg, key).found) source = 'repo';
    if (key === 'box' && ownBox) source = MACHINE;
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
export function setProjectBudget({ env, root, usd, dryRun = false }) {
  if (usd !== null && (typeof usd !== 'number' || !Number.isFinite(usd) || usd < 0)) throw new CliError('ngân sách phải là số ≥ 0', { code: 'config-invalid', why: 'The budget must be a number of at least 0' });
  const file = userConfigPath(env);
  if (dryRun) return { file };
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

/**
 * A project's story folder. Inside the repo it goes into the repo file as a relative path, shared with the repo;
 * outside the repo it stays on this machine, in the project list, so the repo file never holds a path of this
 * machine. null removes the most specific setting: the folder chosen for this machine if any, else the repo file's.
 * dryRun checks the value and says where it would go, writing nothing.
 * @param {{env: NodeJS.ProcessEnv, root: string, box: string|null, dryRun?: boolean}} o
 * @returns {{where: 'machine'|'repo', box: string|null}}
 */
export function setProjectBox({ env, root, box, dryRun = false }) {
  if (box === null || box === undefined || box === '') {
    if (Projects.boxOf(env, root)) { if (!dryRun) Projects.setBox(env, root, null); return { where: 'machine', box: null }; }
    if (!dryRun) write({ cwd: root, env, key: 'box', value: undefined, scope: 'project', repo: root, parsed: true });
    return { where: 'repo', box: null };
  }
  if (typeof box !== 'string') throw new CliError('box phải là chuỗi', { code: 'config-invalid', why: 'The story folder must be a path' });
  const v = box.trim();
  // a relative value is a folder inside the project (the schema refuses `.` and `..`); only an absolute path may leave it
  const bad = path.isAbsolute(v) ? null : validate('box', v);
  if (bad) throw new CliError(`giá trị không hợp lệ cho box: ${bad}`, { code: 'config-invalid', why: bad });
  const abs = path.resolve(root, v);
  if (isInside(root, abs)) {
    const why = 'Story folder must not be the project itself or a folder that contains it';
    throw new CliError(`giá trị không hợp lệ cho box: ${abs} chứa cả repo`, { code: 'config-invalid', why });
  }
  if (!isInside(abs, root)) {
    if (!dryRun) Projects.setBox(env, root, abs);
    return { where: 'machine', box: abs };
  }
  if (dryRun) return { where: 'repo', box: abs };
  write({ cwd: root, env, key: 'box', value: path.relative(root, abs).split(path.sep).join('/'), scope: 'project', repo: root, parsed: true });
  Projects.setBox(env, root, null);
  return { where: 'repo', box: abs };
}

/** Turns private mode on or off for a repo root, in the user config only (a repo cannot turn it off). */
export function setPrivateProject({ env, root, on, dryRun = false }) {
  const file = userConfigPath(env);
  if (dryRun) return { file };
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

// ---------- per-project settings (`--project`) ----------
// Each key goes through the writer the web UI uses for it, so the CLI and the UI hold the same rules and see the same
// values. Only `box` (inside the repo) and `repo` may land in the repo file; the rest stay on this machine.

/** Keys one project can set for itself. */
export const PROJECT_KEYS = ['box', 'repo', 'budget.dailyUsd', 'private', 'paused'];

/** @param {{cwd: string, repo?: string}} o @returns {string} */
function projectRoot({ cwd, repo }) {
  const root = gitRoot(path.resolve(cwd, repo || '.'));
  if (!root) throw new CliError('không ở trong git repo', { code: 'not-git', fix: 'cd vào repo cần sửa, hoặc thêm --repo DIR' });
  return root;
}

function checkProjectKey(key) {
  if (PROJECT_KEYS.includes(key)) return;
  const why = `khoá riêng từng dự án: ${PROJECT_KEYS.join(', ')}`;
  if (KEYS.includes(key)) throw new CliError(`${key} giống nhau cho mọi dự án, không đặt riêng cho một dự án được`, { code: 'config-not-project', why, fix: `momentry config set ${key} …   # bỏ --project` });
  const near = didYouMean(key, PROJECT_KEYS);
  throw new CliError(`khoá lạ: ${key}`, { code: 'config-unknown-key', why: near ? `ý bạn là ${near}?` : why, fix: near ? `momentry config get ${near} --project` : 'momentry config show --project' });
}

/** Files that hold a project's settings. */
function projectFiles(env, root) {
  return { repo: path.join(root, REPO_FILE), machine: Projects.listFile(env), user: userConfigPath(env) };
}

/** What a project sets for itself, per key (null: nothing of its own). Throws on a broken project list. */
function ownValues(env, root) {
  const files = projectFiles(env, root);
  const repoCfg = readObj(files.repo);
  const user = readObj(files.user);
  const entry = Projects.find(Projects.read(env), root);
  const repoBox = lookup(repoCfg, 'box').value;
  const repoName = lookup(repoCfg, 'repo').value;
  const budgets = lookup(user, 'budget.projects').value;
  const priv = lookup(user, 'privacy.privateProjects').value;
  const own = (value, source, file) => ({ value, source, file });
  return {
    box: entry?.box ? own(entry.box, MACHINE, files.machine)
      : typeof repoBox === 'string' && repoBox ? own(path.resolve(root, repoBox), 'repo', files.repo) : null,
    repo: typeof repoName === 'string' && repoName ? own(repoName, 'repo', files.repo) : null,
    'budget.dailyUsd': isObj(budgets) && budgets[root] !== undefined ? own(budgets[root], MACHINE, files.user) : null,
    private: Array.isArray(priv) && priv.some((p) => path.resolve(String(p)) === path.resolve(root)) ? own(true, MACHINE, files.user) : null,
    paused: entry?.paused === true ? own(true, MACHINE, files.machine) : null,
  };
}

/**
 * Every per-project setting of one repo, with the value in effect and where it comes from: the repo file, this
 * machine, the user config, the default or an env var. budget.dailyUsd without a value of its own shows the
 * general daily budget, which still caps the project.
 * @returns {{root: string, files: {repo: string, machine: string, user: string}, values: Record<string, {value: any, source: string}>}}
 */
export function showProject({ cwd, env, repo }) {
  const root = projectRoot({ cwd, repo });
  const own = ownValues(env, root);
  const general = show({ cwd: root, env, repo: root }).values;
  const pick = (k) => (own[k] ? { value: own[k].value, source: own[k].source } : null);
  const values = {
    box: general.box,
    repo: general.repo,
    'budget.dailyUsd': pick('budget.dailyUsd') ?? { value: general['budget.dailyUsd'].value, source: `${general['budget.dailyUsd'].source}, chung mọi dự án` },
    private: pick('private') ?? { value: false, source: 'mặc định' },
    paused: pick('paused') ?? { value: false, source: 'mặc định' },
  };
  return { root, files: projectFiles(env, root), values };
}

/** true/false (also 1/0) from the command line or the UI. */
function toBool(key, v) {
  if (v === true || v === 1) return true;
  if (v === false || v === 0) return false;
  throw new CliError(`giá trị không hợp lệ cho ${key}: ${JSON.stringify(v)}`, { code: 'config-invalid', why: `${key} phải là true hoặc false`, fix: `momentry config set ${key} true --project` });
}

const notObserved = (root, why) => new CliError(`repo không được quan sát: ${root}`, { code: 'not-observed', why, fix: 'momentry init' });

/**
 * Sets (value !== undefined) or unsets one per-project setting, through the same writer the web UI uses for it:
 * box → setProjectBox (inside the repo: repo file; outside: this machine's project list), repo → the repo file,
 * budget.dailyUsd → setProjectBudget (user config), private → setPrivateProject (user config), paused →
 * Projects.setPaused (project list). Writes nothing when the value is already in effect, or with dryRun.
 * @param {{cwd: string, env: NodeJS.ProcessEnv, repo?: string, key: string, value?: any, dryRun?: boolean, parsed?: boolean}} o
 *   parsed: value is already a JS value, not command-line text
 * @returns {{root: string, key: string, value: any, file: string, where: 'repo'|'machine', changed: boolean}}
 */
export function writeProject({ cwd, env, repo, key, value, dryRun = false, parsed = false }) {
  checkProjectKey(key);
  const root = projectRoot({ cwd, repo });
  const files = projectFiles(env, root);
  const own = ownValues(env, root)[key];
  const unset = value === undefined;
  const observed = isObserved(root, env);
  const out = (v, file, where, changed) => ({ root, key, value: v, file, where, changed });
  switch (key) {
    case 'box': {
      if (unset) {
        if (!own) return out(null, files.repo, 'repo', false);
        if (!dryRun) setProjectBox({ env, root, box: null });
        return out(null, own.file, own.source === 'repo' ? 'repo' : 'machine', true);
      }
      const box = parsed ? value : String(value).trim().replace(/^~(?=$|[\\/])/, () => env.HOME || env.USERPROFILE || '~');
      const plan = setProjectBox({ env, root, box, dryRun: true });
      // writing the repo file would turn momentry on for the repo, which is what init is for
      if (plan.where === 'repo' && !observed) throw notObserved(root, 'thư mục chuyện trong repo nằm ở .momentry.json, mà repo chưa bật');
      const changed = !own || own.value !== plan.box || own.source !== (plan.where === 'machine' ? MACHINE : 'repo');
      if (changed && !dryRun) setProjectBox({ env, root, box });
      return out(plan.box, plan.where === 'machine' ? files.machine : files.repo, plan.where, changed);
    }
    case 'repo': {
      if (!unset && !observed) throw notObserved(root, 'tên dự án nằm ở .momentry.json, mà repo chưa bật');
      if (unset && !own) return out(null, files.repo, 'repo', false);
      const r = write({ cwd: root, env, key, value, dryRun, scope: 'project', repo: root, parsed });
      return out(unset ? null : lookup(r.after, key).value, r.file, 'repo', r.changed);
    }
    case 'budget.dailyUsd': {
      const usd = unset ? null : parsed ? value : parseValue(value);
      setProjectBudget({ env, root, usd, dryRun: true });
      const changed = (own?.value ?? null) !== usd;
      if (changed && !dryRun) setProjectBudget({ env, root, usd });
      return out(usd, files.user, 'machine', changed);
    }
    case 'private': case 'paused': {
      const on = unset ? false : toBool(key, parsed ? value : parseValue(value));
      if (key === 'paused' && on && !observed) throw notObserved(root, 'repo chưa bật thì vốn không gom chuyện');
      const changed = (own?.value === true) !== on;
      if (changed && !dryRun) {
        if (key === 'private') setPrivateProject({ env, root, on });
        else Projects.setPaused(env, root, on);
      }
      return out(on, key === 'private' ? files.user : files.machine, 'machine', changed);
    }
    default: throw new Error(`no writer for ${key}`);
  }
}

function runProject(sub, key, value, need, { cwd, env, repo, dryRun }) {
  switch (sub) {
    case 'show': {
      need(1);
      const s = showProject({ cwd, env, repo });
      const w = Math.max(...PROJECT_KEYS.map((k) => k.length));
      const head = [`# dự án ${s.root}`, `# repo: ${s.files.repo}`, `# máy này: ${s.files.machine} + ${s.files.user}`];
      return { lines: [...head, ...PROJECT_KEYS.map((k) => `${k.padEnd(w)}  ${JSON.stringify(s.values[k].value)}  (${s.values[k].source})`)], data: s };
    }
    case 'get': {
      need(2); checkProjectKey(key);
      const s = showProject({ cwd, env, repo });
      return { lines: [JSON.stringify(s.values[key].value)], data: { root: s.root, key, ...s.values[key] } };
    }
    case 'set': case 'unset': {
      need(sub === 'set' ? 3 : 2);
      const r = writeProject({ cwd, env, repo, key, value: sub === 'set' ? value : undefined, dryRun });
      const place = `${r.where === 'repo' ? 'repo' : MACHINE}, ${r.file}`;
      const shown = sub === 'set' ? `${key} = ${JSON.stringify(r.value)}` : key;
      const what = !r.changed ? `không đổi: ${key}` : `${dryRun ? 'sẽ' : 'đã'} ${sub === 'set' ? 'đặt' : 'xoá'} ${shown} cho ${r.root} (${place})`;
      return { lines: [what], data: dryRun ? { ...r, dryRun: true } : r };
    }
    default:
      throw usageError(`config ${sub}: không dùng được với --project`, { why: 'với --project chỉ có show, get, set, unset', fix: 'momentry config show --project' });
  }
}

/** @returns {{lines: string[], data: any}} */
export function runConfig(positionals, { cwd, env, repo, dryRun, project = false }) {
  const [sub, key, value] = positionals;
  const need = (n) => { if (positionals.length !== n) throw usageError(`config ${sub} cần ${n - 1} đối số`, { fix: 'momentry config --help' }); };
  if (project) return runProject(sub, key, value, need, { cwd, env, repo, dryRun });
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
