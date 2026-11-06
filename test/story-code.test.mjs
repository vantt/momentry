// Story codes (`M-XXXX`): derivation, collisions, frontmatter of new stories, backfill, duplicate check, lookup by code
// in the CLI, the web UI API and the review page, and the privacy gate ignoring the code fields. Temp dirs only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { candidateCode, normalizeCode, assignCodes, freeCode, withCode, CODE_RE, CODE_ALPHABET } from '../lib/story-code.mjs';
import { writeNew, readStory, readBox, findStory, backfillCodes, checkBox, codesOf, isStoryRef, AmbiguousCodeError } from '../lib/box.mjs';
import { stringify, parse } from '../lib/frontmatter.mjs';
import { checkStory, loadBlocklist } from '../lib/privacy.mjs';
import * as A from '../lib/ui-api.mjs';

const BIN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../bin/momentry.mjs');
const BODY = '\n# Cache cũ\n\n**Chuyện gì xảy ra:** Đổi Map sang LRU, p95 từ 800ms xuống 90ms.\n';
const tmp = (p) => fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), p)));
const put = (box, id, data = {}) => fs.writeFileSync(path.join(box, `${id}.md`), stringify({ id, date: id.slice(0, 10), status: 'raw', ...data }, BODY));

/** Two ids whose first candidates collide (found by search; deterministic). */
function collidingIds() {
  const seen = new Map();
  for (let n = 0; ; n++) {
    const id = `2026-01-01-c${n}`;
    const c = candidateCode(id);
    if (seen.has(c)) return [seen.get(c), id].sort();
    seen.set(c, id);
  }
}

test('derivation: M- and 4 Crockford chars, deterministic, spread over the alphabet', () => {
  assert.equal(CODE_ALPHABET.length, 32);
  assert.ok(!/[ILOU]/.test(CODE_ALPHABET));
  const c = candidateCode('2026-11-04-cache-lru');
  assert.match(c, CODE_RE);
  assert.equal(candidateCode('2026-11-04-cache-lru'), c, 'same id, same code');
  assert.notEqual(candidateCode('2026-11-04-cache-lru', 1), c, 'a salted candidate differs');
  const chars = new Set();
  for (let n = 0; n < 500; n++) for (const ch of candidateCode(`2026-01-01-s${n}`).slice(2)) chars.add(ch);
  assert.equal(chars.size, 32, 'every Crockford char shows up');
});

test('normalizeCode: any case, M- optional, look-alikes read as digits; other text is not a code', () => {
  assert.equal(normalizeCode('M-7K3Q'), 'M-7K3Q');
  assert.equal(normalizeCode('m-7k3q'), 'M-7K3Q');
  assert.equal(normalizeCode(' 7k3q '), 'M-7K3Q');
  assert.equal(normalizeCode('m-o1l1'), 'M-0111');
  for (const bad of ['M-7K3', '7K3QX', 'M-7K3U', 'M_7K3Q', '2026-11-04-cache-lru', '', null, 42]) assert.equal(normalizeCode(bad), null, String(bad));
  assert.ok(isStoryRef('2026-11-04-cache-lru') && isStoryRef('m-7k3q') && isStoryRef('7K3Q'));
  assert.ok(!isStoryRef('cache-lru') && !isStoryRef('../x'));
});

test('collisions: later story (id order) takes its next candidate; stored codes win; order of input does not matter', () => {
  const [a, b] = collidingIds();
  assert.ok(a < b);
  const codes = assignCodes([{ id: b, data: {} }, { id: a, data: {} }]);
  assert.equal(codes.get(a), candidateCode(a));
  assert.equal(codes.get(b), candidateCode(b, 1), 'the later id rehashes with salt #1');
  // a stored code is authoritative, even when it differs from the computed one, and keeps others away from it
  const stored = assignCodes([{ id: a, data: {} }, { id: b, data: { code: candidateCode(a) } }]);
  assert.equal(stored.get(b), candidateCode(a));
  assert.equal(stored.get(a), candidateCode(a, 1));
  assert.equal(freeCode(a, new Set([candidateCode(a), candidateCode(a, 1)])), candidateCode(a, 2));
  // a malformed stored code is ignored for lookup (check reports it)
  assert.equal(assignCodes([{ id: a, data: { code: 'M-IIII' } }]).get(a), candidateCode(a));
});

test('withCode: code and aliases right after id, alias added once, other keys kept in order', () => {
  assert.deepEqual(Object.keys(withCode({ id: 'x', date: 'd', status: 'raw' }, 'M-0000')), ['id', 'code', 'aliases', 'date', 'status']);
  assert.deepEqual(withCode({ id: 'x', aliases: ['Cache'] }, 'M-0000').aliases, ['Cache', 'M-0000']);
  assert.deepEqual(withCode({ id: 'x', aliases: ['M-0000'] }, 'M-0000').aliases, ['M-0000']);
});

