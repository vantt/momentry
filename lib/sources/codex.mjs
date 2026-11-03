// Codex rollouts (PRD 6.1, 6.2). Shapes checked on real rollouts (2026-07/10, cli with code mode):
// tool calls are `custom_tool_call` name `exec` whose input is JS calling `tools.exec_command({cmd})`,
// `tools.apply_patch(...)`; older `function_call` shell/exec_command/apply_patch and `local_shell_call` also handled.
// Exit codes appear only when the output carries `"exit_code": N`, `metadata.exit_code` or `Process exited with code N`.
import fs from 'node:fs';
import path from 'node:path';
import { paths } from '../paths.mjs';
import { isInside } from '../repo.mjs';
import { jsonLines, countLines as countFileLines } from './claude.mjs';

const UUID_RE = /([0-9a-f]{8})-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const SHELL_TOOLS = new Set(['shell', 'exec_command', 'container.exec', 'local_shell', 'unified_exec']);
const INJECTED_USER_RE = /^\s*(<environment_context>|<user_instructions>|<turn_aborted>|# AGENTS\.md instructions)/;
const LITERAL = String.raw`"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\x60(?:[^\x60\\]|\\.)*\x60`;
const CMD_RE = new RegExp(String.raw`(?:"cmd"|'cmd'|\bcmd)\s*:\s*(${LITERAL})`, 'g');
const LIT_RE = new RegExp(LITERAL, 'g');

/** `codex:<first 8 chars of uuid>` from a rollout path. @param {string} file @returns {string} */
export function sessionId(file) {
  const m = path.basename(file).match(UUID_RE);
  return 'codex:' + (m ? m[1] : path.basename(file, '.jsonl').slice(-8)).toLowerCase();
}

/** Reads the `session_meta` line. @param {string} file @returns {{id: string|null, cwd: string|null, ts: string|null}} */
export function sessionMeta(file) {
  try {
    for (const [, o] of jsonLines(file, { toLine: 20 })) {
      if (o.type !== 'session_meta') continue;
      const p = o.payload || {};
      return { id: p.id ?? p.session_id ?? null, cwd: p.cwd ?? null, ts: p.timestamp ?? o.timestamp ?? null };
    }
  } catch { /* unreadable */ }
  return { id: null, cwd: null, ts: null };
}

/**
 * Rollouts under `<sessionsDir>/YYYY/MM/DD/` whose session_meta cwd lies inside repoRoot.
 * @param {string} repoRoot @param {{sessionsDir?: string}} [opts] default ~/.codex/sessions
 * @returns {import('./claude.mjs').TranscriptFile[]}
 */
export function listTranscripts(repoRoot, opts = {}) {
  const root = opts.sessionsDir ?? path.join(paths().codex, 'sessions');
  const out = [];
  const walk = dir => {
    let ents;
    try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile() && e.name.startsWith('rollout-') && e.name.endsWith('.jsonl')) {
        const { cwd } = sessionMeta(p);
        if (!cwd || !isInside(cwd, repoRoot)) continue;
        const st = fs.statSync(p);
        out.push({ path: p, sid: sessionId(p), source: 'codex', cwd, size: st.size, mtimeMs: st.mtimeMs });
      }
    }
  };
  walk(root);
  return out.sort((a, b) => a.mtimeMs - b.mtimeMs);
}

/**
 * Reads entries in [fromLine, toLine]. user/assistant from response_item (developer dropped);
 * function_call/custom_tool_call -> tool (shell|exec_command -> op shell, apply_patch -> op write + patchPaths);
 * *_call_output -> result (exitCode null if not derivable). Drops reasoning, event_msg, turn_context, world_state.
 * @param {string} file @param {{fromLine?: number, toLine?: number}} [range] @returns {import('./claude.mjs').Entry[]}
 */
export function readEntries(file, range = {}) {
  const out = [];
  const names = new Map();
  for (const [L, o] of jsonLines(file, range)) {
    if (o.type !== 'response_item') continue;
    const p = o.payload || {};
    const ts = typeof o.timestamp === 'string' ? o.timestamp : null;
    if (p.type === 'message') {
      if (p.role !== 'user' && p.role !== 'assistant') continue;
      const text = contentText(p.content);
      if (!text.trim() || (p.role === 'user' && INJECTED_USER_RE.test(text))) continue;
      out.push(p.role === 'user' ? { L, ts, kind: 'user', text, bip: false } : { L, ts, kind: 'assistant', text });
    } else if (p.type === 'function_call' || p.type === 'custom_tool_call' || p.type === 'local_shell_call') {
      const name = p.name ?? (p.type === 'local_shell_call' ? 'local_shell' : '');
      if (p.call_id) names.set(p.call_id, name);
      for (const t of toolEntries(name, p)) out.push({ L, ts, kind: 'tool', ...t });
    } else if (typeof p.type === 'string' && p.type.endsWith('_call_output')) {
      out.push({ L, ts, kind: 'result', name: names.get(p.call_id) ?? '', ...resultOf(p.output) });
    }
  }
  return out;
}

