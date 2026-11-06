// Story angle step: output validation, transcript excerpt, picking, writing into the story (frontmatter, body line,
// privacy gate, merges keep it), the `angle` command and the UI fields. Model output is always faked.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validateAngle, evidenceLine } from '../lib/validate.mjs';
import { excerpt, mainSession, pickStories, hasAngle, angleOf, anglePatch, bodyWithoutAngle } from '../lib/angle.mjs';
import { writeNew, mergeInto, readStory, checkShape, ANGLE_LABEL } from '../lib/box.mjs';
import { checkPatch, checkStory } from '../lib/privacy.mjs';
import { parse } from '../lib/frontmatter.mjs';
import { mergePatch } from '../lib/story.mjs';
import { listStories, getStory, writeAngle } from '../lib/ui-api.mjs';
import { summary } from '../scripts/eval/run.mjs';
import { angleCheckCounts, storyText } from '../scripts/eval/labels.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BIN = path.resolve(HERE, '../bin/momentry.mjs');
const FIX = path.join(HERE, 'fixtures', 'pipeline');
const VAULT = path.join(HERE, 'fixtures', 'privacy', 'vault');
const UUID = '5e5510aa-0000-4000-8000-000000000001';
const SID = 'claude:5e5510aa';
const MINI = fs.readFileSync(path.join(FIX, 'claude-mini.jsonl'), 'utf8').trimEnd().split('\n');

const ok = (obj) => JSON.stringify({ type: 'result', subtype: 'success', is_error: false, duration_ms: 1000, total_cost_usd: 0.002, result: JSON.stringify(obj) }) + '\n';
const tmp = (p) => fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), p)));

// ---------- validation ----------

test('validateAngle: an angle, or none with a reason; evidence must be lines that were given', () => {
  const lines = [3, 4, 5];
  const spine = {};
  assert.deepEqual(validateAngle({ spine, angle: 'Tưởng A. Hoá ra B. Ai cũng có thể dính.', audience: 'dev viết test', evidence: [3, 'L4', '[L5]'] }, { lines }), []);
  assert.deepEqual(validateAngle({ spine, none: true, reason: 'chỉ là việc vặt' }, { lines }), []);
  assert.match(validateAngle({ spine, none: true }, { lines }).join(), /reason/);
  assert.match(validateAngle({ none: true, reason: 'vặt' }, { lines }).join(), /thiếu spine/, 'the spine is asked for in both forms');
  assert.match(validateAngle({ angle: 'x', audience: 'y', evidence: [3, 9] }, { lines }).join(), /evidence ngoài các dòng đã đưa: 9/);
  assert.match(validateAngle({ angle: 'x', audience: 'y', evidence: ['L3-L5'] }, { lines }).join(), /evidence ngoài/, 'a range is not one line');
  assert.match(validateAngle({ angle: 'x', audience: 'y', evidence: [] }, { lines }).join(), /evidence phải là mảng/);
  assert.match(validateAngle({ angle: 'x', audience: 'y' }, { lines }).join(), /evidence phải là mảng/);
  assert.match(validateAngle({ audience: 'y', evidence: [3] }, { lines }).join(), /thiếu angle/);
  assert.match(validateAngle({ angle: 'x', evidence: [3] }, { lines }).join(), /thiếu audience/);
  assert.match(validateAngle({ spine, angle: 'x'.repeat(901), audience: 'y', evidence: [3] }, { lines }).join(), /angle dài quá/);
  assert.match(validateAngle({ none: 'yes', angle: 'x', audience: 'y', evidence: [3] }, { lines }).join(), /none phải là true/);
  assert.match(validateAngle([], { lines }).join(), /không phải JSON object/);
  assert.equal(evidenceLine('L12'), 12); assert.equal(evidenceLine(0), null); assert.equal(evidenceLine('12a'), null);
});

// ---------- excerpt and picking ----------

const entry = (L, text = `dòng ${L}`) => ({ L, kind: 'user', text });

