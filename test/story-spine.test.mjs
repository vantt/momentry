// Story spine and its context: project profile (document discovery, when it is written again, edits kept), the owner's
// requests, spine validation and completeness, request lines as evidence, writing the spine into the story, angle cost
// in the ledger, the session lock of `momentry angle`, and the harness / review page parts. Model output is faked.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { findSources, sourcesText, ensureProfile, readProfile, profilePath, profileState } from '../lib/project-profile.mjs';
import { sessionAsks, asksFor, isTrivialAsk } from '../lib/asks.mjs';
import { validateAngle, validateProfile, completeness } from '../lib/validate.mjs';
import { angleOne, anglePatch, spineOf } from '../lib/angle.mjs';
import { writeNew, mergeInto, readStory, checkShape } from '../lib/box.mjs';
import { checkPatch } from '../lib/privacy.mjs';
import { parse } from '../lib/frontmatter.mjs';
import * as Ledger from '../lib/ledger.mjs';
import { DEFAULTS } from '../lib/config.mjs';
import { summary } from '../scripts/eval/run.mjs';
import { byCompleteness } from '../scripts/eval/metrics.mjs';
import { angleCheckCounts, storyText } from '../scripts/eval/labels.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BIN = path.resolve(HERE, '../bin/momentry.mjs');
const FIX = path.join(HERE, 'fixtures', 'pipeline');
const UUID = '5e5510aa-0000-4000-8000-000000000001';
const SID = 'claude:5e5510aa';
const MINI = fs.readFileSync(path.join(FIX, 'claude-mini.jsonl'), 'utf8').trimEnd().split('\n');

const ok = (obj, usd = 0.002) => JSON.stringify({ type: 'result', subtype: 'success', is_error: false, duration_ms: 1000, total_cost_usd: usd, result: JSON.stringify(obj) }) + '\n';
const tmp = (p) => fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), p)));
const fakeDir = (outputs) => {
  const d = tmp('spine-fake-');
  for (const [k, v] of Object.entries(outputs)) fs.writeFileSync(path.join(d, `${k}.json`), ok(v));
  return d;
};
const cfgFor = (cacheDir) => ({ ...structuredClone(DEFAULTS), cacheDir });

// ---------- project profile ----------

