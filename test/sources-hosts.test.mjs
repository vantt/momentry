// pi, omp, Antigravity transcript readers and profile discovery. Fixtures are invented, shaped like real files.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as pi from '../lib/sources/pi.mjs';
import * as agy from '../lib/sources/agy.mjs';
import { hostRoots } from '../lib/profiles.mjs';
import { sourceOf } from '../lib/pipeline.mjs';

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'transcripts');
const tmp = () => fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'dm-hosts-src-')));
const brief = (es) => es.map((e) => [e.kind, e.op ?? '', e.kind === 'result' ? e.exitCode : (e.paths ?? []).join(',') || e.text.slice(0, 20)]);

function place(src, dir, name, repo) {
  fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, name);
  fs.writeFileSync(p, fs.readFileSync(src, 'utf8').replaceAll('__REPO__', JSON.stringify(repo).slice(1, -1)));
  return p;
}

test('pi: entries, exit codes, edit paths, user bash; session id uses the uuid tail', () => {
  const es = pi.readEntries(path.join(FIX, 'pi-session.jsonl'));
  assert.deepEqual(brief(es), [
    ['user', '', 'Đo lại máy pha cà ph'],
    ['assistant', '', 'Chạy đo trước.'],
    ['tool', 'shell', 'make bench'],
    ['result', '', 2],
    ['tool', 'write', 'src/cache.js'],
    ['result', '', null],
    ['tool', 'shell', 'make bench'],
    ['result', '', 0],
  ]);
  assert.equal(es[3].isError, true);
  assert.equal(pi.sessionId('/s/2026-01-10T09-00-00-000Z_0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b.jsonl', 'pi'), 'pi:2e3f4a5b');
});

test('omp: title line, agent-injected users and tool_execution_start noise are dropped; edit path from the result', () => {
  const es = pi.readEntries(path.join(FIX, 'omp-session.jsonl'));
  assert.deepEqual(brief(es), [
    ['user', '', 'Sửa lỗi build'],
    ['tool', 'write', 'src/a.js'],
    ['result', '', null],
    ['tool', 'shell', 'npm test'],
    ['result', '', 1],
  ]);
  assert.deepEqual(pi.sessionMeta(path.join(FIX, 'omp-session.jsonl')).id, '0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f9999');
});

test('pi/omp listTranscripts: header cwd decides the repo, any bucket name, every profile', () => {
  const home = tmp();
  const repo = path.join(home, 'work', 'repo');
  fs.mkdirSync(repo, { recursive: true });
  const env = { HOME: home, USERPROFILE: home };
  place(path.join(FIX, 'pi-session.jsonl'), path.join(home, '.pi', 'agent', 'sessions', '--x--'), '2026-01-10_0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b.jsonl', repo);
  place(path.join(FIX, 'pi-session.jsonl'), path.join(home, '.pi', 'accounts', 'work', 'sessions', '--y--'), '2026-01-11_0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f0000.jsonl', repo);
  place(path.join(FIX, 'pi-session.jsonl'), path.join(home, '.pi', 'agent', 'sessions', '--z--'), '2026-01-12_0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f1111.jsonl', path.join(home, 'other'));
  place(path.join(FIX, 'omp-session.jsonl'), path.join(home, '.omp', 'profiles', 'p1', 'agent', 'sessions', '-work-repo'), '2026-01-10_0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f9999.jsonl', path.join(repo, 'sub'));
  const p = pi.listTranscripts(repo, { host: 'pi', env });
  assert.deepEqual(p.map((t) => t.sid).sort(), ['pi:2e3f0000', 'pi:2e3f4a5b']);
  const o = pi.listTranscripts(repo, { host: 'omp', env });
  assert.deepEqual(o.map((t) => [t.sid, t.source]), [['omp:2e3f9999', 'omp']]);
});

test('agy: steps map to entries; GENERIC after a tool is its result; /bip marked', () => {
  const es = agy.readEntries(path.join(FIX, 'agy', 'transcript_full.jsonl'));
  assert.deepEqual(brief(es), [
    ['user', '', 'Chạy test'],
    ['assistant', '', 'Chạy ngay.'],
    ['tool', 'shell', 'npm test'],
    ['result', '', 1],
    ['tool', 'write', '/r/src/a.js'],
    ['result', '', null],
    ['user', '', '/bip test xanh lại'],
  ]);
  assert.equal(es[3].isError, true);
  assert.equal(es.at(-1).bip, true);
});

test('agy: the SessionStart index finds a repo\'s transcripts (no cwd in the file), recorded once', () => {
  const home = tmp();
  const cache = path.join(home, 'cache');
  const repo = path.join(home, 'repo');
  fs.mkdirSync(repo);
  const logs = path.join(home, '.gemini', 'antigravity-cli', 'brain', '0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f7777', '.system_generated', 'logs');
  fs.mkdirSync(logs, { recursive: true });
  fs.copyFileSync(path.join(FIX, 'agy', 'transcript_full.jsonl'), path.join(logs, 'transcript_full.jsonl'));
  fs.writeFileSync(path.join(logs, 'transcript.jsonl'), '');
  const s = { conversationId: '0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f7777', transcriptPath: path.join(logs, 'transcript.jsonl'), workspacePaths: [repo] };
  assert.equal(agy.recordSession(s, cache), true);
  assert.equal(agy.recordSession(s, cache), false, 'idempotent');
  agy.recordSession({ ...s, conversationId: '0199a1b2-0000-7000-8000-000000000001', workspacePaths: [path.join(home, 'elsewhere')] }, cache);
  const t = agy.listTranscripts(repo, { cacheDir: cache });
  assert.deepEqual(t.map((x) => [x.sid, path.basename(x.path)]), [['agy:2e3f7777', 'transcript_full.jsonl']]);
  assert.equal(sourceOf(t[0].path), 'agy');
});

test('sourceOf tells the hosts apart by path and first line', () => {
  assert.equal(sourceOf(path.join(FIX, 'pi-session.jsonl')), 'pi');
  assert.equal(sourceOf(path.join(FIX, 'omp-session.jsonl')), 'omp');
  assert.equal(sourceOf(path.join(FIX, 'claude-session.jsonl')), 'claude');
  assert.equal(sourceOf('/x/rollout-2026-01-10.jsonl'), 'codex');
});

test('hostRoots: default dirs plus every profile, only existing ones', () => {
  const home = tmp();
  for (const d of ['.claude', '.codex', '.codex-work', '.pi/agent', '.pi/accounts/a', '.pi/accounts/b', '.omp/agent', '.omp/profiles/p1/agent', '.gemini', '.agy-homes/x/.gemini', '.agy-homes/y']) {
    fs.mkdirSync(path.join(home, d), { recursive: true });
  }
  const env = { HOME: home, USERPROFILE: home };
  const rel = (h) => hostRoots(h, env).map((d) => path.relative(home, d).split(path.sep).join('/'));
  assert.deepEqual(rel('claude'), ['.claude']);
  assert.deepEqual(rel('codex'), ['.codex', '.codex-work']);
  assert.deepEqual(rel('pi'), ['.pi/agent', '.pi/accounts/a', '.pi/accounts/b']);
  assert.deepEqual(rel('omp'), ['.omp/agent', '.omp/profiles/p1/agent']);
  assert.deepEqual(rel('agy'), ['.gemini', '.agy-homes/x/.gemini']);
  assert.deepEqual(hostRoots('pi', { ...env, PI_CODING_AGENT_DIR: path.join(home, '.pi', 'accounts', 'b') }).map((d) => path.basename(d)), ['b', 'a']);
});
