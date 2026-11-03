#!/usr/bin/env node
// One packaging script for local dry runs, CI and releases:
//   dist/momentry-vX.Y.Z.tar.gz   bin/ lib/ prompts/ LICENSE README.md BUILD under momentry-vX.Y.Z/
//   dist/install.sh, dist/install.ps1  stamped with the version
//   dist/checksums.txt            sha256 of every asset, sorted
// Usage: node scripts/package-release.mjs [--out DIR] [--dry-run]
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { pack } from '../lib/tar.mjs';
import { VERSION } from '../lib/version.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DIRS = ['bin', 'lib', 'prompts'];
export const FILES = ['LICENSE', 'README.md'];
const VERSION_RE = /export const VERSION = '[^']*';/;

function git(args) {
  try { return execFileSync('git', ['-C', ROOT, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return ''; }
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    if (d.isSymbolicLink()) throw new Error(`không đóng gói link: ${p}`);
    return d.isDirectory() ? walk(p) : [p];
  });
}

/**
 * Builds the release assets.
 * @param {{root?: string, out: string, version?: string, mtime?: number, commit?: string|null, dryRun?: boolean}} o
 *   `version` overrides lib/version.mjs inside the archive (test fixtures only).
 * @returns {{version: string, assets: Record<string, string>, files: string[]}} assets: name -> sha256
 */
export function buildRelease(o) {
  const root = o.root ?? ROOT;
  const version = o.version ?? VERSION;
  const tag = `v${version}`;
  const top = `momentry-${tag}`;
  const mtime = o.mtime ?? Number(process.env.SOURCE_DATE_EPOCH || git(['log', '-1', '--format=%ct']) || 0);
  const commit = o.commit !== undefined ? o.commit : git(['rev-parse', '--short=12', 'HEAD']) || null;
  const commitTime = mtime ? new Date(mtime * 1000).toISOString().replace('.000Z', 'Z') : null;

  const entries = [];
  for (const d of DIRS) {
    for (const f of walk(path.join(root, d))) {
      const rel = path.relative(root, f).split(path.sep).join('/');
      let data = fs.readFileSync(f);
      if (rel === 'lib/version.mjs' && o.version) data = Buffer.from(data.toString('utf8').replace(VERSION_RE, `export const VERSION = '${version}';`));
      const exec = rel.startsWith('bin/') ? 0o755 : 0o644;
      entries.push({ name: `${top}/${rel}`, data, mode: exec });
    }
  }
  for (const f of FILES) entries.push({ name: `${top}/${f}`, data: fs.readFileSync(path.join(root, f)), mode: 0o644 });
  entries.push({ name: `${top}/BUILD`, data: Buffer.from(`${JSON.stringify({ version, commit, commitTime }, null, 2)}\n`), mode: 0o644 });

  const files = entries.map((e) => e.name).sort();
  const outputs = {
    [`${top}.tar.gz`]: pack(entries, { mtime }),
    'install.sh': Buffer.from(fs.readFileSync(path.join(root, 'install.sh'), 'utf8').replace(/@VERSION@/g, tag)),
    'install.ps1': Buffer.from(fs.readFileSync(path.join(root, 'install.ps1'), 'utf8').replace(/@VERSION@/g, tag)),
  };
  const assets = Object.fromEntries(Object.entries(outputs).map(([n, b]) => [n, crypto.createHash('sha256').update(b).digest('hex')]));
  if (!o.dryRun) {
    fs.mkdirSync(o.out, { recursive: true });
    for (const [n, b] of Object.entries(outputs)) fs.writeFileSync(path.join(o.out, n), b, { mode: n === 'install.sh' ? 0o755 : 0o644 });
    const sums = Object.keys(assets).sort().map((n) => `${assets[n]}  ${n}`).join('\n');
    fs.writeFileSync(path.join(o.out, 'checksums.txt'), `${sums}\n`);
  }
  return { version: tag, assets, files };
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: { out: { type: 'string' }, 'dry-run': { type: 'boolean' } } });
  const out = path.resolve(values.out ?? path.join(ROOT, 'dist'));
  const r = buildRelease({ out, dryRun: values['dry-run'] });
  if (values['dry-run']) {
    console.log(`${r.version}: ${r.files.length} file trong archive`);
    for (const f of r.files) console.log(`  ${f}`);
  } else {
    for (const [n, h] of Object.entries(r.assets)) console.log(`${h}  ${path.join(out, n)}`);
    console.log(`${path.join(out, 'checksums.txt')}`);
  }
}
