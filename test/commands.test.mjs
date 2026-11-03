// The command table is the single source: every command has a handler, complete help, and the docs agree.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { COMMANDS, GLOBAL_FLAGS, resolveCommand, didYouMean, renderCommandHelp } from '../lib/commands.mjs';
import { HANDLED } from '../lib/cli.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BIN = path.join(ROOT, 'bin', 'momentry.mjs');

test('every command has a handler and every handler a command', () => {
  const visible = Object.entries(COMMANDS).filter(([, c]) => !c.hidden).map(([k]) => k).sort();
  assert.deepEqual(HANDLED().sort(), visible);
});

test('every command documents summary, examples and exit codes; flags have descriptions', () => {
  for (const [name, c] of Object.entries(COMMANDS)) {
    assert.ok(c.summary, name);
    assert.ok(c.examples.length >= 1 && c.examples.every((e) => e.startsWith('momentry ')), `${name} examples`);
    assert.ok(Object.hasOwn(c.exit, 0), `${name} exit 0`);
    for (const [f, d] of Object.entries(c.flags)) {
      assert.ok(d.desc, `${name} --${f}`);
      assert.ok(!Object.hasOwn(GLOBAL_FLAGS, f), `${name} --${f} shadows a global flag`);
    }
    const help = renderCommandHelp(name);
    for (const f of Object.keys(c.flags)) assert.match(help, new RegExp(`--${f}\\b`), `${name} help lists --${f}`);
  }
});

test('setup verbs have self-sufficient help (what changes, a non-interactive example, next step)', () => {
  for (const name of ['init', 'connect', 'update', 'uninstall']) {
    const c = COMMANDS[name];
    assert.ok(c.changes, `${name} changes`);
    assert.ok(c.examples.some((e) => /--yes|--json/.test(e)), `${name} non-interactive example`);
  }
  for (const name of ['init', 'doctor', 'connect', 'update']) assert.ok(COMMANDS[name].next, `${name} next`);
});

test('aliases and suggestions', () => {
  assert.equal(resolveCommand('upgrade'), 'update');
  assert.equal(resolveCommand('remove'), 'uninstall');
  assert.equal(resolveCommand('nope'), null);
  assert.equal(didYouMean('lisst', Object.keys(COMMANDS)), 'list');
  assert.equal(didYouMean('doc', Object.keys(COMMANDS)), 'doctor');
  assert.equal(didYouMean('zzzzzz', Object.keys(COMMANDS)), null);
});

test('README and docs/cli-reference.md mention only commands that exist', () => {
  const known = new Set([...Object.keys(COMMANDS), ...Object.values(COMMANDS).flatMap((c) => c.aliases ?? [])]);
  for (const f of ['README.md', 'docs/cli-reference.md', 'docs/installation.md']) {
    const p = path.join(ROOT, f);
    if (!fs.existsSync(p)) continue;
    const text = fs.readFileSync(p, 'utf8');
    for (const m of text.matchAll(/`momentry ([a-z][a-z-]*)/g)) assert.ok(known.has(m[1]), `${f}: momentry ${m[1]}`);
  }
});

test('docs/cli-reference.md is generated from the table and up to date', { skip: !fs.existsSync(path.join(ROOT, 'docs/cli-reference.md')) && 'not generated yet' }, async () => {
  const { renderReference } = await import('../scripts/gen-cli-reference.mjs');
  assert.equal(fs.readFileSync(path.join(ROOT, 'docs/cli-reference.md'), 'utf8'), renderReference(), 'run: node scripts/gen-cli-reference.mjs');
});

test('--version, version --json and help --json', () => {
  const run = (...a) => spawnSync(process.execPath, [BIN, ...a], { encoding: 'utf8' });
  assert.match(run('--version').stdout, /^momentry \d+\.\d+\.\d+/);
  const v = JSON.parse(run('version', '--json').stdout);
  assert.equal(v.schema, 1);
  assert.equal(v.ok, true);
  assert.ok(v.data.version && v.data.node && v.data.platform);
  const h = JSON.parse(run('help', '--json').stdout);
  assert.ok(h.data.commands.init && h.data.global.json);
  assert.equal(h.data.commands.hook, undefined, 'hidden commands are not advertised');
  const ih = run('init', '--help');
  assert.equal(ih.status, 0);
  assert.match(ih.stdout, /Thay đổi:[\s\S]*Ví dụ:[\s\S]*Mã thoát:[\s\S]*Tiếp theo:/);
});
