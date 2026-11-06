// Eval harness (scripts/eval/): label parsing and matching, metric math, replay with --fake-llm. No model calls.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseLabels, matches, slugAll } from '../scripts/eval/labels.mjs';
import { rankMetrics, stepOf, callUsage, stepCosts, addStepCosts, runDiff, mean } from '../scripts/eval/metrics.mjs';
import { loadManifest, runOnce, main } from '../scripts/eval/run.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIX = path.join(HERE, 'fixtures', 'pipeline');

const LABELS = `---
session: 5e5510aa
status: draft
---
Ghi chú ngoài bảng bị bỏ qua.

| # | slug | tiêu đề | dòng | keywords | t | lý do |
|---|---|---|---|---|---|---|
| 1 | mot-ky-tu-unicode | Một ký tự Unicode | 812-830 | Unicode, NFC, chuẩn hoá | x | lý do |
| 2 | tim-kiem | Tìm kiếm tiếng Việt | 1363-1364, 2344-2345 | tìm kiếm, tiếng Việt, dấu |  | khác |
| 3 | repo-only | Chỉ một từ khoá | 50-60 | repo | x | |
`;

const story = (id, title, { hook = '', body = '', lines = [] } = {}) => ({
  id, data: { hook, lines: lines.map((n) => `claude:x#L${n}`) }, body: `\n# ${title}\n\n**Chuyện gì xảy ra:** ${body}\n`,
});

test('label table: frontmatter skipped, columns by header name, t = x, line ranges', () => {
  const L = parseLabels(LABELS, 'f.md');
  assert.equal(L.length, 3);
  assert.deepEqual(L.map((l) => l.t), [true, false, true]);
  assert.deepEqual(L[0].keywords, ['unicode', 'nfc', 'chuan-hoa']);
  assert.deepEqual(L[1].lines, [[1363, 1364], [2344, 2345]]);
  assert.equal(L[0].min, 2);
  assert.equal(L[2].min, 1);
  assert.equal(L[0].name, 'mot-ky-tu-unicode');
});

test('label table: bad t, missing keywords and slug, reversed range are errors with the line', () => {
  const head = '| slug | dòng | keywords | t |\n|---|---|---|---|\n';
  assert.throws(() => parseLabels(`${head}| a | 1-2 | x, y | maybe |`, 'f.md'), /f\.md:3: cột t/);
  assert.throws(() => parseLabels(`${head}|  | 1-2 |  | x |`, 'f.md'), /cần keywords hoặc slug/);
  assert.throws(() => parseLabels(`${head}| a | 9-2 | x | |`, 'f.md'), /ngược/);
  assert.deepEqual(parseLabels('no table here'), []);
});

test('match: slug hint, two keywords ignoring diacritics, whole words only', () => {
  const [uni, search, one] = parseLabels(LABELS);
  assert.ok(matches(story('2026-01-02-mot-ky-tu-unicode-lam-hong', 'X'), uni), 'slug hint');
  assert.ok(matches(story('2026-01-02-a', 'Chuẩn hóa NFC', { body: 'unicode' }), uni), 'keywords without diacritics');
  assert.ok(!matches(story('2026-01-02-a', 'Chỉ unicode'), uni), 'one keyword of three is not enough');
  assert.ok(matches(story('2026-01-02-a', 'b', { hook: 'Tìm kiếm tiếng Việt' }), search), 'hook counts');
  assert.ok(!matches(story('2026-01-02-a', 'report và repository'), one), '"repo" is not part of "report"');
  assert.ok(matches(story('2026-01-02-a', 'sửa repo'), one), 'min 1 with one keyword');
});

test('match: one keyword plus a line inside a label range', () => {
  const [, search] = parseLabels(LABELS);
  assert.ok(matches(story('2026-01-02-a', 'tìm kiếm hỏng', { lines: [2344] }), search));
  assert.ok(!matches(story('2026-01-02-a', 'tìm kiếm hỏng', { lines: [2346] }), search), 'line outside');
  assert.ok(!matches(story('2026-01-02-a', 'chuyện khác', { lines: [1363] }), search), 'line without keyword');
});

