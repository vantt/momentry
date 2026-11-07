// The reminder line an agent session opens with (`momentry hook session-start`): what it counts, how each host gets
// it, silence when there is nothing to say, errors swallowed, speed; and the SessionStart wiring in every host
// (install, migration of an older install, removal). Temp HOME only; no network, no model.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as hosts from '../lib/hosts.mjs';
import { reminderLine, hookOutput } from '../lib/reminder.mjs';
import { checkoutId } from '../lib/ui-api.mjs';
import { writeNew } from '../lib/box.mjs';
import { buildChecks } from '../lib/checks.mjs';
import { run as runChecks } from '../lib/doctor.mjs';
import { sha256 } from '../lib/safe-edit.mjs';
import { today } from '../lib/ledger.mjs';
import { MARKER, CURRENT, shimSh, shimCmd } from '../lib/install.mjs';

const BIN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../bin/momentry.mjs');
const PREFIX = '"/home/u/.local/bin/momentry"';

/** An observed repo with a healthy setup (privacy source, box, private cache) and no host installed. */
function world() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'dm-remind-'));
  const repo = path.join(base, 'repo');
  fs.mkdirSync(path.join(repo, '.git'), { recursive: true });
  fs.writeFileSync(path.join(repo, '.momentry.json'), '{}\n');
  const box = path.join(repo, 'docs', 'storytelling-material');
  fs.mkdirSync(box, { recursive: true });
  const names = path.join(base, 'names.txt');
  fs.writeFileSync(names, 'Bí Mật\n');
  const cache = path.join(base, 'cache');
  fs.mkdirSync(cache, { mode: 0o700 });
  const home = path.join(base, 'home');
  fs.mkdirSync(home);
  const env = { PATH: '', HOME: home, USERPROFILE: home, MOMENTRY_CACHE: cache, MOMENTRY_CONFIG: path.join(base, 'none.json'), MOMENTRY_PRIVACY_SOURCES: names };
  const story = (id, data = {}) => writeNew(box, { id, data: { date: '2026-11-01', status: 'raw', ...data }, body: `\n# ${id}\n` });
  return { base, repo, box, cache, home, env, story };
}

const line = (w, runtime = 'claude') => reminderLine({ root: w.repo, runtime, env: w.env, prefix: PREFIX });

/** Runs the real `momentry hook session-start` (no background scan: nothing to scan, and PATH is empty). */
function hookCli(w, flags = [], payload = { cwd: w.repo, session_id: 'abcdef12-0000' }) {
  return spawnSync(process.execPath, [BIN, 'hook', 'session-start', ...flags], { cwd: w.repo, env: w.env, input: JSON.stringify(payload), encoding: 'utf8' });
}

// ---------- what the line says ----------

test('silence when there is nothing to say', () => {
  const w = world();
  w.story('2026-11-01-da-chon', { status: 'picked' });
  assert.equal(line(w), '');
  const r = hookCli(w);
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '', 'Claude/Codex/pi/omp: no output at all');
  assert.equal(hookCli(w, ['--agy'], { conversationId: 'c1', transcriptPath: '/t', workspacePaths: [w.repo] }).stdout.trim(), '{}', 'Antigravity: an empty JSON object');
});

test('counts new stories (raw and never opened), budget waits of this repo, and problems with a fix', () => {
  const w = world();
  w.story('2026-11-01-moi-mot');
  w.story('2026-11-02-moi-hai');
  w.story('2026-11-03-da-xem');
  w.story('2026-11-03-da-chon', { status: 'picked' });
  fs.writeFileSync(path.join(w.cache, 'ui-state.json'), JSON.stringify({ seen: { [`${checkoutId(w.repo)}/2026-11-03-da-xem`]: '2026-11-04T00:00:00Z' } }));
  fs.writeFileSync(path.join(w.cache, 'budget-wait.json'), JSON.stringify({ day: today(), repos: { [w.repo]: 4, '/other/repo': 9 } }));
  assert.equal(line(w), 'momentry: 2 chuyện mới (/momentry-ui) · 4 phiên chờ ngân sách ngày (momentry scan)');
  // a failing check: no privacy source means every story is held out of the repo
  const broken = { ...w, env: { ...w.env, MOMENTRY_PRIVACY_SOURCES: '' } };
  assert.equal(line(broken), 'momentry: 2 chuyện mới (/momentry-ui) · 4 phiên chờ ngân sách ngày (momentry scan) · 1 lỗi cần sửa (momentry doctor)');
});

