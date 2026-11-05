// Model calls (PRD 4.10, 5.5, 7.2, DM.4). Errors carry `exitCode = 4`.
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { EXIT, ensurePrivateDir, PROMPT_CACHES } from './config.mjs';
import { commandFor } from './proc.mjs';
import { extractJson } from './json.mjs';

/**
 * @typedef {object} CallOpts
 * @property {string} key          fake-llm key, e.g. `harvest-c1-r1`, `cluster-1`, `harvest-c1-r1-retry`
 * @property {string} model        haiku | sonnet | ...
 * @property {string} prompt
 * @property {number} timeoutSec   kill the child after this
 * @property {string|null} [fakeDir]  read `<fakeDir>/<key>.json` instead of calling (missing file -> exitCode 4)
 * @property {string|null} [saveDir]  write the raw `claude -p` JSON to `<saveDir>/<key>.json`
 * @property {string|null} [runDir]   also keep prompt + raw output here (cache runs/<sid>/<ts>/)
 * @property {string} [bin]           executable, default `claude` (tests point it at a fake)
 * @property {NodeJS.ProcessEnv} [env]
 * @property {PromptCache} [cache]     prompt cache of the call, default 'off' (see callEnv)
 */

/** @typedef {'off'|'5m'|'1h'|'auto'} PromptCache */

const KEY_RE = /^[a-z0-9][a-z0-9-]*$/;
const CACHE_ENV = ['DISABLE_PROMPT_CACHING', 'DISABLE_PROMPT_CACHING_HAIKU', 'DISABLE_PROMPT_CACHING_SONNET', 'DISABLE_PROMPT_CACHING_OPUS',
  'CLAUDE_CODE_PROMPT_CACHE_TTL', 'FORCE_PROMPT_CACHING_5M', 'ENABLE_PROMPT_CACHING_1H'];

/**
 * Child env for one call. Every prompt is sent once, so a cache write is paid and never read back (one retry at
 * most): 'off' (default) bills plain input; '5m' / '1h' force that cache lifetime; 'auto' leaves claude's own choice
 * (1 hour on a subscription, 5 minutes on an API key) and the caller's env untouched.
 * @param {NodeJS.ProcessEnv} env @param {{cache?: PromptCache}} [o] @returns {NodeJS.ProcessEnv}
 */
export function callEnv(env, { cache = 'off' } = {}) {
  if (!PROMPT_CACHES.includes(cache)) throw llmError(`cache lạ: ${JSON.stringify(cache)} (${PROMPT_CACHES.join(', ')})`, { kind: 'llm-cache' });
  const out = { ...env, STORY_HARVEST: '1' };
  if (cache !== 'auto') {
    for (const k of CACHE_ENV) delete out[k];
    if (cache === 'off') out.DISABLE_PROMPT_CACHING = '1';
    else out.CLAUDE_CODE_PROMPT_CACHE_TTL = cache;
  }
  return out;
}

const KILL_GRACE_MS = 2000;

function llmError(msg, extra = {}) {
  const e = new Error(msg);
  e.exitCode = EXIT.LLM;
  return Object.assign(e, extra);
}

/** Argv for an isolated call: -p --model M --setting-sources "" --tools "" --strict-mcp-config --no-session-persistence --output-format json. @param {string} model @returns {string[]} */
export function buildArgs(model) {
  return ['-p', '--model', model, '--setting-sources', '', '--tools', '', '--strict-mcp-config',
    '--no-session-persistence', '--output-format', 'json'];
}

function writePrivate(dir, file, text) {
  ensurePrivateDir(dir);
  fs.writeFileSync(path.join(dir, file), text, { mode: 0o600 });
}

