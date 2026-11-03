// Hook entry and hook config printer (PRD 6.4). The hook never blocks the session: it spawns a detached worker.
import { spawn as nodeSpawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { gitRoot } from './repo.mjs';
import { isObserved, cacheDir } from './config.mjs';
import { logEvent } from './log.mjs';
import { render as renderPrompt } from './prompts.mjs';
import { sessionId as piSessionId } from './sources/pi.mjs';
import { sessionId as codexSessionId } from './sources/codex.mjs';
import { sessionId as agySessionId, recordSession } from './sources/agy.mjs';

const EVENTS = ['pre-compact', 'session-end', 'session-start'];
/** Hook runtimes; the flag (`--codex`, `--pi`, …) names the host that called. Claude Code is the default. */
export const RUNTIMES = ['claude', 'codex', 'pi', 'omp', 'agy'];

/**
 * Antigravity hook stdin is camelCase ({conversationId, transcriptPath, workspacePaths}) and its cwd is the
 * hooks.json dir, never the repo: normalise to the Claude shape and keep the original for the session index.
 */
function fromAgy(p) {
  const ws = Array.isArray(p.workspacePaths) ? p.workspacePaths.filter((w) => typeof w === 'string') : [];
  const agy = typeof p.conversationId === 'string' && typeof p.transcriptPath === 'string'
    ? { conversationId: p.conversationId, transcriptPath: p.transcriptPath, workspacePaths: ws } : null;
  return { session_id: p.conversationId, transcript_path: p.transcriptPath, cwd: ws[0], agy };
}

/** `<runtime>:<8 hex>`: head of the id for Claude (UUIDv4), tail for the UUIDv7 hosts (Codex, pi, omp, agy). */
function sessionIdOf(runtime, payload) {
  if (runtime === 'agy') return typeof payload.session_id === 'string' ? agySessionId(payload.session_id) : '';
  if (runtime === 'pi' || runtime === 'omp' || runtime === 'codex') {
    if (runtime === 'codex' && typeof payload.transcript_path === 'string' && payload.transcript_path) return codexSessionId(payload.transcript_path);
    if (runtime !== 'codex' && typeof payload.transcript_path === 'string' && payload.transcript_path) return piSessionId(payload.transcript_path, runtime);
    return typeof payload.session_id === 'string' && payload.session_id ? `${runtime}:${payload.session_id.replace(/-/g, '').slice(-8).toLowerCase()}` : '';
  }
  const id = typeof payload.session_id === 'string' ? payload.session_id.slice(0, 8).toLowerCase() : '';
  return id ? `${runtime}:${id}` : '';
}
export const STDIN_MAX = 1 << 20;

/**
 * Reads the hook payload without blocking the session: a TTY gives '', and the read stops after `timeoutMs` or
 * `maxBytes` (then the stream is destroyed so the process can exit). Never rejects.
 * @param {NodeJS.ReadableStream & {isTTY?: boolean, destroy?: Function}} stream
 * @param {{timeoutMs?: number, maxBytes?: number}} [opts] @returns {Promise<string>}
 */
export function readStdin(stream, { timeoutMs = 50, maxBytes = STDIN_MAX } = {}) {
  if (!stream || stream.isTTY) return Promise.resolve('');
  return new Promise((resolve) => {
    const parts = [];
    let size = 0, done = false;
    const end = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      stream.off?.('data', onData);
      try { stream.pause?.(); stream.destroy?.(); } catch { /* ignore */ }
      resolve(Buffer.concat(parts).toString('utf8'));
    };
    const onData = (b) => {
      const buf = Buffer.isBuffer(b) ? b : Buffer.from(String(b));
      parts.push(buf); size += buf.length;
      if (size >= maxBytes) end();
    };
    const timer = setTimeout(end, timeoutMs);
    stream.on('data', onData);
    stream.once('end', end);
    stream.once('error', end);
  });
}
const DEFAULT_BIN = fileURLToPath(new URL('../bin/momentry.mjs', import.meta.url));

/**
 * Never throws, never writes stdout, returns fast. STORY_HARVEST=1 -> return; bad stdin -> hook.log;
 * unobserved repo -> return; else spawn(process.execPath, [binPath, 'harvest'|'scan', ...], {detached, stdio: 'ignore',
 * env: {...env, STORY_HARVEST: '1'}}).unref().
 * pre-compact / session-end: `harvest --transcript <transcript_path>` (or `--session <src>:<id8>`, else `scan`).
 * session-start: `scan --claude|--codex --except <sid>`.
 * @param {'pre-compact'|'session-end'|'session-start'} event
 * @param {string} stdin raw hook payload (JSON: session_id, transcript_path, cwd, hook_event_name)
 * @param {{codex?: boolean}} flags
 * @param {{env?: NodeJS.ProcessEnv, binPath?: string, spawn?: Function, cwd?: string, execPath?: string}} [deps]
 * @returns {{spawned: boolean, reason?: string, args?: string[]}}
 */
