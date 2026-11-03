import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig, isObserved, cacheDir, DEFAULTS, EXIT } from '../lib/config.mjs';
import { paths } from '../lib/paths.mjs';

function setup({ repoCfg, userCfg } = {}) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'dm-cfg-'));
  const repo = path.join(base, 'myrepo');
  fs.mkdirSync(path.join(repo, '.git'), { recursive: true });
  fs.mkdirSync(path.join(repo, 'sub'));
  if (repoCfg) fs.writeFileSync(path.join(repo, '.momentry.json'), JSON.stringify(repoCfg));
  const userFile = path.join(base, 'user.json');
  if (userCfg) fs.writeFileSync(userFile, JSON.stringify(userCfg));
  const env = { HOME: path.join(base, 'home'), MOMENTRY_CONFIG: userFile };
  return { base, repo, env };
}

test('defaults', () => {
  const { repo, env } = setup();
  const c = loadConfig({ cwd: path.join(repo, 'sub'), env });
  assert.equal(c.repoRoot, repo);
  assert.equal(c.repo, 'myrepo');
  assert.equal(c.box, path.join(repo, 'docs/storytelling-material'));
  assert.equal(c.privacy.allowFile, path.join(c.box, '.privacy-allow'));
  assert.deepEqual(c.harvest, DEFAULTS.harvest);
  assert.equal(c.outsider.enabled, true);
  assert.equal(c.lock.staleSec, 3600);
  assert.equal(c.cacheDir, paths(env).cache);
  assert.equal(c.observed, false);
  assert.equal(c.fakeLlm, null);
});

test('precedence: flags > env > repo > user > defaults', () => {
  const { repo, env } = setup({
    userCfg: { box: 'u-box', harvest: { runs: 2, model: 'u-model' }, scan: { quietMinutes: 5 } },
    repoCfg: { box: 'r-box', 'harvest.runs': 3, outsider: { enabled: false } },
  });
  let c = loadConfig({ cwd: repo, env });
  assert.equal(c.box, path.join(repo, 'r-box'));
  assert.equal(c.harvest.runs, 3);
  assert.equal(c.harvest.model, 'u-model');
  assert.equal(c.scan.quietMinutes, 5);
  assert.equal(c.outsider.enabled, false);
  assert.equal(c.observed, true);

  c = loadConfig({ cwd: repo, env: { ...env, MOMENTRY_BOX: 'e-box', MOMENTRY_FAKE_LLM: '/fake' } });
  assert.equal(c.box, path.join(repo, 'e-box'));
  assert.equal(c.fakeLlm, path.resolve('/fake'));

  c = loadConfig({ cwd: repo, env: { ...env, MOMENTRY_BOX: 'e-box' }, flags: { box: 'f-box', runs: 4, 'quiet-minutes': 9, 'fake-llm': 'fl' } });
  assert.equal(c.box, path.join(repo, 'f-box'));
  assert.equal(c.harvest.runs, 4);
  assert.equal(c.scan.quietMinutes, 9);
  assert.equal(c.fakeLlm, path.join(repo, 'fl'));
});

test('privacy.sources and allowUnchecked are ignored in the repo file', () => {
  const src = [{ type: 'lines', path: '/x/names.txt' }];
  const { repo, env } = setup({ repoCfg: { privacy: { sources: src, allowUnchecked: true, allowFile: 'allow.txt' } } });
  const c = loadConfig({ cwd: repo, env });
  assert.deepEqual(c.privacy.sources, []);
  assert.equal(c.privacy.allowUnchecked, false);
  assert.equal(c.privacy.allowFile, path.join(repo, 'allow.txt'));
  assert.deepEqual(c.ignored.sort(), ['privacy.allowUnchecked', 'privacy.sources']);
});

test('privacy from user config and env', () => {
  const src = [{ type: 'vault-titles', path: '/v' }];
  const { repo, env } = setup({ userCfg: { privacy: { sources: src, allowUnchecked: true } } });
  let c = loadConfig({ cwd: repo, env });
  assert.deepEqual(c.privacy.sources, src);
  assert.equal(c.privacy.allowUnchecked, true);
  c = loadConfig({ cwd: repo, env: { ...env, MOMENTRY_PRIVACY_SOURCES: JSON.stringify([{ type: 'lines', path: '/n' }]) } });
  assert.deepEqual(c.privacy.sources, [{ type: 'lines', path: '/n' }]);
  c = loadConfig({ cwd: repo, env: { HOME: env.HOME, MOMENTRY_CONFIG: '/none.json', MOMENTRY_PRIVACY_SOURCES: ['/a.txt', '/b.txt'].join(path.delimiter), MOMENTRY_ALLOW_UNCHECKED: '1' } });
  assert.deepEqual(c.privacy.sources, [{ type: 'lines', path: '/a.txt' }, { type: 'lines', path: '/b.txt' }]);
  assert.equal(c.privacy.allowUnchecked, true);
});

test('bad values and broken JSON exit 1', () => {
  const { repo, env } = setup({ repoCfg: { harvest: { runs: 0 } } });
  assert.throws(() => loadConfig({ cwd: repo, env }), (e) => e.exitCode === EXIT.FAIL);
  fs.writeFileSync(path.join(repo, '.momentry.json'), '{oops');
  assert.throws(() => loadConfig({ cwd: repo, env }), (e) => e.exitCode === EXIT.FAIL);
});

test('outside a git repo', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'dm-nogit-'));
  const c = loadConfig({ cwd: base, env: { HOME: base, MOMENTRY_CONFIG: path.join(base, 'none.json') }, flags: { box: 'b' } });
  assert.equal(c.repoRoot, null);
  assert.equal(c.observed, false);
  assert.equal(c.box, path.join(base, 'b'));
});

test('isObserved via file or MOMENTRY_REPOS; cacheDir env', () => {
  const { repo } = setup();
  assert.equal(isObserved(repo, {}), false);
  assert.equal(isObserved(repo, { MOMENTRY_REPOS: ['/nope', repo].join(path.delimiter) }), true);
  fs.writeFileSync(path.join(repo, '.momentry.json'), '{}');
  assert.equal(isObserved(repo, {}), true);
  assert.equal(isObserved(null, {}), false);
  assert.equal(cacheDir({ MOMENTRY_CACHE: '/tmp/x' }), path.resolve('/tmp/x'));
});
