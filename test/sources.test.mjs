import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as claude from '../lib/sources/claude.mjs';
import * as codex from '../lib/sources/codex.mjs';

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'transcripts');
const CLAUDE = path.join(FIX, 'claude-session.jsonl');
const CODEX = path.join(FIX, 'rollout-2026-01-10T09-00-00-0f9e8d7c-aaaa-7bbb-8ccc-ddddeeeeffff.jsonl');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'dm-src-'));
const line = (o) => JSON.stringify(o) + '\n';

test('claude: ids, encoding, line count', () => {
  assert.equal(claude.sessionId('/x/0a1b2c3d-1111-2222-3333-444455556666.jsonl'), 'claude:0a1b2c3d');
  assert.equal(claude.encodeProjectDir('/home/u/my.repo_x'), process.platform === 'win32' ? path.resolve('/home/u/my.repo_x').replace(/[^A-Za-z0-9]/g, '-') : '-home-u-my-repo-x');
  assert.equal(claude.countLines(CLAUDE), 15);
  const d = tmp();
  fs.writeFileSync(path.join(d, 'a'), 'x\ny');
  fs.writeFileSync(path.join(d, 'b'), '');
  assert.equal(claude.countLines(path.join(d, 'a')), 2);
  assert.equal(claude.countLines(path.join(d, 'b')), 0);
});

test('claude: readEntries normalises kinds, L, ts, op/paths, bip; drops noise', () => {
  const es = claude.readEntries(CLAUDE);
  const brief = es.map(e => [e.L, e.kind, e.op ?? '', e.name ?? '']);
  assert.deepEqual(brief, [
    [2, 'user', '', ''],
    [4, 'assistant', '', ''],
    [4, 'tool', 'shell', 'Bash'],
    [5, 'result', '', 'Bash'],
    [7, 'user', '', ''],
    [9, 'tool', 'write', 'Edit'],
    [10, 'result', '', 'Edit'],
    [11, 'tool', 'write', 'Write'],
    [11, 'tool', 'write', 'NotebookEdit'],
    [11, 'tool', 'other', 'Read'],
    [14, 'assistant', '', ''],
    [15, 'result', '', 'Write'],
  ]);
  assert.equal(es[0].ts, '2026-01-10T09:01:00.000Z');
  assert.equal(es[2].text, 'git reset --hard HEAD~1');
  assert.deepEqual(es[2].paths, []);
  assert.equal(es[3].isError, true);
  assert.equal(es[3].exitCode, 144);
  assert.equal(es[4].bip, true);
  assert.equal(es[4].text, '/bip cái máy tự tắt');
  assert.equal(es[0].bip, false);
  assert.deepEqual(es[5].paths, ['/fake/repo/.claude/settings.json']);
  assert.deepEqual(es[8].paths, ['/fake/repo/nb.ipynb']);
  assert.deepEqual(es[9].paths, []);
  assert.equal(es[6].text, 'đã sửa');
  assert.equal(es[6].exitCode, null);
  assert.equal(es[6].isError, false);
  assert.equal(es[11].exitCode, 0);
  assert.ok(!es.some(e => /nghĩ thầm|nhắc nhở|Tóm tắt compact|local-command/.test(e.text)));
});

test('claude: fromLine/toLine are inclusive and keep original L', () => {
  assert.deepEqual(claude.readEntries(CLAUDE, { fromLine: 5, toLine: 9 }).map(e => e.L), [5, 7, 9]);
  assert.deepEqual(claude.readEntries(CLAUDE, { toLine: 2 }).map(e => e.L), [2]);
  assert.deepEqual(claude.readEntries(CLAUDE, { fromLine: 16 }), []);
});