test('excerpt: entries around each referenced line, gaps marked, never the whole session', () => {
  const entries = Array.from({ length: 40 }, (_, i) => entry(i * 2 + 1)); // L1, L3, ..., L79
  const ex = excerpt(entries, [21, 60]);
  assert.deepEqual(ex.lines, [17, 19, 21, 23, 25, 55, 57, 59, 61, 63]);
  assert.match(ex.text, /\[L25\] USER: dòng 25\n…\n\[L55\]/);
  assert.ok(!ex.text.includes('[L1]'));
  // a ref between entries belongs to the entry that holds it; refs before the first entry are ignored
  assert.deepEqual(excerpt(entries, [22], { maxChars: 1e6 }).lines, [17, 19, 21, 23, 25]);
  assert.equal(excerpt(entries.slice(5), [1]), null);
  assert.equal(excerpt([], [1]), null);
  assert.equal(excerpt(entries, []), null);
});

test('excerpt: shrinks the window, then cuts, to stay under maxChars; only tags left in the text count', () => {
  const big = Array.from({ length: 9 }, (_, i) => entry(i + 1, 'x'.repeat(100)));
  assert.equal(excerpt(big, [5], { maxChars: 400 }).lines.length, 3, 'radius 1');
  assert.deepEqual(excerpt(big, [5], { maxChars: 130 }).lines, [5], 'radius 0');
  const cut = excerpt(big, [2, 8], { maxChars: 116 });
  assert.deepEqual(cut.lines, [2], 'the cut-off entry is not citable');
  assert.ok(cut.text.length <= 118);
});

test('mainSession: the session with the most refs; other sessions never mix in', () => {
  assert.deepEqual(mainSession(['claude:a#L5', 'codex:b#L2', 'codex:b#L9', 'bad', 'claude:a#L0']), { sid: 'codex:b', nums: [2, 9] });
  assert.equal(mainSession([]), null);
  assert.equal(mainSession(undefined), null);
});

const st = (id, data) => ({ id, data: { status: 'raw', ...data }, body: '' });

test('pickStories: top N by rank, without an angle yet; --force and ids; dropped never', () => {
  const stories = [
    st('2026-01-01-a', { tension: 'none', stakes: 0, strength: 0 }),
    st('2026-01-01-b', { tension: 'khac', stakes: 3, strength: 3, angle: 'đã có' }),
    st('2026-01-01-c', { tension: 'khac', stakes: 2, strength: 2 }),
    st('2026-01-01-d', { tension: 'khac', stakes: 1, strength: 1, angle: 'none' }),
    st('2026-01-01-e', { tension: 'khac', stakes: 3, strength: 3, status: 'dropped' }),
    { id: '2026-01-01-f', data: {}, body: '', error: 'hỏng' },
  ];
  assert.deepEqual(pickStories(stories, { topN: 3 }).map((s) => s.id), ['2026-01-01-c'], 'top 3 = b, c, d; b and d already looked at');
  assert.deepEqual(pickStories(stories, { topN: 3, force: true }).map((s) => s.id), ['2026-01-01-b', '2026-01-01-c', '2026-01-01-d']);
  assert.deepEqual(pickStories(stories, { topN: 0, ids: ['2026-01-01-a'] }).map((s) => s.id), ['2026-01-01-a']);
  assert.deepEqual(pickStories(stories, { topN: 9, ids: ['2026-01-01-b'] }), []);
  assert.deepEqual(pickStories(stories, { topN: 9, ids: ['2026-01-01-e'] }), []);
  assert.ok(hasAngle({ angle: 'none' }) && !hasAngle({ angle: ' ' }) && !hasAngle({}));
  assert.equal(angleOf({ angle: 'none' }), null);
  assert.equal(angleOf({ angle: ' Tưởng  A. ' }), 'Tưởng A.');
});

// ---------- writing into the story ----------