test('findSources: README and docs files by kind, case-insensitive, root before docs/, first match wins', () => {
  const root = tmp('spine-src-');
  fs.mkdirSync(path.join(root, 'docs', 'PRD'), { recursive: true }); // a folder named like a kind is not a file
  fs.writeFileSync(path.join(root, 'Readme.MD'), '# Sổ tay\nMột app ghi chú.');
  fs.writeFileSync(path.join(root, 'README.vi.md'), 'bản thứ hai');
  fs.writeFileSync(path.join(root, 'docs', 'README.md'), 'readme trong docs');
  fs.writeFileSync(path.join(root, 'docs', 'prd-v2.md'), 'PRD: tìm không dấu');
  fs.writeFileSync(path.join(root, 'docs', 'Vision.txt'), 'tầm nhìn');
  fs.writeFileSync(path.join(root, 'docs', 'requirements.md'), 'yêu cầu');
  fs.writeFileSync(path.join(root, 'CLAUDE.md'), 'quy tắc agent');
  fs.writeFileSync(path.join(root, 'AGENTS.md'), '   \n');
  fs.writeFileSync(path.join(root, 'gemini.md'), 'gemini');
  fs.writeFileSync(path.join(root, 'ANTIGRAVITY.md'), 'agy');
  fs.writeFileSync(path.join(root, 'vision.png'), 'not text');
  const got = findSources(root);
  // names in byte order: "README.vi.md" sorts before "Readme.MD"; the root wins over docs/
  assert.deepEqual(got.map((s) => [s.kind, s.rel]), [
    ['readme', 'README.vi.md'], ['prd', 'docs/prd-v2.md'], ['vision', 'docs/Vision.txt'], ['requirements', 'docs/requirements.md'],
    ['claude', 'CLAUDE.md'], ['gemini', 'gemini.md'], ['antigravity', 'ANTIGRAVITY.md'],
  ], 'an empty AGENTS.md and a vision.png are skipped');
  fs.rmSync(path.join(root, 'README.vi.md'));
  assert.equal(findSources(root)[0].rel, 'Readme.MD', 'case does not matter');
  assert.deepEqual(findSources(tmp('spine-none-')), []);
  // the prompt block is capped per file and in total
  const big = [{ kind: 'readme', rel: 'README.md', text: 'a'.repeat(5000) }, { kind: 'prd', rel: 'docs/prd.md', text: 'b'.repeat(5000) }];
  const t = sourcesText(big, { perFile: 100, total: 150 });
  assert.match(t, /^### README\.md\na{100} …\[\+4900\]\n\n### docs\/prd\.md\nb{50} …\[\+4950\]$/);
});

test('ensureProfile: written once, kept while the documents are unchanged, written again when they change', async () => {
  const root = tmp('spine-proj-');
  const cache = tmp('spine-cache-');
  const cfg = cfgFor(cache);
  // no documents: no profile, no call, never invented
  assert.equal((await ensureProfile(root, cfg, { llm: { fakeDir: fakeDir({}) } })).status, 'none');
  assert.equal(fs.existsSync(profilePath(cache, root)), false);

  fs.writeFileSync(path.join(root, 'README.md'), '# Sổ tay\nApp ghi chú chạy trên máy, tìm được chữ không dấu.');
  assert.equal(profileState(root, cache), 'generate');
  const stats = { usd: null, secs: 0, calls: 0 };
  const p1 = await ensureProfile(root, cfg, { llm: { fakeDir: fakeDir({ 'profile-1': { profile: 'Một app ghi chú chạy trên máy.' } }) }, stats });
  assert.deepEqual([p1.status, p1.text], ['generated', 'Một app ghi chú chạy trên máy.']);
  assert.equal(stats.usd, 0.002, 'the call is billed to the caller');
  const file = profilePath(cache, root);
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  const saved = readProfile(file);
  assert.equal(saved.edited, false);
  assert.deepEqual(saved.data.sources, ['README.md']);
  assert.equal(profileState(root, cache), 'cached');

  // unchanged documents: no call (an empty fake dir would fail any call)
  assert.deepEqual(await ensureProfile(root, cfg, { llm: { fakeDir: fakeDir({}) } }), { text: 'Một app ghi chú chạy trên máy.', status: 'cached', file });
  // changed documents: written again
  fs.appendFileSync(path.join(root, 'README.md'), '\nMục tiêu: tìm tiếng Việt.');
  const p2 = await ensureProfile(root, cfg, { llm: { fakeDir: fakeDir({ 'profile-1': { profile: 'Bản mới.' } }) } });
  assert.deepEqual([p2.status, p2.text], ['generated', 'Bản mới.']);
  // a failed call with an older profile keeps the older one
  fs.appendFileSync(path.join(root, 'README.md'), '\nthêm');
  const p3 = await ensureProfile(root, cfg, { llm: { fakeDir: fakeDir({}) } });
  assert.deepEqual([p3.status, p3.text], ['stale', 'Bản mới.']);
  assert.match(p3.error, /thiếu file --fake-llm/);
});

test('ensureProfile: an edited file is the owner\'s and never rewritten; none is stored; no older profile -> throws', async () => {
  const root = tmp('spine-edit-');
  const cache = tmp('spine-cache-');
  const cfg = cfgFor(cache);
  fs.writeFileSync(path.join(root, 'README.md'), 'Một công cụ.');
  await ensureProfile(root, cfg, { llm: { fakeDir: fakeDir({ 'profile-1': { profile: 'Máy viết.' } }) } });
  const file = profilePath(cache, root);
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('Máy viết.', 'Tôi tự viết: app ghi chú tiếng Việt, chạy trên máy.'));
  fs.writeFileSync(path.join(root, 'README.md'), 'README đổi hẳn.');
  assert.equal(profileState(root, cache), 'user');
  const p = await ensureProfile(root, cfg, { llm: { fakeDir: fakeDir({}) } });
  assert.deepEqual([p.status, p.text], ['user', 'Tôi tự viết: app ghi chú tiếng Việt, chạy trên máy.']);
  // a hand-written file without frontmatter is the owner's too
  fs.writeFileSync(file, 'Chỉ một dòng tôi viết.\n');
  assert.deepEqual((await ensureProfile(root, cfg, { llm: { fakeDir: fakeDir({}) } })).text, 'Chỉ một dòng tôi viết.');

  // documents that do not say what the project is: none is stored (no text), and not asked again while unchanged
  const root2 = tmp('spine-agentonly-');
  fs.writeFileSync(path.join(root2, 'CLAUDE.md'), 'Luôn chạy test.');
  const n = await ensureProfile(root2, cfg, { llm: { fakeDir: fakeDir({ 'profile-1': { none: true, reason: 'chỉ có quy tắc cho agent' } }) } });
  assert.deepEqual([n.status, n.text], ['generated', null]);
  assert.equal(readProfile(profilePath(cache, root2)).data.none, 'chỉ có quy tắc cho agent');
  assert.equal((await ensureProfile(root2, cfg, { llm: { fakeDir: fakeDir({}) } })).status, 'cached');

  // first profile and the call fails: throws
  const root3 = tmp('spine-fail-');
  fs.writeFileSync(path.join(root3, 'README.md'), 'x');
  await assert.rejects(ensureProfile(root3, cfg, { llm: { fakeDir: fakeDir({}) } }), (e) => e.exitCode === 4);
  assert.deepEqual(validateProfile({ profile: 'x'.repeat(1201) }), ['profile dài quá 1200 ký tự']);
  assert.deepEqual(validateProfile({ none: true }), ['none: thiếu reason']);
});