test('claude: listTranscripts finds subdir sessions by prefix, drops prefix collisions by cwd', () => {
  const d = tmp();
  const repo = path.join(d, 'work', 'repo');
  const projects = path.join(d, 'projects');
  const enc = claude.encodeProjectDir(repo);
  const put = (dir, name, cwd) => {
    fs.mkdirSync(path.join(projects, dir), { recursive: true });
    fs.writeFileSync(path.join(projects, dir, name), line({ type: 'summary' }) + line({ type: 'user', cwd, message: { content: 'x' } }));
  };
  put(enc, 'aaaaaaaa-1.jsonl', repo);
  put(claude.encodeProjectDir(path.join(repo, 'sub')), 'bbbbbbbb-2.jsonl', path.join(repo, 'sub'));
  put(enc + '2', 'cccccccc-3.jsonl', repo + '2');
  put('-other', 'dddddddd-4.jsonl', repo);
  fs.mkdirSync(path.join(projects, enc, 'aaaaaaaa-1', 'subagents'), { recursive: true });
  fs.writeFileSync(path.join(projects, enc, 'notes.txt'), 'x');
  const got = claude.listTranscripts(repo, { projectsDir: projects });
  assert.deepEqual(got.map(f => f.sid).sort(), ['claude:aaaaaaaa', 'claude:bbbbbbbb']);
  const f = got.find(x => x.sid === 'claude:aaaaaaaa');
  assert.equal(f.source, 'claude');
  assert.equal(f.cwd, repo);
  assert.ok(f.size > 0 && f.mtimeMs > 0);
  assert.deepEqual(claude.listTranscripts(repo, { projectsDir: path.join(d, 'missing') }), []);
});

test('codex: sessionId, sessionMeta, countLines', () => {
  assert.equal(codex.sessionId(CODEX), 'codex:eeeeffff');
  assert.deepEqual(codex.sessionMeta(CODEX), { id: '0f9e8d7c-aaaa-7bbb-8ccc-ddddeeeeffff', cwd: '/fake/repo/sub', ts: '2026-01-10T09:00:00.000Z' });
  assert.equal(codex.countLines(CODEX), 23);
});

test('codex: patchPaths reads Update/Add/Delete (and Move to) headers', () => {
  const p = '*** Begin Patch\n*** Update File: a/b.md\n@@\n*** Move to: a/c.md\n*** Add File: d.txt \n*** Delete File: e.txt\n*** Update File: a/b.md\n*** End Patch';
  assert.deepEqual(codex.patchPaths(p), ['a/b.md', 'a/c.md', 'd.txt', 'e.txt']);
  assert.deepEqual(codex.patchPaths('no patch here'), []);
});

test('codex: readEntries maps messages, tools, outputs, exit codes', () => {
  const es = codex.readEntries(CODEX);
  const brief = es.map(e => [e.L, e.kind, e.op ?? '', e.name ?? '']);
  assert.deepEqual(brief, [
    [5, 'user', '', ''],
    [8, 'tool', 'shell', 'exec_command'],
    [9, 'result', '', 'exec_command'],
    [10, 'tool', 'write', 'apply_patch'],
    [11, 'result', '', 'apply_patch'],
    [12, 'tool', 'shell', 'shell'],
    [13, 'result', '', 'shell'],
    [14, 'tool', 'shell', 'exec_command'],
    [15, 'result', '', 'exec'],
    [16, 'tool', 'write', 'apply_patch'],
    [16, 'tool', 'shell', 'exec_command'],
    [17, 'result', '', 'exec'],
    [18, 'assistant', '', ''],
    [21, 'tool', 'other', 'wait'],
    [22, 'result', '', 'wait'],
  ]);
  const at = (L, i = 0) => es.filter(e => e.L === L)[i];
  assert.equal(at(5).text, 'Số lỗi giảm từ 12 xuống 9 rồi.');
  assert.equal(at(5).ts, '2026-01-10T09:04:00.000Z');
  assert.equal(at(8).text, 'git push --force origin main');
  assert.equal(at(9).exitCode, 1);
  assert.deepEqual(at(10).paths, ['.codex/config.toml', 'src/moi.mjs', 'cu.txt']);
  assert.equal(at(11).exitCode, null);
  assert.equal(at(11).isError, false);
  assert.equal(at(12).text, 'git rebase -i HEAD~3');
  assert.equal(at(13).exitCode, 0);
  assert.equal(at(13).text, 'đã rebase');
  assert.equal(at(14).text, 'git reset --hard HEAD');
  assert.equal(at(15).exitCode, 128);
  assert.doesNotMatch(at(15).text, /Script completed|Wall time/);
  assert.deepEqual(at(16).paths, ['AGENTS.md']);
  assert.equal(at(16, 1).text, 'ls -la');
  assert.equal(at(17).isError, true);
  assert.equal(at(17).exitCode, null);
  assert.equal(at(22).exitCode, null);
  assert.ok(!es.some(e => /luật hệ thống|environment_context|tóm tắt 1/.test(e.text)));
  assert.deepEqual(codex.readEntries(CODEX, { fromLine: 9, toLine: 11 }).map(e => e.L), [9, 10, 11]);
});

