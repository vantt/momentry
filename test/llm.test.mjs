// llm.mjs + json.mjs with a fake `claude` on PATH and --fake-llm fixtures. Never calls the real claude.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildArgs, call, callJson, callEnv, callUsd } from '../lib/llm.mjs';
import { extractJson } from '../lib/json.mjs';
import { validateStakes, validateHookTension } from '../lib/validate.mjs';

const FIX = fileURLToPath(new URL('./fixtures/', import.meta.url));
const FAKE_BIN = path.join(FIX, 'fake-claude');
const FAKE_LLM = path.join(FIX, 'llm-fake');
fs.chmodSync(path.join(FAKE_BIN, 'claude'), 0o755);

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'dm-llm-')); }

/** Env with the fake claude first on PATH; returns {env, state, calls()} */
function fake(plan, result) {
  const state = tmp();
  const env = { ...process.env, PATH: `${FAKE_BIN}${path.delimiter}${process.env.PATH}`, FAKE_CLAUDE_PLAN: plan, FAKE_CLAUDE_STATE: state };
  delete env.STORY_HARVEST;
  if (result) env.FAKE_CLAUDE_RESULT = result;
  const calls = () => fs.readFileSync(path.join(state, 'calls.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l));
  return { env, state, calls };
}

const base = { key: 'harvest-c1-r1', model: 'haiku', prompt: 'Xin chào {không phải chỗ điền}', timeoutSec: 20 };

test('extractJson cuts first { to last }', () => {
  assert.deepEqual(extractJson('Đây:\n```json\n{"a":{"b":[1]}}\n```\nhết'), { a: { b: [1] } });
  assert.throws(() => extractJson('không có gì'), /không có JSON/);
  assert.throws(() => extractJson('{"a": [1, }'), /JSON hỏng/);
  assert.throws(() => extractJson('} ngược {'), /không có JSON/);
  assert.throws(() => extractJson(null));
});

test('buildArgs matches the isolated call of harness/run.sh', () => {
  assert.deepEqual(buildArgs('sonnet'), ['-p', '--model', 'sonnet', '--setting-sources', '', '--tools', '', '--strict-mcp-config',
    '--no-session-persistence', '--output-format', 'json']);
});

test('call: success reads result, cost; prompt on stdin; STORY_HARVEST=1; save and run dirs', async () => {
  const f = fake('ok', '{"x":1}');
  const saveDir = path.join(tmp(), 'save'), runDir = path.join(tmp(), 'runs', 'a');
  const r = await call({ ...base, env: f.env, saveDir, runDir });
  assert.equal(r.result, '{"x":1}');
  assert.equal(r.usd, 0.01);
  assert.ok(r.secs >= 0 && r.secs < 20);
  const [c] = f.calls();
  assert.deepEqual(c.argv, buildArgs('haiku'));
  assert.equal(c.storyHarvest, '1');
  assert.equal(c.prompt, base.prompt);
  assert.equal(c.cacheOff, '1', 'prompt cache is off by default');
  const saved = JSON.parse(fs.readFileSync(path.join(saveDir, 'harvest-c1-r1.json'), 'utf8'));
  assert.equal(saved.result, '{"x":1}');
  if (process.platform !== 'win32') assert.equal(fs.statSync(saveDir).mode & 0o777, 0o700);
  assert.equal(fs.readFileSync(path.join(runDir, 'harvest-c1-r1.prompt.txt'), 'utf8'), base.prompt);
  assert.ok(fs.existsSync(path.join(runDir, 'harvest-c1-r1.json')));
});

test('call: saved output replays with fakeDir', async () => {
  const f = fake('ok', '{"y":2}');
  const saveDir = tmp();
  await call({ ...base, env: f.env, saveDir });
  const r = await call({ ...base, fakeDir: saveDir, env: { PATH: '/nonexistent' } });
  assert.equal(r.result, '{"y":2}');
  assert.equal(r.secs, 1.234);
});

for (const [mode, re] of [['is_error', /is_error/], ['is_error_exit', /is_error/], ['no_result', /thiếu result/],
  ['exit', /thoát 2: fake: hỏng/], ['bad_stdout', /không phải JSON/]]) {
  test(`call: ${mode} fails with exitCode 4`, async () => {
    const f = fake(mode);
    await assert.rejects(call({ ...base, env: f.env }), e => (assert.match(e.message, re), assert.equal(e.exitCode, 4), true));
  });
}

test('call: timeout kills the hung child (SIGTERM ignored -> SIGKILL)', async () => {
  const f = fake('hang');
  const t0 = Date.now();
  await assert.rejects(call({ ...base, timeoutSec: 0.5, env: f.env }), e => (assert.match(e.message, /quá 0.5s/), assert.equal(e.exitCode, 4), true));
  assert.ok(Date.now() - t0 < 10000);
  const pid = Number(fs.readFileSync(path.join(f.state, 'hang.pid'), 'utf8'));
  assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
});

test('call: missing binary fails with exitCode 4', async () => {
  await assert.rejects(call({ ...base, bin: 'claude-khong-co-that', env: { PATH: tmp() } }), e => e.exitCode === 4);
});

test('call: missing --fake-llm file -> exitCode 4', async () => {
  await assert.rejects(call({ ...base, key: 'cluster-1', fakeDir: FAKE_LLM }), e => (assert.match(e.message, /thiếu file --fake-llm/), e.exitCode === 4));
});

test('call: rejects odd keys (no path escape)', async () => {
  await assert.rejects(call({ ...base, key: '../x', fakeDir: FAKE_LLM }), e => e.exitCode === 4);
});

test('call: fake is_error fixture fails', async () => {
  await assert.rejects(call({ ...base, key: 'hook-tension-1', fakeDir: FAKE_LLM }), /is_error \(error_during_execution\)/);
});

const okStakes = '{"main_goal":"g","stakes":[{"id":"M1","stakes":1,"reason":"r"}]}';
const vStakes = json => validateStakes(json, { ids: ['M1'] });

test('callJson: success first try, prose around JSON', async () => {
  const f = fake('prose', okStakes);
  const r = await callJson({ ...base, key: 'stakes-1', env: f.env, validate: vStakes });
  assert.equal(r.retried, false);
  assert.equal(r.json.main_goal, 'g');
  assert.equal(r.usd, 0.01);
  assert.equal(f.calls().length, 1);
});

for (const first of ['bad_json', 'is_error', 'exit', 'hang']) {
  test(`callJson: ${first} then ok -> retried once`, async () => {
    const f = fake(`${first},ok`, okStakes);
    const saveDir = tmp();
    const r = await callJson({ ...base, key: 'stakes-1', timeoutSec: 1, env: f.env, saveDir, validate: vStakes });
    assert.equal(r.retried, true);
    assert.equal(f.calls().length, 2);
    assert.ok(fs.existsSync(path.join(saveDir, 'stakes-1-retry.json')));
  });
}

test('callJson: invalid twice -> step fails, exitCode 4, cost summed', async () => {
  const f = fake('ok', '{"main_goal":"g","stakes":[{"id":"M1","stakes":5,"reason":"r"}]}');
  await assert.rejects(callJson({ ...base, key: 'stakes-1', env: f.env, validate: vStakes }), e => {
    assert.equal(e.exitCode, 4);
    assert.equal(e.errors.length, 2);
    assert.match(e.errors[0], /^stakes-1: .*ngoài 0-3/);
    assert.match(e.errors[1], /^stakes-1-retry: /);
    assert.equal(e.usd, 0.02);
    return true;
  });
  assert.equal(f.calls().length, 2);
});

test('callJson + fake-llm: stakes 5 then retry ok', async () => {
  const r = await callJson({ ...base, key: 'stakes-1', fakeDir: FAKE_LLM, validate: vStakes });
  assert.equal(r.retried, true);
  assert.equal(r.json.stakes[0].stakes, 2);
  assert.ok(Math.abs(r.usd - 0.11) < 1e-9);
  assert.equal(r.secs, 2.5);
});

test('callJson + fake-llm: is_error then tension out of list -> fails', async () => {
  await assert.rejects(callJson({ ...base, key: 'hook-tension-1', fakeDir: FAKE_LLM, validate: j => validateHookTension(j, { ids: ['M1'] }) }),
    e => (assert.match(e.message, /is_error.*\|.*tension "loai_moi" ngoài danh sách/), e.exitCode === 4));
});

test('callJson + fake-llm: bad JSON and no retry file -> fails', async () => {
  await assert.rejects(callJson({ ...base, key: 'outsider-1', fakeDir: FAKE_LLM, validate: () => [] }),
    e => (assert.match(e.message, /outsider-1: đầu ra model không có JSON object \| thiếu file --fake-llm/), e.exitCode === 4));
});

test('callJson + fake-llm: harvest success', async () => {
  const r = await callJson({ ...base, fakeDir: FAKE_LLM, validate: () => [] });
  assert.equal(r.json.stories.length, 1);
  assert.equal(r.usd, 0.12);
});

test('callEnv: cache off by default, forced lifetimes clear the other cache switches, auto leaves env alone', () => {
  const env = { PATH: '/bin', DISABLE_PROMPT_CACHING_SONNET: '1', CLAUDE_CODE_PROMPT_CACHE_TTL: '1h' };
  assert.deepEqual(callEnv(env), { PATH: '/bin', STORY_HARVEST: '1', DISABLE_PROMPT_CACHING: '1' });
  assert.deepEqual(callEnv(env, { cache: '5m' }), { PATH: '/bin', STORY_HARVEST: '1', CLAUDE_CODE_PROMPT_CACHE_TTL: '5m' });
  assert.deepEqual(callEnv(env, { cache: '1h' }), { PATH: '/bin', STORY_HARVEST: '1', CLAUDE_CODE_PROMPT_CACHE_TTL: '1h' });
  assert.deepEqual(callEnv(env, { cache: 'auto' }), { ...env, STORY_HARVEST: '1' });
  assert.equal(env.STORY_HARVEST, undefined, 'caller env is not mutated');
  assert.throws(() => callEnv(env, { cache: 'forever' }), (e) => e.exitCode === 4);
});

test('call: the cache setting reaches the child', async () => {
  const f = fake('ok');
  await call({ ...base, env: f.env, cache: '5m' });
  const [c] = f.calls();
  assert.equal(c.cacheOff, null);
  assert.equal(c.cacheTtl, '5m');
});

test('callUsd: measured list prices, haiku long-prompt step at 100k, cache write factors', () => {
  const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} vs ${b}`);
  near(callUsd('haiku', 90000, 1000), (90000 * 0.1 + 1000 * 0.5) / 1e6);
  near(callUsd('haiku', 110000, 1000), 5 * (110000 * 0.1 + 1000 * 0.5) / 1e6);
  near(callUsd('sonnet', 100000, 2000), (100000 * 2 + 2000 * 10) / 1e6);
  near(callUsd('claude-sonnet-5-5', 100000, 0, '1h'), 100000 * 4 / 1e6);
  near(callUsd('sonnet', 100000, 0, '5m'), 100000 * 2.5 / 1e6);
  near(callUsd('sonnet', 100000, 0, 'auto'), callUsd('sonnet', 100000, 0, '1h'));
  near(callUsd('some-new-model', 1e6, 0), 4, 'unknown models priced as opus');
});
