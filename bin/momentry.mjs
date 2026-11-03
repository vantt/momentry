#!/usr/bin/env node
// momentry CLI (PRD 7.2): parse flags, dispatch, set exit code.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const BIN = fileURLToPath(import.meta.url);
const MIN_NODE = 20;
const EXIT = { OK: 0, USAGE: 1, CHECK: 2, UNCHECKED: 3, LLM: 4, LOCKED: 5 };

const S = { type: 'string' };
const B = { type: 'boolean' };
const SPEC = {
  harvest: { session: S, transcript: S, 'from-line': S, 'to-line': S, runs: S, 'no-outsider': B, 'dry-run': B, 'save-prompts': S, 'fake-llm': S, 'save-llm': S, blind: B, repo: S },
  scan: { repo: S, codex: B, claude: B, 'dry-run': B, 'quiet-minutes': S, except: S, auto: B, 'max-sessions': S },
  hook: { codex: B },
  hooks: { print: B, claude: B, codex: B },
  add: { title: S, note: S, by: S, session: S, repo: S },
  rescore: { session: S, 'no-outsider': B, 'fake-llm': S, repo: S },
  quarantine: { release: S, repo: S },
  list: { rank: B, status: S, thread: S, session: S, json: B, box: S, repo: S },
  check: { box: S, staged: B, repo: S },
  reduce: { transcript: S, 'from-line': S, 'to-line': S, out: S },
  ledger: { show: B, forget: S },
  init: { repo: S },
};
const POSITIONAL = { hook: 1 };
const INT_FLAGS = ['from-line', 'to-line', 'runs', 'quiet-minutes', 'max-sessions'];

const USAGE = `momentry <lệnh> [cờ]

Lệnh: ${Object.keys(SPEC).join(', ')}
Xem README.md.`;

class CliError extends Error {
  constructor(msg, exitCode = EXIT.USAGE) { super(msg); this.exitCode = exitCode; }
}

const isNotImpl = (e) => e?.message === 'not implemented';
const lib = (name) => import(pathToFileURL(path.join(path.dirname(BIN), '..', 'lib', name)).href);

function parse(cmd, args) {
  let r;
  try {
    r = parseArgs({ args, options: { help: { type: 'boolean', short: 'h' }, ...SPEC[cmd] }, allowPositionals: true, strict: true });
  } catch (e) { throw new CliError(e.message); }
  const want = POSITIONAL[cmd] || 0;
  if (r.positionals.length !== want) throw new CliError(`${cmd}: cần ${want} đối số vị trí, gặp ${r.positionals.length}`);
  const flags = { ...r.values };
  for (const k of INT_FLAGS) {
    if (flags[k] === undefined) continue;
    const n = Number(flags[k]);
    if (!Number.isInteger(n) || n < 0) throw new CliError(`--${k} phải là số nguyên ≥ 0: ${flags[k]}`);
    flags[k] = n;
  }
  return { flags, positionals: r.positionals };
}

const pad = (s, n) => { s = String(s ?? ''); return s.length > n ? s.slice(0, n - 1) + '…' : s.padEnd(n); };

// ---------- commands implemented here (DM.1) ----------

async function cmdInit({ flags, cwd, io }) {
  const { gitRoot } = await lib('repo.mjs');
  const { REPO_FILE } = await lib('config.mjs');
  const root = gitRoot(path.resolve(cwd, flags.repo || '.'));
  if (!root) throw new CliError('không ở trong git repo');
  const file = path.join(root, REPO_FILE);
  try {
    fs.writeFileSync(file, '{}\n', { flag: 'wx' });
    io.out(`đã tạo ${file}`);
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
    io.out(`đã có ${file}`);
  }
  return EXIT.OK;
}

async function boxOf(flags, cwd, env) {
  const { loadConfig } = await lib('config.mjs');
  const cfg = loadConfig({ cwd, env, flags });
  if (!fs.existsSync(cfg.box)) throw new CliError(`không có hộp: ${cfg.box}`);
  return cfg;
}