test('codex: older shapes (local_shell_call, shell apply_patch, success:false)', () => {
  const d = tmp();
  const f = path.join(d, 'rollout-x-11111111-2222-3333-4444-555555555555.jsonl');
  const ri = p => line({ timestamp: 't', type: 'response_item', payload: p });
  fs.writeFileSync(f,
    ri({ type: 'local_shell_call', call_id: 'a', action: { type: 'exec', command: ['bash', '-lc', 'git commit --amend'] } }) +
    ri({ type: 'local_shell_call_output', call_id: 'a', output: { content: 'không được', success: false } }) +
    ri({ type: 'function_call', name: 'shell', call_id: 'b', arguments: JSON.stringify({ command: ['apply_patch', '*** Begin Patch\n*** Add File: hooks/x.sh\n+a\n*** End Patch'] }) }) +
    ri({ type: 'function_call', name: 'apply_patch', call_id: 'c', arguments: JSON.stringify({ input: '*** Begin Patch\n*** Update File: CLAUDE.md\n*** End Patch' }) }));
  const es = codex.readEntries(f);
  assert.deepEqual(es.map(e => [e.kind, e.op ?? '']), [['tool', 'shell'], ['result', ''], ['tool', 'write'], ['tool', 'write']]);
  assert.equal(es[0].text, 'git commit --amend');
  assert.equal(es[1].isError, true);
  assert.deepEqual(es[2].paths, ['hooks/x.sh']);
  assert.deepEqual(es[3].paths, ['CLAUDE.md']);
  assert.equal(codex.sessionId(f), 'codex:55555555');
});

test('codex: listTranscripts walks YYYY/MM/DD and keeps cwd inside repo', () => {
  const d = tmp();
  const repo = path.join(d, 'repo');
  const sessions = path.join(d, 'sessions');
  const put = (day, uuid, cwd) => {
    const dir = path.join(sessions, '2026', '01', day);
    fs.mkdirSync(dir, { recursive: true });
    const f = path.join(dir, `rollout-2026-01-${day}T10-00-00-${uuid}.jsonl`);
    fs.writeFileSync(f, line({ timestamp: 't', type: 'session_meta', payload: { id: uuid, cwd } }));
  };
  put('10', 'aaaaaaaa-0000-7000-8000-000000000001', path.join(repo, 'pkg'));
  put('11', 'bbbbbbbb-0000-7000-8000-000000000002', repo + '-other');
  put('11', 'cccccccc-0000-7000-8000-000000000003', repo);
  fs.writeFileSync(path.join(sessions, '2026', '01', '11', 'notes.jsonl'), '');
  const got = codex.listTranscripts(repo, { sessionsDir: sessions });
  assert.deepEqual(got.map(f => f.sid).sort(), ['codex:00000001', 'codex:00000003'], 'uuid tail: UUIDv7 heads repeat');
  assert.ok(got.every(f => f.source === 'codex' && f.cwd));
  assert.deepEqual(codex.listTranscripts(repo, { sessionsDir: path.join(d, 'none') }), []);
});
