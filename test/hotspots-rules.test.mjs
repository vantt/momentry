// Hotspot vocabulary table (lib/rules/hotspots.json): validation, fallback to the built-in table, and equivalence with the
// detectors as they were before the vocabulary left the code (test/fixtures/hotspots-legacy.mjs, frozen).
// Real transcripts: the eval sessions named by `path:` in docs/_private/eval/labels/*.md (or MOMENTRY_EVAL_LABELS),
// read in place when present on this machine; mismatches report line numbers and detector names only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as hot from '../lib/hotspots.mjs';
import { DEFAULT_RULES } from '../lib/hotspots-default.mjs';
import * as legacy from './fixtures/hotspots-legacy.mjs';
import * as claude from '../lib/sources/claude.mjs';
import * as codex from '../lib/sources/codex.mjs';
import * as pi from '../lib/sources/pi.mjs';
import * as agy from '../lib/sources/agy.mjs';
import { sourceOf } from '../lib/pipeline.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIX = path.join(ROOT, 'test', 'fixtures');
const shipped = () => JSON.parse(fs.readFileSync(hot.RULES_FILE, 'utf8'));
const clone = (t) => JSON.parse(JSON.stringify(t));
const READERS = { claude, codex, pi, omp: pi, agy };

/** Throws a RulesError whose entry is `entry`. */
function rejects(mutate, entry, why) {
  const t = shipped();
  mutate(t);
  assert.throws(() => hot.compileRules(t), (e) => {
    assert.ok(e instanceof hot.RulesError, e.message);
    assert.equal(e.entry, entry);
    if (why) assert.match(e.message, why);
    return true;
  });
}

test('the shipped table and the built-in default both compile', () => {
  const r = hot.compileRules(shipped());
  for (const k of ['harness', 'block', 'pair', 'git', 'meta', 'choiceWord', 'pushStart', 'pushAny']) assert.ok(r[k] instanceof RegExp, k);
  assert.equal(r.lessonKinds.length, 4);
  hot.compileRules(DEFAULT_RULES);
  assert.equal(hot.rules(), hot.rules(), 'compiled once and cached');
  // detectors passed as callbacks get an index as second argument and still use the shipped table
  const turns = [{ L: 1, kind: 'user', text: 'chọn A', bip: false }, { L: 2, kind: 'user', text: '<x>', bip: false }];
  assert.equal(turns.filter(hot.isOwnerTurn).length, 1);
  assert.deepEqual(turns.map(hot.metricPair), [null, null]);
});

test('the shipped table is NFC and every entry id is unique within its list', () => {
  const text = fs.readFileSync(hot.RULES_FILE, 'utf8');
  assert.equal(text, text.normalize('NFC'));
  const walk = (v, where) => {
    if (Array.isArray(v)) {
      const ids = v.filter((x) => x && typeof x === 'object').map((x) => x.id).filter(Boolean);
      assert.equal(new Set(ids).size, ids.length, `duplicate id in ${where}`);
    } else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, `${where}.${k}`);
  };
  walk(shipped(), '');
});

test('validation names the bad entry', () => {
  rejects((t) => { t.ownerVoice.choiceWords.vi[1] = 'đồng (ý'; }, 'ownerVoice.choiceWords.vi[1]', /regex sai/);
  rejects((t) => { t.blocked.patterns[1].pattern = '[unclosed'; }, 'blocked.patterns[1] (tool-use-blocked)', /regex sai/);
  // valid without the u flag, invalid with it: fragments are checked with the flags of the regex they join
  rejects((t) => { t.metricPair.unitWords.en.push('\\-x'); }, 'metricPair.unitWords.en[9]', /regex sai/);
  rejects((t) => { t.gitReversal.commands.push('(stash)'); }, 'gitReversal.commands[7]', /nhóm bắt/);
  rejects((t) => { t.ownerVoice.choiceWords.vi.push('cho\u0323n'); }, 'ownerVoice.choiceWords.vi[5]', /NFC/);
  rejects((t) => { t.metaWrite.paths.push(''); }, 'metaWrite.paths[8]', /không rỗng/);
  rejects((t) => { t.ownerVoice.address = { vi: [] }; }, 'ownerVoice.address', /rỗng/);
  rejects((t) => { delete t.harnessText.prefixes; }, 'harnessText.prefixes', /thiếu/);
  rejects((t) => { t.ownerVoice.choiceWord = ['x']; }, 'ownerVoice.choiceWord', /lạ/);
  rejects((t) => { t.blocked.patterns[0].label = 'x'; }, 'blocked.patterns[0] (hook-veto)', /khoá lạ/);
  rejects((t) => { t.lessonWrite.kinds[1].flags = 'gi'; }, 'lessonWrite.kinds[1] (decision)', /flags/);
  rejects((t) => { t.lessonWrite.kinds[0].label = ' '; }, 'lessonWrite.kinds[0] (memory)', /label/);
  rejects((t) => { t.version = 2; }, 'version');
  rejects((t) => { t.extra = {}; }, 'extra');
  assert.throws(() => hot.compileRules(null), hot.RulesError);
});

