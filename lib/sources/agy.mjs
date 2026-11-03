// Antigravity (agy CLI / IDE) transcripts: <gemini>/antigravity-*/brain/<conversationId>/.system_generated/logs/
// transcript_full.jsonl (transcript.jsonl truncates fields). Lines: {step_index, source, type, status, created_at,
// content?, tool_calls?:[{name, args}]}. The transcript has no cwd, so momentry's SessionStart hook records
// {conversationId, transcriptPath, workspacePaths} in <cache>/agy-sessions.jsonl and listTranscripts reads that index.
import fs from 'node:fs';
import path from 'node:path';
import { isInside } from '../repo.mjs';
import { cacheDir } from '../config.mjs';
import { jsonLines, countLines } from './claude.mjs';

export { countLines };

export const INDEX = 'agy-sessions.jsonl';
const SHELL_TOOLS = new Set(['run_command']);
const WRITE_TOOLS = new Set(['write_to_file', 'replace_file_content', 'multi_replace_file_content']);
const EXIT_RE = /exit(?:ed with)? code[:\s]+(-?\d+)/i;

/** `agy:<last 8 hex of the conversation id>` (ids are UUIDv7). @param {string} idOrFile */
export function sessionId(idOrFile) {
  const s = String(idOrFile);
  const id = /[0-9a-f-]{36}/i.exec(s)?.[0] ?? path.basename(s, '.jsonl');
  return `agy:${id.replace(/-/g, '').slice(-8).toLowerCase()}`;
}

/** The fuller transcript next to a hook-reported one. @param {string} file */
export function preferFull(file) {
  const full = path.join(path.dirname(file), 'transcript_full.jsonl');
  return fs.existsSync(full) ? full : file;
}

/**
 * Records one session (called by the SessionStart hook). Idempotent per conversation id.
 * @param {{conversationId: string, transcriptPath: string, workspacePaths?: string[]}} s @param {string} cache
 */
export function recordSession(s, cache) {
  if (!s?.conversationId || !s?.transcriptPath) return false;
  const file = path.join(cache, INDEX);
  if (readIndex(cache).some((x) => x.conversationId === s.conversationId)) return false;
  fs.mkdirSync(cache, { recursive: true, mode: 0o700 });
  fs.appendFileSync(file, `${JSON.stringify({ conversationId: s.conversationId, transcriptPath: s.transcriptPath, workspacePaths: s.workspacePaths ?? [], at: new Date().toISOString() })}\n`, { mode: 0o600 });
  return true;
}

/** @param {string} cache */
export function readIndex(cache) {
  let text = '';
  try { text = fs.readFileSync(path.join(cache, INDEX), 'utf8'); } catch { return []; }
  const out = [];
  for (const l of text.split('\n')) { try { const o = JSON.parse(l); if (o?.conversationId) out.push(o); } catch { /* skip */ } }
  return out;
}

/**
 * Recorded sessions whose workspace is the repo (or inside it) and whose transcript still exists.
 * @param {string} repoRoot @param {{env?: NodeJS.ProcessEnv, cacheDir?: string}} [opts]
 */
export function listTranscripts(repoRoot, opts = {}) {
  const cache = opts.cacheDir ?? cacheDir(opts.env ?? process.env);
  const out = [];
  const seen = new Set();
  for (const s of readIndex(cache)) {
    if (!(s.workspacePaths ?? []).some((w) => typeof w === 'string' && (isInside(w, repoRoot) || isInside(repoRoot, w)))) continue;
    const p = preferFull(s.transcriptPath);
    if (seen.has(p) || !fs.existsSync(p)) continue;
    seen.add(p);
    const st = fs.statSync(p);
    out.push({ path: p, sid: sessionId(s.conversationId), source: 'agy', cwd: s.workspacePaths[0] ?? null, size: st.size, mtimeMs: st.mtimeMs });
  }
  return out.sort((a, b) => a.mtimeMs - b.mtimeMs);
}

function classifyTool(name, args) {
  const a = args && typeof args === 'object' ? args : {};
  if (SHELL_TOOLS.has(name)) return { name, op: 'shell', paths: [], text: String(a.CommandLine ?? a.command ?? '') };
  if (WRITE_TOOLS.has(name)) { const p = a.TargetFile ?? a.path; return { name, op: 'write', paths: p ? [String(p)] : [], text: String(p ?? name) }; }
  return { name, op: 'other', paths: [], text: JSON.stringify(a).slice(0, 2000) };
}

/**
 * Entries in [fromLine, toLine]. A GENERIC step right after a tool call is that tool's response.
 * @param {string} file @param {{fromLine?: number, toLine?: number}} [range]
 * @returns {import('./claude.mjs').Entry[]}
 */
export function readEntries(file, range = {}) {
  const out = [];
  let lastTool = null;
  for (const [L, o] of jsonLines(file, range)) {
    const ts = typeof o.created_at === 'string' ? o.created_at : null;
    if (o.type === 'USER_INPUT' && o.source === 'USER_EXPLICIT') {
      const t = String(o.content ?? '').trim();
      if (t) out.push({ L, ts, kind: 'user', text: t, bip: /^\/bip\b/.test(t) });
      lastTool = null;
    } else if (o.type === 'PLANNER_RESPONSE') {
      if (typeof o.content === 'string' && o.content.trim()) out.push({ L, ts, kind: 'assistant', text: o.content });
      for (const c of Array.isArray(o.tool_calls) ? o.tool_calls : []) {
        lastTool = classifyTool(c?.name, c?.args);
        out.push({ L, ts, kind: 'tool', ...lastTool });
      }
    } else if (o.type === 'GENERIC' && lastTool) {
      const text = String(o.content ?? '');
      const code = EXIT_RE.exec(text);
      out.push({ L, ts, kind: 'result', name: lastTool.name, text, isError: o.status === 'ERROR', exitCode: code ? Number(code[1]) : null });
      lastTool = null;
    }
  }
  return out;
}
