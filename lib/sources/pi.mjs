// pi (@mariozechner/pi-coding-agent, earendil-works/pi) and omp (oh-my-pi, can1357/oh-my-pi) transcripts.
// Both write JSONL sessions under <agentDir>/sessions/<encoded cwd>/<ts>_<uuid>.jsonl: a `session` header
// {cwd, id}, then `message` entries with roles user | assistant | toolResult | bashExecution. omp adds a
// leading `title` line, `attribution` on user messages (agent-injected ones are dropped), and
// `custom` tool_execution_start noise. Directory names are not relied on: the header's cwd decides the repo.
import fs from 'node:fs';
import path from 'node:path';
import { isInside } from '../repo.mjs';
import { hostRoots } from '../profiles.mjs';
import { jsonLines, countLines } from './claude.mjs';
import { patchPaths } from './codex.mjs';

export { countLines };

const SHELL_TOOLS = new Set(['bash']);
const WRITE_TOOLS = new Set(['write', 'edit']);
const EXIT_RE = /exited with code (-?\d+)/i;
const UUID_TAIL_RE = /([0-9a-f]{8})(?:\.jsonl)?$/i;

/**
 * `<host>:<last 8 hex of the session uuid>`: pi/omp ids are UUIDv7, whose first 8 hex repeat for ~65 s.
 * @param {string} file @param {'pi'|'omp'} [host]
 */
export function sessionId(file, host = 'pi') {
  const base = path.basename(file, '.jsonl');
  const m = UUID_TAIL_RE.exec(base.replace(/-/g, ''));
  return `${host}:${(m ? m[1] : base.slice(-8)).toLowerCase()}`;
}

/** The session header ({cwd, id}) among the first lines (omp puts a `title` line before it). @param {string} file */
export function sessionMeta(file) {
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(64 * 1024);
    const n = fs.readSync(fd, buf, 0, buf.length, 0);
    for (const line of buf.subarray(0, n).toString('utf8').split('\n').slice(0, 5)) {
      try {
        const o = JSON.parse(line);
        if (o?.type === 'session') return { cwd: typeof o.cwd === 'string' ? o.cwd : null, id: typeof o.id === 'string' ? o.id : null };
      } catch { /* partial or non-JSON line */ }
    }
  } catch { /* unreadable */ } finally { if (fd !== undefined) fs.closeSync(fd); }
  return null;
}

/** Session dirs: <root>/sessions for each profile root, unless a test passes them. */
function sessionDirs(host, opts) {
  if (opts.sessionsDirs) return opts.sessionsDirs;
  return hostRoots(host, opts.env ?? process.env).map((r) => path.join(r, 'sessions'));
}

/**
 * Sessions of a repo across every profile: depth-1 `*.jsonl` in each bucket (nested subagent artifacts skipped),
 * kept when the header cwd lies inside repoRoot.
 * @param {string} repoRoot @param {{host?: 'pi'|'omp', env?: NodeJS.ProcessEnv, sessionsDirs?: string[]}} [opts]
 */
export function listTranscripts(repoRoot, opts = {}) {
  const host = opts.host ?? 'pi';
  const out = [];
  for (const root of sessionDirs(host, opts)) {
    let buckets;
    try { buckets = fs.readdirSync(root, { withFileTypes: true }); } catch { continue; }
    for (const b of buckets) {
      if (!b.isDirectory()) continue;
      const dir = path.join(root, b.name);
      let files;
      try { files = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
      for (const f of files) {
        if (!f.isFile() || !f.name.endsWith('.jsonl')) continue;
        const p = path.join(dir, f.name);
        const meta = sessionMeta(p);
        if (!meta?.cwd || !isInside(meta.cwd, repoRoot)) continue;
        const st = fs.statSync(p);
        out.push({ path: p, sid: sessionId(p, host), source: host, cwd: meta.cwd, size: st.size, mtimeMs: st.mtimeMs });
      }
    }
  }
  return out.sort((a, b) => a.mtimeMs - b.mtimeMs);
}

const textOf = (c) => (typeof c === 'string' ? c : Array.isArray(c) ? c.filter((x) => x?.type === 'text').map((x) => x.text ?? '').join('\n') : '');

function classifyTool(name, args, resultPath) {
  const a = args && typeof args === 'object' ? args : {};
  if (SHELL_TOOLS.has(name)) return { name, op: 'shell', paths: [], text: String(a.command ?? '') };
  if (WRITE_TOOLS.has(name)) {
    const p = a.path ?? resultPath ?? null;
    const paths = p ? [p] : typeof a.input === 'string' ? patchPaths(a.input) : [];
    return { name, op: 'write', paths, text: paths.join(', ') || name };
  }
  return { name, op: 'other', paths: [], text: String(a.description ?? a.prompt ?? a.pattern ?? a.path ?? JSON.stringify(a)).slice(0, 2000) };
}

/**
 * Entries in [fromLine, toLine]. omp switches apply automatically (title line, attribution, custom noise).
 * @param {string} file @param {{fromLine?: number, toLine?: number}} [range]
 * @returns {import('./claude.mjs').Entry[]}
 */
export function readEntries(file, range = {}) {
  const out = [];
  const pending = new Map(); // toolCallId -> index of its tool Entry (to fill edit paths from the result)
  for (const [L, o] of jsonLines(file, range)) {
    if (o.type !== 'message' || !o.message) continue;
    const m = o.message;
    const ts = typeof o.timestamp === 'string' ? o.timestamp : null;
    if (m.role === 'user') {
      if (m.attribution === 'agent') continue;
      const t = textOf(m.content).trim();
      if (t) out.push({ L, ts, kind: 'user', text: t, bip: false });
    } else if (m.role === 'assistant' && Array.isArray(m.content)) {
      for (const x of m.content) {
        if (x?.type === 'text' && x.text?.trim()) out.push({ L, ts, kind: 'assistant', text: x.text });
        else if (x?.type === 'toolCall') {
          out.push({ L, ts, kind: 'tool', ...classifyTool(x.name, x.arguments) });
          if (x.id) pending.set(x.id, out.length - 1);
        }
      }
    } else if (m.role === 'toolResult') {
      const text = textOf(m.content);
      const code = EXIT_RE.exec(text);
      const isError = m.isError === true;
      const i = pending.get(m.toolCallId);
      if (i !== undefined && out[i].op === 'write' && !out[i].paths.length && typeof m.details?.path === 'string') {
        out[i] = { ...out[i], paths: [m.details.path], text: m.details.path };
      }
      const isShell = i !== undefined ? out[i].op === 'shell' : SHELL_TOOLS.has(m.toolName);
      out.push({ L, ts, kind: 'result', name: m.toolName ?? '', text, isError, exitCode: code ? Number(code[1]) : isShell && !isError ? 0 : null });
    } else if (m.role === 'bashExecution') {
      out.push({ L, ts, kind: 'tool', name: 'bash', op: 'shell', paths: [], text: String(m.command ?? '') });
      out.push({ L, ts, kind: 'result', name: 'bash', text: String(m.output ?? ''), isError: Number.isInteger(m.exitCode) && m.exitCode !== 0, exitCode: Number.isInteger(m.exitCode) ? m.exitCode : null });
    }
  }
  return out;
}