function contentText(c) {
  if (typeof c === 'string') return c;
  if (!Array.isArray(c)) return '';
  return c.map(x => (typeof x === 'string' ? x : typeof x?.text === 'string' ? x.text : '')).filter(Boolean).join('\n');
}

function parseArgs(p) {
  const raw = p.arguments ?? p.input;
  if (raw && typeof raw === 'object') return raw;
  if (typeof raw !== 'string') return {};
  try { const j = JSON.parse(raw); return j && typeof j === 'object' ? j : { input: raw }; } catch { return { input: raw }; }
}

function shellText(cmd) {
  if (Array.isArray(cmd)) {
    const i = cmd.findIndex(a => a === '-lc' || a === '-c');
    return i >= 0 && cmd[i + 1] != null ? String(cmd[i + 1]) : cmd.join(' ');
  }
  return cmd == null ? '' : String(cmd);
}

function shellOrPatch(name, text) {
  if (/\*\*\* Begin Patch/.test(text)) return { name, op: 'write', paths: patchPaths(text), text: oneLine(text).slice(0, 300) };
  return { name, op: 'shell', paths: [], text };
}

function toolEntries(name, p) {
  if (p.type === 'local_shell_call') return [shellOrPatch(name, shellText(p.action?.command))];
  const args = parseArgs(p);
  if (name === 'apply_patch') {
    const patch = String(args.input ?? args.patch ?? '');
    return [{ name, op: 'write', paths: patchPaths(patch), text: oneLine(patch).slice(0, 300) }];
  }
  if (SHELL_TOOLS.has(name)) return [shellOrPatch(name, shellText(args.cmd ?? args.command))];
  if (name === 'exec' && typeof args.input === 'string') return codeModeEntries(args.input);
  return [{ name, op: 'other', paths: [], text: typeof args.input === 'string' ? args.input : JSON.stringify(args) }];
}

// Code mode: one `exec` script may call several tools; one Entry per inner shell command or patch.
function codeModeEntries(src) {
  const res = [];
  if (/\btools\.apply_patch\b/.test(src) || /\*\*\* Begin Patch/.test(src)) {
    const paths = [...new Set([...src.matchAll(LIT_RE)].flatMap(m => patchPaths(decodeLiteral(m[0]))))];
    res.push({ name: 'apply_patch', op: 'write', paths, text: oneLine(src).slice(0, 300) });
  }
  if (/\btools\.(exec_command|shell)\b/.test(src)) {
    const cmds = [...src.matchAll(CMD_RE)].map(m => decodeLiteral(m[1]));
    if (cmds.length) for (const c of cmds) res.push({ name: 'exec_command', op: 'shell', paths: [], text: c });
    else res.push({ name: 'exec_command', op: 'shell', paths: [], text: src });
  }
  return res.length ? res : [{ name: 'exec', op: 'other', paths: [], text: src }];
}

function decodeLiteral(lit) {
  if (lit[0] === '"') { try { return JSON.parse(lit); } catch { /* fall through */ } }
  return lit.slice(1, -1).replace(/\\(.)/g, (_, ch) => ({ n: '\n', t: '\t', r: '\r' })[ch] ?? ch);
}

const oneLine = s => s.replace(/\s+/g, ' ').trim();

function resultOf(output) {
  let text, exitCode = null, isError = false;
  if (output && typeof output === 'object' && !Array.isArray(output)) {
    text = contentText(output.content ?? output.output ?? '');
    if (output.success === false) isError = true;
  } else text = contentText(output);
  try {
    const j = JSON.parse(text);
    if (j && typeof j === 'object' && 'output' in j) {
      if (Number.isInteger(j.metadata?.exit_code)) exitCode = j.metadata.exit_code;
      text = String(j.output);
    }
  } catch { /* not JSON */ }
  if (exitCode === null) exitCode = exitFromText(text);
  if (/^Script (failed|error)/im.test(text)) isError = true;
  text = text.replace(/^(Script (?:completed|running|failed|error)\b[^\n]*|Wall time[^\n]*)\n?/gm, '');
  return { text, isError, exitCode };
}

function exitFromText(text) {
  const codes = [];
  for (const re of [/Process exited with code (-?\d+)/g, /"exit_code"\s*:\s*(-?\d+)/g, /^Exit code:? (-?\d+)/gm])
    for (const m of text.matchAll(re)) codes.push(Number(m[1]));
  if (!codes.length) return null;
  return codes.find(c => c !== 0) ?? 0;
}

/** Paths from `*** Update File:`, `*** Add File:`, `*** Delete File:` lines. @param {string} patch @returns {string[]} */
export function patchPaths(patch) {
  const out = [];
  for (const m of String(patch).matchAll(/^\*\*\* (?:Update|Add|Delete) File: (.+?)\s*$|^\*\*\* Move to: (.+?)\s*$/gm)) {
    const p = m[1] ?? m[2];
    if (p && !out.includes(p)) out.push(p);
  }
  return out;
}

/** Number of lines in a file. @param {string} file @returns {number} */
export function countLines(file) {
  return countFileLines(file);
}
