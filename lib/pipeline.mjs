// Steps 1-11 glue and command handlers (PRD 5.1, 6.3, 6.7, 7.2).
// Every handler returns an object with `exitCode` (PRD 7.2) and optional `message` (printed to stdout).
import fs from 'node:fs';
import path from 'node:path';
import * as claudeSrc from './sources/claude.mjs';
import * as codexSrc from './sources/codex.mjs';
import * as piSrc from './sources/pi.mjs';
import * as agySrc from './sources/agy.mjs';
import { hostRoots } from './profiles.mjs';
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
import { loadBlocklist, loadAllow, checkStory, checkPatch, check as checkText, mask } from './privacy.mjs';
import { readStory, readBox, storiesOfSession, uniqueId, writeNew, mergeInto, CAPTURED_BY } from './box.mjs';
import { pickStories, mainSession, excerpt, angleOne, anglePatch } from './angle.mjs';
import { rankTable } from './rank.mjs';
import { sessionAsks, asksFor } from './asks.mjs';
import { ensureProfile, profileState, profileCallUsd } from './project-profile.mjs';
import { gitRoot, isInside } from './repo.mjs';
import { slugify } from './viet.mjs';
import { logEvent } from './log.mjs';
import { EXIT, ensurePrivateDir } from './config.mjs';
import { callUsd } from './llm.mjs';
import { noteStory } from './metrics.mjs';
import * as Taste from './taste.mjs';
import { projectId } from './projects.mjs';

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

/**
 * Transcript sources: list(repoRoot, env) finds a repo's sessions across every profile of the host (lib/profiles.mjs).
 */
const SOURCES = {
  claude: { ...claudeSrc, list: (repo, env) => hostRoots('claude', env).flatMap((r) => claudeSrc.listTranscripts(repo, { projectsDir: path.join(r, 'projects') })) },
  codex: { ...codexSrc, list: (repo, env) => hostRoots('codex', env).flatMap((r) => codexSrc.listTranscripts(repo, { sessionsDir: path.join(r, 'sessions') })) },
  pi: { ...piSrc, sessionId: (f) => piSrc.sessionId(f, 'pi'), list: (repo, env) => piSrc.listTranscripts(repo, { host: 'pi', env }) },
  omp: { ...piSrc, sessionId: (f) => piSrc.sessionId(f, 'omp'), list: (repo, env) => piSrc.listTranscripts(repo, { host: 'omp', env }) },
  agy: { ...agySrc, list: (repo, env) => agySrc.listTranscripts(repo, { env }) },
};
export const SOURCE_NAMES = Object.keys(SOURCES);
const SEVERITY = [EXIT.LLM, EXIT.UNCHECKED, EXIT.CHECK, EXIT.LOCKED, EXIT.USAGE];
const worst = (codes) => SEVERITY.find((c) => codes.includes(c)) ?? EXIT.OK;
const usage = (msg) => Object.assign(new Error(msg), { exitCode: EXIT.USAGE });
const failure = (msg) => Object.assign(new Error(msg), { exitCode: EXIT.FAIL });
const safeName = (s) => String(s).replace(/[^A-Za-z0-9._-]+/g, '_');
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-');
const fmtUsd = (u) => (u == null ? '? USD' : `${u.toFixed(2)} USD`);

