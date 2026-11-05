#!/usr/bin/env node
// Eval harness: capture real pipeline runs once (--capture), replay them with --fake-llm at zero model cost, and
// measure rank quality against label files plus per-step model cost. Usage and formats: scripts/eval/README.md.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { runSession, SOURCE_NAMES } from '../../lib/pipeline.mjs';
import { loadConfig, ensurePrivateDir } from '../../lib/config.mjs';
import { paths } from '../../lib/paths.mjs';
import { readBox } from '../../lib/box.mjs';
import { sortRanked } from '../../lib/rank.mjs';
import { heldDir } from '../../lib/quarantine.mjs';
import { loadLabels } from './labels.mjs';
import { rankMetrics, callUsage, stepCosts, addStepCosts, runDiff, mean, STEPS } from './metrics.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const DEFAULT_OUT = path.join(ROOT, 'docs', '_private', 'eval');
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
/** Margin over the dry-run estimate for --budget (estimate is within about 0.65–1.16 of real spend; docs/experiments/2026-11-05-cost-cuts). */
const ESTIMATE_FACTOR = 1.3;

/**
 * @typedef {object} Session
 * @property {string} id  @property {string} host  one of SOURCE_NAMES (claude, codex, pi, omp, agy)  @property {string} transcript absolute
 * @property {number} fromLine @property {number} toLine
 * @property {string|null} labels absolute path (relative ones resolve against the manifest's folder)
 */

/** Reads and validates a manifest. @param {string} file @returns {Session[]} */
export function loadManifest(file) {
  const dir = path.dirname(path.resolve(file));
  let j;
  try { j = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { throw new Error(`manifest hỏng ${file}: ${e.message}`); }
  const list = Array.isArray(j) ? j : j?.sessions;
  if (!Array.isArray(list) || !list.length) throw new Error(`${file}: cần mảng sessions không rỗng`);
  const seen = new Set();
  return list.map((s, i) => {
    const at = `${file}: sessions[${i}]`;
    if (!s || typeof s !== 'object') throw new Error(`${at}: phải là object`);
    if (!ID_RE.test(String(s.id ?? ''))) throw new Error(`${at}: id phải khớp ${ID_RE}`);
    if (seen.has(s.id)) throw new Error(`${at}: id trùng ${s.id}`);
    seen.add(s.id);
    if (!SOURCE_NAMES.includes(s.host)) throw new Error(`${at}: host phải là một trong ${SOURCE_NAMES.join(', ')}`);
    if (typeof s.transcript !== 'string' || !path.isAbsolute(s.transcript)) throw new Error(`${at}: transcript phải là đường dẫn tuyệt đối`);
    const fromLine = s.fromLine ?? 1;
    if (!Number.isInteger(fromLine) || fromLine < 1) throw new Error(`${at}: fromLine phải là số nguyên ≥ 1`);
    if (!Number.isInteger(s.toLine) || s.toLine < fromLine) throw new Error(`${at}: toLine phải là số nguyên ≥ fromLine`);
    if (s.labels != null && typeof s.labels !== 'string') throw new Error(`${at}: labels phải là đường dẫn`);
    return { id: s.id, host: s.host, transcript: s.transcript, fromLine, toLine: s.toLine, labels: s.labels ? path.resolve(dir, s.labels) : null };
  });
}

/** sha256 of lines fromLine..toLine (1-based, inclusive) of a file, so a replay can tell the window changed. */
export function windowSha(file, fromLine, toLine) {
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  return crypto.createHash('sha256').update(lines.slice(fromLine - 1, toLine).join('\n')).digest('hex').slice(0, 16);
}

const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };

/** Privacy sources of the user's real config (read only; MOMENTRY_PRIVACY_SOURCES in env still wins in loadConfig). */
function userPrivacySources(env) {
  const c = readJson(paths(env).configFile) || {};
  const s = c.privacy?.sources ?? c['privacy.sources'];
  return Array.isArray(s) ? s : [];
}

/**
 * Fresh scratch git repo with its own config, cache and project list. Only the privacy names are read from the user's
 * config; unchecked stories are allowed into the scratch box (it never leaves docs/_private).
 * @returns {{repo: string, isoEnv: NodeJS.ProcessEnv}}
 */
