// Steps 1-11 glue and command handlers (PRD 5.1, 6.3, 6.7, 7.2).
// Every handler returns an object with `exitCode` (PRD 7.2) and optional `message` (printed to stdout).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as claudeSrc from './sources/claude.mjs';
import * as codexSrc from './sources/codex.mjs';
import { render, chunk, approxTokens } from './reduce.mjs';
import { detect, format } from './hotspots.mjs';
import { render as renderPrompt } from './prompts.mjs';
import { harvest } from './harvest.mjs';
import { cluster, resolveBoxTarget, boxCluster } from './cluster.mjs';
import { hookTension, stakes } from './score.mjs';
import { outsider, applyOutsider } from './outsider.mjs';
import { buildStory, mergePatch, renderBody, localDate } from './story.mjs';
import * as L from './ledger.mjs';
import * as Q from './quarantine.mjs';
import { loadBlocklist, loadAllow, checkStory, checkPatch, mask } from './privacy.mjs';
import { readStory, storiesOfSession, uniqueId, writeNew, mergeInto, CAPTURED_BY } from './box.mjs';
import { slugify } from './viet.mjs';
import { logEvent } from './log.mjs';
import { EXIT, ensurePrivateDir } from './config.mjs';

/**
 * @typedef {object} Report
 * @property {number} exitCode
 * @property {string} [message]
 * @property {string|null} sid
 * @property {'done'|'partial'|'failed'|'noop'|'locked'|'dry-run'} status
 * @property {number} [fromLine] @property {number} [toLine]
 * @property {number} [written] @property {number} [merged]
 * @property {number} [privacyBlocked] @property {number} [privacyUnchecked]
 * @property {number|null} [usd] @property {number} [secs]
 */

/**
 * @typedef {object} HarvestOpts
 * @property {import('./config.mjs').Config} cfg
 * @property {string} [transcript]   explicit file (else resolved from sid via sources)
 * @property {number} [fromLine] @property {number} [toLine]
 * @property {boolean} [dryRun]      write nothing anywhere; without fakeLlm stop before the first model call and print the plan
 * @property {string} [savePrompts]  dir for rendered prompts (and raw outputs) instead of the cache runs/ dir
 * @property {string} [saveLlm]      dir for raw model outputs (replayable with --fake-llm)
 * @property {boolean} [blind]       ignore existing box stories at step 6 and write nothing
 * @property {'claude'|'codex'} [source]
 * @property {NodeJS.ProcessEnv} [env]  HOME for transcript dirs, privacy `~` expansion
 * @property {string} [bin]          model executable (tests)
 */

const SOURCES = { claude: claudeSrc, codex: codexSrc };
const SEVERITY = [EXIT.LLM, EXIT.UNCHECKED, EXIT.CHECK, EXIT.LOCKED, EXIT.USAGE];
const worst = (codes) => SEVERITY.find((c) => codes.includes(c)) ?? EXIT.OK;
const usage = (msg) => Object.assign(new Error(msg), { exitCode: EXIT.USAGE });
const safeName = (s) => String(s).replace(/[^A-Za-z0-9._-]+/g, '_');
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-');
const fmtUsd = (u) => (u == null ? '? USD' : `${u.toFixed(2)} USD`);

/** `claude` or `codex` from a transcript file name. @param {string} file */
export function sourceOf(file) {
  return path.basename(file).startsWith('rollout-') ? 'codex' : 'claude';
}

function transcriptDirs(env) {
  const home = env.HOME || os.homedir();
  return { projectsDir: path.join(home, '.claude', 'projects'), sessionsDir: path.join(home, '.codex', 'sessions') };
}

function resolveTranscript(sid, opts, env) {
  if (opts.transcript) {
    const file = path.resolve(opts.transcript);
    if (!fs.existsSync(file)) throw usage(`không có transcript: ${file}`);
    const pre = sid?.split(':')[0];
    const source = opts.source || (SOURCES[pre] ? pre : sourceOf(file));
    return { path: file, source, sid: sid || SOURCES[source].sessionId(file) };
  }
  const source = String(sid || '').split(':')[0];
  if (!SOURCES[source]) throw usage(`id phiên phải có dạng claude:xxxxxxxx hoặc codex:xxxxxxxx: ${sid}`);
  if (!opts.cfg.repoRoot) throw usage('không ở trong git repo');
  const t = SOURCES[source].listTranscripts(opts.cfg.repoRoot, transcriptDirs(env)).find((x) => x.sid === sid);
  if (!t) throw usage(`không tìm thấy transcript của ${sid} trong repo ${opts.cfg.repoRoot}`);
  return { path: t.path, source, sid };
}

