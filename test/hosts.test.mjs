// connect / hook ownership: surgical edits of ~/.claude/settings.json and ~/.codex/hooks.json in a temp HOME.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as hosts from '../lib/hosts.mjs';
import { readJsonFile, writeJsonFile } from '../lib/safe-edit.mjs';

const PREFIX = '"/home/u/.local/bin/momentry"';

function home() {
  const h = fs.mkdtempSync(path.join(os.tmpdir(), 'dm-hosts-'));
  fs.mkdirSync(path.join(h, '.claude'));
  return { h, env: { HOME: h, PATH: '' }, settings: path.join(h, '.claude', 'settings.json') };
}

test('connect keeps the user\'s hooks, adds ours once, backs up, keeps mode; remove restores', () => {
  const { env, settings } = home();
  const user = { model: 'opus', hooks: { SessionEnd: [{ hooks: [{ type: 'command', command: 'say bye' }] }] } };
  fs.writeFileSync(settings, JSON.stringify(user, null, 4), { mode: 0o600 });
  assert.equal(hosts.detect('claude', env), true);
  assert.equal(hosts.inspectHooks('claude', PREFIX, env).status, 'missing');

  const dry = hosts.apply('claude', { prefix: PREFIX, dryRun: true, env });
  assert.equal(dry.changes.length, 4, 'hooks, momentry-bip, momentry-ui, the momentry skill');
  assert.deepEqual(JSON.parse(fs.readFileSync(settings, 'utf8')), user, 'dry run writes nothing');

  const r = hosts.apply('claude', { prefix: PREFIX, env });
  assert.equal(r.backups.length, 1);
  assert.deepEqual(JSON.parse(fs.readFileSync(r.backups[0], 'utf8')), user);
  const after = JSON.parse(fs.readFileSync(settings, 'utf8'));
  assert.equal(after.model, 'opus');
  assert.equal(after.hooks.SessionEnd.length, 2);
  assert.equal(after.hooks.SessionEnd[0].hooks[0].command, 'say bye');
  assert.equal(after.hooks.PreCompact[0].hooks[0].command, `${PREFIX} hook pre-compact`);
  assert.match(fs.readFileSync(settings, 'utf8'), /^ {4}"model"/m, 'indentation kept');
  if (process.platform !== 'win32') assert.equal(fs.statSync(settings).mode & 0o777, 0o600);
  assert.equal(hosts.inspectHooks('claude', PREFIX, env).status, 'ok');
  assert.equal(hosts.inspectBip('claude', PREFIX, env).status, 'ok');

  assert.deepEqual(hosts.apply('claude', { prefix: PREFIX, env }).changes, [], 'idempotent');

  hosts.apply('claude', { prefix: PREFIX, remove: true, env });
  assert.deepEqual(JSON.parse(fs.readFileSync(settings, 'utf8')), user);
  assert.equal(fs.existsSync(hosts.hostTable(env).claude.bipFile), false);
});

test('old-style hooks (node + bin path) are detected as stale and replaced, not duplicated', () => {
  const { env, settings } = home();
  const old = '"/gone/node" "/old/momentry/bin/momentry.mjs" hook session-end';
  fs.writeFileSync(settings, JSON.stringify({ hooks: { SessionEnd: [{ hooks: [{ type: 'command', command: old }] }] } }));
  const s = hosts.inspectHooks('claude', PREFIX, env);
  assert.equal(s.status, 'stale');
  assert.match(s.detail, /\/gone\/node/);
  hosts.apply('claude', { prefix: PREFIX, env });
  const after = JSON.parse(fs.readFileSync(settings, 'utf8'));
  assert.deepEqual(after.hooks.SessionEnd.map((g) => g.hooks[0].command), [`${PREFIX} hook session-end`]);
});

test('malformed settings.json is refused, never overwritten', () => {
  const { env, settings } = home();
  fs.writeFileSync(settings, '{ "hooks": ');
  assert.equal(hosts.inspectHooks('claude', PREFIX, env).status, 'broken');
  assert.throws(() => hosts.apply('claude', { prefix: PREFIX, env }), /không phải JSON hợp lệ/);
  assert.equal(fs.readFileSync(settings, 'utf8'), '{ "hooks": ');
});

test('a symlinked settings.json (dotfile manager) stays a link; the target is edited', { skip: process.platform === 'win32' && 'symlinks need privileges' }, () => {
  const { h, env, settings } = home();
  const managed = path.join(h, 'dotfiles-settings.json');
  fs.writeFileSync(managed, '{"model":"opus"}');
  fs.symlinkSync(managed, settings);
  hosts.apply('claude', { prefix: PREFIX, env });
  assert.ok(fs.lstatSync(settings).isSymbolicLink());
  assert.equal(JSON.parse(fs.readFileSync(managed, 'utf8')).hooks.SessionEnd.length, 1);
});

test('a "hooks" key that is not an object is refused', () => {
  const { env, settings } = home();
  fs.writeFileSync(settings, '{"hooks":[1,2]}');
  assert.throws(() => hosts.apply('claude', { prefix: PREFIX, env }), /không phải object/);
  assert.equal(fs.readFileSync(settings, 'utf8'), '{"hooks":[1,2]}');
});

