// The single source of the momentry version (release tags must equal `v${VERSION}`).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const VERSION = '0.3.0';

/** Install root: the dir holding bin/, lib/, prompts/, rules/. */
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Name of the build-metadata file the release packager writes at ROOT. */
export const BUILD_FILE = 'BUILD';

function fromGit(root) {
  try {
    const git = (...a) => execFileSync('git', ['-C', root, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000 }).trim();
    const [commit, commitTime] = git('log', '-1', '--format=%H %cI').split(' ');
    const dirty = git('status', '--porcelain', '--untracked-files=no', '--', 'bin', 'lib', 'prompts', 'rules') !== '';
    return { commit: commit ? commit.slice(0, 12) + (dirty ? '-dirty' : '') : null, commitTime: commitTime || null, source: 'git' };
  } catch { return null; }
}

/**
 * Build fingerprint: version plus the commit it was built from.
 * Release installs read `BUILD` (written by scripts/package-release.mjs); a git checkout asks git.
 * @param {string} [root] @returns {{version: string, commit: string|null, commitTime: string|null, source: 'release'|'git'|'unknown'}}
 */
export function fingerprint(root = ROOT) {
  try {
    const b = JSON.parse(fs.readFileSync(path.join(root, BUILD_FILE), 'utf8'));
    return { version: VERSION, commit: b.commit ?? null, commitTime: b.commitTime ?? null, source: 'release' };
  } catch { /* not a release install */ }
  const g = fs.existsSync(path.join(root, '.git')) ? fromGit(root) : null;
  return g ? { version: VERSION, ...g } : { version: VERSION, commit: null, commitTime: null, source: 'unknown' };
}

/** Compares two `X.Y.Z[-pre]` versions (leading `v` allowed). @returns {-1|0|1} */
export function compareVersions(a, b) {
  const parse = (v) => {
    const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(String(v).trim());
    if (!m) throw new Error(`phiên bản không hợp lệ: ${v}`);
    return { n: [Number(m[1]), Number(m[2]), Number(m[3])], pre: m[4] ?? null };
  };
  const x = parse(a), y = parse(b);
  for (let i = 0; i < 3; i++) if (x.n[i] !== y.n[i]) return x.n[i] < y.n[i] ? -1 : 1;
  if (x.pre === y.pre) return 0;
  if (x.pre === null) return 1;
  if (y.pre === null) return -1;
  const xs = x.pre.split('.'), ys = y.pre.split('.');
  for (let i = 0; i < Math.max(xs.length, ys.length); i++) {
    if (xs[i] === undefined) return -1;
    if (ys[i] === undefined) return 1;
    const xn = /^\d+$/.test(xs[i]), yn = /^\d+$/.test(ys[i]);
    if (xn && yn && Number(xs[i]) !== Number(ys[i])) return Number(xs[i]) < Number(ys[i]) ? -1 : 1;
    if (xn !== yn) return xn ? -1 : 1;
    if (xs[i] !== ys[i]) return xs[i] < ys[i] ? -1 : 1;
  }
  return 0;
}