// ---------- the owner's requests ----------

const E = (L, kind, text, extra = {}) => ({ L, kind, text, ...extra });

test('sessionAsks: the owner\'s own requests; tool results, /bip, harness lines and go-aheads left out', () => {
  const entries = [
    E(1, 'user', 'Làm cho tìm kiếm tiếng Việt chạy được khi gõ không dấu, đo bằng Hit@5.'),
    E(2, 'assistant', 'Đã hiểu.'),
    E(3, 'result', 'Exit code 1'),
    E(4, 'user', '<task-notification>xong</task-notification>'),
    E(5, 'user', 'tiếp tục'),
    E(6, 'user', 'ok, commit push'),
    E(7, 'user', 'B'),
    E(8, 'user', '[Request interrupted by user for tool use]'),
    E(9, 'user', 'máy pha nhanh hẳn', { bip: true }),
    E(10, 'user', 'Corpus quá dễ, làm khó hơn thay vì hạ ngưỡng.'),
  ];
  assert.deepEqual(sessionAsks(entries).map((a) => a.L), [1, 10]);
  for (const t of ['Tiếp tục nhé', 'OK', 'commit và push đi', 'yes, go ahead', '2', '  ']) assert.ok(isTrivialAsk(t), t);
  for (const t of ['sửa lỗi đăng nhập', 'tại sao test đỏ?', 'đo lại p@5']) assert.ok(!isTrivialAsk(t), t);
});

test('asksFor: the first request plus the nearest ones before the story, in order, within the budget', () => {
  const asks = [1, 40, 80, 120, 160, 400].map((L) => ({ L, text: `yêu cầu ở dòng ${L} ${'x'.repeat(50)}` }));
  const a = asksFor(asks, 170);
  assert.deepEqual(a.lines, [1, 80, 120, 160], 'first + 3 nearest at or before line 170; later ones never');
  assert.match(a.text, /^\[L1\] USER: yêu cầu ở dòng 1 /);
  assert.equal(a.text.split('\n').length, 4);
  assert.deepEqual(asksFor(asks, 170, { maxChars: 200 }).lines, [1, 160], 'budget keeps the nearest');
  assert.deepEqual(asksFor(asks, 1).lines, [1]);
  assert.equal(asksFor([], 10), null);
  const long = asksFor([{ L: 3, text: 'y'.repeat(900) }], 5);
  assert.match(long.text, /y{600} …\[\+300\]$/);
});

// ---------- spine validation, completeness, request lines as evidence ----------

const slot = (text, evidence) => ({ text, evidence });