test('a file changed between read and write is not overwritten', () => {
  const { settings } = home();
  fs.writeFileSync(settings, '{}');
  const r = readJsonFile(settings);
  fs.writeFileSync(settings, '{"changed":true}');
  assert.throws(() => writeJsonFile(settings, { a: 1 }, r), /vừa bị chương trình khác sửa/);
  assert.equal(fs.readFileSync(settings, 'utf8'), '{"changed":true}');
});

test('bip.md: ours is updated, edited or foreign files are left alone', () => {
  const { env } = home();
  const bip = hosts.hostTable(env).claude.bipFile;
  hosts.apply('claude', { prefix: PREFIX, env });
  assert.equal(hosts.bipOwnership(bip), 'ours');
  assert.match(fs.readFileSync(bip, 'utf8'), /^---\ndescription:/, 'frontmatter stays first');
  assert.match(fs.readFileSync(bip, 'utf8'), /"\/home\/u\/\.local\/bin\/momentry" add --by human/);
  hosts.apply('claude', { prefix: '"/new/momentry"', env });
  assert.match(fs.readFileSync(bip, 'utf8'), /"\/new\/momentry" add/);
  fs.appendFileSync(bip, 'my note\n');
  assert.equal(hosts.bipOwnership(bip), 'foreign');
  const r = hosts.apply('claude', { prefix: PREFIX, env });
  assert.equal(r.skipped.length, 1);
  assert.match(fs.readFileSync(bip, 'utf8'), /my note/);
  assert.equal(hosts.apply('claude', { prefix: PREFIX, remove: true, env }).skipped.length, 1);
  assert.ok(fs.existsSync(bip), 'remove keeps a file the user changed');
});

test('Windows shim: /bip calls momentry by name, hooks keep the absolute path', () => {
  const { env } = home();
  const win = '"C:/Users/a/AppData/Local/momentry/bin/momentry.cmd"';
  hosts.apply('claude', { prefix: win, env });
  assert.match(fs.readFileSync(hosts.hostTable(env).claude.bipFile, 'utf8'), /^\s*momentry add --by human/m);
  assert.equal(JSON.parse(fs.readFileSync(hosts.hostTable(env).claude.hookFile, 'utf8')).hooks.SessionEnd[0].hooks[0].command, `${win} hook session-end`);
});

test('codex: hooks.json events and --codex flag', () => {
  const { h, env } = home();
  fs.mkdirSync(path.join(h, '.codex'));
  hosts.apply('codex', { prefix: PREFIX, env });
  const j = JSON.parse(fs.readFileSync(path.join(h, '.codex', 'hooks.json'), 'utf8'));
  assert.deepEqual(Object.keys(j.hooks), ['PreCompact', 'SessionEnd', 'SessionStart']);
  assert.equal(j.hooks.SessionStart[0].hooks[0].command, `${PREFIX} hook session-start --codex`);
});

test('codex: old snake_case entries (ignored by Codex) are replaced by PascalCase ones', () => {
  const { h, env } = home();
  fs.mkdirSync(path.join(h, '.codex'));
  const f = path.join(h, '.codex', 'hooks.json');
  fs.writeFileSync(f, JSON.stringify({ hooks: { pre_compact: [{ hooks: [{ type: 'command', command: '"/n" "/x/bin/momentry.mjs" hook pre-compact --codex' }] }] } }));
  assert.notEqual(hosts.inspectHooks('codex', PREFIX, env).status, 'ok');
  hosts.apply('codex', { prefix: PREFIX, env });
  assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(f, 'utf8')).hooks), ['PreCompact', 'SessionEnd', 'SessionStart']);
  assert.equal(hosts.inspectHooks('codex', PREFIX, env).status, 'ok');
  assert.ok(fs.existsSync(path.join(h, '.agents', 'skills', 'momentry-bip', 'SKILL.md')));
  assert.ok(!fs.existsSync(path.join(h, '.codex', 'prompts', 'bip.md')), 'Codex has no custom prompts any more');
});