test('slugAll folds Vietnamese text into slug words', () => {
  assert.equal(slugAll('  Đường dẫn  Tìm KIẾM '), 'duong-dan-tim-kiem');
});

test('rank metrics: recall, precision@k on short lists, t mean rank, t in top half', () => {
  const labels = parseLabels(LABELS);
  const ranked = [
    story('2026-01-01-a', 'chuẩn hoá NFC unicode'), // label 1 (t)
    story('2026-01-01-b', 'không liên quan'),
    story('2026-01-01-c', 'không liên quan'),
    story('2026-01-01-d', 'tìm kiếm tiếng Việt'), // label 2
    story('2026-01-01-e', 'unicode NFC lần hai'), // label 1 again
  ];
  const m = rankMetrics(ranked, labels);
  assert.equal(m.stories, 5);
  assert.equal(m.found, 2);
  assert.equal(m.recall, 2 / 3);
  assert.equal(m.p5, 3 / 5);
  assert.equal(m.p10, 3 / 5, 'N < 10 divides by N');
  assert.deepEqual(m.perLabel.map((x) => x.ranks), [[1, 5], [4], []]);
  assert.equal(m.tLabels, 2);
  assert.equal(m.tFound, 1);
  assert.equal(m.tMeanRank, 1, 'missing t labels are counted apart, not averaged');
  assert.equal(m.half, 3);
  assert.equal(m.tTopHalf, 1);
  const empty = rankMetrics([], labels);
  assert.equal(empty.p5, null);
  assert.equal(empty.recall, 0);
  assert.equal(rankMetrics([], []).recall, null);
});

test('step of a fake-llm key', () => {
  assert.equal(stepOf('harvest-c1-r1'), 'harvest');
  assert.equal(stepOf('harvest-fill-c2-r1-f1-retry'), 'fill');
  assert.equal(stepOf('cluster-2'), 'cluster');
  assert.equal(stepOf('outsider-c3-1'), 'outsider');
  assert.equal(stepOf('hook-tension-1-retry'), 'hook-tension');
  assert.equal(stepOf('stakes-1'), 'stakes');
  assert.equal(stepOf('mystery-1'), 'other');
});

test('call usage and per-step sums with shares', () => {
  const raw = (usd, ms, u) => ({ total_cost_usd: usd, duration_ms: ms, usage: u });
  const calls = [
    callUsage('harvest-c1-r1', raw(0.3, 60000, { input_tokens: 10, cache_creation_input_tokens: 90000, cache_read_input_tokens: 5000, output_tokens: 4000 })),
    callUsage('outsider-1', raw(0.6, 90000, { input_tokens: 100000, output_tokens: 2000 })),
    callUsage('stakes-1', raw(0.1, 10000, {})),
    callUsage('stakes-1-retry', {}),
  ];
  assert.equal(calls[0].tokIn, 95010);
  assert.equal(calls[0].secs, 60);
  const t = stepCosts(calls);
  assert.deepEqual(Object.keys(t), ['harvest', 'outsider', 'stakes', 'total']);
  assert.equal(t.stakes.calls, 2);
  assert.equal(t.total.calls, 4);
  assert.ok(Math.abs(t.outsider.share - 0.6) < 1e-9);
  assert.ok(Math.abs(t.total.usd - 1) < 1e-9);
  const both = addStepCosts([t, t]);
  assert.equal(both.total.calls, 8);
  assert.ok(Math.abs(both.harvest.share - 0.3) < 1e-9);
});

