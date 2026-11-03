// Agent hosts momentry connects to, in every profile found (lib/profiles.mjs):
// - Claude Code, Codex: hook entries in settings.json / hooks.json ({matcher-less group: {hooks: [...]}} per event)
// - pi, omp: a TypeScript extension <agentDir>/extensions/momentry.ts (they have no shell-command hooks)
// - Antigravity: a named group "momentry" in <gemini>/config/hooks.json (SessionStart only, user decision 2026-11-03)
// plus a /bip command file per host. We own exactly: hook entries whose command runs `momentry … hook <event>`,
// the "momentry" group, and files whose trailing `momentry:<tag> sha256=…` marker still matches their content.
// Everything else in those files belongs to the user.
import fs from 'node:fs';
import path from 'node:path';
import { paths, homeOf } from './paths.mjs';
import { which } from './proc.mjs';
import { hostRoots } from './profiles.mjs';
import { installState } from './install.mjs';
import { ROOT } from './version.mjs';
import { render as renderPrompt } from './prompts.mjs';
import { readJsonFile, writeJsonFile, writeOwnedText, sha256 } from './safe-edit.mjs';
import { CliError } from './cli-output.mjs';

export const HOST_NAMES = ['claude', 'codex', 'pi', 'omp', 'agy'];
export const LABELS = { claude: 'Claude Code', codex: 'Codex', pi: 'pi', omp: 'omp (oh-my-pi)', agy: 'Antigravity' };
const EXE = { claude: 'claude', codex: 'codex', pi: 'pi', omp: 'omp', agy: 'agy' };
const LIFECYCLE = { PreCompact: 'pre-compact', SessionEnd: 'session-end', SessionStart: 'session-start' };

/** A hook command is ours when it runs momentry's `hook` verb. */
export const OWN_HOOK = /momentry(?:\.mjs|\.cmd)?["']?\s+hook\s+(pre-compact|session-end|session-start)\b/;
/** Antigravity group key we own in hooks.json. */
export const AGY_GROUP = 'momentry';

/** Default config dir of a host (where it would be created when only the CLI exists). */
function defaultRoot(name, env) {
  const p = paths(env);
  const home = homeOf(env);
  return {
    claude: p.claude,
    codex: p.codex,
    pi: env.PI_CODING_AGENT_DIR ? path.resolve(env.PI_CODING_AGENT_DIR) : path.join(home, '.pi', 'agent'),
    omp: path.join(home, '.omp', 'agent'),
    agy: path.join(home, '.gemini'),
  }[name];
}

/**
 * What momentry installs into one config dir of one host.
 * kind 'groups': events in <hookFile>.hooks; 'named': group AGY_GROUP in <hookFile>; 'files': only owned files.
 * @param {string} name @param {string} root
 */
export function target(name, root) {
  const j = (...p) => path.join(root, ...p);
  switch (name) {
    case 'claude': return { host: name, root, kind: 'groups', hookFile: j('settings.json'), events: LIFECYCLE, flag: '', files: [{ file: j('commands', 'bip.md'), make: 'bip' }] };
    // Codex hooks.json uses PascalCase event keys (codex-rs/protocol/src/hooks.rs HookEventsToml); snake_case is ignored.
    case 'codex': return { host: name, root, kind: 'groups', hookFile: j('hooks.json'), events: LIFECYCLE, flag: ' --codex', files: [{ file: j('prompts', 'bip.md'), make: 'bip' }] };
    case 'pi': return { host: name, root, kind: 'files', flag: ' --pi', files: [{ file: j('extensions', 'momentry.ts'), make: 'ext' }, { file: j('prompts', 'bip.md'), make: 'bip' }] };
    case 'omp': return { host: name, root, kind: 'files', flag: ' --omp', files: [{ file: j('extensions', 'momentry.ts'), make: 'ext' }, { file: j('commands', 'bip.md'), make: 'bip' }] };
    case 'agy': return { host: name, root, kind: 'named', hookFile: j('config', 'hooks.json'), events: { SessionStart: 'session-start' }, flag: ' --agy', files: [{ file: j('config', 'skills', 'bip', 'SKILL.md'), make: 'agy-bip' }] };
    default: throw new CliError(`host lạ: ${name}`, { exitCode: 2 });
  }
}

/** Install targets of a host: every existing profile dir; the default dir when only the CLI is on PATH. */
export function targets(name, env = process.env) {
  const roots = hostRoots(name, env);
  if (roots.length) return roots.map((r) => target(name, r));
  return which(EXE[name], { env }) ? [target(name, defaultRoot(name, env))] : [];
}

/** Host present on this machine (a config dir or its CLI). */
export function detect(name, env = process.env) {
  return targets(name, env).length > 0;
}

/** Default-profile view of every host (tests, docs). @param {NodeJS.ProcessEnv} [env] */
export function hostTable(env = process.env) {
  return Object.fromEntries(HOST_NAMES.map((n) => {
    const t = target(n, defaultRoot(n, env));
    return [n, { ...t, name: LABELS[n], dir: t.root, bipFile: t.files.find((f) => f.make !== 'ext').file }];
  }));
}

// ---------- owned files (bip.md, SKILL.md, momentry.ts) ----------

const MARK_RE = /\n(?:<!-- |\/\/ )momentry:[a-z-]+ sha256=([0-9a-f]{64})(?: -->)?\n?$/;

function owned(body, tag, style) {
  const b = body.endsWith('\n') ? body : `${body}\n`;
  return `${b}${style === 'ts' ? `// momentry:${tag} sha256=${sha256(b)}` : `<!-- momentry:${tag} sha256=${sha256(b)} -->`}\n`;
}

/** @returns {'ours'|'edited'|'foreign'|'absent'} */
export function bipOwnership(file) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch { return 'absent'; }
  const m = MARK_RE.exec(text);
  if (!m) return 'foreign';
  return sha256(text.slice(0, m.index + 1)) === m[1] ? 'ours' : 'edited';
}