test('pi and omp: extension + commands in every profile, pi\'s skill once in ~/.agents/skills; idempotent; edited files kept; remove deletes ours', () => {
  const { h, env } = home();
  for (const d of ['.pi/agent', '.pi/accounts/work', '.omp/agent', '.omp/profiles/p1/agent']) fs.mkdirSync(path.join(h, d), { recursive: true });
  const r = hosts.apply('pi', { prefix: PREFIX, env });
  assert.equal(r.changes.length, 7, 'extension and two commands per profile, one shared skill: ' + r.changes.join('\n'));
  const ext = path.join(h, '.pi', 'accounts', 'work', 'extensions', 'momentry.ts');
  const text = fs.readFileSync(ext, 'utf8');
  assert.match(text, /pi\.on\("session_shutdown"/);
  assert.match(text, /const HOST = "pi";/);
  assert.match(text, /\/\/ momentry:ext sha256=[0-9a-f]{64}\n$/);
  assert.match(fs.readFileSync(path.join(h, '.pi', 'agent', 'prompts', 'momentry-bip.md'), 'utf8'), /\$ARGUMENTS/);
  assert.deepEqual(hosts.apply('pi', { prefix: PREFIX, env }).changes, []);
  assert.equal(hosts.inspect('pi', PREFIX, env).status, 'ok');

  hosts.apply('omp', { prefix: PREFIX, env });
  assert.ok(fs.existsSync(path.join(h, '.omp', 'profiles', 'p1', 'agent', 'commands', 'momentry-bip.md')));
  assert.match(fs.readFileSync(path.join(h, '.omp', 'agent', 'extensions', 'momentry.ts'), 'utf8'), /const HOST = "omp";/);

  fs.mkdirSync(path.join(h, '.pi', 'accounts', 'new'));
  const s = hosts.inspect('pi', PREFIX, env);
  assert.equal(s.status, 'missing');
  assert.deepEqual(s.missing, [path.join(h, '.pi', 'accounts', 'new')], 'a new profile is reported');

  fs.appendFileSync(ext, '// mine\n');
  hosts.apply('pi', { prefix: PREFIX, remove: true, env });
  assert.ok(fs.existsSync(ext), 'edited extension kept');
  assert.ok(!fs.existsSync(path.join(h, '.pi', 'agent', 'extensions', 'momentry.ts')));
});

test('Antigravity: a "momentry" group next to other groups in config/hooks.json; skill with disable-model-invocation', () => {
  const { h, env } = home();
  fs.mkdirSync(path.join(h, '.gemini', 'config'), { recursive: true });
  fs.mkdirSync(path.join(h, '.agy-homes', 'acc', '.gemini'), { recursive: true });
  const hj = path.join(h, '.gemini', 'config', 'hooks.json');
  fs.writeFileSync(hj, JSON.stringify({ herdr: { PreInvocation: [{ type: 'command', command: 'herdr x', timeout: 5 }] } }));
  hosts.apply('agy', { prefix: PREFIX, env });
  const j = JSON.parse(fs.readFileSync(hj, 'utf8'));
  assert.deepEqual(Object.keys(j), ['herdr', 'momentry']);
  assert.deepEqual(j.momentry, { SessionStart: [{ type: 'command', command: `${PREFIX} hook session-start --agy`, timeout: 10 }] });
  assert.ok(fs.existsSync(path.join(h, '.agy-homes', 'acc', '.gemini', 'config', 'hooks.json')), 'every account');
  const acc = JSON.parse(fs.readFileSync(path.join(h, '.agy-homes', 'acc', '.gemini', 'config', 'hooks.json'), 'utf8'));
  assert.equal(acc.momentry.SessionStart[0].command, `${PREFIX} hook session-start --agy --user-home "${h}"`, 'account dirs run agy under another HOME');
  const skill = fs.readFileSync(path.join(h, '.gemini', 'config', 'skills', 'momentry-bip', 'SKILL.md'), 'utf8');
  assert.match(skill, /^---\nname: momentry-bip\n[\s\S]*disable-model-invocation: true\n---\n/);
  assert.doesNotMatch(skill, /\$ARGUMENTS/);
  assert.equal(hosts.inspect('agy', PREFIX, env).status, 'ok');
  hosts.apply('agy', { prefix: PREFIX, remove: true, env });
  assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(hj, 'utf8'))), ['herdr']);
});

test('Codex on Windows: shim unquoted (Codex runs hooks in PowerShell), by name when the path has spaces', () => {
  const { h, env } = home();
  fs.mkdirSync(path.join(h, '.codex'));
  hosts.apply('codex', { prefix: '"C:/Users/a/AppData/Local/momentry/bin/momentry.cmd"', env });
  const f = path.join(h, '.codex', 'hooks.json');
  assert.equal(JSON.parse(fs.readFileSync(f, 'utf8')).hooks.SessionStart[0].hooks[0].command, 'C:/Users/a/AppData/Local/momentry/bin/momentry.cmd hook session-start --codex');
  assert.equal(hosts.inspect('codex', '"C:/Users/a/AppData/Local/momentry/bin/momentry.cmd"', env).status, 'ok');
  hosts.apply('codex', { prefix: '"C:/Users/An Tran/AppData/Local/momentry/bin/momentry.cmd"', env });
  assert.equal(JSON.parse(fs.readFileSync(f, 'utf8')).hooks.SessionStart.length, 1, 'old entry replaced, not duplicated');
  assert.equal(JSON.parse(fs.readFileSync(f, 'utf8')).hooks.SessionStart[0].hooks[0].command, 'momentry hook session-start --codex');
});

test('ownership regex: only momentry hook commands', () => {
  for (const c of ['"/x/momentry" hook session-end', '"C:\\x\\momentry.cmd" hook pre-compact', '"/n" "/x/bin/momentry.mjs" hook session-start --codex']) assert.ok(hosts.OWN_HOOK.test(c), c);
  for (const c of ['momentry scan', 'my-hook session-end', 'notmomentry hook x']) assert.ok(!hosts.OWN_HOOK.test(c), c);
});