// ---------- privacy gate + writes (step 10-11) ----------

function privacyGate(cfg, env) {
  const blocklist = loadBlocklist(cfg.privacy.sources, { env });
  return { blocklist, allow: blocklist ? loadAllow(cfg.privacy.allowFile) : new Set(), allowUnchecked: cfg.privacy.allowUnchecked };
}

function newWriter(cfg, gate, { dry, sid }) {
  return {
    cfg, gate, dry, sid, taken: new Set(), written: 0, merged: 0, privacyBlocked: 0, privacyUnchecked: 0, ids: [], held: [],
    log(event, f) { if (!dry) logEvent(event, { sid, ...f }, { cacheDir: cfg.cacheDir }); },
  };
}

/** Writes a new story through the privacy gate. @returns {{id: string, where: 'box'|'quarantine'|'dry', violations?: object[]}} */
function putNew(w, title, story, tag) {
  const { cfg, gate } = w;
  const id = uniqueId(cfg.box, `${story.data.date}-${slugify(title)}`, w.taken);
  w.taken.add(id);
  if (w.dry) { w.written++; return { id, where: 'dry' }; }
  if (!gate.blocklist) {
    if (gate.allowUnchecked) {
      story.data.privacy = 'unchecked';
      writeNew(cfg.box, { id, ...story });
      w.written++; w.ids.push(id);
      w.log('privacy.unchecked-written', { ref: tag });
      return { id, where: 'box' };
    }
    Q.put(cfg.repo, { id, ...story }, 'unchecked', { cacheDir: cfg.cacheDir });
    w.privacyUnchecked++; w.held.push(id);
    w.log('privacy.skipped', { ref: tag, reason: 'không có nguồn chặn' });
    return { id, where: 'quarantine' };
  }
  const violations = checkStory(story, id, gate.blocklist, gate.allow);
  if (violations.length) {
    Q.put(cfg.repo, { id, ...story }, 'violation', { cacheDir: cfg.cacheDir, violations });
    w.privacyBlocked++; w.held.push(id);
    w.log('privacy.blocked', { ref: tag, fields: violations.map((v) => v.field), kinds: violations.map((v) => v.kind) });
    return { id, where: 'quarantine', violations };
  }
  story.data.privacy = 'checked';
  writeNew(cfg.box, { id, ...story });
  w.written++; w.ids.push(id);
  return { id, where: 'box' };
}

const emptyPatch = (p) => !p.append && !p.add && !p.set && !p.outsider;

/** Merges a patch into an existing story through the privacy gate. */
function putMerge(w, target, patch, tag) {
  const { cfg, gate } = w;
  if (emptyPatch(patch)) return 'none';
  if (w.dry) { w.merged++; return 'dry'; }
  const hold = (reason, violations) => {
    Q.put(cfg.repo, { id: target, target, patch }, reason, { cacheDir: cfg.cacheDir, violations });
    w.held.push(target);
  };
  if (!gate.blocklist && !gate.allowUnchecked) {
    hold('unchecked');
    w.privacyUnchecked++;
    w.log('privacy.skipped', { ref: tag, reason: 'không có nguồn chặn' });
    return 'quarantine';
  }
  if (gate.blocklist) {
    const violations = checkPatch(patch, gate.blocklist, gate.allow);
    if (violations.length) {
      hold('violation', violations);
      w.privacyBlocked++;
      w.log('privacy.blocked', { ref: tag, fields: violations.map((v) => v.field), kinds: violations.map((v) => v.kind) });
      return 'quarantine';
    }
  }
  const unchecked = !gate.blocklist;
  const r = mergeInto(cfg.box, target, unchecked ? { ...patch, privacy: 'unchecked' } : patch);
  if (unchecked) w.log('privacy.unchecked-written', { ref: tag });
  if (r.changed) { w.merged++; w.ids.push(target); }
  return 'box';
}

/**
 * Turns scored clusters into new files or merges (step 11). Returns ids whose scores are missing (needsRescore).
 * @returns {string[]}
 */