/** The /bip command body for a prefix. An installed Windows shim is called by name (the agent's shell may be PowerShell). */
function bipBody(prefix) {
  const bin = /momentry\.cmd"$/.test(prefix) ? 'momentry' : prefix;
  return `${renderPrompt('bip', { bin })}\n`;
}

export function bipText(prefix) {
  return owned(bipBody(prefix), 'bip', 'md');
}

/** Antigravity skill: needs name + disable-model-invocation (else the model may run it on its own); no $ARGUMENTS. */
export function agyBipText(prefix) {
  const body = bipBody(prefix).replace(/^---\n[\s\S]*?\n---\n/, '').replace(/\$ARGUMENTS/g, '(phần chữ user gõ sau /bip, nếu có)');
  const fm = ['---', 'name: bip', 'description: Ghi lại khoảnh khắc vừa rồi vào hộp chuyện (momentry). Chỉ chạy khi user gõ /bip.', 'disable-model-invocation: true', '---', ''].join('\n');
  return owned(fm + body, 'bip', 'md');
}

/** How the extension starts momentry: the installed shim, else node + this bin (source checkout). */
function invocation(env) {
  const st = installState(env);
  const managed = st.managed && st.running;
  return {
    shim: managed ? st.shims.find((s) => !s.endsWith('.cmd')) ?? null : null,
    shimCmd: managed ? st.shims.find((s) => s.endsWith('.cmd')) ?? null : null,
    node: process.execPath,
    bin: path.join(ROOT, 'bin', 'momentry.mjs'),
  };
}

