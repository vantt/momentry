// Claude Code transcripts (PRD 6.1, 6.2). Ported from harness/reduce.mjs; tools classified into op/paths.
import fs from 'node:fs';
import path from 'node:path';
import { paths } from '../paths.mjs';
import { isInside } from '../repo.mjs';

/**
 * Normalised transcript entry, source-independent (PRD 6.2).
 * @typedef {object} Entry
 * @property {number} L           1-based line number in the source file
 * @property {string|null} ts     line timestamp
 * @property {'user'|'assistant'|'tool'|'result'} kind
 * @property {string} [name]      original tool name (display only)
 * @property {'shell'|'write'|'other'} [op]  for kind 'tool'
 * @property {string[]} [paths]   for op 'write'
 * @property {string} text        message text, shell command line, or tool result text
 * @property {boolean} [bip]      user line was the /bip command (Claude only)
 * @property {boolean} [isError]
 * @property {number|null} [exitCode]  for kind 'result'; null when unknown
 */

/**
 * @typedef {object} TranscriptFile
 * @property {string} path
 * @property {string} sid         `claude:<8>` or `codex:<8>`
 * @property {'claude'|'codex'} source
 * @property {string|null} cwd
 * @property {number} size
 * @property {number} mtimeMs
 */

const WRITE_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const DROP_USER_RE = /^<(command-|local-command|system-reminder)/;
const BIP_RE = /<command-name>\/?bip<\/command-name>/;
const EXIT_RE = /Exit code (\d+)/;

/** `claude:<first 8 chars of uuid>` from a transcript path. @param {string} file @returns {string} */
export function sessionId(file) {
  return 'claude:' + path.basename(file, '.jsonl').slice(0, 8);
}

/** Claude project dir name for a path: every non-alphanumeric char -> '-'. @param {string} root @returns {string} */
export function encodeProjectDir(root) {
  return path.resolve(root).replace(/[^A-Za-z0-9]/g, '-');
}

/**
 * Transcripts of a repo: dirs under `<projectsDir>` whose name starts with the encoded git root,
 * confirmed by the `cwd` field lying inside repoRoot.
 * @param {string} repoRoot @param {{projectsDir?: string}} [opts] default ~/.claude/projects
 * @returns {TranscriptFile[]}
 */
export function listTranscripts(repoRoot, opts = {}) {
  const projectsDir = opts.projectsDir ?? path.join(paths().claude, 'projects');
  const prefix = encodeProjectDir(repoRoot);
  let dirs;
  try { dirs = fs.readdirSync(projectsDir, { withFileTypes: true }); } catch { return []; }
  const out = [];
  for (const d of dirs) {
    if (!d.isDirectory() || !d.name.startsWith(prefix)) continue;
    const dir = path.join(projectsDir, d.name);
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!f.isFile() || !f.name.endsWith('.jsonl')) continue;
      const p = path.join(dir, f.name);
      const cwd = firstField(p, 'cwd');
      if (!cwd || !isInside(cwd, repoRoot)) continue;
      const st = fs.statSync(p);
      out.push({ path: p, sid: sessionId(p), source: 'claude', cwd, size: st.size, mtimeMs: st.mtimeMs });
    }
  }
  return out.sort((a, b) => a.mtimeMs - b.mtimeMs);
}

/** First string value of `key` on any JSON line, reading the file in pieces. */
export function firstField(file, key, maxBytes = 4 << 20) {
  let fd;
  try { fd = fs.openSync(file, 'r'); } catch { return null; }
  try {
    const buf = Buffer.alloc(1 << 16);
    let rest = '', pos = 0;
    while (pos < maxBytes) {
      const n = fs.readSync(fd, buf, 0, buf.length, pos);
      if (!n) break;
      pos += n;
      const parts = (rest + buf.toString('utf8', 0, n)).split('\n');
      rest = parts.pop();
      for (const l of parts) {
        const v = fieldOf(l, key);
        if (v) return v;
      }
    }
    return fieldOf(rest, key);
  } finally { fs.closeSync(fd); }
}

