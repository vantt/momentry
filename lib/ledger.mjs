// Harvest ledger and per-session locks in <cacheDir> (PRD 6.3).
import fs from 'node:fs';
import path from 'node:path';
import { ensurePrivateDir } from './config.mjs';

/**
 * @typedef {object} HarvestRecord
 * @property {string} at @property {number} fromLine @property {number} toLine
 * @property {number} runs @property {number} runsFailed @property {number} chunks
 * @property {number} hotspots @property {number} hotspotsMissing @property {number} stories
 * @property {number} written @property {number} merged @property {number} privacyBlocked @property {number} privacyUnchecked
 * @property {number|null} usd @property {number} secs @property {'done'|'partial'|'failed'} status
 */

/**
 * @typedef {object} LedgerSession
 * @property {'claude'|'codex'} source @property {string} transcriptPath @property {string} repoRoot
 * @property {number} lastLine @property {number} size @property {number} mtimeMs
 * @property {'done'|'partial'|'failed'} status @property {boolean} pending @property {string[]} needsRescore
 * @property {{toLine: number, text: string}[]} mainGoals @property {HarvestRecord[]} harvests
 */

/** repos: per repoRoot, `autoSince` = when hook-run scans began (older transcripts need a manual scan). */
/** @typedef {{version: 1, sessions: Record<string, LedgerSession>, repos?: Record<string, {autoSince: string}>}} Ledger */
/** @typedef {{sid: string, path: string, fd: number|null, cacheDir: string}} LockHandle */

const FILE = 'ledger.json';
const safe = (sid) => String(sid).replace(/[^A-Za-z0-9._-]+/g, '_');
const empty = () => ({ version: 1, sessions: {}, repos: {} });
const blank = () => ({ source: null, transcriptPath: null, repoRoot: null, lastLine: 0, size: 0, mtimeMs: 0, status: null, pending: false, needsRescore: [], mainGoals: [], harvests: [] });

/** Missing file -> empty ledger. @param {string} cacheDir @returns {Ledger} */
export function load(cacheDir) {
  let text;
  try { text = fs.readFileSync(path.join(cacheDir, FILE), 'utf8'); } catch (e) {
    if (e.code === 'ENOENT') return empty();
    throw e;
  }
  const v = JSON.parse(text);
  if (!v || typeof v !== 'object' || typeof v.sessions !== 'object' || !v.sessions) return empty();
  return { version: 1, sessions: rekeyCodex(v.sessions), repos: v.repos && typeof v.repos === 'object' ? v.repos : {} };
}

/**
 * Codex session ids moved from the uuid head to its tail (UUIDv7 heads collide). Older entries are rekeyed by
 * their stored transcript path, so already harvested sessions are not harvested again.
 */
function rekeyCodex(sessions) {
  const out = { ...sessions };
  for (const [sid, s] of Object.entries(sessions)) {
    if (!sid.startsWith('codex:') || typeof s?.transcriptPath !== 'string') continue;
    const m = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}([0-9a-f]{8})/i.exec(path.basename(s.transcriptPath));
    const next = m ? `codex:${m[1].toLowerCase()}` : sid;
    if (next !== sid && !out[next]) { out[next] = s; delete out[sid]; }
  }
  return out;
}