export function makeScratch(dir, env = process.env) {
  fs.rmSync(dir, { recursive: true, force: true });
  const repo = ensurePrivateDir(path.join(dir, 'repo'));
  execFileSync('git', ['init', '-q', repo], { stdio: 'ignore' });
  fs.writeFileSync(path.join(repo, '.momentry.json'), '{}\n');
  const configFile = path.join(dir, 'config.json');
  fs.writeFileSync(configFile, JSON.stringify({ privacy: { sources: userPrivacySources(env), allowUnchecked: true } }, null, 2) + '\n', { mode: 0o600 });
  const isoEnv = Object.fromEntries(Object.entries(env).filter(([k]) => !k.startsWith('MOMENTRY_') || k === 'MOMENTRY_PRIVACY_SOURCES'));
  Object.assign(isoEnv, { MOMENTRY_CACHE: path.join(dir, 'cache'), MOMENTRY_CONFIG: configFile, XDG_CONFIG_HOME: path.join(dir, 'xdg') });
  return { repo, isoEnv };
}

/** Box stories plus new stories held by the privacy gate, best first. */
function rankedStories(cfg) {
  const box = readBox(cfg.box).filter((s) => !s.error);
  const held = [];
  const dir = heldDir(cfg.repo, cfg.cacheDir);
  for (const f of fs.existsSync(dir) ? fs.readdirSync(dir).filter((n) => n.endsWith('.json')).sort() : []) {
    const h = readJson(path.join(dir, f));
    if (h?.storyId && !h.patch && h.story) held.push({ id: h.storyId, data: h.story.data || {}, body: h.story.body || '', held: true });
  }
  return sortRanked([...box, ...held]);
}

const titleOf = (s) => /^#\s+(.+)$/m.exec(s.body || '')?.[1]?.trim() ?? s.id;

/**
 * One pipeline run of a session window in a fresh scratch repo: real model (saveLlm set) or replay (fakeLlm set).
 * The user's real box, ledger, cache and project list are never written.
 * @param {{session: Session, fromLine: number, toLine: number, scratch: string, saveLlm?: string, fakeLlm?: string, dryRun?: boolean, env?: NodeJS.ProcessEnv}} o
 */
export async function runOnce(o) {
  const env = o.env || process.env;
  const { repo, isoEnv } = makeScratch(o.scratch, env);
  const cfg = loadConfig({ cwd: repo, env: isoEnv, flags: o.fakeLlm ? { 'fake-llm': o.fakeLlm } : {} });
  // model calls and `~` in privacy sources use the real environment; every write goes through cfg (scratch)
  const report = await runSession(null, {
    cfg, transcript: o.session.transcript, source: o.session.host, fromLine: o.fromLine, toLine: o.toLine,
    dryRun: !!o.dryRun, saveLlm: o.saveLlm, env,
  });
  const ranked = o.dryRun ? [] : rankedStories(cfg);
  return { report, ranked, cfg };
}

/** Saved model outputs of a run, per call and per step. @param {string} dir */
export function readCalls(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((n) => n.endsWith('.json')).sort()
    .map((n) => callUsage(n.slice(0, -5), readJson(path.join(dir, n)))).filter(Boolean);
}

function parseDry(message) {
  const m = String(message || '');
  const num = (re) => { const x = re.exec(m); return x ? Number(x[1]) : null; };
  return { usd: num(/~([\d.]+) USD/), tokens: num(/~(\d+) token/), chunks: num(/(\d+) khúc/), hotspots: num(/(\d+) điểm nóng/), entries: num(/(\d+) Entry/) };
}

const summary = (s) => ({ id: s.id, title: titleOf(s), tension: s.data.tension ?? null, stakes: s.data.stakes ?? null, strength: s.data.strength ?? null, hits: s.data.hits ?? null, held: !!s.held });

function nextRunDir(base) {
  ensurePrivateDir(base);
  for (let n = 1; ; n++) {
    const d = path.join(base, String(n));
    try { fs.mkdirSync(d, { mode: 0o700 }); return { n, dir: d }; } catch (e) { if (e.code !== 'EEXIST') throw e; }
  }
}