/** pi/omp extension: forwards session_start / session_before_compact / session_shutdown to `momentry hook`. */
export function extensionText(host, env = process.env) {
  const inv = invocation(env);
  const J = (v) => JSON.stringify(v);
  const src = `// momentry extension for ${host}: written by \`momentry connect ${host}\`; \`momentry connect --remove\` deletes it.
// If you edit this file momentry leaves it alone (delete it to get momentry's version back).
// Never blocks or fails the session: momentry runs detached and every error is swallowed.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

const HOST = ${J(host)};
const SHIM = ${J(inv.shim)};         // installed shim (POSIX; Git Bash on Windows)
const SHIM_CMD = ${J(inv.shimCmd)};  // installed shim for cmd.exe (Windows)
const NODE = ${J(inv.node)};         // source checkout: node + bin (omp runs on Bun, so not process.execPath)
const BIN = ${J(inv.bin)};

function command(args: string[]): [string, string[], Record<string, unknown>] {
  if (process.platform === "win32" && SHIM_CMD && existsSync(SHIM_CMD)) {
    return [process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", \`""\${SHIM_CMD}" \${args.join(" ")}"\`], { windowsVerbatimArguments: true }];
  }
  if (process.platform !== "win32" && SHIM && existsSync(SHIM)) return [SHIM, args, {}];
  return [existsSync(NODE) ? NODE : "node", [BIN, ...args], {}];
}

function fire(event: string, ctx: any): void {
  if (process.env.STORY_HARVEST === "1") return;
  try {
    const sm = ctx?.sessionManager;
    const file = sm?.getSessionFile?.();
    if (event !== "session-start" && (!file || !existsSync(file))) return; // nothing written yet
    const payload = JSON.stringify({ session_id: sm?.getSessionId?.(), transcript_path: file, cwd: ctx?.cwd });
    const [cmd, args, extra] = command(["hook", event, \`--\${HOST}\`]);
    const child = spawn(cmd, args, { detached: true, stdio: ["pipe", "ignore", "ignore"], windowsHide: true, ...extra });
    child.on("error", () => {});
    child.stdin?.on("error", () => {});
    child.stdin?.end(payload);
    child.unref();
  } catch {
    // never break the session
  }
}

export default function (pi: any) {
  pi.on("session_start", (_event: any, ctx: any) => { fire("session-start", ctx); });
  pi.on("session_before_compact", (_event: any, ctx: any) => { fire("pre-compact", ctx); });
  pi.on("session_shutdown", (event: any, ctx: any) => { if (event?.reason !== "reload") fire("session-end", ctx); });
}
`;
  return owned(src, 'ext', 'ts');
}

function fileText(make, t, prefix, env) {
  if (make === 'ext') return extensionText(t.host, env);
  if (make === 'agy-bip') return agyBipText(prefix);
  return bipText(prefix);
}

// ---------- hook config files ----------

/**
 * Codex runs hooks with the session's own shell (PowerShell on Windows by default, codex-rs/core session
 * build_hooks_config), where a command starting with a quoted path is a string, not a call. So for Codex the
 * Windows shim goes unquoted (fine in PowerShell, cmd and bash), or by name from PATH when its path has spaces.
 */
function hookPrefix(prefix, t) {
  if (t.host !== 'codex' || !/momentry\.cmd"$/.test(prefix)) return prefix;
  const bare = prefix.slice(1, -1);
  return /\s/.test(bare) ? 'momentry' : bare;
}

const hookCommand = (prefix, t, event) => `${hookPrefix(prefix, t)} hook ${event}${t.flag}`;
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

/** Removes our entries for every event; returns a new hooks object (empty groups and events dropped). */
function withoutOurs(hooks) {
  const out = {};
  for (const [ev, groups] of Object.entries(hooks ?? {})) {
    if (!Array.isArray(groups)) { out[ev] = groups; continue; }
    const kept = [];
    for (const g of groups) {
      if (!g || typeof g !== 'object' || !Array.isArray(g.hooks)) { kept.push(g); continue; }
      const hs = g.hooks.filter((x) => !(typeof x?.command === 'string' && OWN_HOOK.test(x.command)));
      if (hs.length === g.hooks.length) kept.push(g);
      else if (hs.length) kept.push({ ...g, hooks: hs });
    }
    if (kept.length) out[ev] = kept;
  }
  return out;
}

const agyGroup = (prefix, t) => Object.fromEntries(Object.entries(t.events).map(([ev, event]) => [ev, [{ type: 'command', command: hookCommand(prefix, t, event), timeout: 10 }]]));

/** First quoted path in a command, if any (the executable we registered). */
const targetOf = (cmd) => /^"([^"]+)"/.exec(cmd)?.[1] ?? null;