const BODY = '\n# Máy pha nhanh gấp ba\n\n**Bối cảnh:** máy pha giả.\n**Chuyện gì xảy ra:** bỏ một bước.\n';
function boxWith(data = {}) {
  const box = tmp('angle-box-');
  writeNew(box, { id: '2026-01-10-may-pha', data: { date: '2026-01-10', status: 'raw', sessions: [SID], lines: [`${SID}#L1`], ...data }, body: BODY });
  return box;
}

test('mergeInto: angle in frontmatter and as the line under the title; kept unless replaced; none drops it', () => {
  const box = boxWith();
  const r = mergeInto(box, '2026-01-10-may-pha', anglePatch({ angle: 'Tưởng chậm vì máy: hoá ra vì một bước thừa.', audience: 'người tối ưu quy trình', evidence: [1] }));
  assert.ok(r.changed);
  let s = readStory(box, '2026-01-10-may-pha');
  assert.equal(s.data.angle, 'Tưởng chậm vì máy: hoá ra vì một bước thừa.');
  assert.equal(s.data.audience, 'người tối ưu quy trình');
  assert.equal(s.body, '\n# Máy pha nhanh gấp ba\n\n**Góc kể:** Tưởng chậm vì máy: hoá ra vì một bước thừa.\n**Bối cảnh:** máy pha giả.\n**Chuyện gì xảy ra:** bỏ một bước.\n');
  assert.deepEqual(checkShape(s), []);
  const text = fs.readFileSync(s.path, 'utf8');
  assert.deepEqual(parse(text), { data: s.data, body: s.body }, 'round trip');

  // a second angle (another harvest) never replaces the first
  assert.equal(mergeInto(box, '2026-01-10-may-pha', anglePatch({ angle: 'Khác hẳn.', audience: 'ai đó', evidence: [1] })).changed, false);
  // a harvest merge appends lines and scores, the angle stays
  const harvestPatch = mergePatch(s, { id: 'K1', members: [], outsider: null }, [{ lines: [9], signals: [] }], { hook: { hook: 'mới', tension: 'khac', sides: [], strength: 2 } }, { sid: SID, runs: 1, hotspots: [], answers: [] });
  mergeInto(box, '2026-01-10-may-pha', harvestPatch);
  s = readStory(box, '2026-01-10-may-pha');
  assert.equal(s.data.angle, 'Tưởng chậm vì máy: hoá ra vì một bước thừa.');
  assert.equal(s.data.hook, 'mới');
  assert.equal(s.body.split(ANGLE_LABEL).length, 2);

  // forced redo replaces both places; none removes the line and the audience
  mergeInto(box, '2026-01-10-may-pha', anglePatch({ angle: 'Góc mới.', audience: 'dev', evidence: [1] }, { replace: true }));
  s = readStory(box, '2026-01-10-may-pha');
  assert.equal(s.data.angle, 'Góc mới.');
  assert.match(s.body, /^\*\*Góc kể:\*\* Góc mới\.$/m);
  assert.equal(s.body.split(ANGLE_LABEL).length, 2);
  mergeInto(box, '2026-01-10-may-pha', anglePatch({ none: true, reason: 'vặt' }, { replace: true }));
  s = readStory(box, '2026-01-10-may-pha');
  assert.equal(s.data.angle, 'none');
  assert.equal(s.data.audience, undefined);
  assert.equal(s.body, BODY);
  assert.equal(bodyWithoutAngle('\n# T\n\n**Góc kể:** x\n**Bối cảnh:** y\n'), '\n# T\n\n**Bối cảnh:** y\n');
});