async function cmdList({ flags, cwd, env, io }) {
  const cfg = await boxOf(flags, cwd, env);
  const { readBox } = await lib('box.mjs');
  const has = (v, x) => Array.isArray(v) && v.includes(x);
  let stories = readBox(cfg.box).filter((s) =>
    (!flags.status || s.data.status === flags.status) &&
    (!flags.thread || has(s.data.threads, flags.thread)) &&
    (!flags.session || has(s.data.sessions, flags.session)));
  if (flags.rank) {
    const { sortRanked } = await lib('rank.mjs');
    stories = sortRanked(stories);
  }
  const rows = stories.map((s) => ({
    id: s.id, date: s.data.date ?? null, status: s.error ? 'LỖI' : s.data.status ?? null, hook: s.data.hook ?? null,
    tension: s.data.tension ?? null, stakes: s.data.stakes ?? null, strength: s.data.strength ?? null, hits: s.data.hits ?? null,
  }));
  if (flags.json) { io.out(JSON.stringify(rows, null, 2)); return EXIT.OK; }
  const w = [44, 10, 9, 40, 15, 6, 8, 4];
  const head = ['id', 'date', 'status', 'hook', 'tension', 'stakes', 'strength', 'hits'];
  io.out(head.map((h, i) => pad(h, w[i])).join('  ').trimEnd());
  for (const r of rows) io.out(head.map((h, i) => pad(r[h], w[i])).join('  ').trimEnd());
  return EXIT.OK;
}

function stagedIds(cfg, cwd) {
  const root = cfg.repoRoot;
  if (!root) throw new CliError('--staged cần git repo');
  const out = execFileSync('git', ['-C', root, 'diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'], { encoding: 'utf8' });
  const ids = new Set();
  for (const rel of out.split('\0').filter(Boolean)) {
    const abs = path.join(root, rel);
    if (path.dirname(abs) === cfg.box && abs.endsWith('.md')) ids.add(path.basename(abs, '.md'));
  }
  return ids;
}

async function privacyPass(stories, cfg) {
  let P;
  try {
    P = await lib('privacy.mjs');
    const blocklist = P.loadBlocklist(cfg.privacy.sources);
    if (!blocklist) return { skipped: 'không có nguồn chặn' };
    const allow = P.loadAllow(cfg.privacy.allowFile);
    const found = [];
    for (const s of stories) {
      for (const v of P.checkStory({ data: s.data, body: s.body }, s.id, blocklist, allow)) {
        found.push({ file: s.file, field: v.field, masked: P.mask(v.term) });
      }
    }
    return { found };
  } catch (e) {
    if (isNotImpl(e)) return { skipped: 'bộ kiểm chưa triển khai' };
    throw e;
  }
}

async function cmdCheck({ flags, cwd, env, io }) {
  const cfg = await boxOf(flags, cwd, env);
  const { readBox, checkBox } = await lib('box.mjs');
  const all = readBox(cfg.box);
  const only = flags.staged ? stagedIds(cfg, cwd) : null;
  const targets = only ? all.filter((s) => only.has(s.id)) : all;
  const errors = checkBox(all, only || undefined);
  for (const e of errors) io.err(`${e.file}: ${e.field}: ${e.msg}`);
  const priv = await privacyPass(targets.filter((s) => !s.error), cfg);
  for (const v of priv.found || []) io.err(`${v.file}: ${v.field}: riêng tư: ${v.masked}`);
  if (errors.length || priv.found?.length) {
    io.err(`check: ${targets.length} chuyện, ${errors.length} lỗi khuôn, ${priv.found?.length ?? 0} vi phạm riêng tư`);
    return EXIT.CHECK;
  }
  if (priv.skipped) {
    io.err(`check: ${targets.length} chuyện, khuôn sạch; bỏ qua kiểm riêng tư: ${priv.skipped}`);
    return EXIT.UNCHECKED;
  }
  io.out(`check: ${targets.length} chuyện, sạch`);
  return EXIT.OK;
}

// ---------- commands delegated to later modules ----------