test('validateAngle: spine slots are empty or carry given lines; profile only in context; completeness counts filled slots', () => {
  const lines = [3, 4, 5];
  const angle = { angle: 'Một app ghi chú. Tưởng A, hoá ra B.', audience: 'dev', evidence: [3] };
  const spine = { context: slot('Một app ghi chú.', ['profile']), want: slot('Tìm không dấu.', [3]), obstacle: null, turn: slot('Tưởng A, hoá ra B.', ['L4']), action: { text: '', evidence: [] }, outcome: '', takeaway: undefined, extra: 'bỏ qua' };
  assert.deepEqual(validateAngle({ ...angle, spine }, { lines, profile: true }), []);
  assert.equal(completeness(spine), 3);
  assert.equal(completeness(null), 0);
  assert.match(validateAngle({ ...angle, spine }, { lines }).join(), /spine\.context: evidence ngoài các dòng đã đưa: "profile"/, 'no profile given');
  assert.match(validateAngle({ ...angle, spine: { want: slot('x', ['profile']) } }, { lines, profile: true }).join(), /spine\.want: evidence ngoài/, 'profile only for context');
  assert.match(validateAngle({ ...angle, spine: { turn: slot('x', [9]) } }, { lines }).join(), /spine\.turn: evidence ngoài các dòng đã đưa: 9/);
  assert.match(validateAngle({ ...angle, spine: { turn: slot('x', []) } }, { lines }).join(), /spine\.turn: evidence phải là mảng/);
  assert.match(validateAngle({ ...angle, spine: { turn: { evidence: [3] } } }, { lines }).join(), /spine\.turn: thiếu text/);
  assert.match(validateAngle({ ...angle, spine: { turn: slot('x'.repeat(301), [3]) } }, { lines }).join(), /spine\.turn: text dài quá 300/);
  assert.match(validateAngle({ ...angle, spine: { turn: 'chữ trần' } }, { lines }).join(), /spine\.turn: phải là \{text, evidence\}/);
  assert.match(validateAngle({ ...angle, spine: [] }, { lines }).join(), /thiếu spine/);
});

test('angleOne: request lines are citable evidence; the prompt carries the profile and the requests', async () => {
  const cache = tmp('spine-one-');
  const cfg = cfgFor(cache);
  const story = { id: '2026-01-10-x', data: { hook: 'h' }, body: '\n# Tìm không dấu\n' };
  const ex = { text: '[L50] AGENT: Hit@5 0,93 vì tiêu đề trùng câu tìm.', lines: [50] };
  const out = { spine: { context: slot('Một app ghi chú tiếng Việt.', ['profile', 2]), want: slot('Tìm được chữ không dấu.', [2]), turn: slot('Tưởng 0,93 là tốt, hoá ra corpus quá dễ.', [50]) }, angle: 'Một app ghi chú tiếng Việt muốn tìm được chữ không dấu. Tưởng 0,93 là tốt, hoá ra corpus quá dễ.', audience: 'dev làm tìm kiếm', evidence: [2, 50] };
  const runDir = path.join(cache, 'run');
  const r = await angleOne(story, { ...ex, asks: { text: '[L2] USER: làm tìm kiếm không dấu', lines: [2] }, profile: 'Một app ghi chú\nchạy trên máy.' }, cfg, { key: 'angle-1', llm: { fakeDir: fakeDir({ 'angle-1': out }), runDir } });
  assert.deepEqual(r.evidence, [2, 50]);
  assert.equal(r.completeness, 3);
  assert.deepEqual(r.spine.context, { text: 'Một app ghi chú tiếng Việt.', evidence: ['profile', 2] });
  const prompt = fs.readFileSync(path.join(runDir, 'angle-1.prompt.txt'), 'utf8');
  assert.match(prompt, /<project>\nMột app ghi chú chạy trên máy\.\n<\/project>/);
  assert.match(prompt, /<asks>\n\[L2\] USER: làm tìm kiếm không dấu\n<\/asks>/);
  // without the request block the same answer cites a line that was never given: both attempts fail
  await assert.rejects(angleOne(story, { ...ex, profile: 'P' }, cfg, { key: 'angle-1', llm: { fakeDir: fakeDir({ 'angle-1': out, 'angle-1-retry': out }) } }), /evidence ngoài các dòng đã đưa: 2/);
  // no profile and no requests: placeholders say so
  await angleOne(story, ex, cfg, { key: 'angle-2', llm: { fakeDir: fakeDir({ 'angle-2': { spine: {}, none: true, reason: 'vặt' } }), runDir } });
  assert.match(fs.readFileSync(path.join(runDir, 'angle-2.prompt.txt'), 'utf8'), /<project>\n\(không có\)\n<\/project>\n\n<asks>\n\(không có\)\n<\/asks>/);
});

// ---------- the spine in the story ----------