test('privacy: a name in the angle or audience is caught; the label itself is not story text', () => {
  const blocklist = { terms: [{ term: 'Dự án Hồ Sen', forms: ['dự án hồ sen', 'du an ho sen', 'duwj an hoof sen'], proper: false, source: 't' }] };
  const v = checkPatch(anglePatch({ angle: 'Tưởng ổn, hoá ra lộ tên Du an Ho Sen.', audience: 'dev', evidence: [1] }), blocklist);
  assert.deepEqual(v.map((x) => x.field), ['angle']);
  assert.deepEqual(checkPatch(anglePatch({ angle: 'x', audience: 'người làm Dự án Hồ Sen', evidence: [1] }), blocklist).map((x) => x.field), ['audience']);
  const kể = { terms: [{ term: 'Góc kể', forms: ['góc kể', 'goc ke', 'gocs ker'], proper: true, source: 't' }] };
  assert.deepEqual(checkStory({ data: {}, body: '\n# T\n\n**Góc kể:** ok\n' }, 'x', kể), []);
});

// ---------- pipeline and the command (fake model) ----------

function setup() {
  const base = tmp('angle-pipe-');
  const repo = path.join(base, 'repo');
  fs.mkdirSync(path.join(repo, '.git'), { recursive: true });
  fs.writeFileSync(path.join(repo, '.momentry.json'), '{}');
  const tr = path.join(base, `${UUID}.jsonl`);
  fs.writeFileSync(tr, MINI.slice(0, 8).map((l) => l.replaceAll('__REPO__', JSON.stringify(repo).slice(1, -1))).join('\n') + '\n');
  const env = {
    PATH: process.env.PATH, HOME: path.join(base, 'home'), USERPROFILE: path.join(base, 'home'), TZ: 'UTC',
    MOMENTRY_CACHE: path.join(base, 'cache'), MOMENTRY_CONFIG: path.join(base, 'none.json'),
    MOMENTRY_PRIVACY_SOURCES: JSON.stringify([{ type: 'vault-titles', path: VAULT }]),
  };
  const box = path.join(repo, 'docs', 'storytelling-material');
  return {
    base, repo, tr, box, env,
    /** fake-llm dir: a copy of a fixture set plus the given angle outputs */
    fake(set, angles = {}) {
      const d = fs.mkdtempSync(path.join(base, 'fake-'));
      for (const f of fs.readdirSync(path.join(FIX, set))) fs.copyFileSync(path.join(FIX, set, f), path.join(d, f));
      for (const [k, v] of Object.entries(angles)) fs.writeFileSync(path.join(d, `${k}.json`), ok(v));
      return d;
    },
    run(args, extra = {}) {
      const r = spawnSync(process.execPath, [BIN, ...args], { cwd: repo, env: { ...env, ...extra }, encoding: 'utf8' });
      return { code: r.status, out: r.stdout, err: r.stderr };
    },
    stories() { return fs.readdirSync(box).filter((f) => f.endsWith('.md')).sort().map((f) => ({ f, ...parse(fs.readFileSync(path.join(box, f), 'utf8')) })); },
    held() { try { return fs.readdirSync(path.join(env.MOMENTRY_CACHE, 'quarantine', 'repo')); } catch { return []; } },
  };
}

const SPINE = { context: { text: 'Một người đo máy pha cà phê.', evidence: [1] }, turn: { text: 'Tưởng chậm vì máy, hoá ra vì một bước thừa.', evidence: [3] }, want: null };
const A = (k) => ({ spine: SPINE, angle: `Góc ${k}: tưởng chậm vì máy, hoá ra vì một bước thừa.`, audience: 'người tối ưu quy trình', evidence: [3] });