test('run-to-run difference and label agreement', () => {
  const labels = parseLabels(LABELS);
  const a = { stories: 2, usd: 1, secs: 10, rank: rankMetrics([story('2026-01-01-a', 'unicode NFC'), story('2026-01-01-b', 'tìm kiếm tiếng Việt')], labels) };
  const b = { stories: 3, usd: 1.5, secs: 12, rank: rankMetrics([story('2026-01-01-x', 'khác'), story('2026-01-01-y', 'khác'), story('2026-01-01-a', 'unicode NFC')], labels) };
  const d = runDiff(a, b);
  assert.equal(d.stories, 1);
  assert.equal(d.usd, 0.5);
  assert.equal(d.recall, 1 / 3 - 2 / 3);
  assert.equal(d.labelAgreement, 2 / 3, 'label 2 found only in the first run');
  assert.equal(d.tTopHalfAgreement, 0.5, 'label 1 leaves the top half; label 3 is missing in both');
  assert.deepEqual(runDiff({ stories: 1, usd: null, secs: 1 }, { stories: 1, usd: 2, secs: 1 }), { stories: 0, usd: null, secs: 0 });
  assert.equal(mean([1, null, 3]), 2);
  assert.equal(mean([]), null);
});

function tmp() { return fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'dm-eval-'))); }

test('manifest: validated, labels resolve against its folder', () => {
  const d = tmp();
  const m = path.join(d, 'm.json');
  fs.writeFileSync(m, JSON.stringify({ sessions: [{ id: 'abc', host: 'omp', transcript: '/x/a.jsonl', toLine: 10, labels: 'labels/abc.md' }] }));
  assert.deepEqual(loadManifest(m)[0], { id: 'abc', host: 'omp', transcript: '/x/a.jsonl', fromLine: 1, toLine: 10, labels: path.join(d, 'labels', 'abc.md') });
  const bad = (s, re) => { fs.writeFileSync(m, JSON.stringify({ sessions: [s] })); assert.throws(() => loadManifest(m), re); };
  bad({ id: 'a', host: 'gpt', transcript: '/x', toLine: 1 }, /host/);
  bad({ id: 'a', host: 'claude', transcript: 'rel.jsonl', toLine: 1 }, /tuyệt đối/);
  bad({ id: 'a', host: 'claude', transcript: '/x', fromLine: 5, toLine: 1 }, /toLine/);
  bad({ id: '../a', host: 'claude', transcript: '/x', toLine: 1 }, /id/);
});

/** A captured run made from the pipeline fixtures: transcript window L1-L8 with the `llm-ok` model outputs. */
function fixtureCapture() {
  const d = tmp();
  const tr = path.join(d, '5e5510aa-0000-4000-8000-000000000001.jsonl');
  const mini = fs.readFileSync(path.join(FIX, 'claude-mini.jsonl'), 'utf8').trimEnd().split('\n');
  fs.writeFileSync(tr, mini.slice(0, 8).map((l) => l.replaceAll('__REPO__', '/nowhere')).join('\n') + '\n');
  const env = { PATH: process.env.PATH, HOME: path.join(d, 'home'), TZ: 'UTC' };
  const session = { id: '5e5510aa', host: 'claude', transcript: tr, fromLine: 1, toLine: 8, labels: null };
  return { d, tr, env, session };
}

test('replay with --fake-llm is deterministic and never writes outside the scratch dir', async () => {
  const { d, env, session } = fixtureCapture();
  const once = async (name) => {
    const r = await runOnce({ session, fromLine: 1, toLine: 8, scratch: path.join(d, name), fakeLlm: path.join(FIX, 'llm-ok'), env });
    return { status: r.report.status, usd: r.report.usd, ranked: r.ranked.map(({ id, data, body }) => ({ id, data, body })) };
  };
  const a = await once('one'), b = await once('two');
  assert.equal(a.status, 'done');
  assert.ok(a.ranked.length >= 2);
  assert.deepEqual(b, a);
  assert.ok(!fs.existsSync(path.join(d, 'home')), 'nothing written under HOME');
});