test('mergeInto: spine slots, their line refs and completeness in frontmatter; a redo replaces them; privacy covers them', () => {
  const box = tmp('spine-box-');
  writeNew(box, { id: '2026-01-10-may-pha', data: { date: '2026-01-10', status: 'raw', sessions: [SID], lines: [`${SID}#L3`] }, body: '\n# Máy pha\n\n**Bối cảnh:** x\n' });
  const res = { angle: 'Một quán cà phê. Tưởng chậm vì máy, hoá ra vì một bước thừa.', audience: 'dev', evidence: [3], completeness: 2,
    spine: { context: { text: 'Một quán cà phê.', evidence: ['profile', 1] }, turn: { text: 'Tưởng chậm vì máy, hoá ra vì một bước thừa.', evidence: [3] } } };
  mergeInto(box, '2026-01-10-may-pha', anglePatch(res, { sid: SID }));
  let s = readStory(box, '2026-01-10-may-pha');
  assert.equal(s.data.spine_context, 'Một quán cà phê.');
  assert.deepEqual(s.data.spine_context_lines, ['profile', `${SID}#L1`]);
  assert.deepEqual(s.data.spine_turn_lines, [`${SID}#L3`]);
  assert.equal(s.data.completeness, 2);
  assert.equal(s.data.spine_want, undefined, 'empty slots are not written');
  assert.match(s.body, /^\*\*Góc kể:\*\* Một quán cà phê\. Tưởng/m);
  assert.deepEqual(checkShape(s), []);
  assert.deepEqual(parse(fs.readFileSync(s.path, 'utf8')), { data: s.data, body: s.body }, 'round trip');
  assert.deepEqual(spineOf(s.data), { completeness: 2, spine: { context: { text: 'Một quán cà phê.', lines: ['profile', `${SID}#L1`] }, turn: { text: 'Tưởng chậm vì máy, hoá ra vì một bước thừa.', lines: [`${SID}#L3`] } } });
  // a forced redo to none replaces the spine too
  mergeInto(box, '2026-01-10-may-pha', anglePatch({ none: true, reason: 'vặt', completeness: 1, spine: { action: { text: 'Bỏ một bước.', evidence: [3] } } }, { replace: true, sid: SID }));
  s = readStory(box, '2026-01-10-may-pha');
  assert.deepEqual(Object.keys(s.data).filter((k) => k.startsWith('spine_')), ['spine_action', 'spine_action_lines']);
  assert.equal(s.data.completeness, 1);
  assert.equal(s.data.angle, 'none');
  assert.deepEqual(checkShape({ ...s, data: { ...s.data, completeness: 9 } }).map((x) => x.field), ['completeness']);
  assert.deepEqual(checkShape({ ...s, data: { ...s.data, spine_turn_lines: [3] } }).map((x) => x.field), ['spine_turn_lines']);
  const blocklist = { terms: [{ term: 'Dự án Hồ Sen', forms: ['dự án hồ sen', 'du an ho sen', 'duwj an hoof sen'], proper: false, source: 't' }] };
  assert.deepEqual(checkPatch(anglePatch({ ...res, spine: { context: { text: 'Làm cho Du an Ho Sen.', evidence: [1] } } }), blocklist).map((x) => x.field), ['spine']);
  // the spine is frontmatter only: label matching never sees it
  assert.ok(!storyText(s).includes('bo-mot-buoc'));
});

// ---------- the command: ledger, lock, profile (fake model) ----------

function setup({ readme = null } = {}) {
  const base = tmp('spine-pipe-');
  const repo = path.join(base, 'repo');
  fs.mkdirSync(path.join(repo, '.git'), { recursive: true });
  fs.writeFileSync(path.join(repo, '.momentry.json'), '{}');
  if (readme) fs.writeFileSync(path.join(repo, 'README.md'), readme);
  const tr = path.join(base, `${UUID}.jsonl`);
  fs.writeFileSync(tr, MINI.slice(0, 8).map((l) => l.replaceAll('__REPO__', JSON.stringify(repo).slice(1, -1))).join('\n') + '\n');
  const env = {
    PATH: process.env.PATH, HOME: path.join(base, 'home'), USERPROFILE: path.join(base, 'home'), TZ: 'UTC',
    MOMENTRY_CACHE: path.join(base, 'cache'), MOMENTRY_CONFIG: path.join(base, 'none.json'), MOMENTRY_ALLOW_UNCHECKED: '1',
  };
  const box = path.join(repo, 'docs', 'storytelling-material');
  return {
    base, repo, tr, box, cache: env.MOMENTRY_CACHE,
    fake(set, outputs = {}) {
      const d = fs.mkdtempSync(path.join(base, 'fake-'));
      if (set) for (const f of fs.readdirSync(path.join(FIX, set))) fs.copyFileSync(path.join(FIX, set, f), path.join(d, f));
      for (const [k, v] of Object.entries(outputs)) fs.writeFileSync(path.join(d, `${k}.json`), ok(v));
      return d;
    },
    run(args, extra = {}) {
      const r = spawnSync(process.execPath, [BIN, ...args], { cwd: repo, env: { ...env, ...extra }, encoding: 'utf8' });
      return { code: r.status, out: r.stdout, err: r.stderr };
    },
    stories() { return fs.readdirSync(box).filter((f) => f.endsWith('.md')).sort().map((f) => ({ id: f.slice(0, -3), ...parse(fs.readFileSync(path.join(box, f), 'utf8')) })); },
  };
}

