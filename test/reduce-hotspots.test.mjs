import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as claude from '../lib/sources/claude.mjs';
import * as codex from '../lib/sources/codex.mjs';
import * as reduce from '../lib/reduce.mjs';
import * as hot from '../lib/hotspots.mjs';

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'transcripts');
const CLAUDE = path.join(FIX, 'claude-session.jsonl');
const CODEX = path.join(FIX, 'rollout-2026-01-10T09-00-00-0f9e8d7c-aaaa-7bbb-8ccc-ddddeeeeffff.jsonl');

const user = (L, text) => ({ L, ts: null, kind: 'user', text, bip: false });
const agent = (L, text) => ({ L, ts: null, kind: 'assistant', text });
const shell = (L, text, name = 'Bash') => ({ L, ts: null, kind: 'tool', name, op: 'shell', paths: [], text });
const write = (L, paths, name = 'Edit') => ({ L, ts: null, kind: 'tool', name, op: 'write', paths, text: paths[0] ?? '' });
const result = (L, text, exitCode = null, isError = false) => ({ L, ts: null, kind: 'result', name: 'Bash', text, exitCode, isError });

test('approxTokens = chars / 3.2', () => {
  assert.equal(reduce.approxTokens(320), 100);
  assert.equal(reduce.approxTokens('x'.repeat(32)), 10);
  assert.equal(reduce.approxTokens(''), 0);
});

test('renderEntry cuts by kind and marks …[+n]', () => {
  assert.equal(reduce.renderEntry(user(3, '  chào  ')), '[L3] USER: chào');
  const u = reduce.renderEntry(user(1, 'a'.repeat(2600)));
  assert.ok(u.endsWith(' …[+100]'));
  assert.equal(u.length, '[L1] USER: '.length + 2500 + ' …[+100]'.length);
  assert.ok(reduce.renderEntry(agent(1, 'b'.repeat(2001))).endsWith('b …[+1]'));
  const t = reduce.renderEntry(shell(7, 'echo  a\n  b ' + 'c'.repeat(400)));
  assert.ok(t.startsWith('[L7] TOOL Bash: echo a b ccc'));
  assert.ok(t.endsWith(' …[+109]'));
  assert.equal(reduce.renderEntry({ ...shell(7, 'ls'), name: undefined }), '[L7] TOOL shell: ls');
});

test('renderEntry: result keeps 2 first lines, or 3 last lines on non-zero exit', () => {
  const text = 'một\n\nhai\nba\nbốn\nnăm';
  assert.equal(reduce.renderEntry(result(5, text)), '[L5] RESULT: một | hai');
  assert.equal(reduce.renderEntry(result(5, text, 2)), '[L5] RESULT (exit 2): ba | bốn | năm');
  assert.equal(reduce.renderEntry(result(5, text, null, true)), '[L5] RESULT (exit error): ba | bốn | năm');
  assert.equal(reduce.renderEntry(result(5, text, 0)), '[L5] RESULT: một | hai');
  assert.ok(reduce.renderEntry(result(5, 'x'.repeat(300))).endsWith(' …[+50]'));
  assert.ok(reduce.renderEntry(result(5, 'x'.repeat(600), 1)).endsWith(' …[+100]'));
});

test('render on the fake Claude transcript: no thinking, no compact, no reminders', () => {
  const { text, approxTokens } = reduce.render(claude.readEntries(CLAUDE));
  assert.equal(approxTokens, reduce.approxTokens(text));
  assert.match(text, /^\[L2\] USER: Đo lại máy/);
  assert.match(text, /\[L5\] RESULT \(exit 144\): dòng hai \| dòng ba \| dòng bốn/);
  assert.match(text, /\[L7\] USER: \/bip cái máy tự tắt/);
  assert.doesNotMatch(text, /compact|nghĩ thầm|system-reminder/i);
  assert.equal(text.split('\n').length, 12);
});

const many = (n, size = 100) => Array.from({ length: n }, (_, i) => agent(i + 1, 'x'.repeat(size)));

test('chunk: one chunk when it fits', () => {
  const es = many(10);
  const cs = reduce.chunk(es, 1e6);
  assert.equal(cs.length, 1);
  assert.equal(cs[0].k, 1);
  assert.equal(cs[0].entries.length, 10);
  assert.deepEqual([cs[0].fromLine, cs[0].toLine], [1, 10]);
  assert.equal(cs[0].owns.size, 10);
  assert.deepEqual(reduce.chunk([], 100), []);
});

