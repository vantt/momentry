// Model calls (PRD 4.10, 5.5, 7.2, DM.4). Errors carry `exitCode = 4`.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { EXIT, ensurePrivateDir } from './config.mjs';
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
 */

const KEY_RE = /^[a-z0-9][a-z0-9-]*$/;
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
      child = spawn(bin, args, { env, stdio: ['pipe', 'pipe', 'pipe'], detached: process.platform !== 'win32' });
    } catch (e) { return reject(e); }
    const out = [], err = [];
    let timedOut = false, hard = null;
    const kill = sig => {
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
 * Runs with env STORY_HARVEST=1.
 * @param {CallOpts} opts @returns {Promise<{result: string, usd: number|null, secs: number}>}
 */
export async function call(opts) {
  const { key, model, prompt, timeoutSec, fakeDir = null, saveDir = null, runDir = null, bin = 'claude', env = process.env } = opts;
  if (!KEY_RE.test(key ?? '')) throw llmError(`key lạ: ${JSON.stringify(key)}`, { kind: 'llm-key' });
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
    res = await runChild(bin, buildArgs(model), prompt ?? '', timeoutSec, { ...env, STORY_HARVEST: '1' });
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