/** Captures one session: dry-run estimate, then the real run with --save-llm. Writes `<out>/<id>/runs/<n>/capture.json`. */
async function capture(session, out, log, env) {
  const text = fs.readFileSync(session.transcript, 'utf8');
  const toLine = Math.min(session.toLine, text.split('\n').length - (text.endsWith('\n') ? 1 : 0));
  const { n, dir } = nextRunDir(path.join(out, session.id, 'runs'));
  const dry = await runOnce({ session, fromLine: session.fromLine, toLine, scratch: path.join(dir, 'dry'), dryRun: true, env });
  fs.rmSync(path.join(dir, 'dry'), { recursive: true, force: true });
  log(`${session.id}#${n}: L${session.fromLine}-L${toLine}, ước tính ${parseDry(dry.report.message).usd ?? '?'} USD; đang chạy model…`);
  const r = await runOnce({ session, fromLine: session.fromLine, toLine, scratch: path.join(dir, 'scratch'), saveLlm: path.join(dir, 'llm'), env });
  const rec = {
    id: session.id, run: n, host: session.host, transcript: session.transcript, fromLine: session.fromLine, toLine,
    windowSha: windowSha(session.transcript, session.fromLine, toLine), at: new Date().toISOString(),
    dryRun: parseDry(dry.report.message), report: r.report, ranked: r.ranked.map(summary),
  };
  fs.writeFileSync(path.join(dir, 'capture.json'), JSON.stringify(rec, null, 2) + '\n', { mode: 0o600 });
  log(`${session.id}#${n}: ${r.report.status}, ${r.ranked.length} chuyện, ${r.report.usd?.toFixed(3) ?? '?'} USD, ${r.report.secs} s`);
  return rec;
}

/** Lists captures of a session, oldest first. */
function captures(out, id) {
  const base = path.join(out, id, 'runs');
  if (!fs.existsSync(base)) return [];
  return fs.readdirSync(base).filter((d) => /^\d+$/.test(d)).map(Number).sort((a, b) => a - b)
    .map((n) => ({ n, dir: path.join(base, String(n)), rec: readJson(path.join(base, String(n), 'capture.json')) }))
    .filter((c) => c.rec);
}

const noDate = (id) => String(id).replace(/^\d{4}-\d{2}-\d{2}-/, '');

/** Replays one capture with --fake-llm and returns its measured row. */
async function replay(session, c, labels, opts) {
  const sha = windowSha(session.transcript, c.rec.fromLine, c.rec.toLine);
  const r = await runOnce({ session, fromLine: c.rec.fromLine, toLine: c.rec.toLine, scratch: path.join(c.dir, 'replay'), fakeLlm: path.join(c.dir, 'llm'), env: opts.env });
  const ids = r.ranked.map((s) => noDate(s.id));
  const capIds = c.rec.ranked.map((s) => noDate(s.id));
  if (!opts.keep) fs.rmSync(path.join(c.dir, 'replay'), { recursive: true, force: true });
  return row(session, c, r.ranked, labels, {
    replayStatus: r.report.status, replayExit: r.report.exitCode, windowChanged: sha !== c.rec.windowSha,
    sameAsCapture: ids.length === capIds.length && ids.every((x, i) => x === capIds[i]),
  });
}

function row(session, c, ranked, labels, extra = {}) {
  const calls = readCalls(path.join(c.dir, 'llm'));
  return {
    id: session.id, run: c.n, stories: ranked.length, usd: c.rec.report.usd ?? null, secs: c.rec.report.secs ?? null,
    modelSecs: calls.reduce((a, x) => a + x.secs, 0), status: c.rec.report.status, dryRunUsd: c.rec.dryRun?.usd ?? null,
    steps: stepCosts(calls), rank: labels ? rankMetrics(ranked, labels) : null, ...extra,
  };
}

/** Runs `fn` over items with at most `jobs` in flight. */
async function pool(items, jobs, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.max(1, Math.min(jobs, items.length)) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); }
  }));
  return out;
}

const f2 = (v) => (v == null ? '-' : Number(v).toFixed(2));
const f3 = (v) => (v == null ? '-' : Number(v).toFixed(3));
const pct = (v) => (v == null ? '-' : `${Math.round(v * 100)}%`);
const sgn = (v, f = f2) => (v == null ? '-' : `${v > 0 ? '+' : ''}${f(v)}`);