test('harvest: angles for the ranked stories; none and a failed call never fail the window', () => {
  const s = setup();
  const fake = s.fake('llm-ok', { 'angle-1': A(1), 'angle-2': { spine: {}, none: true, reason: 'chỉ là việc vặt' }, 'angle-3': { ...A(3), evidence: [99] }, 'angle-3-retry': { ...A(3), evidence: [99] } });
  const r = s.run(['harvest', '--transcript', s.tr, '--fake-llm', fake]);
  assert.equal(r.code, 0, r.err + r.out);
  assert.match(r.out, /góc kể: 1 có, 1 không ra chuyện, 1 hỏng \(chạy lại: momentry angle\)/);
  assert.match(r.out, /done; 2 chuyện thô, 3 cụm; ghi 3 mới, gộp 0/, 'angle writes are not counted as merges');
  const all = s.stories();
  const withAngle = all.filter((x) => x.data.angle && x.data.angle !== 'none');
  assert.equal(withAngle.length, 1);
  assert.equal(withAngle[0].data.angle, A(1).angle);
  assert.equal(withAngle[0].data.audience, 'người tối ưu quy trình');
  assert.match(withAngle[0].body, /^# .+\n\n\*\*Góc kể:\*\* Góc 1:/m);
  assert.equal(all.filter((x) => x.data.angle === 'none').length, 1);
  assert.equal(all.filter((x) => x.data.angle === undefined).length, 1);
  assert.equal(s.run(['check']).code, 0);

  // backfill: only the story without an angle is looked at, as angle-1
  const back = s.run(['angle', '--json'], { MOMENTRY_FAKE_LLM: s.fake('llm-ok', { 'angle-1': A('b') }) });
  assert.equal(back.code, 0, back.err + back.out);
  const j = JSON.parse(back.out);
  assert.equal(j.ok, true);
  assert.equal(j.data.stories.length, 1);
  assert.equal(j.data.stories[0].status, 'angle');
  assert.deepEqual(j.data.stories[0].evidence, [3]);
  assert.equal(s.stories().filter((x) => x.data.angle && x.data.angle !== 'none').length, 2);
  const again = s.run(['angle']);
  assert.equal(again.code, 0);
  assert.match(again.out, /đều đã có góc kể/);
});

test('harvest: a merge into a story keeps its angle', () => {
  const s = setup();
  assert.equal(s.run(['harvest', '--transcript', s.tr, '--fake-llm', s.fake('llm-ok', { 'angle-1': A(1), 'angle-2': A(2), 'angle-3': A(3) })]).code, 0);
  const before = s.stories().find((x) => x.f === '2026-01-10-may-pha-nhanh-gap-ba-nho.md');
  assert.ok(before.data.angle);
  fs.appendFileSync(s.tr, MINI.slice(8, 12).map((l) => l.replaceAll('__REPO__', JSON.stringify(s.repo).slice(1, -1))).join('\n') + '\n');
  const r = s.run(['harvest', '--transcript', s.tr, '--fake-llm', s.fake('llm-two-windows'), '--no-outsider']);
  assert.equal(r.code, 0, r.err + r.out);
  assert.match(r.out, /gộp 1/);
  const after = s.stories().find((x) => x.f === '2026-01-10-may-pha-nhanh-gap-ba-nho.md');
  assert.equal(after.data.angle, before.data.angle);
  assert.equal(after.data.audience, before.data.audience);
  assert.equal(after.body.split(ANGLE_LABEL).length, 2);
  assert.ok(after.data.lines.length > before.data.lines.length);
});

test('angle: a private name in the angle goes to quarantine like any story text, and stays held while blocked', () => {
  const s = setup();
  assert.equal(s.run(['harvest', '--transcript', s.tr, '--fake-llm', s.fake('llm-ok')]).code, 0);
  const id = s.stories()[0].f.slice(0, -3);
  const leak = { spine: {}, angle: 'Tưởng ổn, hoá ra lộ tên Du an Ho Sen.', audience: 'dev', evidence: [3] };
  const r = s.run(['angle', '--story', id, '--json'], { MOMENTRY_FAKE_LLM: s.fake('llm-ok', { 'angle-1': leak }) });
  assert.equal(r.code, 0, r.err + r.out);
  assert.equal(JSON.parse(r.out).data.stories[0].status, 'held');
  assert.equal(s.stories()[0].data.angle, undefined, 'nothing entered the box');
  assert.equal(s.held().length, 1);
  assert.equal(s.run(['quarantine', '--release', s.held()[0].slice(0, -5)]).code, 1, 'still blocked');
});

test('angle command: flags, dry run, unknown story, a failed call exits 4', () => {
  const s = setup();
  assert.equal(s.run(['harvest', '--transcript', s.tr, '--fake-llm', s.fake('llm-ok')]).code, 0);
  const ids = s.stories().map((x) => x.f.slice(0, -3));
  const dry = s.run(['angle', '--dry-run', '--top', '2']);
  assert.equal(dry.code, 0, dry.err);
  assert.match(dry.out, /dry-run angle: 2 chuyện \(haiku\), chi phí ước tính ~0\.01 USD/);
  assert.equal(s.stories().filter((x) => x.data.angle).length, 0);
  assert.equal(s.run(['angle', '--story', 'not-an-id']).code, 2);
  assert.equal(s.run(['angle', '--story', '2026-01-10-khong-co']).code, 1);
  assert.equal(s.run(['angle', '--story', ids[0], '--top', '1']).code, 2);
  assert.equal(s.run(['angle', '--top', 'x']).code, 2);
  const failed = s.run(['angle', '--story', ids[0]], { MOMENTRY_FAKE_LLM: s.fake('llm-ok') });
  assert.equal(failed.code, 4);
  assert.match(failed.out, /1 hỏng/);
  assert.equal(s.run(['angle', '--story', ids[0]], { MOMENTRY_FAKE_LLM: s.fake('llm-ok', { 'angle-1': A(1) }) }).code, 0);
  const kept = s.run(['angle', '--story', ids[0]]);
  assert.match(kept.out, /đã có góc kể \(viết lại: --force\)/);
  const forced = s.run(['angle', '--story', ids[0], '--force', '--json'], { MOMENTRY_FAKE_LLM: s.fake('llm-ok', { 'angle-1': A('mới') }) });
  assert.equal(forced.code, 0, forced.err + forced.out);
  assert.equal(s.stories().find((x) => x.f === `${ids[0]}.md`).data.angle, A('mới').angle);
  const show = s.run(['show', ids[0]]);
  assert.match(show.out, /Góc kể: Góc mới: .+ \(cho: người tối ưu quy trình\)/);
});

test('UI: Write the angle runs the real command for one story; a none is read again', async () => {
  const s = setup();
  assert.equal(s.run(['harvest', '--transcript', s.tr, '--fake-llm', s.fake('llm-ok')]).code, 0);
  const id = s.stories()[0].f.slice(0, -3);
  const ctx = (fake) => ({ env: { ...s.env, MOMENTRY_REPOS: s.repo, MOMENTRY_FAKE_LLM: fake }, cwd: s.repo });
  const key = listStories(ctx()).find((c) => c.id === id).key;
  const none = await writeAngle(ctx(s.fake('llm-ok', { 'angle-1': { spine: {}, none: true, reason: 'việc vặt' } })), key);
  assert.equal(none.wrote, false);
  assert.equal(none.angleNone, true);
  const r = await writeAngle(ctx(s.fake('llm-ok', { 'angle-1': A(1) })), key);
  assert.equal(r.message, 'Wrote the angle.');
  assert.equal(r.angle, A(1).angle);
  assert.equal(s.stories().find((x) => x.f === `${id}.md`).data.angle, A(1).angle);
});

// ---------- UI and the harness ----------

test('UI: cards and the story page carry the angle and audience; none or absent -> null', () => {
  const base = tmp('angle-ui-');
  const repo = path.join(base, 'repo');
  fs.mkdirSync(path.join(repo, '.git'), { recursive: true });
  fs.writeFileSync(path.join(repo, '.momentry.json'), '{}');
  const box = path.join(repo, 'docs', 'storytelling-material');
  const mk = (id, extra) => writeNew(box, { id, data: { date: '2026-01-10', status: 'raw', ...extra }, body: '\n# Tiêu đề\n\n**Chuyện gì xảy ra:** x\n' });
  mk('2026-01-10-co-goc', { tension: 'khac', stakes: 3, strength: 3 });
  mergeInto(box, '2026-01-10-co-goc', anglePatch({ angle: 'Tưởng A, hoá ra B.', audience: 'dev', evidence: [1] }));
  mk('2026-01-10-khong-goc', { angle: 'none' });
  mk('2026-01-10-chua-xet', {});
  const env = { HOME: path.join(base, 'home'), MOMENTRY_CACHE: path.join(base, 'cache'), MOMENTRY_CONFIG: path.join(base, 'none.json'), XDG_CONFIG_HOME: path.join(base, 'xdg'), MOMENTRY_REPOS: repo };
  const ctx = { env, cwd: repo };
  const cards = Object.fromEntries(listStories(ctx).map((c) => [c.id, c]));
  assert.equal(cards['2026-01-10-co-goc'].angle, 'Tưởng A, hoá ra B.');
  assert.equal(cards['2026-01-10-co-goc'].audience, 'dev');
  assert.equal(cards['2026-01-10-co-goc'].title, 'Tiêu đề');
  for (const id of ['2026-01-10-khong-goc', '2026-01-10-chua-xet']) { assert.equal(cards[id].angle, null); assert.equal(cards[id].audience, null); }
  const page = getStory(ctx, cards['2026-01-10-co-goc'].key, { markSeen: false });
  assert.equal(page.angle, 'Tưởng A, hoá ra B.');
  assert.equal(page.sections.what, 'x', 'the angle line is not a section');
  assert.deepEqual(page.outline, [], 'no spine, no outline');
});

test('UI: the story page carries the outline the angle was built on, filled slots only, in reading order', () => {
  const base = tmp('angle-outline-');
  const repo = path.join(base, 'repo');
  fs.mkdirSync(path.join(repo, '.git'), { recursive: true });
  fs.writeFileSync(path.join(repo, '.momentry.json'), '{}');
  const box = path.join(repo, 'docs', 'storytelling-material');
  writeNew(box, { id: '2026-01-10-a', data: { date: '2026-01-10', status: 'raw' }, body: '\n# T\n\n**Chuyện gì xảy ra:** x\n' });
  const spine = { turn: { text: 'Tưởng chậm vì máy,\nhoá ra một bước thừa.', evidence: [3] }, context: { text: 'Một quán cà phê.', evidence: [1] } };
  mergeInto(box, '2026-01-10-a', anglePatch({ spine, angle: 'Góc.', audience: 'dev', evidence: [3] }, { sid: 'abc' }));
  const env = { HOME: path.join(base, 'home'), MOMENTRY_CACHE: path.join(base, 'cache'), MOMENTRY_CONFIG: path.join(base, 'none.json'), XDG_CONFIG_HOME: path.join(base, 'xdg'), MOMENTRY_REPOS: repo };
  const ctx = { env, cwd: repo };
  const page = getStory(ctx, listStories(ctx)[0].key, { markSeen: false });
  assert.deepEqual(page.outline.map((o) => [o.slot, o.word]), [['context', 'Setting'], ['turn', 'Thought… turned out']]);
  assert.equal(page.outline[1].text, 'Tưởng chậm vì máy, hoá ra một bước thừa.');
  assert.deepEqual(page.outline[1].lines, ['L3']);
});

test('harness: capture summary has angle and audience; angle line left out of label matching; angle-check counts', () => {
  const s = { id: '2026-01-10-a', data: { tension: 'khac', angle: 'Tưởng A.', audience: 'dev' }, body: '\n# T\n\n**Góc kể:** Tưởng A.\n' };
  assert.deepEqual([summary(s).angle, summary(s).audience], ['Tưởng A.', 'dev']);
  assert.deepEqual([summary({ id: 'x', data: {}, body: '' }).angle, summary({ id: 'x', data: {}, body: '' }).audience], [null, null]);
  assert.ok(!storyText(s).includes('tuong-a'));
  const dir = tmp('angle-check-');
  const f = path.join(dir, 's.json');
  assert.equal(angleCheckCounts(f), null);
  fs.writeFileSync(f, JSON.stringify({ session: 's', stories: { a: { verdict: 'tellable' }, b: { verdict: 'invented' }, c: { verdict: 'tellable' }, d: { verdict: 'odd' } } }));
  assert.deepEqual(angleCheckCounts(f), { tellable: 2, 'no-story': 0, invented: 1, understood: { yes: 0, no: 0 } });
});

test('review page: angles in the found list and on matching answer rows; the angle check is saved privately', async () => {
  const { createReviewServer } = await import('../scripts/eval/review.mjs');
  const base = tmp('angle-review-');
  const labels = path.join(base, 'labels'); const data = path.join(base, 'data');
  fs.mkdirSync(labels); fs.mkdirSync(path.join(data, 's1', 'runs', '1'), { recursive: true });
  fs.writeFileSync(path.join(labels, 's1.md'), '---\nstatus: draft\n---\n| # | slug | tiêu đề | dòng | keywords | t | lý do |\n|---|---|---|---|---|---|---|\n| 1 | may-pha | Máy pha | | | x | |\n');
  fs.writeFileSync(path.join(data, 's1', 'runs', '1', 'capture.json'), JSON.stringify({ ranked: [
    { id: '2026-01-10-may-pha-nhanh', title: 'Máy pha nhanh', angle: 'Tưởng A, hoá ra B.', audience: 'dev' },
    { id: '2026-01-10-viec-vat', title: 'Việc vặt', angle: 'none', audience: null }] }));
  const server = createReviewServer({ labels, data, key: 'k'.repeat(24) });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const call = async (p, opt = {}) => { const r = await fetch(`http://127.0.0.1:${port}${p}`, { ...opt, headers: { 'x-key': 'k'.repeat(24) } }); return { status: r.status, body: await r.json() }; };
  try {
    const s = (await call('/api/sessions/s1')).body;
    assert.equal(s.stories[0].angle, 'Tưởng A, hoá ra B.');
    assert.equal(s.rows[0].angle, 'Tưởng A, hoá ra B.', 'answer row shows the angle of the found story it matches');
    assert.deepEqual(s.angleChecks, {});
    const put = (story, verdict) => call('/api/sessions/s1/angle', { method: 'PUT', body: JSON.stringify({ story, verdict }) });
    assert.deepEqual((await put('2026-01-10-may-pha-nhanh', 'invented')).body.angleChecks, { '2026-01-10-may-pha-nhanh': 'invented' });
    assert.equal((await put('2026-01-10-may-pha-nhanh', 'great')).status, 400);
    assert.equal((await put('2026-01-10-viec-vat', 'tellable')).status, 400, 'no angle, nothing to check');
    const file = path.join(data, 'angle-labels', 's1.json');
    assert.equal(fs.statSync(file).mode & 0o777, 0o600);
    assert.equal(fs.statSync(path.dirname(file)).mode & 0o777, 0o700);
    assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).stories['2026-01-10-may-pha-nhanh'].angle, 'Tưởng A, hoá ra B.');
    assert.deepEqual(angleCheckCounts(file), { tellable: 0, 'no-story': 0, invented: 1, understood: { yes: 0, no: 0 } });
    assert.deepEqual((await put('2026-01-10-may-pha-nhanh', null)).body.angleChecks, {});
  } finally { server.close(); }
});

test('harness: angle-check table per session and in total', async () => {
  const { formatAngleChecks } = await import('../scripts/eval/run.mjs');
  const out = formatAngleChecks({ s1: { tellable: 2, 'no-story': 1, invented: 0 }, s2: { tellable: 1, 'no-story': 0, invented: 1 } });
  assert.match(out, /^s1 +kể được 2, không ra chuyện 1, bịa 0 \(trên 3\)$/m);
  assert.match(out, /^tổng +kể được 3, không ra chuyện 1, bịa 1 \(trên 5\)$/m);
});
