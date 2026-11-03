// Agent hosts momentry connects to: hooks + the /bip command for Claude Code and Codex.
// We own exactly the hook entries whose command runs `momentry … hook <event>`, and a bip.md whose
// trailing marker still matches its content. Everything else in those files belongs to the user.
import fs from 'node:fs';
import path from 'node:path';
import { paths } from './paths.mjs';
import { which } from './proc.mjs';
import { render as renderPrompt } from './prompts.mjs';
import { readJsonFile, writeJsonFile, writeOwnedText, sha256 } from './safe-edit.mjs';
import { CliError } from './cli-output.mjs';

/**
 * Per-host adapter (keep in sync with docs/installation.md; host formats last checked 2026-11).
 * @param {NodeJS.ProcessEnv} env
 */
export function hostTable(env = process.env) {
  const p = paths(env);
  return {
    claude: {
      name: 'Claude Code', dir: p.claude, exe: 'claude', flag: '',
      hookFile: path.join(p.claude, 'settings.json'),
      events: { PreCompact: 'pre-compact', SessionEnd: 'session-end', SessionStart: 'session-start' },
      bipFile: path.join(p.claude, 'commands', 'bip.md'),
    },
    codex: {
      name: 'Codex', dir: p.codex, exe: 'codex', flag: ' --codex',
      hookFile: path.join(p.codex, 'hooks.json'),
      events: { pre_compact: 'pre-compact', session_start: 'session-start' },
      bipFile: path.join(p.codex, 'prompts', 'bip.md'),
    },
  };
}

export const HOST_NAMES = ['claude', 'codex'];

/** A hook command is ours when it runs momentry's `hook` verb. */
export const OWN_HOOK = /momentry(?:\.mjs|\.cmd)?["']?\s+hook\s+(pre-compact|session-end|session-start)\b/;

/** Host installed on this machine: its config dir exists or its CLI is on PATH. */
export function detect(name, env = process.env) {
  const h = hostTable(env)[name];
  return fs.existsSync(h.dir) || !!which(h.exe, { env });
}

const hookCommand = (prefix, h, event) => `${prefix} hook ${event}${h.flag}`;

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

/** First quoted path in a command, if any (the executable we registered). */
const targetOf = (cmd) => /^"([^"]+)"/.exec(cmd)?.[1] ?? null;

/**
 * State of our hooks in one host file.
 * @returns {{status: 'ok'|'missing'|'stale'|'broken', detail: string, events: Record<string, string[]>}}
 */
export function inspectHooks(name, prefix, env = process.env) {
  const h = hostTable(env)[name];
  let r;
  try { r = readJsonFile(h.hookFile); } catch (e) { return { status: 'broken', detail: e.message, events: {} }; }
  const hooks = r.data.hooks ?? {};
  const events = {};
  for (const [ev, event] of Object.entries(h.events)) {
    events[ev] = [];
    for (const g of Array.isArray(hooks[ev]) ? hooks[ev] : []) {
      for (const x of Array.isArray(g?.hooks) ? g.hooks : []) {
        const m = typeof x?.command === 'string' ? OWN_HOOK.exec(x.command) : null;
        if (m && m[1] === event) events[ev].push(x.command);
      }
    }
  }
  const all = Object.values(events).flat();
  if (!all.length) return { status: 'missing', detail: `chưa có hook trong ${h.hookFile}`, events };
  const exact = Object.entries(h.events).every(([ev, event]) => events[ev].length === 1 && events[ev][0] === hookCommand(prefix, h, event));
  if (exact) return { status: 'ok', detail: `${all.length} hook trong ${h.hookFile}`, events };
  const dead = all.map(targetOf).filter((t) => t && !fs.existsSync(t));
  const why = dead.length ? `trỏ tới file không còn: ${dead[0]}` : `khác lệnh mong đợi (${hookCommand(prefix, h, Object.values(h.events)[0])})`;
  return { status: 'stale', detail: `hook trong ${h.hookFile} ${why}`, events };
}

