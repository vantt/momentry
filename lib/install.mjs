// Install layout shared by install.sh / install.ps1 (through the hidden `_activate` command), update, uninstall and doctor.
//
//   <home>/versions/vX.Y.Z/{bin,lib,prompts,rules,ui,BUILD,LICENSE,README.md}
//   <home>/current               text file: the active version dir name (atomic rename on switch)
//   <home>/.momentry-managed     JSON marker: {version, activatedAt}; only marked installs are updated or removed
//   <bin>/momentry               POSIX sh shim (all platforms; Git Bash on Windows)
//   <bin>/momentry.cmd           cmd shim (Windows)
// Shims look up `node` on PATH at run time, so upgrading Node never breaks hooks.
import fs from 'node:fs';
import path from 'node:path';
import { paths } from './paths.mjs';
import { ROOT } from './version.mjs';

export const MARKER = '.momentry-managed';
export const CURRENT = 'current';
export const SHIM_TAG = 'momentry shim: managed by momentry, do not edit';

/** Writes a file atomically (temp file in the same dir, then rename), keeping an existing file's mode. */
export function writeAtomic(file, text, mode) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let m = mode;
  if (m === undefined) { try { m = fs.statSync(file).mode & 0o777; } catch { m = 0o644; } }
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`);
  fs.writeFileSync(tmp, text, { mode: m });
  try { fs.chmodSync(tmp, m); } catch { /* windows */ }
  fs.renameSync(tmp, file);
}

const shQuote = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;

/** POSIX shim text. @param {string} home */
export function shimSh(home) {
  return `#!/bin/sh
