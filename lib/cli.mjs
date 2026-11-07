// momentry CLI: parse with the command table (lib/commands.mjs), dispatch, print text or the --json envelope.
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { EXIT, loadConfig } from './config.mjs';
import { COMMANDS, GLOBAL_FLAGS, resolveCommand, didYouMean, renderCommandHelp, renderMainHelp, describeSurface } from './commands.mjs';
import { CliError, usageError, formatError, envelope, jsonError } from './cli-output.mjs';
import { VERSION, ROOT, fingerprint } from './version.mjs';
import { paths } from './paths.mjs';
import { installState, selfCommand, activate } from './install.mjs';
import { remember as rememberProject } from './projects.mjs';
import { noteInstall, localMeasures } from './metrics.mjs';

const BIN = path.join(ROOT, 'bin', 'momentry.mjs');
const NEXT_AFTER_INIT = 'momentry scan --max-sessions 1';

// ---------- parsing ----------

function optionsFor(cmd) {
  const all = { ...GLOBAL_FLAGS, ...COMMANDS[cmd].flags };
  return Object.fromEntries(Object.entries(all).map(([k, f]) => [k, f.short ? { type: f.type, short: f.short } : { type: f.type }]));
}

/** @returns {{flags: Record<string, any>, positionals: string[]}} */
export function parse(cmd, args) {
  const def = COMMANDS[cmd];
  let r;
  try {
    r = parseArgs({ args, options: optionsFor(cmd), allowPositionals: true, strict: true });
  } catch (e) {
    const m = /'(-{1,2}[^']+)'/.exec(e.message);
    const bad = m?.[1];
    const flagNames = Object.keys({ ...GLOBAL_FLAGS, ...def.flags });
    const near = bad?.startsWith('--') ? didYouMean(bad.slice(2).split('=')[0], flagNames) : null;
    if (e.code === 'ERR_PARSE_ARGS_UNKNOWN_OPTION') throw usageError(`${cmd}: cờ lạ ${bad ?? ''}`.trim(), { why: near ? `ý bạn là --${near}?` : undefined, fix: `momentry ${cmd} --help` });
    throw usageError(`${cmd}: ${e.message.split('\n')[0]}`, { fix: `momentry ${cmd} --help` });
  }
  const { min = 0, max = 0 } = def.positionals ?? {};
  const n = r.positionals.length;
  if (!r.values.help && (n < min || n > max)) {
    throw usageError(`${cmd}: cần ${min === max ? min : `${min}–${max}`} đối số vị trí, gặp ${n}${n ? ` (${r.positionals.join(' ')})` : ''}`, { fix: `momentry ${cmd} --help` });
  }
  const flags = { ...r.values };
  for (const [k, f] of Object.entries(def.flags)) {
    if (!f.int || flags[k] === undefined) continue;
    const v = Number(flags[k]);
    if (!Number.isInteger(v) || v < 0) throw usageError(`--${k} phải là số nguyên ≥ 0: ${flags[k]}`, { fix: `momentry ${cmd} --help` });
    flags[k] = v;
  }
  return { flags, positionals: r.positionals };
}

// ---------- helpers ----------

const isTTY = () => !!(process.stdin.isTTY && process.stdout.isTTY);