function writeClusters(w, clusters, byId, scores, entriesByL, sctx) {
  const needs = [];
  for (const c of clusters) {
    const members = c.members.filter((m) => !m.startsWith('box:')).map((m) => byId.get(m)).filter(Boolean);
    const sc = { hook: scores.hooks.get(c.id), stakes: scores.stakes.get(c.id) };
    const fresh = members.length > 0 || !!c.outsider;
    const boxIds = c.members.filter((m) => m.startsWith('box:'));
    if (boxIds.length > 1) w.log('cluster.duplicate-box', { cluster: c.id, files: boxIds.length });
    const target = resolveBoxTarget(c);
    const old = target ? readStory(w.cfg.box, target) : null;
    if (old && !old.error) {
      const r = putMerge(w, target, mergePatch(old, c, members, sc, sctx), c.id);
      if (r === 'box' && (old.data.status ?? 'raw') === 'raw' && ((fresh && !sc.hook) || !sc.stakes)) needs.push(target);
      continue;
    }
    if (!fresh) continue;
    const built = buildStory(c, members, sc, entriesByL, sctx);
    const r = putNew(w, built.title, { data: built.data, body: built.body }, c.id);
    if (r.where === 'box' && (!sc.hook || !sc.stakes)) needs.push(r.id);
  }
  return needs;
}

// ---------- harvest window (steps 1-11) ----------

function llmBase(opts, cfg, sid, env, noWrite) {
  const runDir = opts.savePrompts ? path.resolve(opts.savePrompts)
    : noWrite ? null : path.join(cfg.cacheDir, 'runs', safeName(sid), stamp());
  return { fakeDir: cfg.fakeLlm, saveDir: opts.saveLlm ? path.resolve(opts.saveLlm) : null, runDir, bin: opts.bin, env };
}

function estimateUsd(tokens, cfg) {
  const harvestUsd = cfg.harvest.runs * (tokens / 1e6 * 1 + 0.03);
  const outsiderUsd = cfg.outsider.enabled ? tokens / 1e6 * 3 + 0.03 : 0;
  return harvestUsd + outsiderUsd + 0.15;
}

function dryPlan(t, win, entries, chunks, hotspots, cfg, opts) {
  const tokens = render(entries).approxTokens;
  if (opts.savePrompts) {
    const dir = ensurePrivateDir(path.resolve(opts.savePrompts));
    for (const c of chunks) {
      const owned = hotspots.filter((h) => c.owns.has(h.L));
      const p = renderPrompt('harvest', { transcript: render(c.entries).text, hotspots: format(owned) || '(không có)' });
      for (let r = 1; r <= cfg.harvest.runs; r++) fs.writeFileSync(path.join(dir, `harvest-c${c.k}-r${r}.prompt.txt`), p, { mode: 0o600 });
    }
  }
  const message = [
    `dry-run ${t.sid} L${win.fromLine}-L${win.toLine}: ${entries.length} Entry, ${chunks.length} khúc, ~${tokens} token, ${hotspots.length} điểm nóng`,
    `harvest ${cfg.harvest.runs} lần (${cfg.harvest.model}), chấm ${cfg.rank.model}, người ngoài ${cfg.outsider.enabled ? cfg.outsider.model : 'tắt'}; chi phí ước tính thô ~${estimateUsd(tokens, cfg).toFixed(2)} USD`,
    ...(opts.savePrompts ? [`đã ghi prompt vào ${path.resolve(opts.savePrompts)}`] : []),
  ].join('\n');
  return { report: { exitCode: EXIT.OK, sid: t.sid, status: 'dry-run', fromLine: win.fromLine, toLine: win.toLine, message }, rec: null };
}