/** `claude` or `codex` from a transcript file name. @param {string} file */
export function sourceOf(file) {
  const base = path.basename(file);
  if (base.startsWith('rollout-')) return 'codex';
  if (/[\\/]\.system_generated[\\/]logs[\\/]transcript[^\\/]*\.jsonl$/.test(file)) return 'agy';
  let head = '';
  try { const fd = fs.openSync(file, 'r'); const b = Buffer.alloc(4096); head = b.subarray(0, fs.readSync(fd, b, 0, b.length, 0)).toString('utf8'); fs.closeSync(fd); } catch { /* unreadable: default */ }
  if (/^\{"type":"title"/.test(head) || /[\\/]\.omp[\\/]/.test(file)) return 'omp';
  if (/^\{"type":"session"/.test(head)) return 'pi';
  return 'claude';
}

function resolveTranscript(sid, opts, env) {
  if (opts.transcript) {
    const file = path.resolve(opts.transcript);
    if (!fs.existsSync(file)) throw failure(`không có transcript: ${file}`);
    const pre = sid?.split(':')[0];
    const source = opts.source || (SOURCES[pre] ? pre : sourceOf(file));
    return { path: file, source, sid: sid || SOURCES[source].sessionId(file) };
  }
  const source = String(sid || '').split(':')[0];
  if (!SOURCES[source]) throw usage(`id phiên phải có dạng <nguồn>:xxxxxxxx (nguồn: ${SOURCE_NAMES.join(', ')}): ${sid}`);
  if (!opts.cfg.repoRoot) throw failure('không ở trong git repo');
  const t = SOURCES[source].list(opts.cfg.repoRoot, env).find((x) => x.sid === sid);
  if (!t) throw failure(`không tìm thấy transcript của ${sid} trong repo ${opts.cfg.repoRoot}`);
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

/**
 * Notes a story that just landed in the box (never fails the write): for the time from install to the first story,
 * and, for a story the user wrote by hand, a `missed` event with its features in <cache>/taste.json (momentry had
 * not found it). `story`: its id, and its frontmatter when the caller has it (else read from the box).
 * @param {import('./config.mjs').Config} cfg @param {string|null|undefined} capturedBy
 * @param {{id: string, data?: Record<string, any>}|null} [story]
 */
export function noteFirstStory(cfg, capturedBy, story = null) {
  if (!cfg.repoRoot) return;
  const project = projectId(cfg.repoRoot);
  try { noteStory(cfg.cacheDir, { project, private: cfg.privateMode, capturedBy }); } catch { /* a measure never blocks a story */ }
  if (capturedBy !== 'human' || !story?.id) return;
  try {
    const data = story.data ?? readStory(cfg.box, story.id)?.data ?? {};
    Taste.note(cfg.cacheDir, { project, key: `${project}/${story.id}`, event: 'missed', private: cfg.privateMode, data, table: rankTable(cfg) });
  } catch { /* a measure never blocks a story */ }
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
      noteFirstStory(cfg, story.data.captured_by, { id, data: story.data });
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
  noteFirstStory(cfg, story.data.captured_by, { id, data: story.data });
  w.written++; w.ids.push(id);
  return { id, where: 'box' };
}

const emptyPatch = (p) => !p.append && !p.add && !p.set && !p.outsider && !p.angle;

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

// ---------- story angle (step 13) ----------

/**
 * Working dir recorded in a transcript (Claude `cwd`, Codex/pi `session_meta` cwd, Antigravity workspace from the
 * hook index), or null. @param {{path: string, source: string}} t @param {import('./config.mjs').Config} cfg
 */
function transcriptCwd(t, cfg) {
  try {
    switch (t.source) {
      case 'claude': return claudeSrc.firstField(t.path, 'cwd');
      case 'codex': return codexSrc.sessionMeta(t.path).cwd;
      case 'pi': case 'omp': return piSrc.sessionMeta(t.path)?.cwd ?? null;
      case 'agy': return agySrc.readIndex(cfg.cacheDir).find((s) => s.transcriptPath === t.path || agySrc.preferFull(s.transcriptPath) === t.path)?.workspacePaths?.[0] ?? null;
      default: return null;
    }
  } catch { return null; }
}

/**
 * Root of the project a session belongs to: the observed repo when the session's cwd lies inside it (worktrees and
 * subdirs share one profile), else the git root of that cwd (a session read from another repo, as the eval harness
 * does), else the observed repo. A cwd that no longer exists counts as unknown.
 * @param {{path: string, source: string}} t @param {import('./config.mjs').Config} cfg @returns {string|null}
 */
export function projectRootOf(t, cfg) {
  const cwd = transcriptCwd(t, cfg);
  if (!cwd || !fs.existsSync(cwd)) return cfg.repoRoot;
  if (cfg.repoRoot && isInside(cwd, cfg.repoRoot)) return cfg.repoRoot;
  return gitRoot(cwd) ?? path.resolve(cwd);
}

/**
 * Sessions read once each: reduced entries, the owner's requests, and the project root. The transcript is the one in
 * `known`, else the one the ledger recorded for it, else found in the repo's transcript sources. null when none is
 * found or readable (its stories are then skipped).
 * @param {import('./config.mjs').Config} cfg @param {NodeJS.ProcessEnv} env @param {Record<string, {path: string, source: string}>} [known]
 * @returns {(sid: string) => {entries: import('./sources/claude.mjs').Entry[], asks: {L: number, text: string}[], root: string|null}|null}
 */
function sessionReader(cfg, env, known = {}) {
  const cache = new Map();
  return (sid) => {
    if (cache.has(sid)) return cache.get(sid);
    let out = null;
    try {
      let t = known[sid];
      if (!t) {
        const s = L.load(cfg.cacheDir).sessions[sid];
        t = s?.transcriptPath && fs.existsSync(s.transcriptPath)
          ? { path: s.transcriptPath, source: SOURCES[s.source] ? s.source : sourceOf(s.transcriptPath) }
          : resolveTranscript(sid, { cfg }, env);
      }
      const entries = SOURCES[t.source].readEntries(t.path);
      out = { entries, asks: sessionAsks(entries), root: projectRootOf(t, cfg) };
    } catch { out = null; }
    cache.set(sid, out);
    return out;
  };
}

/**
 * Project profiles for one run, each project at most once (lib/project-profile.mjs ensureProfile, key `profile-<n>`).
 * A profile carrying a private name is not used (same blocklist as stories). A failed call is logged and the angle is
 * written without a profile. Returns null when there is none to use. `stats` is where the call is billed.
 * @param {import('./config.mjs').Config} cfg @param {{blocklist: any, allow: Set<string>}} gate
 * @param {{llm: object, log: (event: string, f: object) => void}} o
 */
function profileResolver(cfg, gate, { llm, log }) {
  const done = new Map();
  const notes = [];
  const of = async (root, stats) => {
    if (!root) return null;
    if (done.has(root)) return done.get(root);
    let text = null;
    try {
      const p = await ensureProfile(root, cfg, { key: `profile-${done.size + 1}`, llm, stats });
      notes.push({ root, status: p.status, file: p.file });
      if (p.status === 'stale') log('profile.call-failed', { root, error: p.error, kept: 'older profile' });
      const hits = p.text ? checkText(p.text, gate.blocklist, gate.allow) : [];
      if (hits.length) {
        log('profile.privacy-blocked', { root, file: p.file, violations: hits.length });
        notes.at(-1).status = 'blocked';
      } else text = p.text;
    } catch (e) {
      notes.push({ root, status: 'failed', error: e.message });
      log('profile.call-failed', { root, error: e });
    }
    done.set(root, text);
    return text;
  };
  return { of, notes };
}

/** One line on the profiles of a run, e.g. `hồ sơ dự án: momentry tạo mới`; '' when none was looked at. */
function profileLine(notes) {
  const word = { generated: 'tạo mới', cached: 'có sẵn', user: 'bản bạn sửa', none: 'không có tài liệu, bỏ qua', stale: 'gọi model hỏng, dùng bản cũ', blocked: 'có tên riêng tư, không dùng', failed: 'gọi model hỏng, không dùng' };
  return notes.length ? `hồ sơ dự án: ${notes.map((n) => `${path.basename(n.root)} ${word[n.status] ?? n.status}`).join(', ')}` : '';
}

/**
 * @typedef {object} AngleRow
 * @property {string} id
 * @property {'angle'|'none'|'held'|'failed'|'no-lines'|'locked'} status  held: kept out of the repo by the privacy
 *   gate; locked: its session was being gathered by another process
 * @property {string} [angle] @property {string} [audience] @property {number[]} [evidence] @property {string} [reason]
 * @property {object} [spine] @property {number} [completeness]
 * @property {string} [error]
 */

/**
 * Step 13 over picked stories, one call each (`angle-<k>`, k = place in `picked`, or in `rankOf`), written through the
 * privacy gate like any merge. The call sees the project profile and the owner's requests before the story. A failed
 * call leaves the story without an angle for a later `momentry angle`; it is reported but never fails the harvest
 * window.
 * @returns {Promise<AngleRow[]>}
 */
async function angleStories(w, picked, read, cfg, { llm, stats, profiles, force = false, rankOf = null }) {
  const rows = [];
  for (const [i, s] of picked.entries()) {
    const key = `angle-${(rankOf?.get(s.id) ?? i) + 1}`;
    const ms = mainSession(s.data.lines);
    const sess = ms && read(ms.sid);
    const ex = sess && excerpt(sess.entries, ms.nums);
    if (!ex) { rows.push({ id: s.id, status: 'no-lines' }); continue; }
    const input = { ...ex, asks: asksFor(sess.asks, ms.nums[0]), profile: await profiles.of(sess.root, stats) };
    let res;
    try { res = await angleOne(s, input, cfg, { key, llm, stats }); } catch (e) {
      rows.push({ id: s.id, status: 'failed', error: e.message });
      if (!w.dry) logEvent('angle.call-failed', { story: s.id, key, error: e }, { cacheDir: cfg.cacheDir });
      continue;
    }
    const where = putMerge(w, s.id, anglePatch(res, { replace: force, sid: ms.sid }), key);
    rows.push({ id: s.id, status: where === 'quarantine' ? 'held' : res.none ? 'none' : 'angle', ...res });
  }
  return rows;
}

/** One summary line of angle rows, e.g. `góc kể: 3 có, 2 không ra chuyện, 1 hỏng`. */
function angleLine(rows) {
  const n = (st) => rows.filter((r) => r.status === st).length;
  return `góc kể: ${n('angle')} có, ${n('none')} không ra chuyện${n('held') ? `, ${n('held')} giữ ngoài repo` : ''}${n('no-lines') ? `, ${n('no-lines')} không đọc được dòng transcript` : ''}${n('locked') ? `, ${n('locked')} bỏ qua vì phiên đang được gom (chạy lại sau)` : ''}${n('failed') ? `, ${n('failed')} hỏng (chạy lại: momentry angle)` : ''}`;
}

/**
 * Estimated USD of one angle call with the story spine: about 11,800 real prompt tokens (excerpt, project profile, the
 * owner's requests) and ~3,800 output tokens on haiku, thinking included (measured on 20 calls,
 * docs/experiments/2026-11-05-story-spine). Sonnet is not measured with the spine: its earlier ~320 output tokens plus
 * the spine (~600) are assumed.
 * @param {import('./config.mjs').Config} cfg
 */
export function angleCallUsd(cfg) {
  return callUsd(cfg.angle.model, 11800, /haiku/i.test(cfg.angle.model) ? 3800 : 900, cfg.llm.promptCache);
}

/**
 * `angle`: story angles for stories already in the box (backfill), with the same step as harvest. Without --story:
 * the top `top` stories of the whole box by rank that have no angle yet; --force redoes ones that have.
 * `angle.enabled` only gates the harvest step; this command always runs. Stories are taken session by session under
 * that session's lock (a session being gathered is skipped and reported, exit 5); what each session's calls cost
 * (angles, and a project profile written on the way) is recorded in the ledger, so the daily budget counts it.
 * @param {{cfg: import('./config.mjs').Config, top?: number, story?: string, force?: boolean, dryRun?: boolean, env?: NodeJS.ProcessEnv, bin?: string}} opts
 * @returns {Promise<{exitCode: number, status: string, message: string, stories: AngleRow[]|{id: string}[], usd?: number|null}>}
 */
export async function angleCommand(opts) {
  const { cfg } = opts;
  const env = opts.env || process.env;
  const all = readBox(cfg.box);
  const force = !!opts.force;
  let ids = null;
  if (opts.story) {
    const s = all.find((x) => x.id === opts.story);
    if (!s) return { exitCode: EXIT.FAIL, status: 'failed', message: `không có chuyện ${opts.story} trong hộp ${cfg.box}`, stories: [] };
    if (s.error) return { exitCode: EXIT.FAIL, status: 'failed', message: `${s.id}: frontmatter hỏng: ${s.error}`, stories: [] };
    ids = [s.id];
  }
  const top = opts.top ?? cfg.angle.topN;
  const picked = pickStories(all, { topN: top, force, ids, table: rankTable(cfg) });
  if (!picked.length) {
    const why = ids ? `${ids[0]}: đã có góc kể (viết lại: --force)` : `angle: ${top} chuyện đầu bảng đều đã có góc kể (hoặc hộp trống)`;
    return { exitCode: EXIT.OK, status: 'noop', message: why, stories: [] };
  }
  const read = sessionReader(cfg, env);
  if (opts.dryRun) {
    const roots = [...new Set(picked.map((s) => { const ms = mainSession(s.data.lines); return ms ? read(ms.sid)?.root : null; }).filter(Boolean))];
    const newProfiles = roots.filter((r) => profileState(r, cfg.cacheDir) === 'generate').length;
    const usd = picked.length * angleCallUsd(cfg) + newProfiles * profileCallUsd(cfg);
    return {
      exitCode: EXIT.OK, status: 'dry-run', stories: picked.map((s) => ({ id: s.id })),
      message: [`dry-run angle: ${picked.length} chuyện (${cfg.angle.model})${newProfiles ? `, ${newProfiles} hồ sơ dự án mới (${cfg.angle.profileModel})` : ''}, chi phí ước tính ~${usd.toFixed(2)} USD`, ...picked.map((s) => `  ${s.id}`)].join('\n'),
    };
  }
  const llm = { fakeDir: cfg.fakeLlm, runDir: path.join(cfg.cacheDir, 'runs', 'angle', stamp()), bin: opts.bin, env, cache: cfg.llm.promptCache };
  const w = newWriter(cfg, privacyGate(cfg, env), { dry: false, sid: null });
  const profiles = profileResolver(cfg, w.gate, { llm, log: (event, f) => logEvent(event, f, { cacheDir: cfg.cacheDir }) });
  // stories in rank order, taken session by session (the session they are told from), each under its session's lock
  const groups = new Map();
  for (const s of picked) {
    const sid = mainSession(s.data.lines)?.sid ?? null;
    if (!groups.has(sid)) groups.set(sid, []);
    groups.get(sid).push(s);
  }
  const rankOf = new Map(picked.map((s, i) => [s.id, i]));
  const rows = [];
  let usd = null;
  for (const [sid, stories] of groups) {
    if (!sid) { rows.push(...stories.map((s) => ({ id: s.id, status: 'no-lines' }))); continue; }
    const lk = L.lock(sid, { cacheDir: cfg.cacheDir, staleSec: cfg.lock.staleSec });
    if (!lk.ok) { rows.push(...stories.map((s) => ({ id: s.id, status: 'locked' }))); continue; }
    const astats = { usd: null, secs: 0, failed: [], calls: 0 };
    const pstats = { usd: null, secs: 0, failed: [], calls: 0 };
    try {
      const sprofiles = { of: (root) => profiles.of(root, pstats) };
      rows.push(...await angleStories(w, stories, read, cfg, { llm, stats: astats, profiles: sprofiles, force, rankOf }));
      const at = new Date().toISOString();
      const ledger = L.load(cfg.cacheDir);
      const repoRoot = read(sid)?.root ?? cfg.repoRoot;
      L.recordSpend(ledger, sid, { at, step: 'profile', usd: pstats.usd, repoRoot });
      L.recordSpend(ledger, sid, { at, step: 'angle', usd: astats.usd, repoRoot });
      L.save(ledger, cfg.cacheDir);
    } finally {
      L.unlock(lk.handle);
    }
    for (const st of [astats, pstats]) if (st.usd != null) usd = (usd ?? 0) + st.usd;
  }
  // rows back in rank order
  rows.sort((a, b) => rankOf.get(a.id) - rankOf.get(b.id));
  const failed = rows.filter((r) => r.status === 'failed');
  const locked = rows.filter((r) => r.status === 'locked');
  logEvent('angle.run', { stories: rows.length, angles: rows.filter((r) => r.status === 'angle').length, none: rows.filter((r) => r.status === 'none').length,
    failed: failed.length, locked: locked.length, privacyBlocked: w.privacyBlocked, privacyUnchecked: w.privacyUnchecked, usd, profiles: profiles.notes.map((n) => n.status) }, { cacheDir: cfg.cacheDir });
  const pl = profileLine(profiles.notes);
  const message = [
    `angle ${cfg.repo}: ${rows.length} chuyện; ${angleLine(rows)}; ${fmtUsd(usd)}`,
    ...(pl ? [pl] : []),
    ...failed.map((r) => `  ${r.id}: ${r.error}`),
    ...(w.privacyBlocked ? [`${w.privacyBlocked} góc kể vi phạm riêng tư, giữ ngoài repo (momentry quarantine)`] : []),
    ...(w.privacyUnchecked ? [`bỏ qua kiểm riêng tư: không có nguồn chặn; ${w.privacyUnchecked} góc kể giữ ngoài repo (momentry quarantine)`] : []),
  ].join('\n');
  return {
    exitCode: worst([failed.length ? EXIT.LLM : EXIT.OK, w.privacyUnchecked ? EXIT.UNCHECKED : EXIT.OK, locked.length ? EXIT.LOCKED : EXIT.OK]),
    status: failed.length || locked.length ? 'partial' : 'done', stories: rows, usd, profiles: profiles.notes,
    privacyBlocked: w.privacyBlocked, privacyUnchecked: w.privacyUnchecked, message,
  };
}

// ---------- harvest window (steps 1-11) ----------

function llmBase(opts, cfg, sid, env, noWrite) {
  const runDir = opts.savePrompts ? path.resolve(opts.savePrompts)
    : noWrite ? null : path.join(cfg.cacheDir, 'runs', safeName(sid), stamp());
  return { fakeDir: cfg.fakeLlm, saveDir: opts.saveLlm ? path.resolve(opts.saveLlm) : null, runDir, bin: opts.bin, env, cache: cfg.llm.promptCache };
}

/** Real prompt tokens per approxTokens of reduced text, and the system prompt + template around it (measured, 8 sessions). */
const REAL_PER_APPROX = 1.64;
const PROMPT_OVERHEAD = 3500;
/** Harvest output tokens, thinking included, per prompt token (measured: 0.03 without thinking, up to 0.6 with it). */
const HARVEST_OUT_SHARE = 0.2;

/**
 * Estimated USD of one window from the approxTokens of each chunk, priced per call with the measured list prices
 * (lib/llm.mjs callUsd): harvest and outsider per chunk, cluster when chunks or runs are merged, then the two scoring calls.
 * @param {number[]} chunkTokens approxTokens of each chunk's reduced text @param {import('./config.mjs').Config} cfg
 * @returns {number}
 */
export function estimateUsd(chunkTokens, cfg) {
  const cache = cfg.llm.promptCache;
  const real = (approx) => Math.round(approx * REAL_PER_APPROX) + PROMPT_OVERHEAD;
  let usd = 0;
  for (const t of chunkTokens) {
    const h = real(t);
    usd += cfg.harvest.runs * callUsd(cfg.harvest.model, h, Math.round(h * HARVEST_OUT_SHARE), cache);
    if (cfg.outsider.enabled) usd += callUsd(cfg.outsider.model, h, 3000, cache);
  }
  const parts = chunkTokens.length * cfg.harvest.runs;
  if (parts > 1) usd += callUsd(cfg.rank.model, 4000 + 4500 * parts, 1000 * parts, cache);
  if (chunkTokens.length) usd += callUsd(cfg.rank.model, 7500, 2500, cache) + callUsd(cfg.rank.model, 7500, 1500, cache);
  // story angle: at most topN calls; most windows have that many stories or more
  if (chunkTokens.length && cfg.angle.enabled) usd += cfg.angle.topN * angleCallUsd(cfg);
  return usd;
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
    `harvest ${cfg.harvest.runs} lần (${cfg.harvest.model}), chấm ${cfg.rank.model}, người ngoài ${cfg.outsider.enabled ? cfg.outsider.model : 'tắt'}, góc kể ${cfg.angle.enabled ? `${cfg.angle.model} (tối đa ${cfg.angle.topN} chuyện)` : 'tắt'}; chi phí ước tính ~${estimateUsd(chunks.map((c) => render(c.entries).approxTokens), cfg).toFixed(2)} USD`,
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

  // step 13: angles of the session's best stories, after ranking what is now in the box
  let angles = [];
  let profileNote = '';
  if (cfg.angle.enabled && cfg.angle.topN > 0 && !noWrite) {
    const picked = pickStories(storiesOfSession(cfg.box, t.sid), { topN: cfg.angle.topN, table: rankTable(cfg) });
    if (picked.length) {
      const wa = newWriter(cfg, gate, { dry: false, sid: t.sid });
      const profiles = profileResolver(cfg, gate, { llm, log: (event, f) => wa.log(event, f) });
      angles = await angleStories(wa, picked, sessionReader(cfg, env, { [t.sid]: t }), cfg, { llm, stats, profiles });
      profileNote = profileLine(profiles.notes);
      rec.privacyBlocked += wa.privacyBlocked;
      rec.privacyUnchecked += wa.privacyUnchecked;
      tick();
    }
  }

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
    ...(angles.length ? [angleLine(angles)] : []),
    ...(profileNote ? [profileNote] : []),
    ...(w.privacyBlocked ? [`${w.privacyBlocked} chuyện vi phạm riêng tư, giữ ngoài repo (momentry quarantine)`] : []),
    ...(w.privacyUnchecked ? [`bỏ qua kiểm riêng tư: không có nguồn chặn; ${w.privacyUnchecked} chuyện giữ ngoài repo (momentry quarantine)`] : []),
  ].join('\n');
  return finish({ exitCode, status: noWrite ? (opts.dryRun ? 'dry-run' : rec.status) : rec.status, written: w.written, merged: w.merged,
    privacyBlocked: rec.privacyBlocked, privacyUnchecked: rec.privacyUnchecked, angles, message });
}

/** `harvest`: one window of one session (sid may be null when only --transcript is given). @param {string|null} sid @param {HarvestOpts} opts @returns {Promise<Report>} */
export async function runSession(sid, opts) {
  const { cfg } = opts;
  const env = opts.env || process.env;
  let t;
  try { t = resolveTranscript(sid, opts, env); } catch (e) {
    return { exitCode: e.exitCode ?? EXIT.FAIL, sid, status: 'failed', message: e.message };
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
    const llm = { fakeDir: cfg.fakeLlm, runDir: path.join(cfg.cacheDir, 'runs', safeName(sid), `${stamp()}-rescore`), bin: opts.bin, env, cache: cfg.llm.promptCache };
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
 * hook-run scan (`repos[root].autoSince`) and after gathering was last resumed; the older backlog needs a manual
 * `scan`. A project paused on this machine is skipped. `maxSessions` 0 = no cap.
 * @param {{cfg: import('./config.mjs').Config, claude?: boolean, codex?: boolean, dryRun?: boolean, exceptSid?: string, auto?: boolean, maxSessions?: number, env?: NodeJS.ProcessEnv, bin?: string}} opts
 * @returns {Promise<{exitCode: number, message?: string, reports: Report[]}>}
 */
export async function scan(opts) {
  const { cfg } = opts;
  const env = opts.env || process.env;
  if (!cfg.repoRoot) return { exitCode: EXIT.FAIL, message: 'không ở trong git repo', reports: [] };
  if (opts.auto && cfg.paused) return { exitCode: EXIT.OK, message: `scan ${cfg.repo}: đang tạm dừng gom chuyện trên máy này, bỏ qua (bật lại: momentry resume)`, reports: [], paused: true };
  // no source flag set -> every source
  const all = SOURCE_NAMES.every((n) => opts[n] === undefined);
  const files = SOURCE_NAMES.filter((n) => all || opts[n]).flatMap((n) => SOURCES[n].list(cfg.repoRoot, env))
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
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
  // what happened while gathering was paused is left to a manual scan
  if (opts.auto && cfg.resumedAt) since = Math.max(since, Date.parse(cfg.resumedAt) || 0);
  const cap = opts.maxSessions ?? (opts.auto ? cfg.scan.maxSessions : 0);
  const quietMs = cfg.scan.quietMinutes * 60000;
  const reports = [];
  let quiet = 0, same = 0, old = 0, gaveUp = 0, left = 0, waiting = 0;
  // hook runs stop at the daily budget; what is left stays unread and is picked up on a later day
  const budget = opts.auto ? cfg.budget.dailyUsd : 0;
  const own = opts.auto ? cfg.budget.projectUsd ?? 0 : 0;
  const overBudget = () => {
    if (!budget && !own) return false;
    const lg = L.load(cfg.cacheDir);
    return (budget > 0 && L.spentOn(lg, L.today()) >= budget) || (own > 0 && L.spentOn(lg, L.today(), cfg.repoRoot) >= own);
  };
  for (const t of files) {
    if (t.sid !== opts.exceptSid && now - t.mtimeMs < quietMs) { quiet++; continue; }
    if (t.sid !== opts.exceptSid && t.mtimeMs < since) { old++; continue; }
    const st = L.scanState(ledger.sessions[t.sid], t, cfg.scan.maxFailures);
    if (st === 'same') { same++; continue; }
    if (st === 'gave-up') { gaveUp++; continue; }
    if (cap && reports.length >= cap) { left++; continue; }
    if (overBudget()) { waiting++; continue; }
    reports.push(await runSession(t.sid, { cfg, transcript: t.path, source: t.source, dryRun: opts.dryRun, env, bin: opts.bin }));
  }
  if (opts.auto && !opts.dryRun) L.noteWaiting(cfg.cacheDir, cfg.repoRoot, waiting);
  const head = [
    `scan ${cfg.repo}: ${files.length} phiên; gom ${reports.length}, bỏ qua ${quiet} đang mở (< ${cfg.scan.quietMinutes} phút), ${same} không đổi`,
    ...(gaveUp ? [`${gaveUp} phiên hỏng ${cfg.scan.maxFailures} lần liền, file chưa đổi: ngừng thử (harvest --session ID để thử tay)`] : []),
    ...(waiting ? [`${waiting} phiên chờ ngân sách ngày (${[budget ? `chung ${budget} USD` : '', own ? `repo này ${own} USD` : ''].filter(Boolean).join(', ')}): gom tiếp vào ngày sau, hoặc chạy tay momentry scan`] : []),
    ...(left ? [`còn ${left} phiên chưa gom (giới hạn ${cap} phiên mỗi lần quét; chạy lại scan hoặc --max-sessions 0)`] : []),
    ...(old ? [`${old} phiên cũ hơn lần quét tự động đầu tiên hoặc lần bật lại gom chuyện: chạy tay \`momentry scan\` nếu muốn gom`] : []),
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
  if (!fs.existsSync(file)) return { exitCode: EXIT.FAIL, message: `không có transcript: ${file}`, text: '', hotspots: [] };
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