/** Plain-text report of measured rows. */
export function formatReport(rows, diffs, overall) {
  const L = [];
  L.push('phiên#lần  chuyện  recall  p@5   p@10  hạng-t  t-nửa-trên  USD     giây   giây-model  replay');
  for (const r of rows) {
    const k = r.rank;
    L.push([`${r.id}#${r.run}`.padEnd(10), String(r.stories).padStart(7), (k ? pct(k.recall) : '-').padStart(7), (k ? f2(k.p5) : '-').padStart(5),
      (k ? f2(k.p10) : '-').padStart(5), (k ? f2(k.tMeanRank) : '-').padStart(7), (k ? `${k.tTopHalf}/${k.tLabels}` : '-').padStart(11),
      f3(r.usd).padStart(7), String(r.secs ?? '-').padStart(6), f2(r.modelSecs).padStart(11),
      ` ${r.replayStatus ?? '-'}${r.sameAsCapture === false ? ' (khác lần chụp)' : ''}${r.windowChanged ? ' (transcript đã đổi)' : ''}`].join(' '));
  }
  L.push('', `tổng: ${overall.sessions} phiên, ${f3(overall.usd)} USD, ${f2(overall.secs)} giây; trung bình lần 1: recall ${pct(overall.recall)}, p@5 ${f2(overall.p5)}, p@10 ${f2(overall.p10)}, hạng-t ${f2(overall.tMeanRank)}, t nửa trên ${overall.tTopHalf ?? '-'}/${overall.tLabels ?? '-'}`);
  for (const d of diffs) {
    L.push(`lệch ${d.id} #${d.a}→#${d.b}: chuyện ${sgn(d.diff.stories, String)}, USD ${sgn(d.diff.usd, f3)}, recall ${sgn(d.diff.recall)}, p@5 ${sgn(d.diff.p5)}, hạng-t ${sgn(d.diff.tMeanRank)}, nhãn trùng ${pct(d.diff.labelAgreement)}, t-nửa-trên trùng ${pct(d.diff.tTopHalfAgreement)}`);
  }
  const st = overall.steps;
  L.push('', 'bước          gọi   token vào   token ra       USD   phần   giây-model');
  for (const s of [...STEPS, 'other', 'total']) {
    const v = st[s];
    if (!v) continue;
    L.push([s.padEnd(12), String(v.calls).padStart(5), String(v.tokIn).padStart(11), String(v.tokOut).padStart(10), f3(v.usd).padStart(9), pct(v.share).padStart(6), f2(v.secs).padStart(12)].join(' '));
  }
  return L.join('\n');
}

/** Rows -> overall numbers (first capture of each session for quality; every capture for cost). */
export function overallOf(rows) {
  const firstOf = new Map();
  for (const r of rows) if (!firstOf.has(r.id) || r.run < firstOf.get(r.id).run) firstOf.set(r.id, r);
  const q = [...firstOf.values()].map((r) => r.rank).filter(Boolean);
  const sum = (xs) => xs.reduce((a, b) => a + b, 0);
  return {
    sessions: firstOf.size, captures: rows.length, usd: sum(rows.map((r) => r.usd ?? 0)), secs: sum(rows.map((r) => r.secs ?? 0)),
    recall: mean(q.map((k) => k.recall)), p5: mean(q.map((k) => k.p5)), p10: mean(q.map((k) => k.p10)), tMeanRank: mean(q.map((k) => k.tMeanRank)),
    tTopHalf: q.length ? sum(q.map((k) => k.tTopHalf)) : null, tLabels: q.length ? sum(q.map((k) => k.tLabels)) : null,
    steps: addStepCosts(rows.map((r) => r.steps)),
  };
}

function labelsOf(session, log) {
  if (!session.labels) return null;
  if (!fs.existsSync(session.labels)) { log(`${session.id}: chưa có file nhãn ${session.labels}; chỉ đo chi phí`); return null; }
  return loadLabels(session.labels);
}

const USAGE = `node scripts/eval/run.mjs --manifest FILE [--capture] [--out DIR] [--only ID,ID] [--jobs N] [--budget USD] [--keep]
  mặc định: chạy lại mọi lần chụp bằng --fake-llm (không tốn tiền) rồi đo
  --capture  gọi model thật, mỗi phiên một lần chụp mới (<out>/<id>/runs/<n>/)
  --out      thư mục dữ liệu (mặc định ${path.relative(process.cwd(), DEFAULT_OUT) || DEFAULT_OUT})
  --only     chỉ các phiên này   --jobs  số phiên chạy song song (mặc định 1)
  --budget   với --capture: không chụp phiên tiếp khi đã tiêu + ${ESTIMATE_FACTOR}×ước tính vượt mức này
  --keep     giữ repo nháp của lần chạy lại (<out>/<id>/runs/<n>/replay/)`;