async function runWindow(t, win, opts, tick) {
  const { cfg } = opts;
  const env = opts.env || process.env;
  const noWrite = !!(opts.dryRun || opts.blind);
  const t0 = Date.now();
  const entries = SOURCES[t.source].readEntries(t.path, win);
  const hotspots = detect(entries);
  const chunks = entries.length ? chunk(entries, cfg.harvest.maxInputTokens) : [];
  if (opts.dryRun && !cfg.fakeLlm) return dryPlan(t, win, entries, chunks, hotspots, cfg, opts);

  const stats = { usd: null, secs: 0, failed: [], calls: 0 };
  const llm = llmBase(opts, cfg, t.sid, env, noWrite);
  const rec = {
    at: new Date().toISOString(), fromLine: win.fromLine, toLine: win.toLine, runs: 0, runsFailed: 0, chunks: chunks.length,
    hotspots: hotspots.length, hotspotsMissing: 0, stories: 0, written: 0, merged: 0, privacyBlocked: 0, privacyUnchecked: 0,
    usd: null, secs: 0, status: 'done',
  };
  const finish = (report) => {
    rec.usd = stats.usd; rec.secs = Math.round((Date.now() - t0) / 100) / 10;
    return { report: { sid: t.sid, fromLine: win.fromLine, toLine: rec.toLine, usd: rec.usd, secs: rec.secs, ...report }, rec };
  };

  // step 4-5
  const all = [], answers = [], missing = new Set();
  const chunkOk = new Map(chunks.map((c) => [c.k, 0]));
  for (let r = 1; r <= cfg.harvest.runs; r++) {
    let ok = 0, bad = 0;
    for (const c of chunks) {
      const owned = hotspots.filter((h) => c.owns.has(h.L));
      try {
        const res = await harvest(c, owned, cfg, { run: r, llm, stats });
        ok++;
        chunkOk.set(c.k, chunkOk.get(c.k) + 1);
        all.push(...res.stories);
        answers.push(...res.answers);
        for (const id of res.missing) missing.add(id);
        if (res.fillFailed) stats.failed.push(`harvest-fill-c${c.k}-r${r}`);
      } catch (e) {
        bad++;
        if (!noWrite) logEvent('harvest.call-failed', { sid: t.sid, run: r, chunk: c.k, error: e }, { cacheDir: cfg.cacheDir });
      }
      tick();
    }
    if (!chunks.length || ok) { rec.runs++; if (bad) stats.failed.push(`harvest-r${r}`); } else rec.runsFailed++;
  }
  // A chunk that failed in every run: its hotspots count as missing and lastLine stops before its first owned line,
  // so the next harvest retries it (later chunks' stories are still written; re-harvest merges by step 6).
  const dead = chunks.filter((c) => !chunkOk.get(c.k));
  for (const c of dead) for (const h of hotspots) if (c.owns.has(h.L)) missing.add(h.id);
  if (dead.length && rec.runs) {
    const stop = Math.min(...dead[0].owns) - 1;
    rec.toLine = stop;
    stats.failed.push(...dead.map((c) => `harvest-c${c.k}`));
  }
  rec.stories = all.length;
  rec.hotspotsMissing = missing.size;
  if (!rec.runs || rec.toLine < win.fromLine) {
    rec.status = 'failed';
    rec.toLine = win.toLine;
    return finish({ exitCode: EXIT.LLM, status: 'failed', message: `${t.sid} L${win.fromLine}-L${win.toLine}: ${rec.runs ? `khúc ${dead[0].k} hỏng ở mọi lần chạy` : 'mọi lần harvest đều hỏng'}; giữ nguyên lastLine` });
  }

  // step 6, 9, 7, 8
  const existing = opts.blind ? [] : storiesOfSession(cfg.box, t.sid).filter((s) => !s.error);
  let clusters = await cluster(all, existing, cfg, { chunks: chunks.length, runs: rec.runs, llm, stats, cacheDir: noWrite ? null : cfg.cacheDir });
  tick();
  if (cfg.outsider.enabled && chunks.length) {
    const items = [];
    for (const c of chunks) {
      const key = chunks.length > 1 ? `outsider-c${c.k}-1` : 'outsider-1';
      try { items.push(...await outsider(render(c.entries).text, clusters, cfg, { llm, stats, key })); } catch {
        stats.failed.push(chunks.length > 1 ? `outsider-c${c.k}` : 'outsider');
      }
      tick();
    }
    try { clusters = applyOutsider(clusters, items); } catch { stats.failed.push('outsider'); }
  }
  const fresh = clusters.filter((c) => c.outsider || c.members.some((m) => !m.startsWith('box:')));
  const scores = { hooks: new Map(), stakes: new Map(), mainGoal: '' };
  if (fresh.length) {
    try { scores.hooks = await hookTension(fresh, cfg, { llm, stats }); } catch { stats.failed.push('hook-tension'); }
    tick();
    try { const s = await stakes(clusters, cfg, { llm, stats }); scores.stakes = s.map; scores.mainGoal = s.mainGoal; } catch { stats.failed.push('stakes'); }
    tick();
  }

  // step 10-11
  const gate = privacyGate(cfg, env);
  const w = newWriter(cfg, gate, { dry: noWrite, sid: t.sid });
  const entriesByL = new Map();
  for (const e of entries) if (!entriesByL.has(e.L)) entriesByL.set(e.L, e);
  const sctx = { sid: t.sid, source: t.source, repo: cfg.repo, runs: rec.runs, hotspots, answers, harvestDate: localDate(new Date()) };
  const needs = writeClusters(w, clusters, new Map(all.map((s) => [s.id, s])), scores, entriesByL, sctx);
  Object.assign(rec, { written: w.written, merged: w.merged, privacyBlocked: w.privacyBlocked, privacyUnchecked: w.privacyUnchecked });

  const partial = rec.runsFailed > 0 || stats.failed.length > 0 || missing.size > 0;
  rec.status = partial ? 'partial' : 'done';
  if (scores.mainGoal) rec.mainGoal = scores.mainGoal;
  if (partial) rec.needsRescore = needs;
  const exitCode = worst([
    stats.failed.length ? EXIT.LLM : EXIT.OK,
    rec.privacyUnchecked ? EXIT.UNCHECKED : EXIT.OK,
  ]);
  const verb = noWrite ? 'sẽ ghi' : 'ghi';
  const message = [
    `${opts.blind ? 'blind ' : opts.dryRun ? 'dry-run ' : ''}${t.sid} L${win.fromLine}-L${rec.toLine}${rec.toLine < win.toLine ? ` (dừng trước khúc hỏng, còn tới L${win.toLine})` : ''}: ${rec.status}; ${all.length} chuyện thô, ${clusters.length} cụm; ${verb} ${w.written} mới, gộp ${w.merged}`,
    `điểm nóng ${hotspots.length} (thiếu ${missing.size}); lần chạy ${rec.runs}/${cfg.harvest.runs}; ${fmtUsd(stats.usd)}`,
    ...(stats.failed.length ? [`bước hỏng: ${stats.failed.join(', ')}`] : []),
    ...(w.privacyBlocked ? [`${w.privacyBlocked} chuyện vi phạm riêng tư, giữ ngoài repo (momentry quarantine)`] : []),
    ...(w.privacyUnchecked ? [`bỏ qua kiểm riêng tư: không có nguồn chặn; ${w.privacyUnchecked} chuyện giữ ngoài repo (momentry quarantine)`] : []),
  ].join('\n');
  return finish({ exitCode, status: noWrite ? (opts.dryRun ? 'dry-run' : rec.status) : rec.status, written: w.written, merged: w.merged,
    privacyBlocked: w.privacyBlocked, privacyUnchecked: w.privacyUnchecked, message });
}

