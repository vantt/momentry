import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { paths, splitList } from '../lib/paths.mjs';
import { which, commandFor } from '../lib/proc.mjs';
import { VERSION, fingerprint, compareVersions } from '../lib/version.mjs';

test('linux: XDG when absolute, defaults otherwise, MOMENTRY_* overrides win', () => {
  const p = paths({ HOME: '/h' }, { platform: 'linux' });
  assert.deepEqual(p, {
    config: '/h/.config/momentry', configFile: '/h/.config/momentry/config.json', projects: '/h/.config/momentry/projects.json', cache: '/h/.cache/momentry',
    home: '/h/.local/share/momentry', bin: '/h/.local/bin', claude: '/h/.claude', codex: '/h/.codex',
  });
  const x = paths({ HOME: '/h', XDG_CONFIG_HOME: '/x/c', XDG_CACHE_HOME: 'rel', XDG_DATA_HOME: '/x/d' }, { platform: 'linux' });
  assert.equal(x.config, '/x/c/momentry');
  assert.equal(x.cache, '/h/.cache/momentry', 'relative XDG value is ignored');
  assert.equal(x.home, '/x/d/momentry');
  const o = paths({ HOME: '/h', MOMENTRY_CONFIG: '/c.json', MOMENTRY_CACHE: '/k', MOMENTRY_HOME: '/m', MOMENTRY_INSTALL_DIR: '/b', CLAUDE_CONFIG_DIR: '/cl', CODEX_HOME: '/co' }, { platform: 'linux' });
  assert.deepEqual([o.configFile, o.cache, o.home, o.bin, o.claude, o.codex], ['/c.json', '/k', '/m', '/b', '/cl', '/co']);
});

test('macOS keeps the ~/.config layout', () => {
  const p = paths({ HOME: '/Users/a' }, { platform: 'darwin' });
  assert.equal(p.configFile, '/Users/a/.config/momentry/config.json');
  assert.equal(p.cache, '/Users/a/.cache/momentry');
});

test('windows: APPDATA for config, LOCALAPPDATA for install, cache and bin', () => {
  const env = { USERPROFILE: 'C:\\Users\\a', APPDATA: 'C:\\Users\\a\\AppData\\Roaming', LOCALAPPDATA: 'C:\\Users\\a\\AppData\\Local' };
  const p = paths(env, { platform: 'win32' });
  assert.equal(p.configFile, 'C:\\Users\\a\\AppData\\Roaming\\momentry\\config.json');
  assert.equal(p.home, 'C:\\Users\\a\\AppData\\Local\\momentry\\app');
  assert.equal(p.cache, 'C:\\Users\\a\\AppData\\Local\\momentry\\cache');
  assert.equal(p.bin, 'C:\\Users\\a\\AppData\\Local\\momentry\\bin');
  assert.equal(p.claude, 'C:\\Users\\a\\.claude');
  assert.equal(paths({ USERPROFILE: 'C:\\U' }, { platform: 'win32' }).config, 'C:\\U\\AppData\\Roaming\\momentry');
});

test('list env vars split on the platform delimiter', () => {
  assert.deepEqual(splitList('/a:/b::', 'linux'), ['/a', '/b']);
  assert.deepEqual(splitList('C:\\a;D:\\b', 'win32'), ['C:\\a', 'D:\\b']);
  assert.deepEqual(splitList(undefined, 'linux'), []);
});

test('which finds executables on PATH; commandFor wraps .cmd on Windows only', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'dm-which-'));
  const exe = path.join(d, 'tool');
  fs.writeFileSync(exe, '#!/bin/sh\n', { mode: 0o755 });
  fs.writeFileSync(path.join(d, 'plain'), 'x', { mode: 0o644 });
  if (process.platform !== 'win32') {
    assert.equal(which('tool', { env: { PATH: d } }), exe);
    assert.equal(which('plain', { env: { PATH: d } }), null, 'not executable');
  }
  assert.equal(which('nope-xyz', { env: { PATH: d } }), null);
  assert.deepEqual(commandFor('claude', ['-p'], { platform: 'linux' }), { file: 'claude', args: ['-p'], options: {} });

  fs.writeFileSync(path.join(d, 'claude.cmd'), '@echo off\n');
  const cmdFile = path.join(d, 'claude.cmd');
  const c = commandFor(cmdFile, ['-p', '--tools', '', '--model', 'sonnet'], { platform: 'win32', env: { PATHEXT: '.EXE;.CMD', ComSpec: 'C:\\Windows\\system32\\cmd.exe' } });
  assert.equal(c.file, 'C:\\Windows\\system32\\cmd.exe');
  assert.deepEqual(c.args.slice(0, 3), ['/d', '/s', '/c']);
  assert.match(c.args[3], /claude\.cmd -p --tools "" --model sonnet"$/);
  assert.equal(c.options.windowsVerbatimArguments, true);
  assert.throws(() => commandFor(cmdFile, ['a&b'], { platform: 'win32', env: {} }), /không an toàn/);
  if (process.platform === 'win32') assert.equal(which('claude', { env: { Path: d, PATHEXT: '.EXE;.CMD' } }).toLowerCase(), cmdFile.toLowerCase());
});

test('version: fingerprint and comparison', () => {
  assert.match(VERSION, /^\d+\.\d+\.\d+$/);
  const f = fingerprint();
  assert.equal(f.version, VERSION);
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'dm-ver-'));
  fs.writeFileSync(path.join(d, 'BUILD'), JSON.stringify({ commit: 'abc', commitTime: '2026-01-01T00:00:00Z' }));
  assert.deepEqual(fingerprint(d), { version: VERSION, commit: 'abc', commitTime: '2026-01-01T00:00:00Z', source: 'release' });
  assert.equal(fingerprint(fs.mkdtempSync(path.join(os.tmpdir(), 'dm-ver-'))).source, 'unknown');
  assert.equal(compareVersions('0.1.0', 'v0.1.1'), -1);
  assert.equal(compareVersions('1.0.0', '1.0.0-rc.1'), 1);
  assert.equal(compareVersions('1.0.0-rc.2', '1.0.0-rc.10'), -1);
  assert.equal(compareVersions('v2.0.0', '2.0.0'), 0);
  assert.throws(() => compareVersions('x', '1.0.0'));
});