test('new story: frontmatter gets code and aliases (YAML list Obsidian reads), never a code another story holds', () => {
  const box = tmp('dm-code-new-');
  const [a, b] = collidingIds();
  put(box, b); // older file without a code; holds candidate 0 of a as well
  writeNew(box, { id: a, data: { date: '2026-01-01', status: 'raw' }, body: BODY });
  const text = fs.readFileSync(path.join(box, `${a}.md`), 'utf8');
  const code = candidateCode(a, 1);
  assert.match(text, new RegExp(`^---\\nid: ${a}\\ncode: ${code}\\naliases: \\[${code}\\]\\ndate: 2026-01-01\\n`));
  assert.equal(parse(text).data.code, code);
  const codes = codesOf(readBox(box));
  assert.equal(codes.get(b), candidateCode(b), 'the older story keeps the code it already had');
  assert.equal(new Set(codes.values()).size, 2);
});

test('backfill: writes the codes stories already carry, leaves coded and broken files alone; idempotent', () => {
  const box = tmp('dm-code-fill-');
  put(box, '2026-01-01-a');
  put(box, '2026-01-02-b', { code: 'M-ZZZZ', aliases: ['M-ZZZZ'] });
  put(box, '2026-01-03-c', { code: 'M-YYYY' });
  put(box, '2026-01-04-d', { code: 'bad' });
  fs.writeFileSync(path.join(box, '2026-01-05-e.md'), 'no frontmatter');
  const before = codesOf(readBox(box));
  assert.deepEqual(backfillCodes(box, { dryRun: true }).map((x) => x.id), ['2026-01-01-a', '2026-01-03-c']);
  assert.equal(readStory(box, '2026-01-01-a').data.code, undefined, 'dry run writes nothing');
  const done = backfillCodes(box);
  assert.deepEqual(done, [{ id: '2026-01-01-a', code: before.get('2026-01-01-a') }, { id: '2026-01-03-c', code: 'M-YYYY' }]);
  const a = readStory(box, '2026-01-01-a');
  assert.deepEqual([a.data.code, a.data.aliases], [before.get('2026-01-01-a'), [before.get('2026-01-01-a')]]);
  assert.equal(a.body, BODY);
  assert.deepEqual(readStory(box, '2026-01-03-c').data.aliases, ['M-YYYY']);
  assert.equal(readStory(box, '2026-01-04-d').data.code, 'bad');
  assert.deepEqual(codesOf(readBox(box)), before, 'nothing moved');
  assert.deepEqual(backfillCodes(box), []);
});

test('check: duplicate stored codes and malformed codes are reported', () => {
  const box = tmp('dm-code-check-');
  put(box, '2026-01-01-a', { code: 'M-ABCD', aliases: ['M-ABCD'] });
  put(box, '2026-01-02-b', { code: 'M-ABCD', aliases: ['M-ABCD'] });
  put(box, '2026-01-03-c', { code: 'M-ILOU' });
  put(box, '2026-01-04-d', { aliases: 'M-ABCD' });
  const errs = checkBox(readBox(box));
  assert.deepEqual(errs.filter((e) => e.field === 'code').map((e) => e.file), ['2026-01-01-a.md', '2026-01-02-b.md', '2026-01-03-c.md']);
  assert.match(errs[0].msg, /trùng với 2026-01-02-b/);
  assert.ok(errs.some((e) => e.file === '2026-01-04-d.md' && e.field === 'aliases'));
  assert.throws(() => findStory(box, 'm-abcd'), (e) => e instanceof AmbiguousCodeError && e.ids.length === 2);
});

test('findStory: by id, or code in any case with or without M-; null when nothing matches', () => {
  const box = tmp('dm-code-find-');
  put(box, '2026-01-01-a');
  put(box, '2026-01-02-b', { code: 'M-7K3Q' });
  const ca = codesOf(readBox(box)).get('2026-01-01-a');
  assert.equal(findStory(box, '2026-01-01-a').code, ca);
  for (const ref of [ca, ca.toLowerCase(), ca.slice(2), ca.slice(2).toLowerCase()]) assert.equal(findStory(box, ref).story.id, '2026-01-01-a', ref);
  for (const ref of ['M-7K3Q', 'm-7k3q', '7K3Q', '7k3q']) assert.equal(findStory(box, ref).story.id, '2026-01-02-b', ref);
  assert.ok(![...codesOf(readBox(box)).values()].includes('M-0000'));
  assert.equal(findStory(box, 'M-0000'), null);
  assert.equal(findStory(box, '2026-01-09-nope'), null);
  assert.equal(findStory(box, 'cache-lru'), null);
});