/** `harvest`: one window of one session (sid may be null when only --transcript is given). @param {string|null} sid @param {HarvestOpts} opts @returns {Promise<Report>} */
export async function runSession(sid, opts) {
  const { cfg } = opts;
  const env = opts.env || process.env;
  let t;
  try { t = resolveTranscript(sid, opts, env); } catch (e) {
    return { exitCode: e.exitCode ?? EXIT.USAGE, sid, status: 'failed', message: e.message };
  }
  const noWrite = !!(opts.dryRun || opts.blind);
  const explicit = opts.fromLine != null || opts.toLine != null;
  let handle = null;
  if (!noWrite) {
    const lk = L.lock(t.sid, { cacheDir: cfg.cacheDir, staleSec: cfg.lock.staleSec });
    if (!lk.ok) return { exitCode: EXIT.LOCKED, sid: t.sid, status: 'locked', message: `${t.sid}: đang được gom bởi tiến trình khác; đã đặt pending` };
    handle = lk.handle;
  }
  const tick = () => L.touch(handle);
  const reports = [];
  try {
    for (let round = 1; ; round++) {
      const st = fs.statSync(t.path);
      const lines = SOURCES[t.source].countLines(t.path);
      const info = { source: t.source, transcriptPath: t.path, repoRoot: cfg.repoRoot, size: st.size, mtimeMs: st.mtimeMs };
      let win = null;
      if (explicit) {
        const from = Math.max(1, opts.fromLine ?? 1), to = Math.min(opts.toLine ?? lines, lines);
        if (from <= to) win = { fromLine: from, toLine: to };
      } else {
        const n = L.needsHarvest(L.load(cfg.cacheDir), t.sid, { size: st.size, mtimeMs: st.mtimeMs, lines });
        if (n) win = { fromLine: n.fromLine, toLine: lines };
      }
      let out = null;
      if (win) out = await runWindow(t, win, opts, tick);
      else if (!reports.length) reports.push({ exitCode: EXIT.OK, sid: t.sid, status: 'noop', message: `${t.sid}: không có dòng mới` });
      if (out) reports.push(out.report);
      if (noWrite) break;
      const ledger = L.load(cfg.cacheDir);
      if (out?.rec) {
        L.record(ledger, t.sid, info, out.rec, { explicit, lines });
        logEvent('harvest.window', { sid: t.sid, status: out.rec.status, explicit, fromLine: win.fromLine, toLine: out.rec.toLine, written: out.rec.written,
          merged: out.rec.merged, privacyBlocked: out.rec.privacyBlocked, privacyUnchecked: out.rec.privacyUnchecked,
          hotspots: out.rec.hotspots, hotspotsMissing: out.rec.hotspotsMissing, usd: out.rec.usd, secs: out.rec.secs }, { cacheDir: cfg.cacheDir });
      } else if (ledger.sessions[t.sid] && !explicit) {
        const s0 = Object.assign(ledger.sessions[t.sid], info);
        if ((s0.lastLine ?? 0) >= lines && s0.lastLine > 0) Object.assign(s0, { lines, failedCount: 0, ...(s0.status === 'failed' ? { status: 'done' } : {}) });
      }
      const s = ledger.sessions[t.sid];
      const pending = !!s?.pending;
      if (s) s.pending = false;
      if (s || out?.rec) L.save(ledger, cfg.cacheDir);
      if (!pending || explicit || round >= 5 || out?.rec?.status === 'failed' || (out && out.rec.toLine < win.toLine)) break;
    }
  } finally {
    L.unlock(handle);
  }
  const last = reports.filter((r) => r.status !== 'noop').at(-1) || reports[0];
  return {
    ...last,
    exitCode: worst(reports.map((r) => r.exitCode)),
    written: reports.reduce((a, r) => a + (r.written ?? 0), 0),
    merged: reports.reduce((a, r) => a + (r.merged ?? 0), 0),
    message: reports.map((r) => r.message).filter(Boolean).join('\n'),
  };
}