/** Parses `claude -p --output-format json` stdout. @returns {{result: string, usd: number|null, ms: number|null}} */
function parseOutput(raw, key) {
  let o;
  try { o = JSON.parse(raw); } catch { throw llmError(`${key}: đầu ra claude không phải JSON`, { kind: 'llm-bad-output' }); }
  if (o === null || typeof o !== 'object') throw llmError(`${key}: đầu ra claude không phải object`, { kind: 'llm-bad-output' });
  const usd = typeof o.total_cost_usd === 'number' ? o.total_cost_usd : null;
  if (o.is_error === true) throw llmError(`${key}: is_error${o.subtype ? ` (${o.subtype})` : ''}`, { usd, kind: 'llm-is-error' });
  if (typeof o.result !== 'string') throw llmError(`${key}: thiếu result`, { usd, kind: 'llm-bad-output' });
  return { result: o.result, usd, ms: typeof o.duration_ms === 'number' ? o.duration_ms : null };
}

/** Runs the child, kills its process group after timeoutSec. @returns {Promise<{code: number|null, signal: string|null, stdout: string, stderr: string, timedOut: boolean}>} */
function runChild(bin, args, prompt, timeoutSec, env) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      const c = commandFor(bin, args, { env });
      child = spawn(c.file, c.args, { env, stdio: ['pipe', 'pipe', 'pipe'], detached: process.platform !== 'win32', ...c.options });
    } catch (e) { return reject(e); }
    const out = [], err = [];
    let timedOut = false, hard = null;
    const kill = sig => {
      // Windows: claude may run under cmd.exe (claude.cmd); kill the whole tree or it keeps the pipes open.
      if (process.platform === 'win32') { try { spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true }); } catch { /* gone */ } return; }
      try { process.kill(-child.pid, sig); } catch { try { child.kill(sig); } catch { /* gone */ } }
    };
    const timer = setTimeout(() => {
      timedOut = true;
      kill('SIGTERM');
      hard = setTimeout(() => kill('SIGKILL'), KILL_GRACE_MS);
    }, Math.max(0, timeoutSec) * 1000);
    child.stdout.on('data', d => out.push(d));
    child.stderr.on('data', d => err.push(d));
    child.stdin.on('error', () => {});
    child.on('error', e => { clearTimeout(timer); clearTimeout(hard); reject(e); });
    child.on('close', (code, signal) => {
      clearTimeout(timer); clearTimeout(hard);
      resolve({ code, signal, timedOut, stdout: Buffer.concat(out).toString('utf8'), stderr: Buffer.concat(err).toString('utf8') });
    });
    child.stdin.end(prompt);
  });
}

/**
 * One call. Fails (throws, exitCode 4) on non-zero exit, timeout, `is_error: true`, or missing `result`.
 * Runs with env STORY_HARVEST=1 plus the cache setting of callEnv.
 * @param {CallOpts} opts @returns {Promise<{result: string, usd: number|null, secs: number}>}
 */
export async function call(opts) {
  const { key, model, prompt, timeoutSec, fakeDir = null, saveDir = null, runDir = null, bin = 'claude', env = process.env } = opts;
  if (!KEY_RE.test(key ?? '')) throw llmError(`key lạ: ${JSON.stringify(key)}`, { kind: 'llm-key' });
  const childEnv = callEnv(env, { cache: opts.cache });
  if (runDir) writePrivate(runDir, `${key}.prompt.txt`, prompt ?? '');

  if (fakeDir) {
    const file = path.join(fakeDir, `${key}.json`);
    let raw;
    try { raw = fs.readFileSync(file, 'utf8'); } catch { throw llmError(`thiếu file --fake-llm: ${file}`, { kind: 'llm-fake-missing' }); }
    if (runDir) writePrivate(runDir, `${key}.json`, raw);
    const r = parseOutput(raw, key);
    return { result: r.result, usd: r.usd, secs: r.ms == null ? 0 : r.ms / 1000 };
  }

  const t0 = Date.now();
  let res;
  try {
    res = await runChild(bin, buildArgs(model), prompt ?? '', timeoutSec, childEnv);
  } catch (e) {
    throw llmError(`${key}: không chạy được ${bin}: ${e.code ?? e.message}`, { kind: 'llm-spawn' });
  }
  const secs = (Date.now() - t0) / 1000;
  if (res.stdout) {
    if (runDir) writePrivate(runDir, `${key}.json`, res.stdout);
    if (saveDir) writePrivate(saveDir, `${key}.json`, res.stdout);
  }
  if (res.timedOut) throw llmError(`${key}: quá ${timeoutSec}s, đã giết tiến trình`, { secs, kind: 'llm-timeout' });
  if (res.code !== 0) {
    try { parseOutput(res.stdout, key); } catch (e) { if (/: is_error/.test(e.message)) throw Object.assign(e, { secs }); }
    const tail = res.stderr.trim().split('\n').slice(-1)[0]?.slice(0, 200) ?? '';
    throw llmError(`${key}: ${bin} thoát ${res.code ?? res.signal}${tail ? `: ${tail}` : ''}`, { secs, kind: 'llm-exit' });
  }
  const r = parseOutput(res.stdout, key);
  return { result: r.result, usd: r.usd, secs };
}

