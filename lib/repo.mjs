// Git root and repo helpers. Walks up for `.git` (dir or worktree file); no git process, so hooks stay fast.
import fs from 'node:fs';
import path from 'node:path';

/** @param {string} cwd @returns {string|null} absolute git root, or null outside a repo */
export function gitRoot(cwd) {
  let d = path.resolve(cwd);
  for (;;) {
    if (fs.existsSync(path.join(d, '.git'))) return d;
    const p = path.dirname(d);
    if (p === d) return null;
    d = p;
  }
}

/** @param {string} root @returns {string} */
export function repoName(root) {
  return path.basename(path.resolve(root));
}

/** True when `child` equals `parent` or lies below it. @param {string} child @param {string} parent */
export function isInside(child, parent) {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}