/** State of our hooks in one target's hook file. */
function inspectHookFile(t, prefix) {
  if (t.kind === 'files') return { status: 'ok', detail: '' };
  let r;
  try { r = readJsonFile(t.hookFile); } catch (e) { return { status: 'broken', detail: e.message }; }
  if (t.kind === 'named') {
    const g = r.data[AGY_GROUP];
    if (g === undefined) return { status: 'missing', detail: `chưa có hook trong ${t.hookFile}` };
    return JSON.stringify(g) === JSON.stringify(agyGroup(prefix, t)) ? { status: 'ok', detail: `hook trong ${t.hookFile}` } : { status: 'stale', detail: `hook trong ${t.hookFile} khác bản mong đợi` };
  }
  const hooks = r.data.hooks ?? {};
  const events = {};
  for (const [ev, event] of Object.entries(t.events)) {
    events[ev] = [];
    for (const g of Array.isArray(hooks[ev]) ? hooks[ev] : []) {
      for (const x of Array.isArray(g?.hooks) ? g.hooks : []) {
        const m = typeof x?.command === 'string' ? OWN_HOOK.exec(x.command) : null;
        if (m && m[1] === event) events[ev].push(x.command);
      }
    }
  }
  const all = Object.values(events).flat();
  if (!all.length) return { status: 'missing', detail: `chưa có hook trong ${t.hookFile}` };
  const exact = Object.entries(t.events).every(([ev, event]) => events[ev].length === 1 && events[ev][0] === hookCommand(prefix, t, event));
  if (exact) return { status: 'ok', detail: `${all.length} hook trong ${t.hookFile}` };
  const dead = all.map(targetOf).filter((x) => x && !fs.existsSync(x));
  const why = dead.length ? `trỏ tới file không còn: ${dead[0]}` : `khác lệnh mong đợi (${hookCommand(prefix, t, Object.values(t.events)[0])})`;
  return { status: 'stale', detail: `hook trong ${t.hookFile} ${why}` };
}

/** State of one owned file. @returns {{status: 'ok'|'missing'|'stale'|'foreign', detail: string}} */
function inspectFile(f, t, prefix, env) {
  const own = bipOwnership(f.file);
  if (own === 'absent') return { status: 'missing', detail: `chưa có ${f.file}` };
  if (own !== 'ours') return { status: 'foreign', detail: `${f.file} do bạn viết hoặc đã sửa; momentry không ghi đè` };
  return fs.readFileSync(f.file, 'utf8') === fileText(f.make, t, prefix, env) ? { status: 'ok', detail: f.file } : { status: 'stale', detail: `${f.file} là bản cũ` };
}

const RANK = { broken: 4, missing: 3, stale: 2, foreign: 1, ok: 0 };

/**
 * State of a host across all its targets: worst status, plus the profiles still missing something.
 * @returns {{status: 'ok'|'missing'|'stale'|'broken'|'foreign', detail: string, targets: number, missing: string[]}}
 */
export function inspect(name, prefix, env = process.env) {
  const ts = targets(name, env);
  const parts = [];
  const missing = [];
  for (const t of ts) {
    const rs = [inspectHookFile(t, prefix), ...t.files.map((f) => inspectFile(f, t, prefix, env))];
    if (rs.some((r) => r.status === 'missing')) missing.push(t.root);
    parts.push(...rs.filter((r) => r.status !== 'ok'));
  }
  const worst = parts.reduce((w, r) => (RANK[r.status] > RANK[w] ? r.status : w), 'ok');
  const detail = worst === 'ok' ? `${ts.length} profile đã cài` : parts.filter((r) => r.status === worst).map((r) => r.detail).slice(0, 3).join('; ') + (missing.length > 1 ? ` (+${missing.length} profile chưa cài)` : '');
  return { status: worst, detail, targets: ts.length, missing };
}