test('budget waits from another day are not reported (that budget is spent already)', () => {
  const w = world();
  fs.writeFileSync(path.join(w.cache, 'budget-wait.json'), JSON.stringify({ day: '2000-01-01', repos: { [w.repo]: 4 } }));
  assert.equal(line(w), '');
});

test('the story command is named the way each host calls it', () => {
  const w = world();
  w.story('2026-11-01-moi');
  const want = { claude: '/momentry-ui', codex: '$momentry-ui', pi: '/momentry-ui', omp: '/momentry-ui', agy: '/momentry-ui' };
  for (const [host, cmd] of Object.entries(want)) {
    assert.equal(hosts.commandName(host, 'momentry-ui'), cmd);
    assert.equal(line(w, host), `momentry: 1 chuyện mới (${cmd})`, host);
  }
});

test('a host that needs repair counts as a problem (an older install without the reminder)', () => {
  const w = world();
  fs.mkdirSync(path.join(w.home, '.claude'));
  assert.equal(line(w), 'momentry: 1 lỗi cần sửa (momentry doctor)', 'host present, not connected: connect is the fix');
  hosts.apply('claude', { prefix: PREFIX, env: w.env });
  assert.equal(line(w), '');
});

test('an installed copy whose shim is gone counts as a problem; a PATH without the shim dir does not', () => {
  const w = world();
  const app = path.join(w.base, 'app');
  const running = path.join(app, 'versions', 'v9.9.9');
  fs.mkdirSync(running, { recursive: true });
  fs.writeFileSync(path.join(app, MARKER), '{"version":"9.9.9"}\n');
  fs.writeFileSync(path.join(app, CURRENT), 'v9.9.9\n');
  const env = { ...w.env, MOMENTRY_HOME: app, MOMENTRY_INSTALL_DIR: path.join(w.base, 'bin') };
  const at = (install) => reminderLine({ root: w.repo, runtime: 'claude', env, prefix: PREFIX, install });
  // the host's own platform: paths are resolved with its path rules
  const here = { root: running, platform: process.platform };
  assert.equal(at(here), 'momentry: 1 lỗi cần sửa (momentry doctor)', 'the hooks call a shim that is not there');
  fs.mkdirSync(path.join(w.base, 'bin'));
  fs.writeFileSync(path.join(w.base, 'bin', 'momentry'), shimSh(app));
  if (process.platform === 'win32') fs.writeFileSync(path.join(w.base, 'bin', 'momentry.cmd'), shimCmd(app));
  assert.equal(at(here), '', 'shim back; PATH (empty here) is not checked');
  fs.rmSync(path.join(w.base, 'bin'), { recursive: true });
  assert.equal(at(undefined), '', 'a source checkout has no shim to miss');
});

// ---------- how each host gets it ----------

test('hookOutput: the format each host injects', () => {
  const l = 'momentry: 1 chuyện mới (/momentry-ui)';
  for (const host of ['claude', 'codex']) {
    const j = JSON.parse(hookOutput(host, l));
    assert.deepEqual(j, { systemMessage: l, hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: l } }, host);
  }
  assert.deepEqual(JSON.parse(hookOutput('agy', l)), { injectSteps: [{ systemMessage: { systemMessage: l, metadata: { user_markdown: l } } }] });
  assert.equal(hookOutput('pi', l), l);
  assert.equal(hookOutput('omp', l), l);
  assert.match(hookOutput('claude', l), /^[\x20-\x7e]+$/, 'pure ASCII JSON: a Windows code page cannot garble it');
  assert.equal(hookOutput('claude', ''), '');
  assert.equal(hookOutput('pi', ''), '');
  assert.equal(hookOutput('agy', ''), '{}');
});