/** Atomic write (temp + rename), dir mode 0700. @param {Ledger} ledger @param {string} cacheDir */
export function save(ledger, cacheDir) {
  ensurePrivateDir(cacheDir);
  const file = path.join(cacheDir, FILE);
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(ledger, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(tmp, file);
}

function alive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

function isDead(file, staleSec) {
  let st, info;
  try { st = fs.statSync(file); } catch { return true; }
  try { info = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { info = null; }
  if (Date.now() - st.mtimeMs > staleSec * 1000) return true;
  if (!info) return Date.now() - st.mtimeMs > 5000; // being written right now
  return !alive(info.pid);
}

/**
 * `locks/<sid>.lock` via openSync(wx) with {pid, startedAt}. A dead lock (pid gone or mtime older than staleSec) is replaced.
 * A live lock: sets `pending: true` in the ledger and returns {ok: false} (caller exits 5).
 * @param {string} sid @param {{cacheDir: string, staleSec: number}} opts
 * @returns {{ok: true, handle: LockHandle} | {ok: false, pending: true}}
 */
export function lock(sid, opts) {
  const dir = ensurePrivateDir(path.join(opts.cacheDir, 'locks'));
  const file = path.join(dir, `${safe(sid)}.lock`);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = fs.openSync(file, 'wx', 0o600);
      fs.writeSync(fd, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
      fs.closeSync(fd);
      return { ok: true, handle: { sid, path: file, fd: null, cacheDir: opts.cacheDir } };
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
    }
    if (!isDead(file, opts.staleSec ?? 3600)) break;
    fs.rmSync(file, { force: true });
  }
  const ledger = load(opts.cacheDir);
  ledger.sessions[sid] ??= blank();
  ledger.sessions[sid].pending = true;
  save(ledger, opts.cacheDir);
  return { ok: false, pending: true };
}

/** utimes the lock after each step. @param {LockHandle} handle */
export function touch(handle) {
  if (!handle) return;
  const now = new Date();
  try { fs.utimesSync(handle.path, now, now); } catch { /* lock gone */ }
}

/** Removes the lock. @param {LockHandle} handle */
export function unlock(handle) {
  if (handle) fs.rmSync(handle.path, { force: true });
}

/**
 * Next window: {fromLine: lastLine + 1}, {fromLine: 1} if the file shrank/was rewritten, null if nothing new.
 * @param {Ledger} ledger @param {string} sid @param {{size: number, mtimeMs: number, lines: number}} stat
 * @returns {{fromLine: number} | null}
 */
export function needsHarvest(ledger, sid, stat) {
  const s = ledger.sessions[sid];
  const last = s?.lastLine ?? 0;
  if (!s || !last) return stat.lines > 0 ? { fromLine: 1 } : null;
  if (stat.size < (s.size ?? 0) || stat.lines < last) return stat.lines > 0 ? { fromLine: 1 } : null;
  return stat.lines > last ? { fromLine: last + 1 } : null;
}

/**
 * Applies one harvest result: done/partial advance lastLine, failed keeps it; appends harvests[] and mainGoals[];
 * partial adds needsRescore ids. Mutates and returns the ledger.
 * Explicit window (--from-line/--to-line): never moves lastLine back nor skips lines; it only raises lastLine to
 * max(lastLine, toLine) when fromLine <= lastLine + 1, and changes status/size/mtime only when lastLine moved and
 * reaches `lines` (otherwise scan would think the file was fully read).
 * Failed automatic windows bump failedCount (scan stops retrying after scan.maxFailures); success resets it.
 * @param {Ledger} ledger @param {string} sid
 * @param {Omit<LedgerSession, 'status'|'pending'|'needsRescore'|'mainGoals'|'harvests'|'lastLine'>} info
 * @param {HarvestRecord & {mainGoal?: string, needsRescore?: string[]}} rec
 * @param {{explicit?: boolean, lines?: number}} [opts]  lines: current line count of the transcript
 * @returns {Ledger}
 */
export function record(ledger, sid, info, rec, opts = {}) {
  const s = (ledger.sessions[sid] ??= blank());
  for (const k of ['harvests', 'mainGoals', 'needsRescore']) if (!Array.isArray(s[k])) s[k] = [];
  const { mainGoal, needsRescore, ...h } = rec;
  s.harvests.push(opts.explicit ? { ...h, explicit: true } : h);
  if (mainGoal) s.mainGoals.push({ toLine: rec.toLine, text: mainGoal });
  if (needsRescore?.length) s.needsRescore = [...new Set([...s.needsRescore, ...needsRescore])];
  const { size, mtimeMs, ...where } = info;
  Object.assign(s, where);
  const lines = opts.lines ?? rec.toLine;
  if (opts.explicit) {
    const last = s.lastLine ?? 0;
    if (rec.status === 'failed' || rec.fromLine > last + 1 || rec.toLine <= last) return ledger;
    s.lastLine = rec.toLine;
    if (s.lastLine < lines) return ledger;
    Object.assign(s, { size, mtimeMs, lines, status: rec.status, failedCount: 0 });
    return ledger;
  }
  Object.assign(s, { size, mtimeMs, lines, status: rec.status });
  if (rec.status !== 'failed') s.lastLine = rec.toLine;
  // failed, or stopped before the end (a chunk failed in every run): counts toward scan's retry cap
  s.failedCount = rec.status === 'failed' || s.lastLine < lines ? (s.failedCount ?? 0) + 1 : 0;
  return ledger;
}

/**
 * Scan decision for one transcript: 'run', 'same' (nothing new), or 'gave-up' (unchanged file whose last
 * `maxFailures` automatic harvests failed or stopped early; a changed file is tried again).
 * @param {LedgerSession|undefined} s @param {{size: number, mtimeMs: number}} t @param {number} maxFailures
 * @returns {'run'|'same'|'gave-up'}
 */
export function scanState(s, t, maxFailures) {
  if (!s || s.size !== t.size || s.mtimeMs !== t.mtimeMs) return 'run';
  if (s.status !== 'failed' && s.lastLine > 0 && s.lastLine >= (s.lines ?? 0)) return 'same';
  return (s.failedCount ?? 0) >= maxFailures ? 'gave-up' : 'run';
}

const localDay = (d) => { const t = new Date(d); return Number.isNaN(t.getTime()) ? null : `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; };

/**
 * USD spent on reads recorded on a local day (YYYY-MM-DD), across every repo or only one.
 * @param {Ledger} ledger @param {string} day @param {string} [repoRoot]
 */
export function spentOn(ledger, day, repoRoot) {
  let usd = 0;
  for (const s of Object.values(ledger.sessions)) {
    if (repoRoot && path.resolve(s?.repoRoot ?? '') !== path.resolve(repoRoot)) continue;
    for (const h of s?.harvests ?? []) if (typeof h.usd === 'number' && localDay(h.at) === day) usd += h.usd;
  }
  return usd;
}

/** Today's local day. */
export const today = () => localDay(new Date());

const WAIT_FILE = 'budget-wait.json';

/** Records how many sessions of a repo wait for tomorrow's budget (latest automatic scan wins). */
export function noteWaiting(cacheDir, repoRoot, count) {
  const file = path.join(cacheDir, WAIT_FILE);
  let v = {};
  try { v = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* none yet */ }
  if (v.day !== today()) v = { day: today(), repos: {} };
  if (count) v.repos[repoRoot] = count; else delete v.repos[repoRoot];
  ensurePrivateDir(cacheDir);
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(v), { mode: 0o600 });
  fs.renameSync(tmp, file);
}

/** Sessions waiting for budget today, per repo root. @returns {Record<string, number>} */
export function waiting(cacheDir) {
  try { const v = JSON.parse(fs.readFileSync(path.join(cacheDir, WAIT_FILE), 'utf8')); return v.day === today() ? v.repos ?? {} : {}; } catch { return {}; }
}

/** Removes a session from the ledger; true if it existed. @param {Ledger} ledger @param {string} sid @returns {boolean} */
export function forget(ledger, sid) {
  if (!Object.hasOwn(ledger.sessions, sid)) return false;
  delete ledger.sessions[sid];
  return true;
}