const A = { spine: { context: { text: 'Một quán cà phê.', evidence: ['profile'] }, turn: { text: 'Tưởng chậm vì máy, hoá ra vì một bước thừa.', evidence: [1, 3] } }, angle: 'Một quán cà phê đo máy pha. Tưởng chậm vì máy, hoá ra vì một bước thừa.', audience: 'người tối ưu quy trình', evidence: [1, 3] };

test('angle command: angle and profile cost go into the ledger and count toward the day; the spine is written', () => {
  const s = setup({ readme: '# Quán\nMột quán cà phê đo máy pha.' });
  const h = s.run(['harvest', '--transcript', s.tr, '--fake-llm', s.fake('llm-ok', { 'profile-1': { profile: 'Một quán cà phê đo máy pha.' } })]);
  assert.equal(h.code, 0, h.err + h.out);
  assert.match(h.out, /hồ sơ dự án: repo tạo mới/, 'harvest writes the profile once; the failed angle calls never fail the window');
  const before = Ledger.load(s.cache);
  const harvestUsd = before.sessions[SID].harvests[0].usd;
  assert.ok(harvestUsd >= 0.002 * 5, 'the profile call is in the window cost');
  const id = s.stories()[0].id;
  const r = s.run(['angle', '--story', id, '--json'], { MOMENTRY_FAKE_LLM: s.fake(null, { 'angle-1': A }) });
  assert.equal(r.code, 0, r.err + r.out);
  const j = JSON.parse(r.out).data;
  assert.equal(j.stories[0].status, 'angle');
  assert.equal(j.stories[0].completeness, 2);
  assert.equal(j.usd, 0.002);
  const story = s.stories().find((x) => x.id === id);
  assert.equal(story.data.completeness, 2);
  assert.deepEqual(story.data.spine_turn_lines, [`${SID}#L1`, `${SID}#L3`]);
  const after = Ledger.load(s.cache);
  assert.deepEqual(after.sessions[SID].spend.map((x) => [x.step, x.usd]), [['angle', 0.002]], 'the profile was cached: no profile spend');
  const day = Ledger.today();
  assert.ok(Math.abs(Ledger.spentOn(after, day) - (Ledger.spentOn(before, day) + 0.002)) < 1e-9);
  assert.ok(Math.abs(Ledger.spentOn(after, day, s.repo) - Ledger.spentOn(after, day)) < 1e-9, 'counted for this repo too');
  assert.equal(after.sessions[SID].harvests.length, 1, 'an angle run is not a read');

  // README changed: a new profile is written on the way and billed as its own step
  fs.appendFileSync(path.join(s.repo, 'README.md'), '\nMục tiêu: pha nhanh hơn.');
  const r2 = s.run(['angle', '--story', id, '--force', '--json'], { MOMENTRY_FAKE_LLM: s.fake(null, { 'angle-1': A, 'profile-1': { profile: 'Bản mới.' } }) });
  assert.equal(r2.code, 0, r2.err + r2.out);
  assert.deepEqual(Ledger.load(s.cache).sessions[SID].spend.map((x) => x.step), ['angle', 'profile', 'angle']);
  assert.match(r2.out, /tạo mới/);
});