// ---------- rescore ----------

/**
 * `rescore`: steps 9 (optional), 7, 8 on every `status: raw` story of the session; clears needsRescore.
 * @param {string} sid @param {{cfg: import('./config.mjs').Config, env?: NodeJS.ProcessEnv, bin?: string}} opts @returns {Promise<Report>}
 */
export async function rescore(sid, opts) {
  const { cfg } = opts;
  const env = opts.env || process.env;
  const lk = L.lock(sid, { cacheDir: cfg.cacheDir, staleSec: cfg.lock.staleSec });
  if (!lk.ok) return { exitCode: EXIT.LOCKED, sid, status: 'locked', message: `${sid}: đang được gom bởi tiến trình khác` };
  try {
    const session = storiesOfSession(cfg.box, sid).filter((s) => !s.error);
    const raw = session.filter((s) => (s.data.status ?? 'raw') === 'raw');
    const ledger0 = L.load(cfg.cacheDir);
    if (!raw.length) {
      if (ledger0.sessions[sid]) { ledger0.sessions[sid].needsRescore = []; L.save(ledger0, cfg.cacheDir); }
      return { exitCode: EXIT.OK, sid, status: 'noop', message: `${sid}: không có chuyện status: raw` };
    }
    const stats = { usd: null, secs: 0, failed: [], calls: 0 };
    const llm = { fakeDir: cfg.fakeLlm, runDir: path.join(cfg.cacheDir, 'runs', safeName(sid), `${stamp()}-rescore`), bin: opts.bin, env };
    let clusters = session.map(boxCluster);
    let entries = [];
    let source = String(sid).split(':')[0];
    if (cfg.outsider.enabled) {
      try {
        const t = resolveTranscript(sid, { cfg }, env);
        source = t.source;
        entries = SOURCES[t.source].readEntries(t.path);
        const text = render(entries).text;
        if (approxTokens(text) > cfg.harvest.maxInputTokens) logEvent('rescore.outsider-skipped', { sid, reason: 'quá dài' }, { cacheDir: cfg.cacheDir });
        else clusters = applyOutsider(clusters, await outsider(text, clusters, cfg, { llm, stats }));
      } catch (e) {
        stats.failed.push('outsider');
        logEvent('rescore.outsider-failed', { sid, error: e }, { cacheDir: cfg.cacheDir });
      }
    }
    const rawIds = new Set(raw.map((s) => `box:${s.id}`));
    const scores = { hooks: new Map(), stakes: new Map(), mainGoal: '' };
    try { scores.hooks = await hookTension(clusters.filter((c) => rawIds.has(c.id) || !c.id.startsWith('box:')), cfg, { llm, stats }); } catch { stats.failed.push('hook-tension'); }
    try { const s = await stakes(clusters, cfg, { llm, stats }); scores.stakes = s.map; scores.mainGoal = s.mainGoal; } catch { stats.failed.push('stakes'); }
    // existing stories: only machine scores (and the outsider section); hooks of non-raw stories are ignored by mergeInto
    const gate = privacyGate(cfg, env);
    const w = newWriter(cfg, gate, { dry: false, sid });
    const entriesByL = new Map();
    for (const e of entries) if (!entriesByL.has(e.L)) entriesByL.set(e.L, e);
    const sctx = { sid, source, repo: cfg.repo, runs: 0, hotspots: [], answers: [], harvestDate: localDate(new Date()) };
    const needs = writeClusters(w, clusters, new Map(), scores, entriesByL, sctx);
    const ledger = L.load(cfg.cacheDir);
    const s = (ledger.sessions[sid] ??= { lastLine: 0, status: null, pending: false, needsRescore: [], mainGoals: [], harvests: [] });
    s.needsRescore = stats.failed.length ? [...new Set([...(s.needsRescore || []), ...needs])] : [];
    if (scores.mainGoal) (s.mainGoals ||= []).push({ toLine: s.lastLine ?? 0, text: scores.mainGoal, rescore: true });
    L.save(ledger, cfg.cacheDir);
    const message = [
      `rescore ${sid}: ${raw.length} chuyện raw; cập nhật ${w.merged}, thêm ${w.written}; ${fmtUsd(stats.usd)}`,
      ...(stats.failed.length ? [`bước hỏng: ${stats.failed.join(', ')}`] : []),
      ...(w.privacyBlocked + w.privacyUnchecked ? [`${w.privacyBlocked + w.privacyUnchecked} phần giữ ngoài repo (momentry quarantine)`] : []),
    ].join('\n');
    return {
      exitCode: worst([stats.failed.length ? EXIT.LLM : EXIT.OK, w.privacyUnchecked ? EXIT.UNCHECKED : EXIT.OK]),
      sid, status: stats.failed.length ? 'partial' : 'done', written: w.written, merged: w.merged,
      privacyBlocked: w.privacyBlocked, privacyUnchecked: w.privacyUnchecked, usd: stats.usd, message,
    };
  } finally {
    L.unlock(lk.handle);
  }
}

