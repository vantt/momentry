#!/usr/bin/env node
// Personal ranking (lib/taste-rank.mjs) measured on the labelled set, leave one session out: label `t` = used, every
// other story (matched by a non-`t` label or by none) = dropped; learn on the other sessions, rank the left-out one,
// rotate. Each session's first capture is replayed with --fake-llm (0 USD) into a temporary scratch repo, exactly as
// run.mjs measures it. Prints numbers only (no titles, no text). Usage: --help.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { loadManifest, runOnce, captures, DEFAULT_OUT } from './run.mjs';
import { loadLabels, matches, storyText } from './labels.mjs';
import { rankMetrics, mean } from './metrics.mjs';
import { snapshot } from '../../lib/taste.mjs';
import { learn, personalOrder, LAMBDA } from '../../lib/taste-rank.mjs';

/**
 * Ranked stories and labels of every session, from a replay of its first capture.
 * @returns {Promise<{id: string, ranked: any[], labels: import('./labels.mjs').Label[]}[]>}
 */
export async function loadSessions(sessions, out, log, env = process.env) {
  const rows = [];
  for (const s of sessions) {
    const c = captures(out, s.id)[0];
    if (!c) { log(`${s.id}: chưa có lần chụp`); continue; }
    if (!s.labels || !fs.existsSync(s.labels)) { log(`${s.id}: chưa có file nhãn`); continue; }
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'momentry-taste-loso-'));
    try {
      const r = await runOnce({ session: s, fromLine: c.rec.fromLine, toLine: c.rec.toLine, scratch, fakeLlm: path.join(c.dir, 'llm'), env });
      rows.push({ id: s.id, ranked: r.ranked, labels: loadLabels(s.labels) });
    } finally { fs.rmSync(scratch, { recursive: true, force: true }); }
  }
  return rows;
}

/** 1 when a `t` label matches the story, else 0. */
export function usedOf(story, labels) {
  const text = storyText(story);
  return labels.some((l) => l.t && matches(story, l, text)) ? 1 : 0;
}

/**
 * Verdicts of the training sessions: position in the default order as `base`; `at` orders sessions as listed, so
 * the held-out check of learn() takes the last sessions.
 */
export function examplesFrom(train) {
  return train.flatMap((s, k) => s.ranked.map((story, i) => ({
    y: usedOf(story, s.labels), base: i + 1, at: `${String(k).padStart(3, '0')}-${String(i).padStart(5, '0')}`, features: snapshot(story.data),
  })));
}

/** Leave-one-session-out rows: default and personal metrics per session. */
export function loso(data, { lambda = LAMBDA, check = true, explore = true } = {}) {
  return data.map((s) => {
    const model = learn(examplesFrom(data.filter((x) => x !== s)), { lambda, check });
    const personal = personalOrder(s.ranked, model, { explore });
    return { id: s.id, model: model.reason, check: model.check, def: rankMetrics(s.ranked, s.labels), own: rankMetrics(personal, s.labels) };
  });
}

/** Stories per feature that is missing in the replayed frontmatter. */
export function coverage(data) {
  const all = data.flatMap((s) => s.ranked.map((x) => snapshot(x.data)));
  const miss = (f) => all.filter(f).length;
  return {
    stories: all.length, tension: miss((f) => f.tension === null), stakes: miss((f) => f.stakes === null), strength: miss((f) => f.strength === null),
    hits: miss((f) => f.hits === null), completeness: miss((f) => f.completeness === null), signals: miss((f) => !f.signals.length),
    outsider: miss((f) => !f.hit_by.includes('outsider')), angle: miss((f) => !f.has_angle),
  };
}

const f2 = (v) => (v == null ? '-' : v.toFixed(2));

