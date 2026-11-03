// Self-update: same checks as the installer (exact-name sha256, safe extraction, candidate --version),
// switch by rewriting `current`, run post-update work inside the new version, roll back on any failure.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { VERSION, compareVersions } from './version.mjs';
import { installState, switchTo } from './install.mjs';
import { extract } from './tar.mjs';
import { CliError } from './cli-output.mjs';

/** Where releases come from; forks change this constant, tests and mirrors set MOMENTRY_RELEASE_BASE. */
export const REPO = 'vantt/momentry';
export const ASSET_RE = /^momentry-(v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)\.tar\.gz$/;
export const ARCHIVE_ALLOW = ['bin', 'lib', 'prompts', 'BUILD', 'LICENSE', 'README.md'];
const MAX_BYTES = 32 * 1024 * 1024;

export const releaseBase = (env = process.env) => env.MOMENTRY_RELEASE_BASE || `https://github.com/${REPO}/releases`;

/** URL (or local path) of an asset. A local base (path or file:) is one release dir holding the assets. */
export function assetUrl(base, version, name) {
  if (/^file:/.test(base)) return path.join(fileURLToPath(base), name);
  if (!/^https?:/.test(base)) return path.join(base, name);
  return version ? `${base}/download/${version}/${name}` : `${base}/latest/download/${name}`;
}

/** Fetches a URL (https only, except loopback http for tests) or reads a local file, with timeout and size cap. */
export async function fetchBytes(url, { timeoutMs = 60000, maxBytes = MAX_BYTES } = {}) {
  if (!/^https?:/.test(url)) {
    const st = fs.statSync(url);
    if (st.size > maxBytes) throw new Error(`file quá lớn: ${url}`);
    return fs.readFileSync(url);
  }
  const u = new URL(url);
  if (u.protocol !== 'https:' && !['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname)) throw new Error(`chỉ tải qua HTTPS: ${url}`);
  const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status} khi tải ${url}`), { status: res.status });
  const len = Number(res.headers.get('content-length') || 0);
  if (len > maxBytes) throw new Error(`file quá lớn: ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > maxBytes) throw new Error(`file quá lớn: ${url}`);
  return buf;
}

/** Parses checksums.txt: `<sha256>  <name>` lines. */
export function parseChecksums(text) {
  const out = new Map();
  for (const line of String(text).split(/\r?\n/)) {
    const m = /^([0-9a-f]{64})\s+\*?(\S+)$/.exec(line.trim());
    if (m) out.set(m[2], m[1]);
  }
  return out;
}

/** Normalizes `1.2.3` / `v1.2.3` to `v1.2.3`. */
export const vtag = (v) => (String(v).startsWith('v') ? String(v) : `v${v}`);

/**
 * Version policy: `latest` never downgrades; an explicit version may; same version only with force.
 * @returns {'update'|'same'|'older'}
 */
export function decide(current, target, { explicit = false, force = false } = {}) {
  const c = compareVersions(current, target);
  if (c < 0) return 'update';
  if (c === 0) return force ? 'update' : 'same';
  return explicit ? 'update' : 'older';
}

/** Resolves the target release once: its version, archive name and expected sha256. */
export async function resolveRelease({ env = process.env, version = null } = {}) {
  const base = releaseBase(env);
  const v = version ? vtag(version) : null;
  const sums = parseChecksums((await fetchBytes(assetUrl(base, v, 'checksums.txt'))).toString('utf8'));
  const archives = [...sums.keys()].filter((n) => ASSET_RE.test(n));
  if (archives.length !== 1) throw new Error(`checksums.txt phải có đúng một momentry-v*.tar.gz (gặp ${archives.length})`);
  const name = archives[0];
  const target = ASSET_RE.exec(name)[1];
  if (v && target !== v) throw new Error(`checksums.txt của ${v} lại trỏ tới ${name}`);
  return { base, version: target, name, sha256: sums.get(name), pinned: v };
}

const lastLine = (s) => s.trim().split('\n').pop();

function runNode(script, args, env) {
  return spawnSync(process.execPath, [script, ...args], { env, encoding: 'utf8', timeout: 60000, windowsHide: true });
}

/**
 * Downloads, verifies and activates `rel`. Rolls back to the running version if anything fails after the switch.
 * @returns {{from: string, to: string, steps: string[], doctor: any}}
 */
export async function install(rel, { env = process.env, platform = process.platform } = {}) {
  const st = installState(env, { platform });
  const steps = [];
  // the version resolved once from checksums.txt, not `latest` again (a release published meanwhile must not win)
  const gz = await fetchBytes(assetUrl(rel.base, rel.version, rel.name));
  const got = crypto.createHash('sha256').update(gz).digest('hex');
  if (got !== rel.sha256) throw new CliError(`sha256 của ${rel.name} không khớp checksums.txt; không cài`, { code: 'checksum-mismatch', why: `mong ${rel.sha256}, nhận ${got}` });
  steps.push(`tải và kiểm sha256 ${rel.name}`);

  const final = path.join(st.versionsDir, rel.version);
  const tmp = `${final}.tmp-${process.pid}`;
  fs.mkdirSync(st.versionsDir, { recursive: true });
  fs.rmSync(tmp, { recursive: true, force: true });
  try {
    extract(gz, tmp, { top: `momentry-${rel.version}`, allow: ARCHIVE_ALLOW });
    const bin = path.join(tmp, 'bin', 'momentry.mjs');
    const v = runNode(bin, ['version', '--json'], env);
    let reported = null;
    try { reported = JSON.parse(v.stdout).data.version; } catch { /* below */ }
    if (v.status !== 0 || vtag(reported ?? '') !== rel.version) throw new Error(`bản mới không chạy được hoặc báo sai phiên bản (${reported ?? lastLine(v.stderr)})`);
    steps.push(`thử ${rel.version}: chạy được`);
    if (rel.version !== st.running) fs.rmSync(final, { recursive: true, force: true });
    if (!fs.existsSync(final)) fs.renameSync(tmp, final);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  const newBin = path.join(final, 'bin', 'momentry.mjs');
  const act = runNode(newBin, ['_activate', '--json'], env);
  if (act.status !== 0) {
    if (st.running) switchTo(st.running, env, { platform });
    if (rel.version !== st.running) fs.rmSync(final, { recursive: true, force: true });
    throw new CliError(`kích hoạt ${rel.version} lỗi; đã quay lại ${st.running}`, { why: lastLine(act.stderr) });
  }
  steps.push(`kích hoạt ${rel.version}`);
  const doc = runNode(newBin, ['doctor', '--fix', '--json'], env);
  let doctor = null;
  try { doctor = JSON.parse(doc.stdout); } catch { /* reported as null */ }
  // update may run outside any repo: judge only the machine-wide checks here.
  const machine = (doctor?.data?.checks ?? []).filter((c) => !/^(repo|box)\./.test(c.code));
  const healthy = !!doctor && machine.every((c) => !c.critical || c.status !== 'fail');
  steps.push(`doctor --fix trong bản mới: ${healthy ? 'ok' : 'còn việc (chạy momentry doctor)'}`);
  return { from: st.running ?? VERSION, to: rel.version, steps, doctor, healthy };
}