test('chunk: splits on entry boundaries with overlap; overlap owned by first chunk', () => {
  const es = many(100);
  const line = reduce.renderEntry(es[0]).length + 1;
  const max = Math.floor((line * 40) / 3.2);
  const cs = reduce.chunk(es, max, 5);
  assert.ok(cs.length > 2);
  for (const c of cs) assert.ok(reduce.render(c.entries).approxTokens <= max, `chunk ${c.k} too big`);
  for (let i = 1; i < cs.length; i++) {
    const prev = cs[i - 1], c = cs[i];
    assert.equal(c.k, i + 1);
    assert.deepEqual(c.entries.slice(0, 5).map(e => e.L), prev.entries.slice(-5).map(e => e.L));
    for (const e of c.entries.slice(0, 5)) assert.ok(prev.owns.has(e.L) && !c.owns.has(e.L));
  }
  const all = cs.flatMap(c => [...c.owns]);
  assert.equal(all.length, 100);
  assert.equal(new Set(all).size, 100);
  assert.equal(cs.at(-1).toLine, 100);
});

test('chunk: hotspot in the overlap belongs to the first chunk only', () => {
  const es = many(60);
  es[33] = { ...result(34, 'lỗi', 1) };
  const line = reduce.renderEntry(es[0]).length + 1;
  const cs = reduce.chunk(es, Math.floor((line * 36) / 3.2), 10);
  const hs = hot.detect(es);
  assert.deepEqual(hs.map(h => h.id), ['H34']);
  const holders = cs.filter(c => c.entries.some(e => e.L === 34));
  assert.equal(holders.length, 2);
  assert.deepEqual(cs.filter(c => c.owns.has(34)).map(c => c.k), [holders[0].k]);
});

test('chunk: overlap shrinks so every chunk adds new entries; oversized entry still progresses', () => {
  const es = many(10, 100);
  const cs = reduce.chunk(es, 40, 20);
  assert.equal(cs.length, 10);
  assert.ok(cs.every(c => c.owns.size === 1));
  const cs2 = reduce.chunk(many(6), Math.floor(((reduce.renderEntry(many(1)[0]).length + 1) * 3) / 3.2), 20);
  assert.ok(cs2.every(c => c.owns.size >= 1));
  assert.equal(cs2.flatMap(c => [...c.owns]).length, 6);
});

test('nonzeroExit', () => {
  const cases = [
    [result(1, '', 144), 'exit 144'],
    [result(1, '', null, true), 'exit error'],
    [result(1, '', 2, true), 'exit 2'],
    [result(1, '', 0), null],
    [result(1, 'Exit code 9 in text only', null, false), null],
    [result(1, '', null, false), null],
    [user(1, 'exit 1'), null],
  ];
  for (const [e, want] of cases) assert.equal(hot.nonzeroExit(e), want, JSON.stringify(e));
});

test('metricPair: every connector, equal pair ignored, only user/assistant', () => {
  for (const c of ['→', '->', '=>', 'lên', 'xuống', 'thành', 'tới', 'to', 'TO'])
    assert.ok(hot.metricPair(agent(1, `từ 3 ${c} 7 giây`)), c);
  assert.equal(hot.metricPair(user(1, '0,667 → 0,307')), 'số 0,667→0,307');
  assert.equal(hot.metricPair(agent(1, '12→9')), 'số 12→9');
  assert.equal(hot.metricPair(agent(1, '0,5 → 0,5')), null);
  assert.equal(hot.metricPair(agent(1, 'tăng 3 lần, rồi 7')), null);
  assert.equal(hot.metricPair(agent(1, 'không có số')), null);
  assert.equal(hot.metricPair(shell(1, 'echo 1 -> 2')), null);
  assert.equal(hot.metricPair(result(1, '1 -> 2', 0)), null);
});

test('gitReversal: shell op only', () => {
  const pos = {
    'git reset --hard HEAD~1': 'git reset', 'git revert abc': 'git revert', 'git rebase -i HEAD~3': 'git rebase',
    'git restore a.txt': 'git restore', 'git checkout -- a.txt': 'git checkout --', 'git commit --amend -m x': 'git commit --amend',
    'git push -f': 'git push -f', 'git push --force origin main': 'git push --force', 'gom squash 6 commit': 'git squash',
  };
  for (const [cmd, want] of Object.entries(pos)) assert.equal(hot.gitReversal(shell(1, cmd)), want, cmd);
  for (const cmd of ['git status', 'git checkout main', 'git commit -m x', 'git push origin main', 'echo reset'])
    assert.equal(hot.gitReversal(shell(1, cmd)), null, cmd);
  assert.equal(hot.gitReversal({ ...shell(1, 'git reset --hard'), op: 'other' }), null);
  assert.equal(hot.gitReversal(agent(1, 'git reset --hard')), null);
  assert.equal(hot.gitReversal(shell(1, 'git reset --hard', 'exec_command')), 'git reset');
});