// ---------- scan ----------

/**
 * `scan`: harvest every session of the repo whose size/mtime differs from the ledger, newest first, skipping files
 * modified within scan.quietMinutes except `exceptSid`, and unchanged files that failed `scan.maxFailures` times.
 * `auto` (hook-run): at most `scan.maxSessions` sessions per scan, and only transcripts modified after the repo's first
 * hook-run scan (`repos[root].autoSince`); the older backlog needs a manual `scan`. `maxSessions` 0 = no cap.
 * @param {{cfg: import('./config.mjs').Config, claude?: boolean, codex?: boolean, dryRun?: boolean, exceptSid?: string, auto?: boolean, maxSessions?: number, env?: NodeJS.ProcessEnv, bin?: string}} opts
 * @returns {Promise<{exitCode: number, message?: string, reports: Report[]}>}
 */
export async function scan(opts) {
  const { cfg } = opts;
  const env = opts.env || process.env;
  if (!cfg.repoRoot) return { exitCode: EXIT.USAGE, message: 'không ở trong git repo', reports: [] };
  const dirs = transcriptDirs(env);
  const both = opts.claude === undefined && opts.codex === undefined;
  const files = [
    ...(both || opts.claude ? claudeSrc.listTranscripts(cfg.repoRoot, dirs) : []),
    ...(both || opts.codex ? codexSrc.listTranscripts(cfg.repoRoot, dirs) : []),
  ].sort((a, b) => b.mtimeMs - a.mtimeMs);
  const ledger = L.load(cfg.cacheDir);
  const now = Date.now();
  let since = 0;
  if (opts.auto) {
    const r = ledger.repos[cfg.repoRoot];
    if (r?.autoSince) since = Date.parse(r.autoSince) || 0;
    else {
      since = now;
      if (!opts.dryRun) {
        ledger.repos[cfg.repoRoot] = { autoSince: new Date(now).toISOString() };
        L.save(ledger, cfg.cacheDir);
        logEvent('scan.first-auto', { repo: cfg.repo, backlog: files.length }, { cacheDir: cfg.cacheDir });
      }
    }
  }
  const cap = opts.maxSessions ?? (opts.auto ? cfg.scan.maxSessions : 0);
  const quietMs = cfg.scan.quietMinutes * 60000;
  const reports = [];
  let quiet = 0, same = 0, old = 0, gaveUp = 0, left = 0;
  for (const t of files) {
    if (t.sid !== opts.exceptSid && now - t.mtimeMs < quietMs) { quiet++; continue; }
    if (t.sid !== opts.exceptSid && t.mtimeMs < since) { old++; continue; }
    const st = L.scanState(ledger.sessions[t.sid], t, cfg.scan.maxFailures);
    if (st === 'same') { same++; continue; }
    if (st === 'gave-up') { gaveUp++; continue; }
    if (cap && reports.length >= cap) { left++; continue; }
    reports.push(await runSession(t.sid, { cfg, transcript: t.path, source: t.source, dryRun: opts.dryRun, env, bin: opts.bin }));
  }
  const head = [
    `scan ${cfg.repo}: ${files.length} phiên; gom ${reports.length}, bỏ qua ${quiet} đang mở (< ${cfg.scan.quietMinutes} phút), ${same} không đổi`,
    ...(gaveUp ? [`${gaveUp} phiên hỏng ${cfg.scan.maxFailures} lần liền, file chưa đổi: ngừng thử (harvest --session ID để thử tay)`] : []),
    ...(left ? [`còn ${left} phiên chưa gom (giới hạn ${cap} phiên mỗi lần quét; chạy lại scan hoặc --max-sessions 0)`] : []),
    ...(old ? [`${old} phiên cũ hơn lần quét tự động đầu tiên: chạy tay \`momentry scan\` nếu muốn gom`] : []),
  ].join('\n');
  return {
    exitCode: worst(reports.map((r) => r.exitCode).filter((c) => c !== EXIT.LOCKED)),
    message: [head, ...reports.map((r) => r.message).filter(Boolean)].join('\n'),
    reports,
  };
}