test('a bad or missing table falls back to the built-in default and warns', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'momentry-hotspot-rules-'));
  try {
    const bad = path.join(dir, 'hotspots.json');
    const t = shipped();
    t.ownerVoice.pushbackStart.vi[0] = '(?<x';
    t.ownerVoice.pushbackStart.vi.push('tuyệt');
    fs.writeFileSync(bad, JSON.stringify(t));
    const warnings = [];
    const r = hot.loadRules(bad, { warn: (m) => warnings.push(m) });
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /ownerVoice\.pushbackStart\.vi\[0\].*mặc định/);
    const turn = (text) => ({ L: 1, kind: 'user', text, bip: false });
    assert.equal(hot.ownerVoice(turn('không, làm lại'), 0, r), 'chủ phản đối hoặc thúc', 'default vocabulary in use');
    assert.equal(hot.ownerVoice(turn('tuyệt vời'), 0, r), null, 'nothing from the bad table');

    fs.writeFileSync(bad, '{ not json');
    hot.loadRules(bad, { warn: (m) => warnings.push(m) });
    assert.match(warnings[1], /JSON sai/);
    hot.loadRules(path.join(dir, 'missing.json'), { warn: (m) => warnings.push(m) });
    assert.match(warnings[2], /không đọc được/);
    assert.deepEqual(hot.loadRules(hot.RULES_FILE, { warn: (m) => warnings.push(m) }).pair, hot.rules().pair);
    assert.equal(warnings.length, 3, 'the shipped table loads without a warning');

    // the default warner writes each message once per process
    const writes = [];
    const orig = process.stderr.write;
    process.stderr.write = (s) => { writes.push(String(s)); return true; };
    try { hot.loadRules(path.join(dir, 'gone.json')); hot.loadRules(path.join(dir, 'gone.json')); } finally { process.stderr.write = orig; }
    assert.equal(writes.length, 1);
    assert.match(writes[0], /^momentry: .*gone\.json.*mặc định/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---- equivalence with the frozen detectors ----

const NEW = { default: hot.compileRules(DEFAULT_RULES), shipped: hot.compileRules(shipped()) };
// The built-in default must always match the frozen detectors. The shipped table must too while it carries the same
// vocabulary; once it deliberately grows, its differences are listed as diagnostics (measure them with scripts/eval).
const strip = (v) => (Array.isArray(v) ? v.map(strip) : v && typeof v === 'object'
  ? Object.fromEntries(Object.entries(v).filter(([k]) => k !== '$comment' && k !== 'comment').map(([k, x]) => [k, strip(x)])) : v);
const SHIPPED_IS_DEFAULT = JSON.stringify(strip(shipped())) === JSON.stringify(strip(clone(DEFAULT_RULES)));

/** Per entry, every detector's output (with the same stretch counter as detect). */
function signals(entries, impl, r) {
  const out = [];
  let stretch = 0;
  for (const e of entries) {
    const row = r
      ? [impl.nonzeroExit(e, r), impl.blocked(e, r), impl.metricPair(e, r), impl.gitReversal(e, r), impl.metaWrite(e, r), impl.lessonWrite(e, r), impl.ownerVoice(e, stretch, r), impl.isOwnerTurn(e, r)]
      : [impl.nonzeroExit(e), impl.blocked(e), impl.metricPair(e), impl.gitReversal(e), impl.metaWrite(e), impl.lessonWrite(e), impl.ownerVoice(e, stretch), impl.isOwnerTurn(e)];
    out.push(row);
    stretch = (r ? impl.isOwnerTurn(e, r) : impl.isOwnerTurn(e)) || e.bip ? 0 : stretch + 1;
  }
  return out;
}
const NAMES = ['nonzeroExit', 'blocked', 'metricPair', 'gitReversal', 'metaWrite', 'lessonWrite', 'ownerVoice', 'isOwnerTurn'];

/** Asserts identical detector output and identical detect() lists; failures name lines and detectors, not text. */
function assertSame(label, entries, t) {
  const old = signals(entries, legacy);
  const oldHs = legacy.detect(entries);
  for (const [name, r] of Object.entries(NEW)) {
    const now = signals(entries, hot, r);
    const diff = [];
    now.forEach((row, i) => row.forEach((v, k) => { if (v !== old[i][k]) diff.push(`L${entries[i].L} ${NAMES[k]}`); }));
    if (name === 'shipped' && !SHIPPED_IS_DEFAULT) {
      t.diagnostic(`${label}: shipped table changes ${diff.length} detector outputs${diff.length ? ': ' + diff.slice(0, 20).join(', ') : ''}`);
      continue;
    }
    assert.deepEqual(diff.slice(0, 20), [], `${label}, ${name} table: detectors differ`);
    const hs = hot.detect(entries, { rules: r });
    assert.equal(hs.length, oldHs.length, `${label}, ${name} table: hotspot count`);
    assert.ok(hs.every((h, i) => JSON.stringify(h) === JSON.stringify(oldHs[i])), `${label}, ${name} table: hotspot lists differ`);
  }
  return oldHs.length;
}

const u = (L, text, bip = false) => ({ L, ts: null, kind: 'user', text, bip });
const a = (L, text) => ({ L, ts: null, kind: 'assistant', text });
const sh = (L, text) => ({ L, ts: null, kind: 'tool', name: 'Bash', op: 'shell', paths: [], text });
const wr = (L, p) => ({ L, ts: null, kind: 'tool', name: 'Edit', op: 'write', paths: [p], text: p });
const res = (L, text, exitCode = 1, isError = false) => ({ L, ts: null, kind: 'result', name: 'Bash', text, exitCode, isError });

/** Probes for every vocabulary entry, plus near misses (case, word boundaries, NFD, ranges, lockfiles, upstreams). */
function probes() {
  const texts = {
    owner: [
      '[Request interrupted by user]', '[Request interrupted by user for tool use]', 'A', '(b)', 'C.', '2', '1c', '3a!', 'G', 'AB', '(12)',
      'chọn B', 'phương án 2', 'em chọn phương án 2', 'anh đồng ý', 'duyệt', 'PA 1', 'pa2', 'option B', 'go with A', 'pick 3', 'Choose b', 'approve',
      'chọnx', 'options please', 'em em chọn', 'CHỌN A', 'Đồng ý nhé', 'cho\u0323n B',
      'không', 'Không phải vậy', 'khong dung', 'ko', 'no', 'Nope.', 'stop', 'dừng lại', 'Đừng sửa file đó', 'sai rồi', 'wrong file', 'why?',
      'nothing', 'kokoro', 'stopwatch', 'whyever', 'nobody', 'khôngx', 'saigon',
      'sao lại xoá', 'sao mà chậm', 'sao vẫn lỗi', 'sao chưa xong', 'thông minh hơn đi', 'lâu quá', 'quá lâu rồi', 'mãi chưa xong', 'mãi mà chưa',
      'làm gì mà lâu', 'too slow', 'this is taking too long', 'why did you do that', 'Why are we here', 'why is it', 'why do', 'why would', 'ok but why did it', "that's wrong", 'thats wrong',
      'SAO LẠI THẾ', 'Too Slow', 'x'.repeat(250) + ' sao lại', 'không ' + 'y'.repeat(320), 'ok', 'tiếp tục', 'cảm ơn',
      '<task-notification>done</task-notification>', '  <command-name>/clear</command-name>', 'Another Claude session sent you a message', 'another claude session sent',
    ],
    numbers: [
      '4 301 → 1 360', '1.360 -> 980', '0,667 => 0,72', '8,3% lên 9,1%', '10 xuống 7', '3 thành 5', '5 tới 9', '12 to 40', '12 TO 40', '7 Lên 8',
      'rows 0 to 190', 'lines 3 to 9', 'dòng 12 tới 40', 'Dòng 12 tới 40', 'hàng 1 tới 4', 'page 2 to 5', 'trang 3 tới 7', 'bytes 0 to 99', 'chars 1 to 80', 'ký tự 1 tới 20',
      'mapping-0241 to 0300', '#12 to #14', 'id_3 to 9', 'v/2 to 3', 'a-1 to 2',
      '0 to 190 rows', '12 tới 40 dòng', '1 to 5 files', '3 tới 7 ngày', '2 to 4 days', '1 tới 2 tuần', '2 to 3 weeks', '1 tới 3 tháng', '2 to 6 months',
      '5 to 10 pages', '3 tới 9 trang', '10 to 20 kb', '1 to 2 GiB', '5 to 9 b', '1 to 2 bytes', '5 to 9 lines', '3 tới 4 hàng', '2 to 3 rowsx', '2 to 3 dòngx',
      '1 to 2 Kb', '5 lên 9 dòng', '1 → 1', '01 → 2', '1,000 → 2,000', '1 000 → 1 000', '3.5 → 3,5', 'from 3 to 4 users', 'abc 3 → 4',
    ],
    shell: [
      'git reset --hard HEAD~1', 'git revert abc', 'git rebase -i HEAD~3', 'git rebase origin/main', 'git rebase main', 'git rebase --onto main x', 'git rebase upstream/dev',
      'git rebase @{u}', 'git rebase @{upstream}', 'git rebase develop', 'git rebase trunk', 'git rebase master', 'git rebase feature', 'git rebase --abort',
      'git rebase --autosquash main', 'git rebase -i main', 'git rebase --abort main', 'git rebase --onto x main', 'git rebase --root main', 'git rebase --exec "x" main', 'git rebase --root', 'git rebase --interactive main',
      'git restore src/a.js', 'git checkout -- src/a.js', 'git checkout -- package-lock.json', 'git checkout -- pnpm-lock.yaml yarn.lock', 'git checkout -- "Cargo.lock"',
      'git checkout -- a.lock src/b.js', 'git checkout main', 'git commit --amend --no-edit', 'git push -f', 'git push --force-with-lease', 'git push origin main',
      'git merge --squash x', 'squash commits', 'git status && git reset HEAD', 'cat <<EOF > notes.md\ngit reset --hard\nEOF', 'echo ok; git stash',
      'echo x > memory/note.md', 'echo x >> docs/decisions/0001.md', 'echo x | tee -a journal/2026.md', 'cp a.md CHANGELOG.md', 'mv tmp.md docs/adr/0002.md',
      'install -m 644 a MEMORY.md', 'cp -r a b/journals/x.md', 'cat <<EOF > CHANGELOG.md\nbody\nEOF', 'echo x > /dev/null', 'echo x 2> err.log', 'echo x &> journal/a.md',
    ],
    writes: [
      '/r/.claude/settings.json', '/r/.claude/settings.local.json', 'settings.json', '/r/.codex/config.toml', '/r/.agents/x.md', '/r/AGENTS.md', 'CLAUDE.md',
      '/r/skills/x/SKILL.md', '/r/hooks/pre.sh', '/r/hook/x.sh', '/r/myskills/x.md', '/r/.claude/memory/x.md', 'C:\\r\\.claude\\agents\\a.md',
      '/r/memory/lessons.md', '/r/MEMORY.md', '/r/docs/decisions/x.md', '/r/decision/x.md', '/r/ADR-0003.md', '/r/adr_1.md', '/r/ADRS/x.md', '/r/journal/a.md', '/r/journals/b.md',
      '/r/CHANGELOG.md', '/r/changelog', '/r/CHANGELOG.txt', '/r/src/index.mjs', 'C:\\r\\memory\\a.md',
    ],
    results: [
      'PreToolUse:Bash hook error: denied', '<tool_use_error>Blocked: path outside', 'Permission for this command was denied', 'Permission to use Bash has been denied',
      'permission to use Write denied', 'This agent is isolated in the worktree /x', 'Command blocked by the sandbox', 'blocked by sandbox', 'sandbox policy denied write',
      'Sandbox: operation blocked', 'x'.repeat(420) + ' blocked by sandbox', 'Error: ENOENT', 'make: *** [all] Error 2', '',
    ],
  };
  const out = [];
  let L = 1;
  for (const t of texts.owner) { out.push(u(L++, t)); out.push(a(L++, 'ok')); }
  for (const t of texts.numbers) { out.push(a(L++, t)); out.push(u(L++, t)); }
  out.push(u(L++, '<local-command-stdout>4 → 5</local-command-stdout>'));
  for (const t of texts.shell) out.push(sh(L++, t));
  for (const p of texts.writes) { out.push(wr(L++, p)); out.push(sh(L++, `echo x > ${p}`)); }
  for (const t of texts.results) { out.push(res(L++, t)); out.push(res(L++, t, null, true)); out.push(res(L++, t, 0)); out.push({ ...res(L++, t), rejected: true }); }
  for (let i = 0; i < 35; i++) out.push(a(L++, 'chạy tiếp'));
  out.push(u(L++, 'ừ'));
  out.push(u(L++, '/bip đây', true));
  return out;
}

test('equivalence: vocabulary probes give identical detector output and hotspots', (t) => {
  const entries = probes();
  // every detector fires somewhere, so the probes exercise each list
  const fired = new Set(legacy.detect(entries, { window: 0 }).map((h) => h.kind));
  assert.deepEqual([...fired].sort(), ['bip', 'blocked', 'gitReversal', 'lessonWrite', 'metaWrite', 'metricPair', 'nonzeroExit', 'ownerVoice']);
  // spaced out so the merge window keeps every hit apart, then dense
  assertSame('probes', entries.map((e, i) => ({ ...e, L: i * 10 + 1 })), t);
  assertSame('probes dense', entries, t);
});

test('equivalence: fixture transcripts', (t) => {
  const files = fs.readdirSync(FIX, { recursive: true }).filter((f) => f.endsWith('.jsonl')).map((f) => path.join(FIX, f));
  assert.ok(files.length >= 5);
  let total = 0;
  for (const f of files) {
    const src = f.includes(`${path.sep}agy${path.sep}`) ? 'agy' : sourceOf(f);
    let entries;
    try { entries = READERS[src].readEntries(f); } catch { continue; } // not a transcript
    total += assertSame(path.relative(FIX, f), entries, t);
  }
  assert.ok(total > 5, `fixture hotspots: ${total}`);
});

/** Eval sessions listed in labels frontmatter, existing on this machine. */
function evalSessions() {
  const dir = process.env.MOMENTRY_EVAL_LABELS || path.join(ROOT, 'docs', '_private', 'eval', 'labels');
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.md'))) {
    const fm = fs.readFileSync(path.join(dir, f), 'utf8').match(/^---\n([\s\S]*?)\n---/)?.[1];
    if (!fm) continue;
    const get = (k) => fm.match(new RegExp(`^${k}:\\s*(.+)$`, 'm'))?.[1].trim();
    const p = get('path')?.replace(/^~(?=\/|$)/, os.homedir());
    if (p && fs.existsSync(p)) out.push({ id: path.basename(f, '.md'), host: get('host') || sourceOf(p), path: p });
  }
  return out;
}

test('equivalence: real eval transcripts on this machine', (t) => {
  const sessions = evalSessions();
  if (!sessions.length) return t.skip('no eval transcripts on this machine');
  for (const s of sessions) {
    const reader = READERS[s.host];
    assert.ok(reader, `${s.id}: unknown host ${s.host}`);
    const n = assertSame(`session ${s.id}`, reader.readEntries(s.path), t);
    t.diagnostic(`${s.id} ${s.host}: ${n} hotspots`);
  }
});