test('metaWrite: write op, any listed path', () => {
  const pos = ['/r/.claude/settings.json', '.codex/config.toml', '/r/.agents/x.md', 'AGENTS.md', '/r/CLAUDE.md',
    'skills/a/SKILL.md', '/r/hooks/pre.sh', 'hook/x', 'settings.local.json', 'C:\\r\\.claude\\x.md'];
  for (const p of pos) assert.ok(hot.metaWrite(write(1, [p])), p);
  assert.equal(hot.metaWrite(write(1, ['/r/.claude/settings.json'])), 'ghi meta settings.json');
  assert.equal(hot.metaWrite(write(1, ['src/a.mjs', 'AGENTS.md'], 'apply_patch')), 'ghi meta AGENTS.md');
  for (const p of ['src/a.mjs', 'docs/skillset.md', 'mysettings.json.bak/x', 'README.md']) assert.equal(hot.metaWrite(write(1, [p])), null, p);
  assert.equal(hot.metaWrite(write(1, [])), null);
  assert.equal(hot.metaWrite({ ...shell(1, 'vim .claude/x'), paths: ['.claude/x'] }), null);
});

test('bipMark', () => {
  assert.equal(hot.bipMark({ ...user(1, '/bip'), bip: true }), 'bip');
  assert.equal(hot.bipMark(user(1, '/bip')), null);
  assert.equal(hot.bipMark({ ...agent(1, 'x'), bip: true }), null);
});

test('detect: global H<L> ids, same-kind merge within 5 lines, kinds kept apart', () => {
  const es = [
    result(10, '', 1), result(15, '', 2), result(20, '', 3), result(30, '', 1),
    agent(12, '1 → 2'), shell(13, 'git reset --hard'),
    { ...user(40, '/bip'), bip: true },
    result(50, '', 1), agent(50, '4 → 5'),
    result(60, '', null), result(61, '', 0),
  ].sort((a, b) => a.L - b.L);
  const hs = hot.detect(es);
  assert.deepEqual(hs.map(h => [h.id, h.kind, h.L, h.Lend]), [
    ['H10', 'nonzeroExit', 10, 20],
    ['H12', 'metricPair', 12, 12],
    ['H13', 'gitReversal', 13, 13],
    ['H30', 'nonzeroExit', 30, 30],
    ['H40', 'bip', 40, 40],
    ['H50', 'nonzeroExit', 50, 50],
    ['H50a', 'metricPair', 50, 50],
  ]);
  assert.deepEqual(hs[0].signals, ['exit 1', 'exit 2', 'exit 3']);
  assert.equal(hot.detect(es, { window: 4 }).filter(h => h.kind === 'nonzeroExit').length, 5);
  assert.equal(hot.format(hs.slice(0, 2)), 'H10 [L10-L20] exit 1; exit 2; exit 3\nH12 [L12] số 1→2');
  assert.deepEqual(hot.detect([]), []);
});

test('same git reset and .claude/ write give hotspots from both Claude and Codex sources', () => {
  const kinds = es => hot.detect(es).map(h => h.kind).sort();
  const c = kinds(claude.readEntries(CLAUDE));
  assert.deepEqual(c, ['bip', 'gitReversal', 'metaWrite', 'metricPair', 'nonzeroExit']);
  const hc = hot.detect(claude.readEntries(CLAUDE));
  assert.deepEqual(hc.map(h => h.id), ['H2', 'H4', 'H5', 'H7', 'H9']);
  const x = hot.detect(codex.readEntries(CODEX));
  assert.deepEqual(x.map(h => [h.id, h.kind, h.Lend]), [
    ['H5', 'metricPair', 5],
    ['H8', 'gitReversal', 14],
    ['H9', 'nonzeroExit', 9],
    ['H10', 'metaWrite', 10],
    ['H15', 'nonzeroExit', 17],
    ['H16', 'metaWrite', 16],
  ]);
  assert.deepEqual(x[1].signals, ['git push --force', 'git rebase', 'git reset']);
  assert.deepEqual(x[4].signals, ['exit 128', 'exit error']);
  assert.deepEqual(x[3].signals, ['ghi meta config.toml']);
  assert.deepEqual(x[5].signals, ['ghi meta AGENTS.md']);
});