/** Plain-text table. */
export function format(rows, cov, head) {
  const L = [head, 'phiên      chuyện  t   t-nửa-trên mặc định→gu   p@5 mặc định→gu   hạng-t mặc định→gu   mô hình (AUC giữ lại gu/mặc định)'];
  for (const r of rows) {
    L.push([r.id.padEnd(10), String(r.def.stories).padStart(6), String(r.def.tLabels).padStart(3),
      `${r.def.tTopHalf}→${r.own.tTopHalf}`.padStart(13), `${f2(r.def.p5)}→${f2(r.own.p5)}`.padStart(16), `${f2(r.def.tMeanRank)}→${f2(r.own.tMeanRank)}`.padStart(20),
      `   ${r.model}${r.check ? ` (${f2(r.check.auc)}/${f2(r.check.aucDefault)})` : ''}`].join(' '));
  }
  const sum = (k, f) => rows.reduce((a, r) => a + r[k][f], 0);
  const t = sum('def', 'tLabels');
  L.push('', `tổng: t nửa trên ${sum('def', 'tTopHalf')}/${t} → ${sum('own', 'tTopHalf')}/${t}; p@5 ${f2(mean(rows.map((r) => r.def.p5)))} → ${f2(mean(rows.map((r) => r.own.p5)))}; hạng-t ${f2(mean(rows.map((r) => r.def.tMeanRank)))} → ${f2(mean(rows.map((r) => r.own.tMeanRank)))}`);
  const worst = Math.min(...rows.map((r) => r.own.tTopHalf - r.def.tTopHalf));
  L.push(`phiên tụt nhiều nhất: ${worst} chuyện t; đạt tiêu chí (không phiên nào tụt quá 1, tổng tăng): ${worst >= -1 && sum('own', 'tTopHalf') > sum('def', 'tTopHalf') ? 'có' : 'không'}`);
  L.push(`thiếu đặc trưng trên ${cov.stories} chuyện: ${Object.entries(cov).filter(([k]) => k !== 'stories').map(([k, v]) => `${k} ${v}`).join(', ')}`);
  return L.join('\n');
}

const USAGE = `node scripts/eval/taste-loso.mjs --manifest FILE [--out DIR] [--lambda X,Y] [--no-check] [--no-explore]
  --out         thư mục bản chụp (mặc định ${DEFAULT_OUT}/new-defaults)
  --lambda      độ mạnh tiên nghiệm, một hay nhiều giá trị (mặc định ${LAMBDA})
  --no-check    bỏ bước so với mặc định trên phán quyết giữ lại (để xem riêng mô hình học được gì)
  --no-explore  bỏ chỗ khám phá trong top 5`;

export async function main(argv = process.argv.slice(2), io = { out: (s) => process.stdout.write(s + '\n'), err: (s) => process.stderr.write(s + '\n') }) {
  let a;
  try { a = parseArgs({ args: argv, options: { manifest: { type: 'string' }, out: { type: 'string' }, lambda: { type: 'string' }, 'no-check': { type: 'boolean' }, 'no-explore': { type: 'boolean' }, help: { type: 'boolean', short: 'h' } } }).values; } catch (e) { io.err(`${e.message}\n${USAGE}`); return 2; }
  if (a.help) { io.out(USAGE); return 0; }
  if (!a.manifest) { io.err(`thiếu --manifest\n${USAGE}`); return 2; }
  const lambdas = (a.lambda ?? String(LAMBDA)).split(',').map(Number);
  if (!lambdas.every((x) => Number.isFinite(x) && x > 0)) { io.err('--lambda phải là số > 0'); return 2; }
  let sessions;
  try { sessions = loadManifest(a.manifest); } catch (e) { io.err(e.message); return 2; }
  const data = await loadSessions(sessions, path.resolve(a.out ?? path.join(DEFAULT_OUT, 'new-defaults')), io.err);
  if (data.length < 2) { io.err('cần ít nhất 2 phiên có bản chụp và nhãn'); return 1; }
  const cov = coverage(data);
  const check = !a['no-check'], explore = !a['no-explore'];
  for (const lambda of lambdas) io.out(`${format(loso(data, { lambda, check, explore }), cov, `lambda ${lambda}${check ? '' : ', không kiểm giữ lại'}${explore ? '' : ', không chỗ khám phá'}`)}\n`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().then((code) => { process.exitCode = code; }, (e) => { process.stderr.write(`${e.stack || e.message}\n`); process.exitCode = 1; });
}