// ---------- add ----------

/**
 * `add`: manual story (`captured_by: human`, `hit_by: [bip]`), privacy-checked; blocked/unchecked goes to quarantine
 * (exit 2 / 3).
 * @param {{cfg: import('./config.mjs').Config, title?: string, note: string, by?: string, session?: string, env?: NodeJS.ProcessEnv}} opts
 * @returns {Promise<{exitCode: number, message?: string, id: string, where: 'box'|'quarantine'}>}
 */
export async function addStory(opts) {
  const { cfg } = opts;
  const env = opts.env || process.env;
  const by = opts.by ?? 'human';
  if (!CAPTURED_BY.includes(by) || by === 'harvest') return { exitCode: EXIT.USAGE, message: `--by phải là human hoặc live: ${by}`, id: null, where: null };
  const note = String(opts.note ?? '').trim();
  const title = String(opts.title || note.split(/(?<=[.!?])\s|\n/)[0].slice(0, 100)).trim();
  if (!title) return { exitCode: EXIT.USAGE, message: 'add cần --title hoặc --note', id: null, where: null };
  const session = opts.session || null;
  const data = {
    date: localDate(new Date()), repo: cfg.repo, status: 'raw', signals: [],
    source: session ? `ghi tay /bip, ${session}` : 'ghi tay /bip', sessions: session ? [session] : [],
    captured_by: by, hit_by: by === 'human' ? ['bip'] : [by], lines: [], privacy: undefined, links: [], threads: [],
  };
  const w = newWriter(cfg, privacyGate(cfg, env), { dry: false, sid: session });
  const r = putNew(w, title, { data, body: renderBody({ title, what_happened: note }) }, 'add');
  if (r.where === 'box') return { exitCode: EXIT.OK, message: `đã ghi ${r.id}`, id: r.id, where: 'box' };
  if (r.violations) {
    const shown = r.violations.map((v) => `${v.field}: ${mask(v.term)}`).join(', ');
    return { exitCode: EXIT.CHECK, message: `vi phạm riêng tư (${shown}); giữ ngoài repo: momentry quarantine`, id: r.id, where: 'quarantine' };
  }
  return { exitCode: EXIT.UNCHECKED, message: 'bỏ qua kiểm riêng tư: không có nguồn chặn; chuyện giữ ngoài repo: momentry quarantine', id: r.id, where: 'quarantine' };
}

// ---------- reduce ----------

/**
 * `reduce`: reduced text + hotspots of a transcript; writes `reduced.txt`, `hotspots.txt` to `out` if given.
 * @param {{transcript: string, fromLine?: number, toLine?: number, out?: string}} opts
 * @returns {Promise<{exitCode: number, message?: string, text: string, hotspots: import('./hotspots.mjs').Hotspot[]}>}
 */
export async function reduceCommand(opts) {
  const file = path.resolve(opts.transcript);
  if (!fs.existsSync(file)) return { exitCode: EXIT.USAGE, message: `không có transcript: ${file}`, text: '', hotspots: [] };
  const entries = SOURCES[sourceOf(file)].readEntries(file, { fromLine: opts.fromLine, toLine: opts.toLine });
  const { text, approxTokens: tokens } = render(entries);
  const hotspots = detect(entries);
  const hs = format(hotspots);
  if (opts.out) {
    const dir = ensurePrivateDir(path.resolve(opts.out));
    fs.writeFileSync(path.join(dir, 'reduced.txt'), text + '\n', { mode: 0o600 });
    fs.writeFileSync(path.join(dir, 'hotspots.txt'), hs + (hs ? '\n' : ''), { mode: 0o600 });
    return { exitCode: EXIT.OK, message: `${entries.length} Entry, ~${tokens} token, ${hotspots.length} điểm nóng; đã ghi ${dir}/reduced.txt, hotspots.txt`, text, hotspots };
  }
  return { exitCode: EXIT.OK, message: `${text}\n\n# điểm nóng (${hotspots.length}, ~${tokens} token)\n${hs}`, text, hotspots };
}