test('harness: replays a stored capture, measures it against labels, writes results', async () => {
  const { d, tr, env, session } = fixtureCapture();
  const out = path.join(d, 'out');
  const run1 = path.join(out, session.id, 'runs', '1');
  fs.mkdirSync(run1, { recursive: true });
  fs.cpSync(path.join(FIX, 'llm-ok'), path.join(run1, 'llm'), { recursive: true });
  const first = await runOnce({ session, fromLine: 1, toLine: 8, scratch: path.join(d, 'cap'), fakeLlm: path.join(run1, 'llm'), env });
  const { windowSha } = await import('../scripts/eval/run.mjs');
  fs.writeFileSync(path.join(run1, 'capture.json'), JSON.stringify({
    id: session.id, run: 1, fromLine: 1, toLine: 8, windowSha: windowSha(tr, 1, 8), report: first.report,
    dryRun: { usd: 0.2 }, ranked: first.ranked.map((s) => ({ id: s.id })),
  }));
  fs.cpSync(run1, path.join(out, session.id, 'runs', '2'), { recursive: true });
  const top = first.ranked[0];
  fs.mkdirSync(path.join(d, 'labels'));
  fs.writeFileSync(path.join(d, 'labels', 'l.md'), `| slug | keywords | t |\n|---|---|---|\n| ${top.id.slice(11)} | zzz | x |\n| khong-co | qqq, www | |\n`);
  const m = path.join(d, 'manifest.json');
  fs.writeFileSync(m, JSON.stringify({ sessions: [{ ...session, labels: 'labels/l.md' }] }));
  const lines = [];
  const code = await main(['--manifest', m, '--out', out], { out: (s) => lines.push(s), err: (s) => lines.push(s) }, env);
  assert.equal(code, 0, lines.join('\n'));
  const file = fs.readdirSync(path.join(out, 'results'))[0];
  const res = JSON.parse(fs.readFileSync(path.join(out, 'results', file), 'utf8'));
  assert.equal(res.rows.length, 2);
  const r = res.rows[0];
  assert.equal(r.sameAsCapture, true);
  assert.equal(r.windowChanged, false);
  assert.equal(r.rank.recall, 0.5);
  assert.equal(r.rank.tMeanRank, 1);
  assert.equal(r.rank.p5, 1 / Math.min(5, r.stories));
  assert.ok(r.steps.total.calls >= 4);
  assert.equal(res.diffs.length, 1);
  assert.equal(res.diffs[0].diff.labelAgreement, 1);
  assert.ok(!fs.existsSync(path.join(run1, 'replay')), 'replay scratch removed without --keep');
});

test('review page: a label file read and written back keeps every label the harness sees', async () => {
  const { readLabelFile, writeLabelFile } = await import('../scripts/eval/review.mjs');
  const text = `---\nsession: abc12345\nhost: claude\nstatus: draft\n---\n| # | slug | tiêu đề | dòng | keywords | t | lý do |\n|---|---|---|---|---|---|---|\n| 1 | tmp-quota | /tmp hết hạn mức | 487-740 | EDQUOT, worktree | x | Sự cố. |\n| 2 | | Tìm kiếm tiếng Việt | 1363-1364, 2344 | tiếng Việt, dấu | | |\n`;
  const f = readLabelFile(text);
  assert.equal(f.meta.status, 'draft');
  assert.equal(f.rows.length, 2);
  assert.equal(f.rows[0].t, 'x');
  const back = writeLabelFile(f.front, 'reviewed', f.rows);
  assert.match(back, /^status: reviewed$/m);
  assert.deepEqual(parseLabels(back).map((l) => ({ ...l, name: undefined, slugs: undefined })), parseLabels(text).map((l) => ({ ...l, name: undefined, slugs: undefined })));
  assert.deepEqual(parseLabels(back)[1].slugs, ['tim-kiem-tieng-viet'], 'a row without slug gets one from its title');
  const added = writeLabelFile(f.front, 'draft', [...f.rows, { title: 'Bài | có gạch', keywords: 'a, b', t: 'x' }]);
  assert.equal(parseLabels(added).length, 3);
  assert.throws(() => writeLabelFile(f.front, 'draft', [{ title: '', keywords: '' }]), /keywords hoặc slug/);
  const fromFound = writeLabelFile(f.front, 'draft', [{ slug: 'agent-dong-task', title: 'Agent đóng task', keywords: '', t: 'x' }]);
  assert.equal(parseLabels(fromFound)[0].min, 1, 'a story picked from the found list has a slug and no keywords');
});