/** Default-profile hook state (kept for callers and tests that look at one profile). */
export function inspectHooks(name, prefix, env = process.env) {
  return inspectHookFile(target(name, targets(name, env)[0]?.root ?? defaultRoot(name, env)), prefix);
}

/** Default-profile /bip state. */
export function inspectBip(name, prefix, env = process.env) {
  const t = target(name, targets(name, env)[0]?.root ?? defaultRoot(name, env));
  return inspectFile(t.files.find((f) => f.make !== 'ext'), t, prefix, env);
}

function applyHookFile(t, o, changes, backups) {
  if (t.kind === 'files') return;
  const r = readJsonFile(t.hookFile);
  let next;
  if (t.kind === 'named') {
    next = { ...r.data };
    if (o.remove) delete next[AGY_GROUP]; else next[AGY_GROUP] = agyGroup(o.prefix, t);
  } else {
    if (r.data.hooks !== undefined && !isObj(r.data.hooks)) {
      throw new CliError(`khoá "hooks" trong ${t.hookFile} không phải object; momentry không sửa`, { code: 'host-config-malformed', fix: `sửa tay ${t.hookFile}, rồi chạy lại` });
    }
    const hooks = withoutOurs(r.data.hooks);
    if (!o.remove) for (const [ev, event] of Object.entries(t.events)) hooks[ev] = [...(hooks[ev] ?? []), { hooks: [{ type: 'command', command: hookCommand(o.prefix, t, event) }] }];
    next = { ...r.data };
    if (Object.keys(hooks).length) next.hooks = hooks; else delete next.hooks;
  }
  if (JSON.stringify(next) === JSON.stringify(r.data)) return;
  changes.push(`${o.remove ? 'gỡ' : 'cài'} hook momentry trong ${t.hookFile} (${Object.keys(t.events).join(', ')})`);
  if (o.dryRun) return;
  const w = writeJsonFile(t.hookFile, next, r);
  if (w.backup) backups.push(w.backup);
}

function applyFile(f, t, o, env, changes, backups, skipped) {
  const own = bipOwnership(f.file);
  if (o.remove) {
    if (own === 'ours') { changes.push(`xoá ${f.file}`); if (!o.dryRun) fs.rmSync(f.file); }
    else if (own !== 'absent') skipped.push(`${f.file} không phải bản momentry ghi nguyên vẹn; để nguyên`);
    return;
  }
  if (own === 'foreign' || own === 'edited') { skipped.push(`${f.file} do bạn viết hoặc đã sửa; để nguyên (xoá file đó rồi chạy lại nếu muốn bản của momentry)`); return; }
  const text = fileText(f.make, t, o.prefix, env);
  let cur = null;
  try { cur = fs.readFileSync(f.file, 'utf8'); } catch { /* absent */ }
  if (cur === text) return;
  changes.push(`${cur === null ? 'tạo' : 'cập nhật'} ${f.file}${f.make === 'ext' ? ' (extension)' : ' (lệnh /bip)'}`);
  if (o.dryRun) return;
  const w = writeOwnedText(f.file, text);
  if (w.backup) backups.push(w.backup);
}

/**
 * Plans (and unless dryRun, applies) connecting or removing one host in every profile.
 * @param {string} name @param {{prefix: string, remove?: boolean, dryRun?: boolean, env?: NodeJS.ProcessEnv}} o
 * @returns {{host: string, changes: string[], backups: string[], skipped: string[]}}
 */
export function apply(name, o) {
  const env = o.env ?? process.env;
  const changes = [], backups = [], skipped = [];
  for (const t of targets(name, env)) {
    applyHookFile(t, o, changes, backups);
    for (const f of t.files) applyFile(f, t, o, env, changes, backups, skipped);
  }
  return { host: name, changes, backups, skipped };
}