export function handleHook(event, stdin, flags, deps = {}) {
  const env = deps.env || process.env;
  const log = (ev, f) => logEvent(ev, { hook: event, ...f }, { cacheDir: cacheDir(env) });
  try {
    if (env.STORY_HARVEST === '1') return { spawned: false, reason: 'story-harvest' };
    if (!EVENTS.includes(event)) { log('hook.bad-event', {}); return { spawned: false, reason: 'bad-event' }; }
    let payload = {};
    if (String(stdin ?? '').trim()) {
      try { payload = JSON.parse(stdin); } catch (e) { log('hook.bad-stdin', { error: e }); return { spawned: false, reason: 'bad-stdin' }; }
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) { log('hook.bad-stdin', {}); return { spawned: false, reason: 'bad-stdin' }; }
    }
    const runtime = RUNTIMES.find((r) => flags?.[r]) ?? 'claude';
    if (runtime === 'agy') payload = fromAgy(payload);
    const cwd = typeof payload.cwd === 'string' && payload.cwd ? payload.cwd : deps.cwd || process.cwd();
    const root = gitRoot(cwd);
    if (!root || !isObserved(root, env)) return { spawned: false, reason: 'not-observed' };

    const sid = sessionIdOf(runtime, payload);
    if (runtime === 'agy' && payload.agy) recordSession(payload.agy, cacheDir(env));
    let args;
    if (event === 'session-start') {
      // --except lets scan harvest the calling session despite the quiet window (PRD 6.4). Antigravity calls only at
      // session start, when its transcript holds one prompt: leave it to the quiet rule, it is harvested next time.
      args = ['scan', '--repo', root, `--${runtime}`, '--auto', ...(sid && runtime !== 'agy' ? ['--except', sid] : [])];
    } else if (typeof payload.transcript_path === 'string' && payload.transcript_path) {
      args = ['harvest', '--transcript', payload.transcript_path, '--repo', root, ...(sid ? ['--session', sid] : [])];
    } else if (sid) {
      args = ['harvest', '--session', sid, '--repo', root];
    } else {
      args = ['scan', '--repo', root, `--${runtime}`, '--auto'];
    }
    const spawn = deps.spawn || nodeSpawn;
    const child = spawn(deps.execPath || process.execPath, [deps.binPath || DEFAULT_BIN, ...args], {
      detached: true, stdio: 'ignore', windowsHide: true, cwd: root, env: { ...env, STORY_HARVEST: '1' },
    });
    child?.on?.('error', (e) => log('hook.spawn-error', { error: e }));
    child?.unref?.();
    log('hook.spawned', { runtime, cmd: args[0], sid: sid || null });
    return { spawned: true, args };
  } catch (e) {
    log('hook.error', { error: e });
    return { spawned: false, reason: 'error' };
  }
}

const q = (s) => `"${String(s).replace(/(["\\$`])/g, '\\$1')}"`;

/**
 * Hook JSON for ~/.claude/settings.json or ~/.codex/hooks.json plus /bip template and install notes.
 * Commands use `paths.prefix` (the installed shim) or absolute node + bin paths. Prints only; `momentry connect` installs.
 * @param {'claude'|'codex'} runtime @param {{execPath?: string, binPath?: string, prefix?: string}} [paths]
 * @returns {string}
 */
export function printHookConfig(runtime, paths = {}) {
  const bin = paths.prefix || `${q(paths.execPath || process.execPath)} ${q(paths.binPath || DEFAULT_BIN)}`;
  const entry = (cmd) => [{ hooks: [{ type: 'command', command: `${bin} ${cmd}` }] }];
  const bip = renderPrompt('bip', { bin });
  if (runtime === 'codex') {
    const json = { hooks: { PreCompact: entry('hook pre-compact --codex'), SessionEnd: entry('hook session-end --codex'), SessionStart: entry('hook session-start --codex') } };
    return [
      '# momentry: hook cho Codex (momentry connect codex --yes tự cài; hoặc dán vào ~/.codex/hooks.json)',
      JSON.stringify(json, null, 2),
      '',
      '# Bật: Codex hỏi duyệt tin cậy hook mới; hoặc thêm vào mục hooks.state trong ~/.codex/config.toml.',
      '# Tắt: xoá các mục trên, hoặc đặt trạng thái hook thành tắt trong hooks.state.',
      '# Tên sự kiện Codex là PascalCase như Claude Code. Đường dự phòng, chạy tay:',
      `#   ${bin} scan --codex`,
      '# Codex không giữ /bip trong transcript: lệnh /bip chỉ đi qua `add`.',
      '',
      '# Mẫu /bip cho Codex: lưu thành ~/.codex/prompts/bip.md',
      bip,
    ].join('\n');
  }
  const json = {
    hooks: {
      PreCompact: entry('hook pre-compact'),
      SessionEnd: entry('hook session-end'),
      SessionStart: entry('hook session-start'),
    },
  };
  return [
    '# momentry: hook cho Claude Code (momentry connect claude --yes tự cài; hoặc gộp vào khoá "hooks" của ~/.claude/settings.json)',
    JSON.stringify(json, null, 2),
    '',
    '# Bật: dán đoạn trên rồi mở phiên mới. Tắt: xoá ba mục PreCompact, SessionEnd, SessionStart.',
    '# Hook chỉ chạy trong repo có .momentry.json (momentry init) hoặc nằm trong MOMENTRY_REPOS.',
    '',
    '# Mẫu /bip cho Claude: lưu thành .claude/commands/bip.md (một repo) hoặc ~/.claude/commands/bip.md',
    bip,
  ].join('\n');
}