async function observedConfig(flags, cwd, env) {
  const { loadConfig } = await lib('config.mjs');
  const cfg = loadConfig({ cwd, env, flags });
  if (!cfg.repoRoot) throw new CliError('không ở trong git repo');
  if (!cfg.observed) throw new CliError(`repo không được quan sát: ${cfg.repoRoot} (chạy momentry init)`);
  for (const k of cfg.ignored) process.stderr.write(`bỏ qua ${k} trong .momentry.json (chỉ nhận từ cấu hình người dùng)\n`);
  return cfg;
}

function report(res, io) {
  if (res?.message) io.out(res.message);
  return Number.isInteger(res?.exitCode) ? res.exitCode : EXIT.OK;
}

async function cmdHarvest({ flags, cwd, env, io }) {
  if (!flags.session && !flags.transcript) throw new CliError('harvest cần --session hoặc --transcript');
  const cfg = await observedConfig(flags, cwd, env);
  const P = await lib('pipeline.mjs');
  return report(await P.runSession(flags.session ?? null, {
    cfg, transcript: flags.transcript && path.resolve(cwd, flags.transcript),
    fromLine: flags['from-line'], toLine: flags['to-line'], dryRun: !!flags['dry-run'],
    savePrompts: flags['save-prompts'] && path.resolve(cwd, flags['save-prompts']),
    saveLlm: flags['save-llm'] && path.resolve(cwd, flags['save-llm']), blind: !!flags.blind, env,
  }), io);
}

async function cmdScan({ flags, cwd, env, io }) {
  const cfg = await observedConfig(flags, cwd, env);
  const P = await lib('pipeline.mjs');
  const both = !flags.claude && !flags.codex;
  return report(await P.scan({ cfg, claude: both || !!flags.claude, codex: both || !!flags.codex, dryRun: !!flags['dry-run'], exceptSid: flags.except, auto: !!flags.auto, maxSessions: flags['max-sessions'], env }), io);
}

async function cmdRescore({ flags, cwd, env, io }) {
  if (!flags.session) throw new CliError('rescore cần --session');
  const cfg = await observedConfig(flags, cwd, env);
  const P = await lib('pipeline.mjs');
  return report(await P.rescore(flags.session, { cfg, env }), io);
}

async function cmdAdd({ flags, cwd, env, io }) {
  if (!flags.note && !flags.title) throw new CliError('add cần --note hoặc --title');
  const cfg = await observedConfig(flags, cwd, env);
  const P = await lib('pipeline.mjs');
  return report(await P.addStory({ cfg, title: flags.title, note: flags.note ?? '', by: flags.by ?? 'human', session: flags.session, env }), io);
}

async function cmdReduce({ flags, cwd, io }) {
  if (!flags.transcript) throw new CliError('reduce cần --transcript');
  const P = await lib('pipeline.mjs');
  return report(await P.reduceCommand({
    transcript: path.resolve(cwd, flags.transcript), fromLine: flags['from-line'], toLine: flags['to-line'],
    out: flags.out && path.resolve(cwd, flags.out),
  }), io);
}

async function cmdQuarantine({ flags, cwd, env, io }) {
  const { loadConfig } = await lib('config.mjs');
  const cfg = loadConfig({ cwd, env, flags });
  if (!cfg.repo) throw new CliError('không ở trong git repo');
  const Q = await lib('quarantine.mjs');
  if (!flags.release) {
    for (const it of Q.list(cfg.repo, { cacheDir: cfg.cacheDir })) io.out(`${it.id}  ${it.reason}  ${it.at}`);
    return EXIT.OK;
  }
  const P = await lib('privacy.mjs');
  const blocklist = P.loadBlocklist(cfg.privacy.sources);
  if (!blocklist) { io.err('bỏ qua kiểm riêng tư: không có nguồn chặn'); return EXIT.UNCHECKED; }
  const r = Q.release(cfg.repo, flags.release, blocklist, { cacheDir: cfg.cacheDir, box: cfg.box, allow: P.loadAllow(cfg.privacy.allowFile) });
  if (!r.released) { for (const v of r.violations) io.err(`${v.field}: ${P.mask(v.term)}`); return EXIT.CHECK; }
  io.out(`đã thả ${flags.release} vào ${r.path}`);
  return EXIT.OK;
}

