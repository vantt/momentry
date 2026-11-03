// Every path momentry reads or writes outside a repo. Single source for config, installer, update and uninstall.
// Linux/WSL/macOS: XDG-style (~/.config, ~/.cache, ~/.local/share, ~/.local/bin); macOS keeps ~/.config on purpose.
// Windows: %APPDATA%\momentry (config), %LOCALAPPDATA%\momentry\{app,bin,cache} (install, shims, cache).
import os from 'node:os';
import path from 'node:path';

/**
 * @typedef {object} Paths
 * @property {string} config      config dir
 * @property {string} configFile  user config file (MOMENTRY_CONFIG wins)
 * @property {string} cache       cache dir (MOMENTRY_CACHE wins): ledger, locks, quarantine, runs, hook.log
 * @property {string} home        install root (MOMENTRY_HOME wins): versions/, current, .momentry-managed
 * @property {string} bin         dir of the `momentry` shim (MOMENTRY_INSTALL_DIR wins)
 * @property {string} claude      Claude Code config dir (CLAUDE_CONFIG_DIR wins)
 * @property {string} codex       Codex home (CODEX_HOME wins)
 */

/** path module for a platform, so Windows paths can be computed (and tested) anywhere. */
export const pathFor = (platform = process.platform) => (platform === 'win32' ? path.win32 : path.posix);

/**
 * @param {NodeJS.ProcessEnv} [env] @param {{platform?: string, homedir?: string}} [opts]
 * @returns {Paths}
 */
export function paths(env = process.env, opts = {}) {
  const platform = opts.platform ?? process.platform;
  const P = pathFor(platform);
  const home = opts.homedir ?? (platform === 'win32' ? env.USERPROFILE ?? env.HOME : env.HOME) ?? os.homedir();
  // XDG values count only when absolute (XDG spec).
  const abs = (v) => (v && P.isAbsolute(v) ? v : null);
  const own = (v) => (v ? P.resolve(v) : null);

  let config, cache, root, bin;
  if (platform === 'win32') {
    const appData = abs(env.APPDATA) ?? P.join(home, 'AppData', 'Roaming');
    const local = abs(env.LOCALAPPDATA) ?? P.join(home, 'AppData', 'Local');
    config = P.join(appData, 'momentry');
    // install root, shims and cache are siblings so uninstall can remove the install without the cache
    root = P.join(local, 'momentry', 'app');
    cache = P.join(local, 'momentry', 'cache');
    bin = P.join(local, 'momentry', 'bin');
  } else {
    config = P.join(abs(env.XDG_CONFIG_HOME) ?? P.join(home, '.config'), 'momentry');
    cache = P.join(abs(env.XDG_CACHE_HOME) ?? P.join(home, '.cache'), 'momentry');
    root = P.join(abs(env.XDG_DATA_HOME) ?? P.join(home, '.local', 'share'), 'momentry');
    bin = P.join(home, '.local', 'bin');
  }
  return {
    config,
    configFile: own(env.MOMENTRY_CONFIG) ?? P.join(config, 'config.json'),
    cache: own(env.MOMENTRY_CACHE) ?? cache,
    home: own(env.MOMENTRY_HOME) ?? root,
    bin: own(env.MOMENTRY_INSTALL_DIR) ?? bin,
    claude: own(env.CLAUDE_CONFIG_DIR) ?? P.join(home, '.claude'),
    codex: own(env.CODEX_HOME) ?? P.join(home, '.codex'),
  };
}

/** Splits a list env var (MOMENTRY_REPOS, MOMENTRY_PRIVACY_SOURCES) by the platform's delimiter (`:`, `;` on Windows). */
export function splitList(value, platform = process.platform) {
  return String(value ?? '').split(pathFor(platform).delimiter).filter(Boolean);
}