test('ledger: recordSpend skips unknown cost, adds a session it does not know, and spentOn counts it', () => {
  const lg = { version: 1, sessions: {}, repos: {} };
  Ledger.recordSpend(lg, 'claude:aa', { step: 'angle', usd: null, repoRoot: '/r' });
  Ledger.recordSpend(lg, 'claude:aa', { step: 'angle', usd: 0, repoRoot: '/r' });
  assert.deepEqual(lg.sessions, {});
  Ledger.recordSpend(lg, 'claude:aa', { at: '2026-01-10T10:00:00', step: 'angle', usd: 0.01, repoRoot: '/r' });
  Ledger.recordSpend(lg, 'claude:aa', { at: '2026-01-10T11:00:00', step: 'profile', usd: 0.005, repoRoot: '/other' });
  assert.equal(lg.sessions['claude:aa'].repoRoot, '/r');
  assert.ok(Math.abs(Ledger.spentOn(lg, '2026-01-10') - 0.015) < 1e-12);
  assert.ok(Math.abs(Ledger.spentOn(lg, '2026-01-10', '/r') - 0.015) < 1e-12);
  assert.equal(Ledger.spentOn(lg, '2026-01-11'), 0);
  assert.equal(Ledger.needsHarvest(lg, 'claude:aa', { size: 10, mtimeMs: 1, lines: 4 }).fromLine, 1, 'a spend-only session is still read from the start');
});