/** Consent for changes outside the repo: --yes, else ask on a TTY, else a usage error naming --yes. */
async function confirm(ctx, question, { required = true } = {}) {
  if (ctx.flags.yes) return true;
  if (!isTTY() || ctx.flags.json) {
    if (!required) return false;
    throw usageError(`${ctx.cmd}: cần --yes khi không có TTY`, { fix: `momentry ${[ctx.cmd, ...ctx.positionals].join(' ')} --yes` });
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  const a = await new Promise((res) => rl.question(`${question} [Y/n] `, res));
  rl.close();
  return !/^n/i.test(a.trim());
}

const bullets = (items) => items.map((c) => `  - ${c}`);

const pad = (s, n) => { s = String(s ?? ''); return s.length > n ? s.slice(0, n - 1) + '…' : s.padEnd(n); };

function boxOf(ctx) {
  const cfg = loadConfig({ cwd: ctx.cwd, env: ctx.env, flags: ctx.flags });
  if (!fs.existsSync(cfg.box)) throw new CliError(`không có hộp: ${cfg.box}`, { code: 'no-box', fix: 'momentry init' });
  return cfg;
}

/**
 * Puts an observed repo on the machine's project list (the UI reads it). Runs from init and from every command the
 * hook starts, so repos observed before the list existed join it on their next session. A failed write only warns.
 */
function remember(ctx, cfg) {
  if (!cfg?.repoRoot || !cfg.observed || ctx.flags['dry-run']) return;
  try { rememberProject(ctx.env, cfg.repoRoot, { name: cfg.repo }); } catch (e) { ctx.io.err(`không ghi được danh sách dự án: ${e.message}`); }
}

/** Records the install time once (lib/metrics.mjs); a failed write never fails install or init. */
function noteInstallSafe(env, o) {
  try { noteInstall(env, o); } catch { /* measures are best effort */ }
}

function observedConfig(ctx) {
  const cfg = loadConfig({ cwd: ctx.cwd, env: ctx.env, flags: ctx.flags });
  if (!cfg.repoRoot) throw new CliError('không ở trong git repo', { code: 'not-git', fix: 'cd vào repo cần quan sát' });
  if (!cfg.observed) throw new CliError(`repo không được quan sát: ${cfg.repoRoot}`, { code: 'not-observed', fix: 'momentry init' });
  for (const k of cfg.ignored) ctx.io.err(`bỏ qua ${k} trong .momentry.json (chỉ nhận từ cấu hình người dùng)`);
  // a paused project still takes commands run by hand; only the hook-run ones skip it
  if (cfg.paused && !ctx.flags.auto) ctx.io.err(`${cfg.repo}: đang tạm dừng gom chuyện trên máy này (hook không tự gom); lệnh chạy tay vẫn làm. Bật lại: momentry resume`);
  remember(ctx, cfg);
  return cfg;
}

/** Pipeline reports `{exitCode, message}` → command result. */
function report(res, ctx) {
  if (res?.message) ctx.io.out(res.message);
  const { message, ...rest } = res ?? {};
  return { code: Number.isInteger(res?.exitCode) ? res.exitCode : EXIT.OK, data: { message: message ?? null, ...rest } };
}

const lib = (name) => import(`./${name}`);

function doctorCtx(ctx, extra = {}) {
  return { cwd: ctx.cwd, env: ctx.env, repo: ctx.flags.repo, platform: process.platform, prefix: selfCommand(ctx.env), ...extra };
}

/** Envelope error from the first failing critical check (its code, detail and fix). */
function checkError(results) {
  const c = results.find((r) => r.critical && r.status === 'fail') ?? results.find((r) => r.status === 'fail' || r.status === 'warn');
  return c ? { code: c.code, why: c.detail, fix: c.fix ?? null } : null;
}

// ---------- commands ----------

const H = {};

H.init = async (ctx) => {
  const D = await lib('doctor.mjs');
  const { buildChecks } = await lib('checks.mjs');
  const hosts = await lib('hosts.mjs');
  const dctx = doctorCtx(ctx, { connect: false });
  const detected = ctx.flags['no-connect'] ? [] : hosts.HOST_NAMES.filter((n) => hosts.detect(n, ctx.env));

  if (ctx.flags['dry-run']) {
    const r = await D.run(buildChecks(dctx), dctx, { fix: true, creates: true, dryRun: true });
    const hostPlans = detected.map((n) => { try { return hosts.apply(n, { prefix: dctx.prefix, dryRun: true, env: ctx.env }); } catch (e) { return { host: n, changes: [], skipped: [e.message] }; } });
    const changes = [...new Set([...r.planned.filter((x) => !x.startsWith('host.')), ...hostPlans.flatMap((h) => h.changes)])];
    ctx.io.out(changes.length ? ['init sẽ:', ...bullets(changes)].join('\n') : 'init: không có gì phải làm');
    for (const h of hostPlans) for (const s of h.skipped) ctx.io.out(`  (bỏ qua) ${s}`);
    return { code: EXIT.OK, data: { dryRun: true, changes } };
  }

  if (detected.length) {
    const roots = detected.flatMap((n) => hosts.targets(n, ctx.env).map((t) => t.root));
    dctx.connect = await confirm(ctx, `Cài hook/extension, lệnh momentry-bip/momentry-ui và skill momentry cho ${detected.map((n) => hosts.LABELS[n]).join(', ')} trong ${roots.length} thư mục cấu hình (${roots.slice(0, 3).join(', ')}${roots.length > 3 ? ', …' : ''}), có sao lưu?`, { required: false });
  }
  noteInstallSafe(ctx.env, { fresh: true, via: 'init' });
  const r = await D.run(buildChecks(dctx), dctx, { fix: true, creates: true });
  try { remember(ctx, loadConfig({ cwd: ctx.cwd, env: ctx.env, flags: { repo: ctx.flags.repo } })); } catch { /* broken config: the checks above report it */ }
  const lines = [];
  if (r.changes.length) lines.push('Đã làm:', ...bullets(r.changes), '');
  else lines.push('init: không có gì phải làm.', '');
  lines.push(...D.format(r.results));
  const hostsLeft = detected.length && !dctx.connect;
  if (r.ok) {
    lines.push('', '✓ Sẵn sàng.');
    if (hostsLeft) lines.push(`Hook chưa cài (không có --yes): momentry connect --yes`);
    lines.push(`Tiếp: ${NEXT_AFTER_INIT}`);
  } else {
    lines.push('', 'Chưa sẵn sàng: chạy lệnh ở dòng "sửa" phía trên, rồi momentry init lại.');
  }
  ctx.io.out(lines.join('\n'));
  const next = r.ok ? [NEXT_AFTER_INIT] : D.nextCommands(r.results);
  if (r.ok && hostsLeft) next.unshift('momentry connect --yes');
  return { code: r.ok ? EXIT.OK : EXIT.FAIL, data: { ready: r.ok, changes: r.changes, checks: r.results }, next, error: r.ok ? null : checkError(r.results) };
};

H.doctor = async (ctx) => {
  const D = await lib('doctor.mjs');
  const { buildChecks } = await lib('checks.mjs');
  const dctx = doctorCtx(ctx, { connect: false });
  const r = await D.run(buildChecks(dctx), dctx, { fix: !!ctx.flags.fix, creates: false, dryRun: !!ctx.flags['dry-run'] });
  const lines = D.format(r.results);
  if (r.changes.length) lines.push('', 'Đã sửa:', ...bullets(r.changes));
  if (r.planned.length) lines.push('', '--fix sẽ:', ...bullets(r.planned));
  lines.push('', r.ok ? '✓ Mọi check quan trọng đều đạt.' : '✗ Còn check quan trọng chưa đạt.');
  ctx.io.out(lines.join('\n'));
  return { code: r.ok ? EXIT.OK : EXIT.FAIL, data: { checks: r.results, changes: r.changes }, next: D.nextCommands(r.results), error: r.ok ? null : checkError(r.results) };
};

H.status = async (ctx) => {
  const D = await lib('doctor.mjs');
  const { buildChecks } = await lib('checks.mjs');
  const dctx = doctorCtx(ctx, { connect: false, quick: true });
  const r = await D.run(buildChecks(dctx), dctx, {});
  const bad = r.results.filter((x) => x.status === 'fail' || x.status === 'warn');
  const paused = r.results.some((x) => x.code === 'project.paused' && x.status === 'info');
  const next = D.nextCommands(r.results)[0] ?? (r.ok ? NEXT_AFTER_INIT : 'momentry doctor');
  const lines = [`momentry ${VERSION}: ${bad.length ? `${bad.length} việc cần làm (${bad.map((x) => x.code).join(', ')})` : 'ổn'}`];
  if (paused) lines.push('Repo này đang tạm dừng gom chuyện trên máy này: hook không tự gom, chuyện cũ vẫn đọc được.');
  lines.push(`Tiếp: ${next}`);
  ctx.io.out(lines.join('\n'));
  return { code: r.ok ? EXIT.OK : EXIT.FAIL, data: { version: VERSION, paused, checks: r.results, measures: localMeasures(ctx.env) }, next: [next], error: r.ok ? null : checkError(r.results) };
};

H.list = async (ctx) => {
  const { flags } = ctx;
  const cfg = boxOf(ctx);
  const { readBox, codesOf } = await lib('box.mjs');
  const has = (v, x) => Array.isArray(v) && v.includes(x);
  const all = readBox(cfg.box);
  const codes = codesOf(all);
  let stories = all.filter((s) =>
    (!flags.status || s.data.status === flags.status) &&
    (!flags.thread || has(s.data.threads, flags.thread)) &&
    (!flags.session || has(s.data.sessions, flags.session)));
  const R = flags.rank ? await lib('rank.mjs') : null;
  const P = flags.rank ? await lib('taste-rank.mjs') : null;
  const table = R?.rankTable(cfg);
  // the order of the taste learned on this machine when rank.personal is on and the model is active
  const model = P?.personalModel(cfg);
  const ranked = R ? R.sortRanked(stories, table) : stories;
  if (R) stories = P.personalOrder(ranked, model);
  const rows = stories.map((s) => {
    const taste = P?.tasteWhy(s, ranked, stories, model);
    return {
      code: codes.get(s.id), id: s.id, date: s.data.date ?? null, status: s.error ? 'LỖI' : s.data.status ?? null, hook: s.data.hook ?? null,
      tension: s.data.tension ?? null, stakes: s.data.stakes ?? null, strength: s.data.strength ?? null, hits: s.data.hits ?? null,
      ...(R ? { why: { ...R.explain(s, table), ...(taste ? { taste } : {}) } } : {}),
    };
  });
  const w = [6, 44, 10, 9, 40, 15, 6, 8, 4];
  const head = ['code', 'id', 'date', 'status', 'hook', 'tension', 'stakes', 'strength', 'hits'];
  ctx.io.out([head.map((h, i) => pad(h, w[i])).join('  ').trimEnd(), ...rows.map((r) => head.map((h, i) => pad(r[h], w[i])).join('  ').trimEnd())].join('\n'));
  return { code: EXIT.OK, data: rows };
};

function stagedIds(cfg) {
  if (!cfg.repoRoot) throw new CliError('--staged cần git repo');
  const out = execFileSync('git', ['-C', cfg.repoRoot, 'diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'], { encoding: 'utf8' });
  const ids = new Set();
  for (const rel of out.split('\0').filter(Boolean)) {
    const abs = path.join(cfg.repoRoot, rel);
    if (path.dirname(abs) === cfg.box && abs.endsWith('.md')) ids.add(path.basename(abs, '.md'));
  }
  return ids;
}

H.check = async (ctx) => {
  const cfg = boxOf(ctx);
  const { readBox, checkBox, backfillCodes } = await lib('box.mjs');
  const P = await lib('privacy.mjs');
  let filled = null;
  if (ctx.flags.fix) {
    const dry = !!ctx.flags['dry-run'];
    filled = backfillCodes(cfg.box, { dryRun: dry });
    if (filled.length) ctx.io.out(`check --fix: ${dry ? 'sẽ ghi' : 'đã ghi'} mã chuyện vào ${filled.length} chuyện (${filled.map((x) => `${x.code} ${x.id}`).join(', ')})`);
  }
  const all = readBox(cfg.box);
  const only = ctx.flags.staged ? stagedIds(cfg) : null;
  const targets = only ? all.filter((s) => only.has(s.id)) : all;
  const errors = checkBox(all, only || undefined);
  for (const e of errors) ctx.io.err(`${e.file}: ${e.field}: ${e.msg}`);
  const blocklist = P.loadBlocklist(cfg.privacy.sources, { env: ctx.env });
  const found = [];
  if (blocklist) {
    const allow = P.loadAllow(cfg.privacy.allowFile);
    for (const s of targets.filter((x) => !x.error)) {
      for (const v of P.checkStory({ data: s.data, body: s.body }, s.id, blocklist, allow)) found.push({ file: s.file, field: v.field, masked: P.mask(v.term) });
    }
  }
  for (const v of found) ctx.io.err(`${v.file}: ${v.field}: riêng tư: ${v.masked}`);
  const data = { stories: targets.length, shapeErrors: errors.length, privacy: blocklist ? found.length : null, ...(filled ? { codesWritten: filled } : {}) };
  if (errors.length || found.length) {
    ctx.io.err(`check: ${targets.length} chuyện, ${errors.length} lỗi khuôn, ${found.length} vi phạm riêng tư`);
    return { code: EXIT.CHECK, data };
  }
  if (!blocklist) {
    ctx.io.err(`check: ${targets.length} chuyện, khuôn sạch; bỏ qua kiểm riêng tư: không có nguồn chặn`);
    return { code: EXIT.UNCHECKED, data, next: [] };
  }
  ctx.io.out(`check: ${targets.length} chuyện, sạch`);
  return { code: EXIT.OK, data };
};

H.harvest = async (ctx) => {
  const { flags, cwd } = ctx;
  if (!flags.session && !flags.transcript) throw usageError('harvest cần --session hoặc --transcript', { fix: 'momentry harvest --help' });
  const cfg = observedConfig(ctx);
  const P = await lib('pipeline.mjs');
  return report(await P.runSession(flags.session ?? null, {
    cfg, transcript: flags.transcript && path.resolve(cwd, flags.transcript),
    fromLine: flags['from-line'], toLine: flags['to-line'], dryRun: !!flags['dry-run'],
    savePrompts: flags['save-prompts'] && path.resolve(cwd, flags['save-prompts']),
    saveLlm: flags['save-llm'] && path.resolve(cwd, flags['save-llm']), blind: !!flags.blind, env: ctx.env,
  }), ctx);
};

H.scan = async (ctx) => {
  const { flags } = ctx;
  const cfg = observedConfig(ctx);
  const P = await lib('pipeline.mjs');
  const picked = P.SOURCE_NAMES.filter((n) => flags[n]);
  const which = Object.fromEntries(P.SOURCE_NAMES.map((n) => [n, !picked.length || picked.includes(n)]));
  return report(await P.scan({ cfg, ...which, dryRun: !!flags['dry-run'], exceptSid: flags.except, auto: !!flags.auto, maxSessions: flags['max-sessions'], env: ctx.env }), ctx);
};

H.rescore = async (ctx) => {
  if (!ctx.flags.session) throw usageError('rescore cần --session', { fix: 'momentry rescore --help' });
  const cfg = observedConfig(ctx);
  return report(await (await lib('pipeline.mjs')).rescore(ctx.flags.session, { cfg, env: ctx.env }), ctx);
};

const BAD_REF = { why: 'id có dạng YYYY-MM-DD-slug, mã có dạng M-XXXX (hoa thường đều được, M- có thể bỏ), như momentry list in ra', fix: 'momentry list --rank' };

/** A story of the box by id or code, as a CLI error when there is none, or the code is held by several stories. */
async function findStoryOrFail(box, ref) {
  const B = await lib('box.mjs');
  let hit;
  try { hit = B.findStory(box, ref); } catch (e) {
    if (e instanceof B.AmbiguousCodeError) throw new CliError(e.message, { code: 'ambiguous-code', why: 'hai chuyện ghi cùng một mã', fix: 'momentry check' });
    throw e;
  }
  if (!hit) throw new CliError(`không có chuyện ${ref} trong hộp ${box}`, { code: 'no-story', fix: 'momentry list --rank' });
  return hit;
}

H.angle = async (ctx) => {
  const { flags } = ctx;
  if (flags.story !== undefined) {
    const { isStoryRef } = await lib('box.mjs');
    if (!isStoryRef(flags.story)) throw usageError(`id chuyện sai khuôn: ${flags.story}`, BAD_REF);
    if (flags.top !== undefined) throw usageError('--story và --top không dùng chung', { fix: 'momentry angle --help' });
  }
  const cfg = observedConfig(ctx);
  if (!fs.existsSync(cfg.box)) throw new CliError(`không có hộp: ${cfg.box}`, { code: 'no-box', fix: 'momentry init' });
  let story;
  if (flags.story !== undefined) {
    const s = (await findStoryOrFail(cfg.box, flags.story)).story;
    if (s.error) throw new CliError(`file chuyện ${s.id} sai khuôn`, { code: 'story-malformed', why: s.error, fix: 'momentry check' });
    story = s.id;
  }
  const res = await (await lib('pipeline.mjs')).angleCommand({ cfg, top: flags.top, story, force: !!flags.force, dryRun: !!flags['dry-run'], env: ctx.env });
  return report(res, ctx);
};

/**
 * `pause` / `resume`: shortcuts for `config set paused true|false --project`, through the same writer; gathering for
 * this repo on this machine, kept in the project list (never in the repo file).
 */
async function setGathering(ctx, pause) {
  const { writeProject } = await lib('config-cmd.mjs');
  const dryRun = !!ctx.flags['dry-run'];
  const r = writeProject({ cwd: ctx.cwd, env: ctx.env, repo: ctx.flags.repo, key: 'paused', value: pause, parsed: true, dryRun });
  const cfg = loadConfig({ cwd: r.root, env: ctx.env });
  const data = { repo: cfg.repo, root: r.root, paused: pause, changed: r.changed };
  if (!data.changed) {
    ctx.io.out(pause ? `${cfg.repo}: đã tạm dừng sẵn. Bật lại: momentry resume` : `${cfg.repo}: đang gom chuyện, không có gì để bật lại`);
    return { code: EXIT.OK, data };
  }
  if (dryRun) {
    ctx.io.out(`${ctx.cmd} sẽ: ${pause ? 'đánh dấu tạm dừng' : 'bỏ dấu tạm dừng'} cho ${r.root} trong ${r.file}`);
    return { code: EXIT.OK, data: { ...data, dryRun: true } };
  }
  ctx.io.out(pause
    ? `Đã tạm dừng gom chuyện cho ${cfg.repo} trên máy này: hook không tự gom, scan --auto bỏ qua, đầu phiên không nhắc. Chuyện cũ vẫn đọc được. Bật lại: momentry resume`
    : `Đã bật lại gom chuyện cho ${cfg.repo}: phiên từ giờ được gom tự động. Phiên trong lúc tạm dừng chỉ gom khi chạy tay momentry scan.`);
  return { code: EXIT.OK, data, next: pause ? [] : ['momentry status'] };
}

H.pause = async (ctx) => setGathering(ctx, true);
H.resume = async (ctx) => setGathering(ctx, false);

const MARKS = ['use', 'later', 'drop'];

/**
 * A story of the current repo (or --repo) as the web UI sees it, through lib/ui-api.mjs: the same id check, reader and
 * writer, so the CLI and the UI never disagree. `call` runs a ui-api function with the UI context and the story's key, and maps UI errors.
 */
async function storyAccess(ctx, ref) {
  const { isStoryRef } = await lib('box.mjs');
  if (!isStoryRef(ref)) throw usageError(`id chuyện sai khuôn: ${ref}`, BAD_REF);
  const cfg = boxOf(ctx);
  if (!cfg.repoRoot) throw new CliError('không ở trong git repo', { code: 'not-git', fix: 'cd vào repo của hộp chuyện, hoặc thêm --repo DIR' });
  const A = await lib('ui-api.mjs');
  const root = path.resolve(cfg.repoRoot);
  const ui = { env: ctx.env, cwd: root };
  const project = A.listProjects(ui).find((p) => p.root === root);
  if (!project) throw new CliError(`không đọc được dự án ${root}`, { code: 'no-project', fix: 'momentry doctor' });
  // a code is resolved once, so every later call (and the UI state key) uses the story id
  const { story } = await findStoryOrFail(cfg.box, ref);
  const id = story.id;
  const call = (fn) => {
    try { return fn(A, ui, `${project.id}/${id}`); } catch (e) {
      if (!(e instanceof A.UiError)) throw e;
      if (e.status === 404) throw new CliError(`không có chuyện ${id} trong hộp ${cfg.box}`, { code: 'no-story', fix: 'momentry list --rank' });
      if (e.status === 409) throw new CliError(`file chuyện ${id} sai khuôn hoặc không đọc được`, { code: 'story-malformed', why: e.message, fix: 'momentry check' });
      throw new CliError(e.message, { code: 'story-error' });
    }
  };
  return { cfg, call, id };
}

/** Plain-text view of a story for `show`. */
function storyLines(s) {
  const out = [`# ${s.title}`, `${s.code} · ${s.id} · ${s.date ?? '-'} · ${s.status}${s.later ? ' · để sau' : ''}`];
  if (s.angle) out.push('', `Góc kể: ${s.angle}${s.audience ? ` (cho: ${s.audience})` : ''}`);
  for (const [k, text] of Object.entries(s.sections)) if (text) out.push('', `${s.sectionLabels[k] ?? k}: ${text}`);
  if (s.links.length) out.push('', `Liên quan: ${s.links.map((l) => l.key.split('/').pop()).join(', ')}`);
  out.push('', s.file);
  return out;
}

H.show = async (ctx) => {
  const { call } = await storyAccess(ctx, ctx.positionals[0]);
  const s = call((A, ui, key) => A.getStory(ui, key, { markSeen: false }));
  ctx.io.out(storyLines(s).join('\n'));
  return { code: EXIT.OK, data: s };
};

H.mark = async (ctx) => {
  const [ref, action] = ctx.positionals;
  if (!MARKS.includes(action)) throw usageError(`nhãn lạ: ${action}`, { why: `dùng ${MARKS.join(', ')}`, fix: 'momentry mark --help' });
  const { call, id } = await storyAccess(ctx, ref);
  if (ctx.flags['dry-run']) {
    const s = call((A, ui, key) => A.getStory(ui, key, { markSeen: false }));
    ctx.io.out(`mark sẽ: đánh dấu ${id} là ${action} (status hiện tại: ${s.status})`);
    return { code: EXIT.OK, data: { dryRun: true, id, action, status: s.status } };
  }
  const s = call((A, ui, key) => A.markStory(ui, key, action));
  ctx.io.out(`đã đánh dấu ${id}: ${action} (status: ${s.status}${s.later ? ', để sau' : ''})`);
  return { code: EXIT.OK, data: { action, ...s } };
};

H.add = async (ctx) => {
  const { flags } = ctx;
  if (!flags.note && !flags.title) throw usageError('add cần --note hoặc --title', { fix: 'momentry add --help' });
  if (flags.by && !['human', 'live'].includes(flags.by)) throw usageError(`--by phải là human hoặc live: ${flags.by}`);
  const cfg = observedConfig(ctx);
  return report(await (await lib('pipeline.mjs')).addStory({ cfg, title: flags.title, note: flags.note ?? '', by: flags.by ?? 'human', session: flags.session, env: ctx.env }), ctx);
};

/** One decimal, Vietnamese style (2,4). */
const dec = (v) => (v === null ? '-' : v.toFixed(1).replace('.', ','));

H.taste = async (ctx) => {
  const T = await lib('taste.mjs');
  const { VOCAB } = await lib('vocab.mjs');
  const { cacheDir } = await lib('config.mjs');
  let project = null;
  if (ctx.flags.repo) {
    const R = await lib('repo.mjs');
    const { projectId } = await lib('projects.mjs');
    const root = fs.existsSync(ctx.flags.repo) ? R.gitRoot(path.resolve(ctx.flags.repo)) : null;
    if (!root) throw new CliError(`không phải git repo: ${ctx.flags.repo}`, { code: 'not-git', fix: 'momentry taste   (mọi dự án), hoặc --repo DIR của một git repo' });
    project = projectId(root);
  }
  const m = T.measures(T.load(cacheDir(ctx.env)), { project });
  const t = m.top5;
  const lines = ['Gu của bạn, tính trên máy này (không gửi đi đâu).'];
  let cfg;
  try { cfg = loadConfig({ cwd: ctx.cwd, env: ctx.env }); } catch { cfg = { cacheDir: cacheDir(ctx.env), rank: { personal: false } }; /* broken config: doctor reports it */ }
  const personal = personalLines(await lib('taste-rank.mjs'), cfg);
  lines.push(...personal.lines);
  if (t.enough) {
    lines.push(`Top 5: bạn dùng ${t.use}/${t.decided} chuyện đã quyết`);
    if (m.meanUsedRank !== null) lines.push(`Chuyện bạn dùng nằm hạng trung bình ${dec(m.meanUsedRank)}`);
  } else {
    lines.push(`Top 5: cần thêm ${t.missing} quyết định (use, later, drop) trên chuyện đang ở top 5 (đã có ${t.decided}/${t.needed}).`);
  }
  const d = m.decisions;
  lines.push(`Đã quyết: dùng ${d.used}, bỏ ${d.dropped}, để sau ${d.later}.`);
  const word = (list, id, special) => special[id] ?? list.find((x) => x.id === id)?.label ?? id;
  const table = (head, rows, special, list) => (rows.length
    ? ['', `${pad(head, 28)}  ${pad('dùng', 5)}  bỏ`, ...rows.map((r) => `${pad(word(list, r.id, special), 28)}  ${pad(r.used, 5)}  ${r.dropped}`)]
    : []);
  lines.push(...table('Giằng xé', m.features.tension, { other: 'ngoài danh sách', unknown: 'chưa chấm' }, VOCAB.tensions));
  lines.push(...table('Tín hiệu', m.features.signals, { other: 'ngoài danh sách', none: 'không có tín hiệu' }, VOCAB.signals));
  if (d.used + d.dropped) lines.push('', `Stakes trung bình: chuyện dùng ${dec(m.features.stakes.used)}, chuyện bỏ ${dec(m.features.stakes.dropped)}`);
  lines.push(`Chuyện bạn tự ghi (momentry bỏ sót): ${m.missed}`);
  const fields = T.EDIT_FIELDS.filter((f) => m.edits[f]).map((f) => `${f} ${m.edits[f]}`);
  lines.push(`Lần bạn sửa chữ model viết: ${m.edits.total}${fields.length ? ` (${fields.join(', ')})` : ''}`);
  const v = m.verdicts;
  if (v.tellable + v['no-story'] + v.invented + v.understood.yes + v.understood.no) {
    lines.push(`Kiểm góc kể: kể được ${v.tellable}, không ra chuyện ${v['no-story']}, bịa ${v.invented}; hiểu được không cần hỏi thêm: có ${v.understood.yes}, không ${v.understood.no}`);
  }
  ctx.io.out(lines.join('\n'));
  return { code: EXIT.OK, data: { project, ...m, personal: personal.data } };
};

/**
 * Whether ranking follows the learned taste (always learned over every project on this machine), why not, and the
 * biggest learned weights. @param {typeof import('./taste-rank.mjs')} P @param {{rank: {personal: boolean}, cacheDir: string}} cfg
 */
function personalLines(P, cfg) {
  const on = cfg.rank.personal === true;
  const model = P.personalModel(on ? cfg : { ...cfg, rank: { ...cfg.rank, personal: true } });
  const weights = P.topWeights(model);
  const data = { enabled: on, active: on && model.active, reason: on ? model.reason : 'off', counts: model.counts, needed: model.needed, check: model.check, weights };
  const c = model.counts, n = model.needed;
  const lines = [];
  if (!on) lines.push('Xếp theo gu: tắt (momentry config set rank.personal true để bật); đang xếp theo thứ tự mặc định.');
  else if (model.active) lines.push(`Xếp theo gu: đang bật, học từ ${c.verdicts} chuyện đã quyết (dùng ${c.used}, bỏ ${c.dropped}) trên mọi dự án; một chỗ trong top 5 giữ cho thứ tự mặc định.`);
  else if (model.reason === 'worse') lines.push('Xếp theo gu: đang dùng thứ tự mặc định, vì gu học được xếp các quyết định gần đây kém hơn mặc định.');
  else lines.push('Xếp theo gu: chưa đủ quyết định, đang xếp theo thứ tự mặc định.');
  if (model.reason === 'few') {
    const miss = [n.verdicts && `${n.verdicts} quyết định dùng hay bỏ`, n.used && `${n.used} chuyện dùng`, n.dropped && `${n.dropped} chuyện bỏ`].filter(Boolean);
    lines.push(`  Cần thêm ${miss.join(', ')} (đã có ${c.verdicts}: dùng ${c.used}, bỏ ${c.dropped}; cần ${P.MIN_VERDICTS}, trong đó ${P.MIN_USED} dùng và ${P.MIN_DROPPED} bỏ).`);
  }
  if (model.check) lines.push(`  Kiểm trên ${model.check.heldOut} quyết định mới nhất: gu xếp đúng ${pctOf(model.check.auc)} cặp dùng/bỏ, mặc định ${pctOf(model.check.aucDefault)}.`);
  if (weights.length) lines.push('  Gu học được:', ...weights.map((w) => `    ${w.text} (${w.weight > 0 ? '+' : ''}${w.weight.toFixed(2).replace('.', ',')})`));
  return { lines, data };
}

const pctOf = (v) => (v === null ? '-' : `${Math.round(v * 100)}%`);

H.ui = async (ctx) => {
  const S = await lib('ui-server.mjs');
  const { flags } = ctx;
  if (flags.serve) {
    const srv = await S.serve({ env: ctx.env, cwd: ctx.cwd, port: flags.port, onListen: (st) => ctx.io.err(`momentry ui: http://127.0.0.1:${st.port}/${st.tailnet ? ` và tailnet ${(st.dnsName ? [st.dnsName] : st.tailnet).join(', ')}` : ''} (tự tắt khi không còn tab nào mở)`) });
    for (const sig of ['SIGINT', 'SIGTERM']) process.once(sig, () => { srv.close(); });
    await srv.done;
    return { code: EXIT.OK, data: { stopped: true } };
  }
  let st = await S.runningInstance(ctx.env);
  const reused = !!st;
  if (!st) {
    try { st = await S.startDetached({ env: ctx.env, cwd: ctx.cwd, bin: BIN, port: flags.port }); } catch (e) {
      throw new CliError(`không mở được giao diện: ${e.message}`, { code: 'ui-start', fix: 'momentry ui --serve   # chạy trong terminal để xem lỗi' });
    }
  }
  if (flags.remote) {
    const urls = S.remoteUrls(st);
    if (!urls.length) throw new CliError('giao diện không nghe trên tailnet', { code: 'ui-no-tailnet', fix: S.tailscaleWanted(ctx.env) ? 'kiểm tra Tailscale đang chạy (tailscale status), rồi tắt giao diện cũ và mở lại: momentry ui' : 'momentry config set ui.tailscale true, rồi mở lại giao diện' });
    ctx.io.out(`Mở trên máy khác trong tailnet (link có mã truy cập, đừng gửi cho người khác):\n${urls.join('\n')}`);
    return { code: EXIT.OK, data: { port: st.port, reused, urls } };
  }
  // the token stays in a private launcher file; only its path is printed or passed to the browser
  const open = pathToFileURL(S.writeLauncher(ctx.env, st)).href;
  const opened = !flags['no-open'] && S.openBrowser(open, ctx.env);
  ctx.io.out(opened ? `Đã mở momentry trong trình duyệt (http://127.0.0.1:${st.port}/).` : `Mở file này trong trình duyệt: ${open}`);
  if (st.tailnet?.length) ctx.io.out('Máy khác trong tailnet cũng mở được: momentry ui --remote để lấy link.');
  return { code: EXIT.OK, data: { open, port: st.port, reused, opened, tailnet: st.tailnet ?? [] } };
};

H.reduce = async (ctx) => {
  const { flags, cwd } = ctx;
  if (!flags.transcript) throw usageError('reduce cần --transcript', { fix: 'momentry reduce --help' });
  return report(await (await lib('pipeline.mjs')).reduceCommand({
    transcript: path.resolve(cwd, flags.transcript), fromLine: flags['from-line'], toLine: flags['to-line'], out: flags.out && path.resolve(cwd, flags.out),
  }), ctx);
};

H.quarantine = async (ctx) => {
  const cfg = loadConfig({ cwd: ctx.cwd, env: ctx.env, flags: ctx.flags });
  if (!cfg.repo) throw new CliError('không ở trong git repo', { fix: 'cd vào repo cần quan sát' });
  const Q = await lib('quarantine.mjs');
  if (!ctx.flags.release) {
    const items = Q.list(cfg.repo, { cacheDir: cfg.cacheDir });
    ctx.io.out(items.map((it) => `${it.id}  ${it.reason}  ${it.at}`).join('\n'));
    return { code: EXIT.OK, data: items };
  }
  const P = await lib('privacy.mjs');
  const blocklist = P.loadBlocklist(cfg.privacy.sources, { env: ctx.env });
  if (!blocklist) { ctx.io.err('bỏ qua kiểm riêng tư: không có nguồn chặn'); return { code: EXIT.UNCHECKED }; }
  const opts = { cacheDir: cfg.cacheDir, box: cfg.box, allow: P.loadAllow(cfg.privacy.allowFile) };
  const { noteFirstStory } = await lib('pipeline.mjs');
  if (ctx.flags.release === 'all') {
    // every held story is re-checked; clean ones go into the box, the rest stay held with their reason
    const released = [], held = [], failed = [];
    for (const it of Q.list(cfg.repo, { cacheDir: cfg.cacheDir })) {
      try {
        const r = Q.release(cfg.repo, it.id, blocklist, opts);
        if (r.released) { if (r.created) noteFirstStory(cfg, r.capturedBy, { id: path.basename(r.path, '.md') }); released.push({ id: it.id, path: r.path }); ctx.io.out(`đã thả ${it.id} vào ${r.path}`); }
        else { held.push({ id: it.id, violations: r.violations.map((v) => ({ field: v.field, masked: P.mask(v.term) })) }); ctx.io.err(`${it.id}: vẫn giữ: ${r.violations.map((v) => `${v.field}: ${P.mask(v.term)}`).join('; ')}`); }
      } catch (e) { failed.push({ id: it.id, error: e.message }); ctx.io.err(`${it.id}: ${e.message}`); }
    }
    ctx.io.out(`quarantine: thả ${released.length}, còn giữ ${held.length}, lỗi ${failed.length}`);
    return { code: held.length || failed.length ? EXIT.CHECK : EXIT.OK, data: { released, held, failed } };
  }
  const r = Q.release(cfg.repo, ctx.flags.release, blocklist, opts);
  if (!r.released) { for (const v of r.violations) ctx.io.err(`${v.field}: ${P.mask(v.term)}`); return { code: EXIT.CHECK }; }
  if (r.created) noteFirstStory(cfg, r.capturedBy, { id: path.basename(r.path, '.md') });
  ctx.io.out(`đã thả ${ctx.flags.release} vào ${r.path}`);
  return { code: EXIT.OK, data: { released: ctx.flags.release, path: r.path } };
};

H.ledger = async (ctx) => {
  const { cacheDir } = await lib('config.mjs');
  const L = await lib('ledger.mjs');
  const dir = cacheDir(ctx.env);
  const ledger = L.load(dir);
  if (ctx.flags.forget) {
    if (!L.forget(ledger, ctx.flags.forget)) throw new CliError(`không có phiên ${ctx.flags.forget} trong sổ`, { fix: 'momentry ledger' });
    L.save(ledger, dir);
    ctx.io.out(`đã quên ${ctx.flags.forget}`);
    return { code: EXIT.OK, data: { forgot: ctx.flags.forget } };
  }
  ctx.io.out(JSON.stringify(ledger, null, 2));
  return { code: EXIT.OK, data: ledger };
};

H.hooks = async (ctx) => {
  if (!ctx.flags.print) throw usageError('hooks cần --print', { fix: 'momentry hooks --print --claude   (hoặc momentry connect --yes để tự cài)' });
  const Hk = await lib('hook.mjs');
  const runtimes = ctx.flags.claude || ctx.flags.codex ? ['claude', 'codex'].filter((r) => ctx.flags[r]) : ['claude'];
  ctx.io.out(runtimes.map((r) => Hk.printHookConfig(r, { prefix: selfCommand(ctx.env) })).join('\n'));
  return { code: EXIT.OK };
};

H.connect = async (ctx) => {
  const hosts = await lib('hosts.mjs');
  const AF = await lib('agent-files.mjs');
  const want = ctx.positionals[0];
  if (want && !hosts.HOST_NAMES.includes(want)) throw usageError(`host lạ: ${want}`, { why: `dùng ${hosts.HOST_NAMES.join(' hoặc ')}` , fix: 'momentry connect --help' });
  const names = want ? [want] : hosts.HOST_NAMES.filter((n) => hosts.detect(n, ctx.env));
  if (!names.length) throw new CliError('không thấy Claude Code hay Codex trên máy này', { code: 'no-host', fix: 'cài Claude Code (https://docs.anthropic.com/claude-code) rồi chạy lại' });
  const prefix = selfCommand(ctx.env);
  const remove = !!ctx.flags.remove;
  // removing: hosts removed together free the ~/.agents/skills files they share; a file shared by two hosts is listed once
  const plans = names.map((n) => hosts.apply(n, { prefix, remove, removing: names, dryRun: true, env: ctx.env }));
  const changes = [...new Set(plans.flatMap((p) => p.changes))];
  const skipped = [...new Set(plans.flatMap((p) => p.skipped))];
  if (!changes.length || ctx.flags['dry-run']) {
    ctx.io.out([changes.length ? 'connect sẽ:' : 'connect: không có gì phải làm', ...bullets(changes), ...skipped.map((s) => `  (bỏ qua) ${s}`)].join('\n'));
    return { code: EXIT.OK, data: { dryRun: !!ctx.flags['dry-run'], changes, skipped } };
  }
  if (!(await confirm(ctx, `${remove ? 'Gỡ' : 'Cài'}:\n${bullets(changes).join('\n')}\nTiếp tục?`))) return { code: EXIT.FAIL, data: { cancelled: true } };
  const done = names.map((n) => hosts.apply(n, { prefix, remove, removing: names, env: ctx.env }));
  const lines = done.flatMap((d) => [...d.changes.map((c) => `✓ ${c}`), ...d.backups.map((b) => `  sao lưu: ${b}`), ...d.skipped.map((s) => `  (bỏ qua) ${s}`)]);
  const hint = (n) => `${n}: ${[AF.NAMES.bip, AF.NAMES.ui].map((c) => hosts.commandName(n, c)).join(', ')}`;
  lines.push(remove ? 'Đã gỡ. Mở phiên mới để host nạp lại cấu hình.' : `Đã cài cho ${names.map((n) => hosts.LABELS[n]).join(', ')}. Mở phiên mới để hook/extension có hiệu lực. Lệnh: ${names.map(hint).join('; ')}.`);
  ctx.io.out(lines.join('\n'));
  return { code: EXIT.OK, data: { changes: done.flatMap((d) => d.changes), backups: done.flatMap((d) => d.backups), skipped }, next: ['momentry doctor'] };
};

H.config = async (ctx) => {
  const { runConfig } = await lib('config-cmd.mjs');
  const r = runConfig(ctx.positionals, { cwd: ctx.cwd, env: ctx.env, repo: ctx.flags.repo, dryRun: !!ctx.flags['dry-run'], project: !!ctx.flags.project });
  ctx.io.out(r.lines.join('\n'));
  return { code: EXIT.OK, data: r.data };
};

H.paths = async (ctx) => {
  const p = paths(ctx.env);
  const st = installState(ctx.env);
  const data = { ...p, versions: st.versions, current: st.current, running: st.running, managed: st.managed, source: ROOT };
  const w = Math.max(...Object.keys(data).map((k) => k.length));
  ctx.io.out(Object.entries(data).map(([k, v]) => `${k.padEnd(w)}  ${Array.isArray(v) ? v.join(', ') : v ?? '-'}`).join('\n'));
  return { code: EXIT.OK, data };
};

H.version = async (ctx) => {
  const f = fingerprint();
  const data = { ...f, node: process.versions.node, platform: process.platform, arch: process.arch, installDir: ROOT };
  ctx.io.out(`momentry ${VERSION}${f.commit ? ` (${f.commit}${f.commitTime ? `, ${f.commitTime}` : ''})` : ''}`);
  return { code: EXIT.OK, data };
};

H.update = async (ctx) => {
  const U = await lib('update.mjs');
  const { flags } = ctx;
  const st = installState(ctx.env);
  if (!flags.check && !st.running) throw new CliError('momentry đang chạy từ mã nguồn, không phải bản cài', { code: 'not-installed', fix: `git -C "${ROOT}" pull` });
  if (!flags.check && !st.managed) throw new CliError(`không thấy dấu ${st.home}/.momentry-managed; chỉ cập nhật bản do install.sh/install.ps1 cài`, { code: 'not-managed', fix: 'cài lại bằng install.sh hoặc install.ps1' });
  let rel;
  try { rel = await U.resolveRelease({ env: ctx.env, version: flags.version }); } catch (e) {
    if (e.status === 404) {
      throw new CliError(`không có bản phát hành ${flags.version ?? 'mới nhất'} ở ${U.releaseBase(ctx.env)}`, { code: 'release-not-found', why: e.message, fix: flags.version ? 'momentry update --check' : null });
    }
    throw new CliError(`không lấy được thông tin bản phát hành: ${e.message}`, { code: 'release-unreachable', fix: 'kiểm mạng rồi chạy lại momentry update --check' });
  }
  const d = U.decide(VERSION, rel.version, { explicit: !!flags.version, force: !!flags.force });
  if (flags.check) {
    const newer = d === 'update' && !flags.force;
    ctx.io.out(newer ? `có bản mới: ${rel.version} (đang dùng v${VERSION}). Cập nhật: momentry update --yes` : `đã là bản mới nhất (v${VERSION})`);
    return { code: newer ? EXIT.UPDATE : EXIT.OK, data: { current: `v${VERSION}`, latest: rel.version, updateAvailable: newer }, next: newer ? ['momentry update --yes'] : [] };
  }
  if (d !== 'update') {
    ctx.io.out(d === 'same' ? `đã là ${rel.version}; không có gì để làm (--force để cài lại)` : `bản phát hành ${rel.version} cũ hơn v${VERSION}; không hạ cấp (dùng --version ${rel.version} nếu muốn)`);
    return { code: EXIT.OK, data: { current: `v${VERSION}`, latest: rel.version, changed: false } };
  }
  if (flags['dry-run']) {
    ctx.io.out(`update sẽ: tải ${rel.name}, kiểm sha256, giải nén vào ${st.versionsDir}/${rel.version}, thử chạy, đổi current từ ${st.running} sang ${rel.version}, chạy doctor --fix trong bản mới`);
    return { code: EXIT.OK, data: { dryRun: true, from: st.running, to: rel.version } };
  }
  if (!(await confirm(ctx, `Cập nhật v${VERSION} → ${rel.version}?`))) return { code: EXIT.FAIL, data: { cancelled: true } };
  const r = await U.install(rel, { env: ctx.env });
  ctx.io.out([...r.steps.map((s) => `✓ ${s}`), `Đã cập nhật ${r.from} → ${r.to}.`].join('\n'));
  return { code: EXIT.OK, data: r, next: r.healthy ? [] : ['momentry doctor'] };
};

H.uninstall = async (ctx) => {
  const Un = await lib('uninstall.mjs');
  const p = Un.plan({ env: ctx.env, purge: !!ctx.flags.purge, prefix: selfCommand(ctx.env) });
  const lines = [];
  if (p.kept.length) lines.push(`Giữ lại: ${p.kept.join('; ')}${ctx.flags.purge ? '' : ' (xoá cả cấu hình và cache: --purge)'}`);
  for (const s of p.skipped) lines.push(`  (bỏ qua) ${s}`);
  if (!p.steps.length) {
    ctx.io.out([...lines, 'uninstall: không có gì để gỡ'].join('\n'));
    return { code: EXIT.OK, data: { done: [], kept: p.kept, skipped: p.skipped } };
  }
  lines.push(`uninstall ${ctx.flags['dry-run'] ? 'sẽ' : ''}:`.replace(' :', ':'), ...bullets(p.steps.map((s) => s.what)));
  ctx.io.out(lines.join('\n'));
  if (ctx.flags['dry-run']) return { code: EXIT.OK, data: { dryRun: true, steps: p.steps.map((s) => s.what), kept: p.kept, skipped: p.skipped } };
  if (!(await confirm(ctx, 'Gỡ momentry?'))) return { code: EXIT.FAIL, data: { cancelled: true } };
  const r = Un.execute(p.steps);
  if (r.failed) {
    ctx.io.out(`✗ ${r.failed.what}: ${r.failed.error}; dừng, các bước sau không chạy`);
    return { code: EXIT.FAIL, data: { done: r.done, failed: r.failed, kept: p.kept } };
  }
  ctx.io.out(`✓ Đã gỡ momentry.${p.kept.length ? ` Dữ liệu còn ở: ${p.kept.join('; ')}` : ''}`);
  return { code: EXIT.OK, data: { done: r.done, kept: p.kept, skipped: p.skipped } };
};

H.help = async (ctx) => {
  const name = ctx.positionals[0];
  if (name) {
    const c = resolveCommand(name);
    if (!c || COMMANDS[c].hidden) throw unknownCommand(name);
    ctx.io.out(renderCommandHelp(c));
    return { code: EXIT.OK, data: { command: c, ...COMMANDS[c] } };
  }
  ctx.io.out(renderMainHelp());
  return { code: EXIT.OK, data: describeSurface() };
};

/** Commands that have a handler (test/commands.test.mjs checks the table against it). */
export const HANDLED = () => Object.keys(H);

/** Hidden: makes the version this code runs from active (called by install.sh/install.ps1 and update). */
async function internalActivate(args, io) {
  const json = args.includes('--json');
  try {
    const dryRun = args.includes('--dry-run');
    const fresh = !installState(process.env).managed;
    const r = activate(process.env, { dryRun });
    if (!dryRun) noteInstallSafe(process.env, { fresh, via: 'install' });
    if (json) io.out(envelope({ ok: true, data: r })); else io.out(`kích hoạt ${r.version}${r.previous ? ` (bản trước: ${r.previous})` : ''}`);
    return EXIT.OK;
  } catch (e) {
    if (json) io.out(envelope({ ok: false, error: jsonError(e) })); else io.err(formatError(e));
    return EXIT.FAIL;
  }
}

/** Session starts that get no reminder: the session already had one (compaction, extension reload). */
const NO_REMINDER = new Set(['compact', 'reload']);

/**
 * `hook` must always exit 0 and never block the session. It prints nothing, except at session start: one reminder
 * line (lib/reminder.mjs) in the host's format when there is something to say; and Antigravity, which needs a JSON
 * object from every hook, gets `{}` otherwise.
 */
async function runHook(args, env, write) {
  let out = args.includes('--agy') ? '{}' : '';
  try {
    if (env.STORY_HARVEST === '1') return EXIT.OK;
    const { logEvent } = await lib('log.mjs');
    try {
      const { positionals, flags } = parse('hook', args);
      // a host run under another HOME (Antigravity accounts) passes the real one: config, cache, privacy, claude login
      if (flags['user-home']) env = { ...env, HOME: flags['user-home'], USERPROFILE: flags['user-home'] };
      const Hk = await lib('hook.mjs');
      let stdin = '';
      try { stdin = await Hk.readStdin(process.stdin); } catch (e) { logEvent('hook.stdin-error', { code: e?.code ?? 'error' }); }
      const r = Hk.handleHook(positionals[0], stdin, flags, { env, binPath: BIN });
      if (positionals[0] === 'session-start' && r.root && !NO_REMINDER.has(r.source)) {
        try {
          const R = await lib('reminder.mjs');
          out = R.hookOutput(r.runtime, R.reminderLine({ root: r.root, runtime: r.runtime, env, prefix: selfCommand(env) }));
        } catch (e) {
          logEvent('hook.reminder-error', { error: e });
        }
      }
    } catch (e) {
      logEvent('hook.error', { error: e });
    }
  } catch { /* never fail a hook */ } finally {
    try { if (out) write.out(out); } catch { /* a closed stdout must not fail the hook */ }
  }
  return EXIT.OK;
}

function unknownCommand(name) {
  const visible = Object.entries(COMMANDS).filter(([, c]) => !c.hidden).flatMap(([k, c]) => [k, ...(c.aliases ?? [])]);
  const near = didYouMean(name, visible);
  return usageError(`lệnh lạ: ${name}`, { why: near ? `ý bạn là "momentry ${near}"?` : undefined, fix: near ? `momentry ${near} --help` : 'momentry --help' });
}

/**
 * @param {string[]} argv arguments after the script path
 * @param {{cwd?: string, env?: NodeJS.ProcessEnv, out?: (s: string) => void, err?: (s: string) => void}} [c]
 * @returns {Promise<number>} exit code
 */
export async function main(argv, c = {}) {
  const cwd = c.cwd || process.cwd();
  let env = c.env || process.env;
  const write = { out: c.out || ((s) => process.stdout.write(s + '\n')), err: c.err || ((s) => process.stderr.write(s + '\n')) };
  const [first, ...rest] = argv;

  if (first === 'hook') return runHook(rest, env, write);
  if (first === '_activate') return internalActivate(rest, write);
  if (first === '--version' || first === '-V') { write.out(`momentry ${VERSION}`); return EXIT.OK; }

  const wantsJson = argv.includes('--json');
  const mainHelp = !first || first === '--help' || first === '-h';
  let cmd = null;
  if (mainHelp) cmd = 'help';
  else if (!first.startsWith('-')) cmd = resolveCommand(first);
  const args = mainHelp ? [] : rest;

  const buffered = [];
  const io = {
    out: (s) => (wantsJson ? buffered.push(String(s)) : write.out(s)),
    err: (s) => { if (!argv.includes('--quiet') && !argv.includes('-q')) write.err(s); },
  };
  try {
    if (!cmd || COMMANDS[cmd]?.hidden) throw unknownCommand(first);
    const { flags, positionals } = parse(cmd, args);
    if (flags.config) env = { ...env, MOMENTRY_CONFIG: path.resolve(cwd, flags.config) };
    if (flags.help) {
      write.out(wantsJson ? envelope({ ok: true, data: { command: cmd, ...COMMANDS[cmd] } }) : renderCommandHelp(cmd));
      return EXIT.OK;
    }
    const res = await H[cmd]({ cmd, flags, positionals, cwd, env, io });
    const code = res?.code ?? EXIT.OK;
    if (wantsJson) {
      const data = res?.data !== undefined ? res.data : { output: buffered.join('\n') };
      const error = code === EXIT.OK ? null : res?.error ?? { code: `exit-${code}`, why: buffered.join('\n') || `thoát ${code}`, fix: res?.next?.[0] ?? null };
      write.out(envelope({ ok: code === EXIT.OK, data, error, next: res?.next ?? [] }));
    }
    return code;
  } catch (e) {
    const known = e instanceof CliError || Number.isInteger(e.exitCode);
    const code = Number.isInteger(e.exitCode) ? e.exitCode : EXIT.FAIL;
    if (wantsJson) {
      write.out(envelope({ ok: false, data: null, error: jsonError(e), next: e.fix && /^momentry\b/.test(e.fix) ? [e.fix] : [] }));
    } else {
      write.err(known ? formatError(e) : `lỗi: ${e.stack || e.message}`);
    }
    return code;
  }
}