# ${SHIM_TAG}
MOMENTRY_HOME=${shQuote(home.replace(/\\/g, '/'))}
v=$(cat "$MOMENTRY_HOME/${CURRENT}" 2>/dev/null) || { echo "momentry: không thấy bản cài ở $MOMENTRY_HOME; cài lại: https://github.com/vantt/momentry#cài" >&2; exit 1; }
command -v node >/dev/null 2>&1 || { echo "momentry: cần Node ≥ 20 trên PATH: https://nodejs.org" >&2; exit 1; }
exec node "$MOMENTRY_HOME/versions/$v/bin/momentry.mjs" "$@"
`;
}

/** Windows cmd shim text. @param {string} home */
export function shimCmd(home) {
  return [
    '@echo off',
    `rem ${SHIM_TAG}`,
    'setlocal',
    `set "MOMENTRY_HOME=${home}"`,
    `set /p MOMENTRY_V=<"%MOMENTRY_HOME%\\${CURRENT}"`,
    'where node >nul 2>nul || (echo momentry: can Node ^>= 20 tren PATH: https://nodejs.org 1>&2 & exit /b 1)',
    'node "%MOMENTRY_HOME%\\versions\\%MOMENTRY_V%\\bin\\momentry.mjs" %*',
    'exit /b %ERRORLEVEL%',
    '',
  ].join('\r\n');
}

/**
 * Where everything lives and what is installed.
 * @param {NodeJS.ProcessEnv} [env] @param {{platform?: string, root?: string}} [opts]
 */
export function installState(env = process.env, opts = {}) {
  const platform = opts.platform ?? process.platform;
  const p = paths(env, { platform });
  const root = opts.root ?? ROOT;
  // An install made with --home lives elsewhere: the running code (…/versions/vX) tells where.
  const installRoot = path.dirname(path.dirname(root));
  const derived = path.basename(path.dirname(root)) === 'versions' && fs.existsSync(path.join(installRoot, MARKER)) ? installRoot : null;
  const home = env.MOMENTRY_HOME ? p.home : derived ?? p.home;
  const versionsDir = path.join(home, 'versions');
  let marker = null;
  try { marker = JSON.parse(fs.readFileSync(path.join(home, MARKER), 'utf8')); } catch { /* not managed */ }
  // The shim dir chosen at install time (--install-dir) is recorded in the marker.
  const bin = env.MOMENTRY_INSTALL_DIR ? p.bin : marker?.bin ?? p.bin;
  let current = null;
  try { current = fs.readFileSync(path.join(home, CURRENT), 'utf8').trim() || null; } catch { /* none */ }
  let versions = [];
  try { versions = fs.readdirSync(versionsDir).filter((d) => /^v\d/.test(d) && !d.includes('.tmp')).sort(); } catch { /* none */ }
  const real = (f) => { try { return fs.realpathSync(f); } catch { return path.resolve(f); } };
  const rel = path.relative(real(versionsDir), real(root));
  const running = rel && !rel.startsWith('..') && !path.isAbsolute(rel) && !rel.includes(path.sep) ? rel : null;
  const shims = platform === 'win32' ? [path.join(bin, 'momentry.cmd'), path.join(bin, 'momentry')] : [path.join(bin, 'momentry')];
  return { home, bin, versionsDir, marker, managed: !!marker, current, versions, running, shims, platform };
}

/** The command a hook or /bip uses to call momentry. Managed install: the absolute shim; dev checkout: node + this bin. */
export function selfCommand(env = process.env, opts = {}) {
  const st = installState(env, opts);
  const q = (s) => `"${s}"`;
  // Windows: forward slashes, because Claude Code runs hooks through Git Bash (which misreads `\`) and Codex through
  // cmd.exe; `"C:/…/momentry.cmd"` works in both.
  if (st.managed && st.running) return q(st.platform === 'win32' ? st.shims[0].replace(/\\/g, '/') : st.shims[0]);
  return `${q(opts.execPath ?? process.execPath)} ${q(path.join(opts.root ?? ROOT, 'bin', 'momentry.mjs'))}`;
}

/**
 * Makes the version this code runs from the active one: writes `current`, the shims and the marker,
 * and prunes versions other than the new and the previous one. Called by the installers and by update.
 * @param {NodeJS.ProcessEnv} [env] @param {{platform?: string, root?: string, dryRun?: boolean}} [opts]
 * @returns {{version: string, previous: string|null, wrote: string[], pruned: string[]}}
 */
export function activate(env = process.env, opts = {}) {
  const st = installState(env, opts);
  if (!st.running) throw new Error(`bản đang chạy không nằm trong ${st.versionsDir}; chỉ kích hoạt được bản đã giải nén vào đó`);
  const previous = st.current && st.current !== st.running ? st.current : null;
  const wrote = [path.join(st.home, CURRENT), ...st.shims, path.join(st.home, MARKER)];
  const keep = new Set([st.running, previous].filter(Boolean));
  const pruned = st.versions.filter((v) => !keep.has(v));
  if (opts.dryRun) return { version: st.running, previous, wrote, pruned };
  const foreign = st.shims.find((s) => fs.existsSync(s) && !isOurShim(s));
  if (foreign) throw new Error(`${foreign} đã có và không do momentry cài; xoá nó hoặc đặt MOMENTRY_INSTALL_DIR khác`);
  writeAtomic(path.join(st.home, CURRENT), `${st.running}\n`, 0o644);
  writeAtomic(path.join(st.bin, 'momentry'), shimSh(st.home), 0o755);
  if (st.platform === 'win32') writeAtomic(path.join(st.bin, 'momentry.cmd'), shimCmd(st.home), 0o755);
  writeAtomic(path.join(st.home, MARKER), `${JSON.stringify({ version: st.running.replace(/^v/, ''), bin: st.bin, activatedAt: new Date().toISOString() }, null, 2)}\n`, 0o644);
  for (const v of pruned) fs.rmSync(path.join(st.versionsDir, v), { recursive: true, force: true });
  return { version: st.running, previous, wrote, pruned };
}

/** Points `current` back at `version` (rollback). */
export function switchTo(version, env = process.env, opts = {}) {
  const st = installState(env, opts);
  if (!fs.existsSync(path.join(st.versionsDir, version, 'bin', 'momentry.mjs'))) throw new Error(`không có bản ${version} trong ${st.versionsDir}`);
  writeAtomic(path.join(st.home, CURRENT), `${version}\n`, 0o644);
}

/** True when a shim file is ours (carries the tag). */
export function isOurShim(file) {
  try { return fs.readFileSync(file, 'utf8').includes(SHIM_TAG); } catch { return false; }
}