async function cmdLedger({ flags, env, io }) {
  const { cacheDir } = await lib('config.mjs');
  const L = await lib('ledger.mjs');
  const dir = cacheDir(env);
  const ledger = L.load(dir);
  if (flags.forget) {
    if (!L.forget(ledger, flags.forget)) throw new CliError(`không có phiên ${flags.forget} trong sổ`);
    L.save(ledger, dir);
    io.out(`đã quên ${flags.forget}`);
    return EXIT.OK;
  }
  io.out(JSON.stringify(ledger, null, 2));
  return EXIT.OK;
}

async function cmdHooks({ flags, io }) {
  if (!flags.print) throw new CliError('hooks cần --print');
  const H = await lib('hook.mjs');
  const runtimes = flags.claude || flags.codex ? ['claude', 'codex'].filter((r) => flags[r]) : ['claude'];
  for (const r of runtimes) io.out(H.printHookConfig(r, { execPath: process.execPath, binPath: BIN }));
  return EXIT.OK;
}

const COMMANDS = {
  init: cmdInit, list: cmdList, check: cmdCheck, harvest: cmdHarvest, scan: cmdScan, rescore: cmdRescore,
  add: cmdAdd, reduce: cmdReduce, quarantine: cmdQuarantine, ledger: cmdLedger, hooks: cmdHooks,
};

// `hook` must always exit 0, print nothing to stdout, and never block the session.
async function runHook(args, env) {
  try {
    if (env.STORY_HARVEST === '1') return EXIT.OK;
    const { logEvent } = await lib('log.mjs');
    try {
      if (Number(process.versions.node.split('.')[0]) < MIN_NODE) {
        logEvent('hook.node-too-old', { node: process.versions.node });
        return EXIT.OK;
      }
      const { flags, positionals } = parse('hook', args);
      const H = await lib('hook.mjs');
      let stdin = '';
      try { stdin = await H.readStdin(process.stdin); } catch (e) { logEvent('hook.stdin-error', { code: e?.code ?? 'error' }); }
      H.handleHook(positionals[0], stdin, flags, { env, binPath: BIN });
    } catch (e) {
      logEvent(isNotImpl(e) ? 'hook.not-implemented' : 'hook.error', { error: e });
    }
  } catch { /* never fail a hook */ }
  return EXIT.OK;
}

/**
 * @param {string[]} argv arguments after the script path
 * @param {{cwd?: string, env?: NodeJS.ProcessEnv, out?: (s: string) => void, err?: (s: string) => void}} [ctx]
 * @returns {Promise<number>} exit code
 */
export async function main(argv, ctx = {}) {
  const cwd = ctx.cwd || process.cwd();
  const env = ctx.env || process.env;
  const io = {
    out: ctx.out || ((s) => process.stdout.write(s + '\n')),
    err: ctx.err || ((s) => process.stderr.write(s + '\n')),
  };
  const [cmd, ...args] = argv;
  if (cmd === 'hook') return runHook(args, env);

  if (Number(process.versions.node.split('.')[0]) < MIN_NODE) {
    io.err(`momentry cần Node ≥ ${MIN_NODE}, đang chạy ${process.versions.node}`);
    return EXIT.USAGE;
  }
  if (!cmd || cmd === '--help' || cmd === '-h' || cmd === 'help') { io.out(USAGE); return cmd ? EXIT.OK : EXIT.USAGE; }
  const fn = COMMANDS[cmd];
  if (!fn) { io.err(`lệnh lạ: ${cmd}\n\n${USAGE}`); return EXIT.USAGE; }

  try {
    const { flags, positionals } = parse(cmd, args);
    if (flags.help) { io.out(`momentry ${cmd} ${Object.keys(SPEC[cmd]).map((k) => `[--${k}]`).join(' ')}`); return EXIT.OK; }
    return await fn({ flags, positionals, cwd, env, io });
  } catch (e) {
    if (isNotImpl(e)) { io.err(`chưa triển khai: ${cmd}`); return EXIT.USAGE; }
    io.err(e.exitCode !== undefined ? e.message : `lỗi: ${e.stack || e.message}`);
    return Number.isInteger(e.exitCode) ? e.exitCode : EXIT.USAGE;
  }
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(BIN)) {
  process.exitCode = await main(process.argv.slice(2));
}
