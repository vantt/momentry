// `momentry config path|show|get|set|unset|default|privacy-add`: the binary owns the defaults and validates every edit.
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULTS, REPO_FILE, USER_ONLY, loadConfig, userConfigPath } from './config.mjs';
import { gitRoot } from './repo.mjs';
import { CliError, usageError } from './cli-output.mjs';
import { didYouMean } from './commands.mjs';
import { writeAtomic } from './install.mjs';
import { paths } from './paths.mjs';

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
 * set (value !== undefined) or unset a key in the user config file, validating the result before it replaces the file.
 * @returns {{file: string, before: object, after: object, changed: boolean}}
 */
export function write({ cwd, env, key, value, dryRun }) {
  checkKey(key);
  const file = userConfigPath(env);
  let text = null;
  try { text = fs.readFileSync(file, 'utf8'); } catch (e) { if (e.code !== 'ENOENT') throw new CliError(`không đọc được ${file}: ${e.message}`); }
  let before = {};
  if (text !== null && text.trim()) {
    try { before = JSON.parse(text); } catch (e) { throw new CliError(`${file} hỏng: ${e.message}`, { fix: `sửa tay ${file}` }); }
  }
  const after = setIn(structuredClone(before), key, value === undefined ? undefined : parseValue(value));
  const changed = JSON.stringify(after) !== JSON.stringify(before);
  if (!changed || dryRun) return { file, before, after, changed };
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const probe = `${file}.check-${process.pid}`;
  fs.writeFileSync(probe, JSON.stringify(after));
  try {
    loadConfig({ cwd, env: { ...env, MOMENTRY_CONFIG: probe } });
  } catch (e) {
    throw new CliError(`giá trị không hợp lệ cho ${key}: ${e.message}`, { code: 'config-invalid', fix: `momentry config get ${key}` });
  } finally { fs.rmSync(probe, { force: true }); }
  writeAtomic(file, `${JSON.stringify(after, null, 2)}\n`, text === null ? 0o600 : undefined);
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