test('CLI: one line per host format; nothing after a compaction or an extension reload', () => {
  const w = world();
  w.story('2026-11-01-moi');
  const want = 'momentry: 1 chuyện mới (/momentry-ui)';
  let r = hookCli(w);
  assert.equal(r.status, 0);
  assert.equal(r.stdout.trim().split('\n').length, 1, 'a single line');
  assert.equal(JSON.parse(r.stdout).hookSpecificOutput.additionalContext, want);
  r = hookCli(w, ['--codex']);
  assert.equal(JSON.parse(r.stdout).systemMessage, 'momentry: 1 chuyện mới ($momentry-ui)');
  assert.equal(hookCli(w, ['--pi']).stdout.trim(), want);
  assert.equal(JSON.parse(hookCli(w, ['--agy'], { conversationId: 'c1', transcriptPath: '/t', workspacePaths: [w.repo] }).stdout).injectSteps[0].systemMessage.systemMessage, want);
  assert.equal(hookCli(w, [], { cwd: w.repo, source: 'compact' }).stdout, '');
  assert.equal(hookCli(w, ['--omp'], { cwd: w.repo, source: 'reload' }).stdout, '');
  assert.equal(hookCli(w, [], { cwd: w.repo, source: 'startup' }).stdout.trim().length > 0, true);
});

test('CLI: only the session repo, and only when it is observed', () => {
  const w = world();
  w.story('2026-11-01-moi');
  const other = path.join(w.base, 'other');
  fs.mkdirSync(path.join(other, '.git'), { recursive: true });
  const r = hookCli(w, [], { cwd: other });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '', 'unobserved repo: silent, even though another repo has news');
});

test('CLI: errors are swallowed, logged, and the session still starts', () => {
  const w = world();
  fs.rmSync(w.box, { recursive: true });
  fs.writeFileSync(w.box, 'not a folder');
  const r = hookCli(w);
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '');
  assert.match(fs.readFileSync(path.join(w.cache, 'hook.log'), 'utf8'), /hook\.reminder-error/);
  const a = hookCli(w, ['--agy'], { conversationId: 'c1', transcriptPath: '/t', workspacePaths: [w.repo] });
  assert.equal(a.stdout.trim(), '{}', 'Antigravity still gets its JSON object');
  const bad = spawnSync(process.execPath, [BIN, 'hook', 'session-start', '--agy'], { cwd: w.repo, env: w.env, input: '{not json', encoding: 'utf8' });
  assert.equal(bad.status, 0);
  assert.equal(bad.stdout.trim(), '{}');
});

test('speed: the line for a box of 300 stories takes well under 150 ms', () => {
  const w = world();
  for (let i = 0; i < 300; i++) w.story(`2026-10-01-chuyen-${i}`);
  fs.mkdirSync(path.join(w.home, '.claude'));
  hosts.apply('claude', { prefix: PREFIX, env: w.env });
  line(w); // warm the module cache, as the hook process has by then
  const t = process.hrtime.bigint();
  const l = line(w);
  const ms = Number(process.hrtime.bigint() - t) / 1e6;
  assert.equal(l, 'momentry: 300 chuyện mới (/momentry-ui)');
  assert.ok(ms < 150, `took ${ms.toFixed(1)} ms`);
  // whole process (node start, imports, hook): generous bound for slow CI machines
  const t2 = Date.now();
  assert.equal(hookCli(w).status, 0);
  assert.ok(Date.now() - t2 < 2000, `hook process took ${Date.now() - t2} ms`);
});

// ---------- SessionStart wiring per host ----------

function machine() {
  const h = fs.mkdtempSync(path.join(os.tmpdir(), 'dm-remind-hosts-'));
  for (const d of ['.claude', '.codex', '.pi/agent', '.omp/agent', '.gemini']) fs.mkdirSync(path.join(h, d), { recursive: true });
  return { h, env: { HOME: h, USERPROFILE: h, PATH: '' }, p: (...x) => path.join(h, ...x) };
}

