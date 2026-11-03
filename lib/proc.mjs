// Finding and launching external commands (claude, git, codex) the same way on Linux, macOS and Windows.
import fs from 'node:fs';
import { pathFor, splitList } from './paths.mjs';

const envPath = (env) => env.PATH ?? env.Path ?? env.path ?? '';

/**
 * Locates `cmd` on PATH (with PATHEXT on Windows). A cmd containing a separator is checked as given.
 * @param {string} cmd @param {{env?: NodeJS.ProcessEnv, platform?: string}} [opts] @returns {string|null}
 */
export function which(cmd, opts = {}) {
  const env = opts.env ?? process.env;
  const platform = opts.platform ?? process.platform;
  const P = pathFor(platform);
  const win = platform === 'win32';
  const exts = win ? ['', ...(env.PATHEXT ?? env.Pathext ?? '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean)] : [''];
  const ok = (f) => {
    try {
      if (!fs.statSync(f).isFile()) return false;
      if (!win) fs.accessSync(f, fs.constants.X_OK);
      return true;
    } catch { return false; }
  };
  const tryExts = (base) => {
    for (const e of exts) {
      // On Windows a bare name without extension is not runnable; only accept it when it already has one.
      if (win && !e && !/\.[A-Za-z0-9]+$/.test(base)) continue;
      if (ok(base + e)) return base + e;
    }
    return null;
  };
  if (cmd.includes('/') || (win && cmd.includes('\\'))) return tryExts(cmd);
  for (const dir of splitList(envPath(env), platform)) {
    const hit = tryExts(P.join(dir, cmd));
    if (hit) return hit;
  }
  return null;
}

const UNSAFE_CMD = /[%!^&|<>"\r\n]/;

/** Quotes one argument for `cmd.exe /s /c "…"`; refuses characters cmd would expand or interpret. */
function quoteCmd(a) {
  const s = String(a);
  if (UNSAFE_CMD.test(s)) throw new Error(`đối số không an toàn cho cmd.exe: ${JSON.stringify(s)}`);
  return s === '' || /[\s,;=()[\]]/.test(s) ? `"${s}"` : s;
}

/**
 * How to spawn `bin args` on this platform. On Windows a `.cmd`/`.bat` (npm-installed CLIs) must go through
 * cmd.exe since Node refuses to spawn them directly; other platforms spawn the command as is.
 * @param {string} bin @param {string[]} args @param {{env?: NodeJS.ProcessEnv, platform?: string}} [opts]
 * @returns {{file: string, args: string[], options: {windowsVerbatimArguments?: boolean, windowsHide?: boolean}}}
 */
export function commandFor(bin, args, opts = {}) {
  const env = opts.env ?? process.env;
  const platform = opts.platform ?? process.platform;
  if (platform !== 'win32') return { file: bin, args, options: {} };
  const resolved = which(bin, { env, platform }) ?? bin;
  if (/\.(cmd|bat)$/i.test(resolved)) {
    const line = [resolved, ...args].map(quoteCmd).join(' ');
    return { file: env.ComSpec ?? env.COMSPEC ?? 'cmd.exe', args: ['/d', '/s', '/c', `"${line}"`], options: { windowsVerbatimArguments: true, windowsHide: true } };
  }
  return { file: resolved, args, options: { windowsHide: true } };
}