test('privacy gate ignores code and aliases; label matching never sees frontmatter', async () => {
  const names = path.join(tmp('dm-code-priv-'), 'names.txt');
  fs.writeFileSync(names, 'M-ABCD\nQuokka Tran\n');
  const bl = loadBlocklist([{ type: 'lines', path: names }]);
  assert.ok(bl);
  const story = { data: { id: '2026-01-01-a', code: 'M-ABCD', aliases: ['M-ABCD'] }, body: BODY };
  assert.deepEqual(checkStory(story, '2026-01-01-a', bl), []);
  const leak = checkStory({ ...story, data: { ...story.data, aliases: ['M-ABCD', 'Quokka Tran'], hook: 'gặp M-ABCD' } }, '2026-01-01-a', bl);
  assert.deepEqual(leak.map((v) => v.field).sort(), ['aliases', 'hook'], 'a hand-written alias and other fields are still checked');
  const { storyText } = await import('../scripts/eval/labels.mjs');
  assert.ok(!storyText({ data: { code: 'M-ABCD', aliases: ['M-ABCD'] }, body: BODY }).includes('abcd'));
});

// ---------- CLI ----------

function repo() {
  const base = tmp('dm-code-cli-');
  const root = path.join(base, 'proj');
  const box = path.join(root, 'docs', 'storytelling-material');
  fs.mkdirSync(path.join(root, '.git'), { recursive: true });
  fs.mkdirSync(box, { recursive: true });
  fs.writeFileSync(path.join(root, '.momentry.json'), '{}\n');
  const env = { PATH: process.env.PATH, HOME: path.join(base, 'home'), USERPROFILE: path.join(base, 'home'), MOMENTRY_CACHE: path.join(base, 'cache'), MOMENTRY_CONFIG: path.join(base, 'none.json') };
  const run = (args) => {
    const r = spawnSync(process.execPath, [BIN, ...args], { cwd: root, env, encoding: 'utf8' });
    return { code: r.status, out: r.stdout, err: r.stderr, json: () => JSON.parse(r.stdout) };
  };
  return { base, root, box, env, run };
}

test('CLI: list shows codes; show / mark / angle --story take a code in any form', () => {
  const { base, box, run } = repo();
  put(box, '2026-11-02-cache-lru', { tension: 'nho_ma_to', stakes: 3, strength: 3 });
  const code = candidateCode('2026-11-02-cache-lru');
  const list = run(['list']);
  assert.match(list.out.split('\n')[1], new RegExp(`^${code}\\s+2026-11-02-cache-lru`));
  assert.equal(run(['list', '--json']).json().data[0].code, code);
  for (const ref of [code, code.toLowerCase(), code.slice(2).toLowerCase()]) {
    const r = run(['show', ref, '--json']);
    assert.equal(r.code, 0, r.out + r.err);
    assert.deepEqual([r.json().data.id, r.json().data.code], ['2026-11-02-cache-lru', code]);
  }
  assert.match(run(['show', code]).out, new RegExp(`^# Cache cũ\\n${code} · 2026-11-02-cache-lru · `));
  const m = run(['mark', code.slice(2).toLowerCase(), 'use', '--json']);
  assert.equal(m.code, 0, m.out);
  assert.equal(readStory(box, '2026-11-02-cache-lru').data.status, 'picked');
  assert.match(run(['mark', code, 'later']).out, /^đã đánh dấu 2026-11-02-cache-lru: later/);
  const state = JSON.parse(fs.readFileSync(path.join(base, 'cache', 'ui-state.json'), 'utf8'));
  assert.ok(Object.keys(state.later).every((k) => k.endsWith('/2026-11-02-cache-lru')), 'machine state is keyed by id, not by code');
  const missing = run(['show', 'M-0000', '--json']);
  assert.equal(missing.code, 1);
  assert.equal(missing.json().error.code, 'no-story');
  const angle = run(['angle', '--story', code.toLowerCase(), '--dry-run', '--json']);
  assert.equal(angle.code, 0, angle.out + angle.err);
  assert.match(angle.out, /2026-11-02-cache-lru/, 'the code resolved to the story id');
  assert.equal(run(['angle', '--story', 'M-0000', '--dry-run', '--json']).json().error.code, 'no-story');
});