test('connect wires session start in every host', () => {
  const { env, p } = machine();
  for (const n of hosts.HOST_NAMES) hosts.apply(n, { prefix: PREFIX, env });
  const json = (f) => JSON.parse(fs.readFileSync(p(f), 'utf8'));
  assert.equal(json('.claude/settings.json').hooks.SessionStart[0].hooks[0].command, `${PREFIX} hook session-start`);
  assert.equal(json('.codex/hooks.json').hooks.SessionStart[0].hooks[0].command, `${PREFIX} hook session-start --codex`);
  assert.equal(json('.gemini/config/hooks.json').momentry.SessionStart[0].command, `${PREFIX} hook session-start --agy`);
  for (const ext of ['.pi/agent/extensions/momentry.ts', '.omp/agent/extensions/momentry.ts']) {
    const ts = fs.readFileSync(p(ext), 'utf8');
    assert.match(ts, /pi\.on\("session_start", \(event: any, ctx: any\) => \{ fire\("session-start", ctx, event\?\.reason\); \}\)/, ext);
    assert.match(ts, /stdio: \["pipe", start \? "pipe" : "ignore", "ignore"\]/, 'stdout is read only at session start');
    assert.match(ts, /ctx\?\.ui\?\.notify\?\.\(line, "info"\)/, 'the line is shown to the user');
  }
});

test('migration: doctor --fix adds the missing SessionStart hook and refreshes an older pi/omp extension, without asking', async () => {
  const { env, p } = machine();
  for (const n of ['claude', 'pi']) hosts.apply(n, { prefix: PREFIX, env });
  // an older install: Claude hooked only PreCompact and SessionEnd; pi has an extension without the reminder
  const settings = JSON.parse(fs.readFileSync(p('.claude/settings.json'), 'utf8'));
  delete settings.hooks.SessionStart;
  settings.hooks.Stop = [{ hooks: [{ type: 'command', command: 'my-own-hook' }] }];
  fs.writeFileSync(p('.claude/settings.json'), JSON.stringify(settings));
  const old = 'export default function (pi: any) {}\n';
  fs.writeFileSync(p('.pi/agent/extensions/momentry.ts'), `${old}// momentry:ext sha256=${sha256(old)}\n`);
  assert.equal(hosts.inspect('claude', PREFIX, env).status, 'stale', 'connected profile: stale, so no consent is needed');
  assert.equal(hosts.inspect('pi', PREFIX, env).status, 'stale');

  const ctx = { cwd: p(), env, prefix: PREFIX, platform: process.platform, quick: true };
  const checks = buildChecks(ctx).filter((c) => c.code === 'host.claude' || c.code === 'host.pi');
  const r = await runChecks(checks, ctx, { fix: true });
  assert.deepEqual(r.results.map((x) => x.status), ['ok', 'ok'], JSON.stringify(r.results));
  const after = JSON.parse(fs.readFileSync(p('.claude/settings.json'), 'utf8'));
  assert.equal(after.hooks.SessionStart[0].hooks[0].command, `${PREFIX} hook session-start`);
  assert.equal(after.hooks.Stop[0].hooks[0].command, 'my-own-hook', 'user hooks kept');
  assert.match(fs.readFileSync(p('.pi/agent/extensions/momentry.ts'), 'utf8'), /ui\?\.notify/);
});

test('removal takes the SessionStart hook out of every host and keeps the user\'s own hooks', () => {
  const { env, p } = machine();
  fs.writeFileSync(p('.claude/settings.json'), JSON.stringify({ hooks: { SessionStart: [{ hooks: [{ type: 'command', command: 'my-start' }] }] } }));
  for (const n of hosts.HOST_NAMES) hosts.apply(n, { prefix: PREFIX, env });
  for (const n of hosts.HOST_NAMES) hosts.apply(n, { prefix: PREFIX, env, remove: true });
  const claude = JSON.parse(fs.readFileSync(p('.claude/settings.json'), 'utf8'));
  assert.deepEqual(claude.hooks, { SessionStart: [{ hooks: [{ type: 'command', command: 'my-start' }] }] });
  assert.equal(JSON.parse(fs.readFileSync(p('.codex/hooks.json'), 'utf8')).hooks, undefined);
  assert.equal(JSON.parse(fs.readFileSync(p('.gemini/config/hooks.json'), 'utf8')).momentry, undefined);
  assert.ok(!fs.existsSync(p('.pi/agent/extensions/momentry.ts')));
  assert.ok(!fs.existsSync(p('.omp/agent/extensions/momentry.ts')));
});