/** bip.md marker: last line carries the sha256 of everything above it. */
const BIP_MARK = /\n<!-- momentry:bip sha256=([0-9a-f]{64}) -->\n?$/;

export function bipText(prefix) {
  const body = `${renderPrompt('bip', { bin: prefix })}\n`;
  return `${body}<!-- momentry:bip sha256=${sha256(body)} -->\n`;
}

/** @returns {'ours'|'edited'|'foreign'|'absent'} */
export function bipOwnership(file) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch { return 'absent'; }
  const m = BIP_MARK.exec(text);
  if (!m) return 'foreign';
  return sha256(text.slice(0, m.index + 1)) === m[1] ? 'ours' : 'edited';
}

/** @returns {{status: 'ok'|'missing'|'stale'|'foreign', detail: string}} */
export function inspectBip(name, prefix, env = process.env) {
  const f = hostTable(env)[name].bipFile;
  const own = bipOwnership(f);
  if (own === 'absent') return { status: 'missing', detail: `chưa có ${f}` };
  if (own !== 'ours') return { status: 'foreign', detail: `${f} do bạn viết hoặc đã sửa; momentry không ghi đè` };
  return fs.readFileSync(f, 'utf8') === bipText(prefix) ? { status: 'ok', detail: f } : { status: 'stale', detail: `${f} là bản cũ` };
}

/**
 * Plans (and unless dryRun, applies) connecting or removing one host.
 * @param {'claude'|'codex'} name @param {{prefix: string, remove?: boolean, dryRun?: boolean, env?: NodeJS.ProcessEnv}} o
 * @returns {{host: string, changes: string[], backups: string[], skipped: string[]}}
 */
export function apply(name, o) {
  const env = o.env ?? process.env;
  const h = hostTable(env)[name];
  const changes = [], backups = [], skipped = [];

  const r = readJsonFile(h.hookFile);
  const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
  if (r.data.hooks !== undefined && !isObj(r.data.hooks)) {
    throw new CliError(`khoá "hooks" trong ${h.hookFile} không phải object; momentry không sửa`, { code: 'host-config-malformed', fix: `sửa tay ${h.hookFile}, rồi chạy lại` });
  }
  const hooks = withoutOurs(r.data.hooks);
  if (!o.remove) {
    for (const [ev, event] of Object.entries(h.events)) {
      hooks[ev] = [...(hooks[ev] ?? []), { hooks: [{ type: 'command', command: hookCommand(o.prefix, h, event) }] }];
    }
  }
  const next = { ...r.data };
  if (Object.keys(hooks).length) next.hooks = hooks; else delete next.hooks;
  if (JSON.stringify(next) !== JSON.stringify(r.data)) {
    changes.push(`${o.remove ? 'gỡ' : 'cài'} hook momentry trong ${h.hookFile} (${Object.keys(h.events).join(', ')})`);
    if (!o.dryRun) {
      const w = writeJsonFile(h.hookFile, next, r);
      if (w.backup) backups.push(w.backup);
    }
  }

  const own = bipOwnership(h.bipFile);
  if (o.remove) {
    if (own === 'ours') {
      changes.push(`xoá ${h.bipFile}`);
      if (!o.dryRun) fs.rmSync(h.bipFile);
    } else if (own !== 'absent') skipped.push(`${h.bipFile} không phải bản momentry ghi nguyên vẹn; để nguyên`);
  } else if (own === 'foreign' || own === 'edited') {
    skipped.push(`${h.bipFile} do bạn viết hoặc đã sửa; để nguyên (xoá file đó rồi chạy lại nếu muốn bản của momentry)`);
  } else {
    const text = bipText(o.prefix);
    let cur = null;
    try { cur = fs.readFileSync(h.bipFile, 'utf8'); } catch { /* absent */ }
    if (cur !== text) {
      changes.push(`${cur === null ? 'tạo' : 'cập nhật'} ${h.bipFile} (lệnh /bip)`);
      if (!o.dryRun) {
        const w = writeOwnedText(h.bipFile, text);
        if (w.backup) backups.push(w.backup);
      }
    }
  }
  return { host: name, changes, backups, skipped };
}