test('CLI: check reports duplicate codes; check --fix writes codes into old files', () => {
  const { box, run } = repo();
  put(box, '2026-01-01-a');
  put(box, '2026-01-02-b');
  const before = codesOf(readBox(box));
  const fix = run(['check', '--fix', '--json']);
  assert.deepEqual(fix.json().data.codesWritten, [{ id: '2026-01-01-a', code: before.get('2026-01-01-a') }, { id: '2026-01-02-b', code: before.get('2026-01-02-b') }]);
  assert.equal(readStory(box, '2026-01-01-a').data.code, before.get('2026-01-01-a'));
  assert.deepEqual(run(['check', '--fix', '--json']).json().data.codesWritten, []);
  put(box, '2026-01-03-c', { code: before.get('2026-01-01-a') });
  const dup = run(['check']);
  assert.equal(dup.code, 1);
  assert.match(dup.err, /2026-01-03-c\.md: code: mã M-[0-9A-Z]{4} trùng với 2026-01-01-a/);
  const amb = run(['show', before.get('2026-01-01-a'), '--json']);
  assert.equal(amb.code, 1);
  assert.equal(amb.json().error.code, 'ambiguous-code');
});

// ---------- web UI API and review page ----------

test('UI API: cards and the story page carry the code; a code works as the key and state stays keyed by id', () => {
  const base = tmp('dm-code-ui-');
  const repoDir = path.join(base, 'proj');
  const box = path.join(repoDir, 'docs', 'storytelling-material');
  fs.mkdirSync(path.join(repoDir, '.git'), { recursive: true });
  fs.mkdirSync(box, { recursive: true });
  fs.writeFileSync(path.join(repoDir, '.momentry.json'), '{}\n');
  const env = { HOME: path.join(base, 'home'), MOMENTRY_CONFIG: path.join(base, 'config', 'config.json'), MOMENTRY_CACHE: path.join(base, 'cache'), XDG_CONFIG_HOME: path.join(base, 'config-home') };
  const ctx = { env, cwd: repoDir };
  put(box, '2026-11-02-a');
  const code = candidateCode('2026-11-02-a');
  const [card] = A.listStories(ctx);
  assert.equal(card.code, code);
  const pid = card.project;
  const s = A.getStory(ctx, `${pid}/${code.slice(2).toLowerCase()}`);
  assert.deepEqual([s.id, s.code, s.key], ['2026-11-02-a', code, `${pid}/2026-11-02-a`]);
  assert.ok(A.loadState(env).seen[`${pid}/2026-11-02-a`], 'seen under the id key');
  assert.equal(A.markStory(ctx, `${pid}/${code}`, 'later').later, true);
  assert.ok(A.loadState(env).later[`${pid}/2026-11-02-a`]);
  assert.throws(() => A.getStory(ctx, `${pid}/M-0000`), (e) => e.status === 404);
  backfillCodes(box);
  put(box, '2026-11-03-b', { code });
  assert.throws(() => A.getStory(ctx, `${pid}/${code}`), (e) => e.status === 409 && /momentry check/.test(e.message));
});

test('review page: found stories carry a code and an angle check accepts a code', async () => {
  const { createReviewServer } = await import('../scripts/eval/review.mjs');
  const base = tmp('dm-code-review-');
  const labels = path.join(base, 'labels'); const data = path.join(base, 'data');
  fs.mkdirSync(labels); fs.mkdirSync(path.join(data, 's1', 'runs', '1'), { recursive: true });
  fs.writeFileSync(path.join(labels, 's1.md'), '---\nstatus: draft\n---\n| # | slug | tiêu đề | dòng | keywords | t | lý do |\n|---|---|---|---|---|---|---|\n| 1 | may-pha | Máy pha | | | x | |\n');
  fs.writeFileSync(path.join(data, 's1', 'runs', '1', 'capture.json'), JSON.stringify({ ranked: [
    { id: '2026-01-10-may-pha-nhanh', code: 'M-7K3Q', title: 'Máy pha nhanh', angle: 'Tưởng A, hoá ra B.', audience: 'dev' },
    { id: '2026-01-10-viec-vat', title: 'Việc vặt', angle: 'none', audience: null }] }));
  const key = 'k'.repeat(24);
  const server = createReviewServer({ labels, data, key });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const call = async (p, opt = {}) => { const r = await fetch(`http://127.0.0.1:${port}${p}`, { ...opt, headers: { 'x-key': key } }); return { status: r.status, body: await r.json() }; };
  try {
    const s = (await call('/api/sessions/s1')).body;
    assert.deepEqual(s.stories.map((x) => x.code), ['M-7K3Q', candidateCode('2026-01-10-viec-vat')]);
    const r = await call('/api/sessions/s1/angle', { method: 'PUT', body: JSON.stringify({ story: '7k3q', verdict: 'tellable' }) });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(r.body.angleChecks, { '2026-01-10-may-pha-nhanh': 'tellable' });
  } finally { server.close(); }
});