test('review page: writes the angle of one story without one, in the capture scratch repo, into capture.json', async () => {
  const { createReviewServer } = await import('../scripts/eval/review.mjs');
  const { summary } = await import('../scripts/eval/run.mjs');
  const { d, env, session } = fixtureCapture();
  const data = path.join(d, 'data'); const labels = path.join(d, 'labels');
  const run1 = path.join(data, session.id, 'runs', '1');
  fs.mkdirSync(run1, { recursive: true }); fs.mkdirSync(labels);
  const cap = await runOnce({ session, fromLine: 1, toLine: 8, scratch: path.join(run1, 'scratch'), fakeLlm: path.join(FIX, 'llm-ok'), env });
  const ranked = cap.ranked.map(summary);
  assert.ok(ranked.every((s) => s.angle === null), 'the fixture outputs have no angle');
  ranked[1].held = true;
  const capFile = path.join(run1, 'capture.json');
  fs.writeFileSync(capFile, JSON.stringify({ id: session.id, run: 1, ranked }));
  fs.writeFileSync(path.join(labels, `${session.id}.md`), '| slug | keywords | t |\n|---|---|---|\n| x | a, b | |\n');
  const fake = path.join(d, 'fake');
  fs.mkdirSync(fake);
  const angle = { spine: { turn: { text: 'Tưởng chậm vì máy, hoá ra vì một bước thừa.', evidence: [3] } }, angle: 'Tưởng chậm vì máy, hoá ra vì một bước thừa.', audience: 'dev', evidence: [3] };
  fs.writeFileSync(path.join(fake, 'angle-1.json'), JSON.stringify({ type: 'result', subtype: 'success', is_error: false, duration_ms: 1000, total_cost_usd: 0.003, result: JSON.stringify(angle) }) + '\n');
  const key = 'k'.repeat(24);
  const server = createReviewServer({ labels, data, key, env, fakeLlm: fake });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const run = async (story) => {
    const r = await fetch(`http://127.0.0.1:${server.address().port}/api/sessions/${session.id}/angle-run`, { method: 'POST', headers: { 'x-key': key }, body: JSON.stringify({ story }) });
    return { status: r.status, body: await r.json() };
  };
  try {
    const page = await (await fetch(`http://127.0.0.1:${server.address().port}/`)).text();
    assert.ok(page.includes('Viết góc kể') && page.includes('~0,003–0,004 USD'));
    const r = await run(ranked[0].id);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.angle, angle.angle);
    assert.equal(r.body.completeness, 1);
    assert.equal(r.body.usd, 0.003);
    const saved = JSON.parse(fs.readFileSync(capFile, 'utf8')).ranked;
    assert.equal(saved[0].angle, angle.angle);
    assert.equal(saved[0].audience, 'dev');
    assert.ok(saved[0].angleAt, 'marked as added after the capture');
    assert.equal(saved[0].title, ranked[0].title, 'the rest of the entry is kept');
    assert.match((await run(ranked[0].id)).body.error, /đã có góc kể/);
    assert.match((await run(ranked[1].id)).body.error, /cổng riêng tư/);
    assert.equal((await run('2026-01-10-khong-co')).status, 404);
    assert.equal((await run('../x')).status, 400);
  } finally { server.close(); }
});