/** CLI entry; returns the exit code. `env` is the real environment (model calls, privacy names). */
export async function main(argv = process.argv.slice(2), io = { out: (s) => process.stdout.write(s + '\n'), err: (s) => process.stderr.write(s + '\n') }, env = process.env) {
  let a;
  try {
    a = parseArgs({ args: argv, options: {
      manifest: { type: 'string' }, capture: { type: 'boolean' }, out: { type: 'string' }, only: { type: 'string' },
      jobs: { type: 'string' }, budget: { type: 'string' }, keep: { type: 'boolean' }, help: { type: 'boolean', short: 'h' },
    } }).values;
  } catch (e) { io.err(`${e.message}\n${USAGE}`); return 2; }
  if (a.help) { io.out(USAGE); return 0; }
  if (!a.manifest) { io.err(`thiếu --manifest\n${USAGE}`); return 2; }
  const jobs = a.jobs === undefined ? 1 : Number(a.jobs);
  const budget = a.budget === undefined ? null : Number(a.budget);
  if (!Number.isInteger(jobs) || jobs < 1) { io.err('--jobs phải là số nguyên ≥ 1'); return 2; }
  if (budget !== null && !(budget > 0)) { io.err('--budget phải là số > 0'); return 2; }
  let sessions;
  try { sessions = loadManifest(a.manifest); } catch (e) { io.err(e.message); return 2; }
  if (a.only) {
    const want = new Set(a.only.split(',').map((s) => s.trim()).filter(Boolean));
    const unknown = [...want].filter((x) => !sessions.some((s) => s.id === x));
    if (unknown.length) { io.err(`--only: không có trong manifest: ${unknown.join(', ')}`); return 2; }
    sessions = sessions.filter((s) => want.has(s.id));
  }
  const out = path.resolve(a.out || DEFAULT_OUT);
  ensurePrivateDir(out);
  let failed = 0;

  if (a.capture) {
    let spent = 0;
    await pool(sessions, jobs, async (s) => {
      if (!fs.existsSync(s.transcript)) { io.err(`${s.id}: không có transcript ${s.transcript}`); failed++; return; }
      if (budget !== null) {
        const est = parseDry((await runOnce({ session: s, fromLine: s.fromLine, toLine: s.toLine, scratch: path.join(out, s.id, 'budget-dry'), dryRun: true, env })).report.message).usd ?? 0;
        fs.rmSync(path.join(out, s.id, 'budget-dry'), { recursive: true, force: true });
        if (spent + ESTIMATE_FACTOR * est > budget) { io.err(`${s.id}: bỏ qua, đã tiêu ${spent.toFixed(2)} + ${ESTIMATE_FACTOR}×${est.toFixed(2)} USD vượt --budget ${budget}`); return; }
      }
      try {
        const rec = await capture(s, out, io.err, env);
        spent += rec.report.usd ?? 0;
        if (rec.report.status === 'failed') failed++;
      } catch (e) { io.err(`${s.id}: ${e.message}`); failed++; }
    });
  }

  const rows = [], diffs = [];
  await pool(sessions, jobs, async (s) => {
    let labels;
    try { labels = labelsOf(s, io.err); } catch (e) { io.err(`${s.id}: nhãn hỏng: ${e.message}`); failed++; return; }
    const cs = captures(out, s.id);
    if (!cs.length) { io.err(`${s.id}: chưa có lần chụp nào (chạy với --capture)`); return; }
    const mine = [];
    for (const c of cs) {
      try { mine.push(await replay(s, c, labels, { keep: a.keep, env })); } catch (e) { io.err(`${s.id}#${c.n}: chạy lại hỏng: ${e.message}`); failed++; }
    }
    rows.push(...mine);
    for (let i = 1; i < mine.length; i++) diffs.push({ id: s.id, a: mine[0].run, b: mine[i].run, diff: runDiff(mine[0], mine[i]) });
  });
  rows.sort((x, y) => x.id.localeCompare(y.id) || x.run - y.run);
  const overall = overallOf(rows);
  io.out(formatReport(rows, diffs, overall));
  const resDir = ensurePrivateDir(path.join(out, 'results'));
  const file = path.join(resDir, `${new Date().toISOString().replace(/[:.]/g, '-')}${a.capture ? '-capture' : ''}.json`);
  fs.writeFileSync(file, JSON.stringify({ at: new Date().toISOString(), manifest: path.resolve(a.manifest), rows, diffs, overall }, null, 2) + '\n', { mode: 0o600 });
  io.out(`\nđã ghi ${file}`);
  return failed ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().then((code) => { process.exitCode = code; }, (e) => { process.stderr.write(`${e.stack || e.message}\n`); process.exitCode = 1; });
}