const addUsd = (a, b) => (a == null && b == null ? null : (a ?? 0) + (b ?? 0));

/**
 * call + extractJson + validate; on any failure retries once with key `<key>-retry`; still failing -> throws (exitCode 4).
 * The thrown error carries `usd`, `secs` and `errors` (messages of both attempts).
 * @param {CallOpts & {validate: (json: any) => string[]}} opts
 * @returns {Promise<{json: any, usd: number|null, secs: number, retried: boolean}>}
 */
export async function callJson(opts) {
  const { validate, ...base } = opts;
  let usd = null, secs = 0;
  const errors = [];
  for (const [i, key] of [base.key, `${base.key}-retry`].entries()) {
    try {
      const r = await call({ ...base, key });
      usd = addUsd(usd, r.usd);
      secs += r.secs;
      const json = extractJson(r.result);
      const errs = validate ? validate(json) : [];
      if (!errs.length) return { json, usd, secs, retried: i > 0 };
      errors.push(`${key}: ${errs.slice(0, 5).join('; ')}${errs.length > 5 ? ` (+${errs.length - 5})` : ''}`);
    } catch (e) {
      usd = addUsd(usd, e.usd ?? null);
      secs += e.secs ?? 0;
      errors.push(e.message.startsWith(key) || e.message.startsWith('thiếu file') ? e.message : `${key}: ${e.message}`);
    }
  }
  throw llmError(`model lỗi sau khi gọi lại: ${errors.join(' | ')}`, { usd, secs, errors, kind: 'llm-retry-failed' });
}

// ---------- cost estimate ----------

/**
 * List prices in USD per million tokens, read off `total_cost_usd` of real `claude -p` calls (Claude Code 2.1.318,
 * docs/experiments/2026-11-05-cost-cuts). Haiku bills a whole prompt over `longOver` tokens at `long` times both
 * prices. Unknown models are priced as opus, the dearest measured.
 */
export const PRICES = Object.freeze({
  haiku: Object.freeze({ in: 0.1, out: 0.5, longOver: 100000, long: 5 }),
  sonnet: Object.freeze({ in: 2, out: 10 }),
  opus: Object.freeze({ in: 4, out: 20 }),
});
/** Prompt price relative to plain input: a cache write per lifetime ('auto' = 1 hour, as on a subscription). */
const CACHE_FACTOR = Object.freeze({ off: 1, '5m': 1.25, '1h': 2, auto: 2 });

/**
 * Estimated USD of one call.
 * @param {string} model haiku | sonnet | opus | full model id @param {number} inTokens prompt tokens, system prompt included
 * @param {number} outTokens output and thinking tokens @param {PromptCache} [cache] @returns {number}
 */
export function callUsd(model, inTokens, outTokens, cache = 'off') {
  const name = Object.keys(PRICES).find((k) => String(model).toLowerCase().includes(k)) ?? 'opus';
  const p = PRICES[name];
  const mult = p.longOver && inTokens > p.longOver ? p.long : 1;
  return ((inTokens * p.in * (CACHE_FACTOR[cache] ?? 2)) + (outTokens * p.out)) * mult / 1e6;
}