function fieldOf(line, key) {
  if (!line.includes(`"${key}"`)) return null;
  try {
    const o = JSON.parse(line);
    const v = o[key] ?? o.payload?.[key];
    return typeof v === 'string' ? v : null;
  } catch { return null; }
}

/** Splits a JSONL file into [L, object] pairs within the range; bad JSON lines are skipped. */
export function* jsonLines(file, range = {}) {
  const from = range.fromLine ?? 1, to = range.toLine ?? Infinity;
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  for (let i = Math.max(0, from - 1); i < Math.min(lines.length, to); i++) {
    if (!lines[i]) continue;
    let o;
    try { o = JSON.parse(lines[i]); } catch { continue; }
    yield [i + 1, o];
  }
}

const textOf = c =>
  typeof c === 'string' ? c : Array.isArray(c) ? c.filter(x => x.type === 'text').map(x => x.text).join('\n') : '';
const resultText = r =>
  typeof r.content === 'string' ? r.content : Array.isArray(r.content) ? r.content.map(x => x.text || '').join('\n') : '';

/**
 * Reads entries in [fromLine, toLine]. Sets `bip` before dropping `<command-`/`<local-command`/`<system-reminder` lines;
 * drops thinking and `isCompactSummary` lines.
 * @param {string} file @param {{fromLine?: number, toLine?: number}} [range] @returns {Entry[]}
 */
export function readEntries(file, range = {}) {
  const out = [];
  const toolNames = new Map();
  for (const [L, o] of jsonLines(file, range)) {
    const ts = typeof o.timestamp === 'string' ? o.timestamp : null;
    const c = o.message?.content;
    if (o.type === 'user') {
      if (o.isCompactSummary) continue;
      if (Array.isArray(c) && c.some(x => x.type === 'tool_result')) {
        for (const r of c.filter(x => x.type === 'tool_result')) {
          const text = resultText(r);
          const m = text.match(EXIT_RE);
          out.push({ L, ts, kind: 'result', name: toolNames.get(r.tool_use_id) ?? '', text,
            isError: !!r.is_error, exitCode: m ? Number(m[1]) : null });
        }
        continue;
      }
      const t = textOf(c);
      if (!t) continue;
      if (BIP_RE.test(t)) {
        const args = t.match(/<command-args>([\s\S]*?)<\/command-args>/)?.[1].trim() ?? '';
        out.push({ L, ts, kind: 'user', text: ('/bip ' + args).trim(), bip: true });
        continue;
      }
      if (DROP_USER_RE.test(t)) continue;
      out.push({ L, ts, kind: 'user', text: t, bip: false });
    } else if (o.type === 'assistant' && Array.isArray(c)) {
      for (const x of c) {
        if (x.type === 'text' && x.text?.trim()) out.push({ L, ts, kind: 'assistant', text: x.text });
        else if (x.type === 'tool_use') {
          if (x.id) toolNames.set(x.id, x.name);
          out.push({ L, ts, kind: 'tool', ...classifyTool(x.name, x.input || {}) });
        }
      }
    }
  }
  return out;
}

function classifyTool(name, inp) {
  const p = inp.file_path || inp.notebook_path || '';
  const text = String(inp.command || inp.description || inp.prompt || inp.pattern || p || JSON.stringify(inp));
  if (name === 'Bash') return { name, op: 'shell', paths: [], text: String(inp.command ?? text) };
  if (WRITE_TOOLS.has(name)) return { name, op: 'write', paths: p ? [p] : [], text };
  return { name, op: 'other', paths: [], text };
}

/** Number of lines in a file (for ledger lastLine). @param {string} file @returns {number} */
export function countLines(file) {
  const buf = fs.readFileSync(file);
  if (!buf.length) return 0;
  let n = 0;
  for (let i = buf.indexOf(10); i !== -1; i = buf.indexOf(10, i + 1)) n++;
  return buf[buf.length - 1] === 10 ? n : n + 1;
}