test('angle command: a session being gathered is skipped under its lock (exit 5); its stories stay untouched', () => {
  const s = setup();
  assert.equal(s.run(['harvest', '--transcript', s.tr, '--fake-llm', s.fake('llm-ok')]).code, 0);
  const id = s.stories()[0].id;
  const locks = path.join(s.cache, 'locks');
  fs.mkdirSync(locks, { recursive: true });
  fs.writeFileSync(path.join(locks, 'claude_5e5510aa.lock'), JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
  const r = s.run(['angle', '--story', id, '--json'], { MOMENTRY_FAKE_LLM: s.fake(null, { 'angle-1': A }) });
  assert.equal(r.code, 5, r.err + r.out);
  assert.equal(JSON.parse(r.out).data.stories[0].status, 'locked');
  assert.equal(s.stories().find((x) => x.id === id).data.angle, undefined);
  fs.rmSync(path.join(locks, 'claude_5e5510aa.lock'));
  const again = s.run(['angle', '--story', id], { MOMENTRY_FAKE_LLM: s.fake(null, { 'angle-1': { ...A, spine: { turn: A.spine.turn } } }) });
  assert.equal(again.code, 0, again.err + again.out);
  assert.equal(fs.existsSync(path.join(locks, 'claude_5e5510aa.lock')), false, 'the lock is released');
});

// ---------- harness and review page ----------

test('harness: capture summary carries the spine; completeness is a measurable order, never the default rank', () => {
  const st = (id, completeness) => ({ id, data: completeness == null ? {} : { completeness }, body: '' });
  assert.deepEqual(byCompleteness([st('a', 2), st('b'), st('c', 7), st('d', 2), st('e', 0)]).map((s) => s.id), ['c', 'a', 'd', 'e', 'b']);
  const s = { id: '2026-01-10-a', data: { angle: 'x', spine_turn: 'Tưởng A.', spine_turn_lines: ['claude:a#L3'], completeness: 1 }, body: '' };
  assert.deepEqual([summary(s).spine, summary(s).completeness], [{ turn: { text: 'Tưởng A.', lines: ['claude:a#L3'] } }, 1]);
  assert.deepEqual([summary({ id: 'x', data: {}, body: '' }).spine, summary({ id: 'x', data: {}, body: '' }).completeness], [{}, null]);
});

test('review page: spine and old angle beside the new one; "understood without asking?" saved next to the verdict', async () => {
  const { createReviewServer } = await import('../scripts/eval/review.mjs');
  const base = tmp('spine-review-');
  const labels = path.join(base, 'labels'); const data = path.join(base, 'data');
  fs.mkdirSync(labels); fs.mkdirSync(path.join(data, 's1', 'runs', '1'), { recursive: true });
  fs.writeFileSync(path.join(labels, 's1.md'), '---\nstatus: draft\n---\n| # | slug | tiêu đề | dòng | keywords | t | lý do |\n|---|---|---|---|---|---|---|\n| 1 | may-pha | Máy pha | | | x | |\n');
  fs.writeFileSync(path.join(data, 's1', 'runs', '1', 'capture.json'), JSON.stringify({ ranked: [
    { id: '2026-01-10-may-pha', title: 'Máy pha', angle: 'Một quán. Tưởng A, hoá ra B.', audience: 'dev', prevAngle: 'Tưởng A, hoá ra B.', prevAudience: 'dev', spine: { turn: { text: 'Tưởng A, hoá ra B.', lines: ['claude:a#L3'] } }, completeness: 1 },
    { id: '2026-01-10-vat', title: 'Vặt', angle: 'none' }] }));
  const server = createReviewServer({ labels, data, key: 'k'.repeat(24) });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const call = async (p, opt = {}) => { const r = await fetch(`http://127.0.0.1:${port}${p}`, { ...opt, headers: { 'x-key': 'k'.repeat(24) } }); return { status: r.status, body: await r.json() }; };
  const put = (body) => call('/api/sessions/s1/angle', { method: 'PUT', body: JSON.stringify(body) });
  try {
    const page = await (await fetch(`http://127.0.0.1:${port}/`)).text();
    assert.ok(page.includes('Đọc xong hiểu được, không cần hỏi thêm?') && page.includes('góc kể cũ') && page.includes('kể được'));
    const s = (await call('/api/sessions/s1')).body;
    assert.equal(s.stories[0].prevAngle, 'Tưởng A, hoá ra B.');
    assert.equal(s.stories[0].completeness, 1);
    assert.deepEqual(s.stories[0].spine.turn.lines, ['claude:a#L3']);
    assert.deepEqual(s.understood, {});
    assert.deepEqual((await put({ story: '2026-01-10-may-pha', verdict: 'tellable' })).body, { angleChecks: { '2026-01-10-may-pha': 'tellable' }, understood: {} });
    assert.deepEqual((await put({ story: '2026-01-10-may-pha', understood: 'no' })).body, { angleChecks: { '2026-01-10-may-pha': 'tellable' }, understood: { '2026-01-10-may-pha': 'no' } }, 'the verdict is kept');
    assert.equal((await put({ story: '2026-01-10-may-pha', understood: 'maybe' })).status, 400);
    assert.equal((await put({ story: '2026-01-10-vat', understood: 'yes' })).status, 400, 'no angle, nothing to ask');
    const file = path.join(data, 'angle-labels', 's1.json');
    const saved = JSON.parse(fs.readFileSync(file, 'utf8')).stories['2026-01-10-may-pha'];
    assert.deepEqual([saved.verdict, saved.understood, saved.angle], ['tellable', 'no', 'Một quán. Tưởng A, hoá ra B.']);
    assert.deepEqual(angleCheckCounts(file), { tellable: 1, 'no-story': 0, invented: 0, understood: { yes: 0, no: 1 } });
    assert.deepEqual((await put({ story: '2026-01-10-may-pha', verdict: null })).body.understood, { '2026-01-10-may-pha': 'no' }, 'clearing the verdict keeps the answer');
    await put({ story: '2026-01-10-may-pha', understood: null });
    assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')).stories, {}, 'both cleared: the entry goes');
  } finally { server.close(); }
});

test('review page: without prevAngle in the capture, the old angle comes from the run before', async () => {
  const { createReviewServer } = await import('../scripts/eval/review.mjs');
  const base = tmp('spine-review2-');
  const labels = path.join(base, 'labels'); const data = path.join(base, 'data');
  fs.mkdirSync(labels);
  fs.writeFileSync(path.join(labels, 's1.md'), '---\nstatus: draft\n---\n| # | slug | tiêu đề | dòng | keywords | t | lý do |\n|---|---|---|---|---|---|---|\n| 1 | x | X | | | x | |\n');
  for (const [n, angle] of [[1, 'Cũ.'], [2, 'Mới.']]) {
    fs.mkdirSync(path.join(data, 's1', 'runs', String(n)), { recursive: true });
    fs.writeFileSync(path.join(data, 's1', 'runs', String(n), 'capture.json'), JSON.stringify({ ranked: [{ id: `2026-01-1${n}-may-pha`, title: 'Máy pha', angle }] }));
  }
  const server = createReviewServer({ labels, data, key: 'k'.repeat(24) });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try {
    const r = await fetch(`http://127.0.0.1:${server.address().port}/api/sessions/s1`, { headers: { 'x-key': 'k'.repeat(24) } });
    const s = await r.json();
    assert.deepEqual([s.stories[0].angle, s.stories[0].prevAngle], ['Mới.', 'Cũ.'], 'matched by id without the date');
  } finally { server.close(); }
});
