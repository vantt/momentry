// End-to-end through the CLI with --fake-llm on an invented transcript (PRD 8, "Pipeline đầu cuối", "Dry run").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parse } from '../lib/frontmatter.mjs';
import { encodeProjectDir } from '../lib/sources/claude.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BIN = path.resolve(HERE, '../bin/momentry.mjs');
const FIX = path.join(HERE, 'fixtures', 'pipeline');
const VAULT = path.join(HERE, 'fixtures', 'privacy', 'vault');
const UUID = '5e5510aa-0000-4000-8000-000000000001';
const SID = 'claude:5e5510aa';
const MINI = fs.readFileSync(path.join(FIX, 'claude-mini.jsonl'), 'utf8').trimEnd().split('\n');

function setup({ lines = 8, privacy = true } = {}) {
  const base = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'dm-pipe-')));
  const repo = path.join(base, 'repo');
  fs.mkdirSync(path.join(repo, '.git'), { recursive: true });
  fs.writeFileSync(path.join(repo, '.momentry.json'), '{}');
  const tr = path.join(base, `${UUID}.jsonl`);
  const env = {
    PATH: process.env.PATH, HOME: path.join(base, 'home'), USERPROFILE: path.join(base, 'home'), TZ: 'UTC',
    MOMENTRY_CACHE: path.join(base, 'cache'), MOMENTRY_CONFIG: path.join(base, 'none.json'),
    ...(privacy ? { MOMENTRY_PRIVACY_SOURCES: JSON.stringify([{ type: 'vault-titles', path: VAULT }]) } : {}),
  };
  const s = {
    base, repo, tr, env, box: path.join(repo, 'docs', 'storytelling-material'), cache: env.MOMENTRY_CACHE,
    write(n) { fs.writeFileSync(tr, MINI.slice(0, n).map((l) => l.replaceAll('__REPO__', JSON.stringify(repo).slice(1, -1))).join('\n') + '\n'); },
    run(args, extra = {}) {
      const r = spawnSync(process.execPath, [BIN, ...args], { cwd: repo, env: { ...env, ...extra }, encoding: 'utf8' });
      return { code: r.status, out: r.stdout, err: r.stderr };
    },
    harvest(set, ...more) { return this.run(['harvest', '--transcript', tr, '--fake-llm', path.join(FIX, set), ...more]); },
    stories() { try { return fs.readdirSync(this.box).filter((f) => f.endsWith('.md')).sort(); } catch { return []; } },
    read(f) { return parse(fs.readFileSync(path.join(this.box, f), 'utf8')); },
    ledger() { return JSON.parse(fs.readFileSync(path.join(this.cache, 'ledger.json'), 'utf8')).sessions[SID]; },
    held() { try { return fs.readdirSync(path.join(this.cache, 'quarantine', 'repo')).sort(); } catch { return []; } },
  };
  s.write(lines);
  return s;
}

const snapshot = (dir) => {
  const out = {};
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else out[p] = fs.readFileSync(p, 'utf8'); } };
  if (fs.existsSync(dir)) walk(dir);
  return out;
};

test('llm-ok: writes the right stories, ledger; second run writes nothing', () => {
  const s = setup();
  const r = s.harvest('llm-ok');
  assert.equal(r.code, 0, r.err + r.out);
  assert.match(r.out, /done; 2 chuyện thô, 3 cụm; ghi 3 mới, gộp 0/);
  assert.deepEqual(s.stories(), ['2026-01-10-do-thoi-gian-tung-buoc-bang.md', '2026-01-10-may-pha-nhanh-gap-ba-nho.md', '2026-01-10-quay-lui-commit-khi-test-do.md']);
  const { data, body } = s.read('2026-01-10-may-pha-nhanh-gap-ba-nho.md');
  assert.equal(data.id, '2026-01-10-may-pha-nhanh-gap-ba-nho');
  assert.equal(data.date, '2026-01-10');
  assert.equal(data.repo, 'repo');
  assert.equal(data.status, 'raw');
  assert.deepEqual(data.sessions, [SID]);
  assert.equal(data.captured_by, 'harvest');
  assert.deepEqual(data.hit_by, ['hotspot', 'harvest', 'outsider']);
  assert.deepEqual(data.lines, [`${SID}#L1`, `${SID}#L3`]);
  assert.equal(data.privacy, 'checked');
  assert.ok(['it_ma_nhieu', 'none'].includes(data.tension));
  assert.ok(Number.isInteger(data.stakes) && Number.isInteger(data.strength));
  assert.equal(data.hits, 1); assert.equal(data.runs, 1);
  assert.match(body, /\*\*Góc người ngoài:\*\* cách làm phổ biến là đoán bằng mắt/);
  const out = s.read('2026-01-10-do-thoi-gian-tung-buoc-bang.md').data;
  assert.deepEqual(out.hit_by, ['outsider']);
  const l = s.ledger();
  assert.equal(l.lastLine, 8); assert.equal(l.status, 'done'); assert.equal(l.harvests[0].written, 3);
  assert.equal(l.harvests[0].hotspots, 4); assert.equal(l.mainGoals.length, 1);
  assert.equal(s.run(['check']).code, 0);
  const ranked = JSON.parse(s.run(['list', '--rank', '--json']).out).data;
  assert.equal(ranked.length, 3);
  assert.notEqual(ranked[0].tension, 'none');

  const before = snapshot(s.box);
  const again = s.harvest('llm-ok');
  assert.equal(again.code, 0);
  assert.match(again.out, /không có dòng mới/);
  assert.deepEqual(snapshot(s.box), before);
  assert.equal(s.ledger().harvests.length, 1);
  assert.equal(fs.readdirSync(path.join(s.cache, 'locks')).length, 0, 'lock released');
});

test('two windows (PreCompact then SessionEnd): window two merges into the old file', () => {
  const s = setup();
  assert.equal(s.harvest('llm-ok').code, 0);
  s.write(12);
  const r = s.harvest('llm-two-windows', '--no-outsider');
  assert.equal(r.code, 0, r.err + r.out);
  assert.match(r.out, /L9-L12: done; 1 chuyện thô, 3 cụm; ghi 0 mới, gộp 1/);
  assert.equal(s.stories().length, 3);
  const { data } = s.read('2026-01-10-may-pha-nhanh-gap-ba-nho.md');
  assert.deepEqual(data.lines, [`${SID}#L1`, `${SID}#L3`, `${SID}#L9`]);
  assert.equal(data.runs, 2); assert.equal(data.hits, 2);
  assert.ok(data.hits <= data.runs);
  const l = s.ledger();
  assert.equal(l.lastLine, 12);
  assert.deepEqual(l.harvests.map((h) => [h.fromLine, h.toLine]), [[1, 8], [9, 12]]);
  assert.equal(l.mainGoals.length, 2);
});

test('missing hotspots: harvest-fill gets exactly the missing ids; fill without answers -> partial', () => {
  const s = setup();
  const prompts = path.join(s.base, 'prompts');
  const r = s.harvest('llm-missing-hotspots', '--no-outsider', '--save-prompts', prompts);
  assert.equal(r.code, 0, r.err + r.out);
  const fill = fs.readFileSync(path.join(prompts, 'harvest-fill-c1-r1-f1.prompt.txt'), 'utf8').split('<hotspots>')[1];
  assert.match(fill, /^\nH4 /m); assert.match(fill, /^H6 /m); assert.doesNotMatch(fill, /H1 |H3 /);
  assert.equal(s.stories().length, 3);
  assert.equal(s.ledger().status, 'done');
  assert.equal(s.ledger().harvests[0].hotspotsMissing, 0);
  assert.equal(fs.existsSync(path.join(s.cache, 'runs')), false, 'prompts went to --save-prompts, not the cache');

  const t = setup();
  const fake = path.join(t.base, 'fake');
  fs.cpSync(path.join(FIX, 'llm-missing-hotspots'), fake, { recursive: true });
  const empty = { type: 'result', is_error: false, total_cost_usd: 0, result: '{"stories":[],"hotspots":[]}' };
  fs.writeFileSync(path.join(fake, 'harvest-fill-c1-r1-f1.json'), JSON.stringify(empty));
  fs.writeFileSync(path.join(fake, 'hook-tension-1.json'), fs.readFileSync(path.join(FIX, 'llm-privacy-leak', 'hook-tension-1.json')));
  fs.writeFileSync(path.join(fake, 'stakes-1.json'), fs.readFileSync(path.join(FIX, 'llm-privacy-leak', 'stakes-1.json')));
  const p = t.run(['harvest', '--transcript', t.tr, '--fake-llm', fake, '--no-outsider']);
  assert.equal(p.code, 0, p.err + p.out);
  assert.match(p.out, /partial/);
  const l = t.ledger();
  assert.equal(l.status, 'partial'); assert.equal(l.lastLine, 8); assert.equal(l.harvests[0].hotspotsMissing, 2);
  assert.equal(t.stories().length, 2);
});

test('llm-is-error: window failed, lastLine kept, nothing written; a later run starts again at line 1', () => {
  const s = setup();
  const r = s.harvest('llm-is-error');
  assert.equal(r.code, 4);
  assert.match(r.out, /mọi lần harvest đều hỏng/);
  assert.deepEqual(s.stories(), []);
  assert.equal(s.ledger().status, 'failed');
  assert.equal(s.ledger().lastLine, 0);
  const ok = s.harvest('llm-ok');
  assert.equal(ok.code, 0);
  assert.deepEqual(s.ledger().harvests.map((h) => [h.fromLine, h.status]), [[1, 'failed'], [1, 'done']]);
});

test('llm-bad-json: hook step fails -> partial with needsRescore; rescore fills the scores', () => {
  const s = setup();
  const r = s.harvest('llm-bad-json', '--no-outsider');
  assert.equal(r.code, 4, r.err + r.out);
  assert.match(r.out, /partial/); assert.match(r.out, /bước hỏng: hook-tension/);
  const files = s.stories();
  assert.equal(files.length, 2);
  for (const f of files) {
    const d = s.read(f).data;
    assert.equal(d.hook, undefined);
    assert.ok(Number.isInteger(d.stakes));
  }
  const l = s.ledger();
  assert.equal(l.status, 'partial'); assert.equal(l.lastLine, 8);
  assert.deepEqual([...l.needsRescore].sort(), files.map((f) => f.slice(0, -3)));

  const rs = s.run(['rescore', '--session', SID, '--no-outsider', '--fake-llm', path.join(FIX, 'llm-rescore')]);
  assert.equal(rs.code, 0, rs.err + rs.out);
  for (const f of files) assert.equal(typeof s.read(f).data.hook, 'string');
  assert.deepEqual(s.ledger().needsRescore, []);
});

test('llm-privacy-leak: the leaking story goes to quarantine, never into the box', () => {
  const s = setup();
  const r = s.harvest('llm-privacy-leak', '--no-outsider');
  assert.equal(r.code, 0, r.err + r.out);
  assert.match(r.out, /1 chuyện vi phạm riêng tư/);
  assert.deepEqual(s.stories(), ['2026-01-10-may-pha-nhanh-gap-ba-nho.md']);
  const all = Object.values(snapshot(s.box)).join('\n').toLowerCase();
  assert.doesNotMatch(all, /ho sen|hồ sen/);
  assert.equal(s.held().length, 1);
  const item = JSON.parse(fs.readFileSync(path.join(s.cache, 'quarantine', 'repo', s.held()[0]), 'utf8'));
  assert.equal(item.reason, 'violation');
  assert.ok(item.violations.length > 0);
  assert.doesNotMatch(fs.readFileSync(path.join(s.cache, 'hook.log'), 'utf8').toLowerCase(), /ho sen|hồ sen|ho-sen/);
  assert.equal(s.ledger().harvests[0].privacyBlocked, 1);
  const q = s.run(['quarantine']);
  assert.match(q.out, /violation/);
});

test('no block source: nothing enters the box (exit 3); allowUnchecked only from user env, not the repo file', () => {
  const s = setup({ privacy: false });
  fs.writeFileSync(path.join(s.repo, '.momentry.json'), JSON.stringify({ privacy: { allowUnchecked: true } }));
  const r = s.harvest('llm-ok');
  assert.equal(r.code, 3, r.err + r.out);
  assert.match(r.out, /bỏ qua kiểm riêng tư/);
  assert.deepEqual(s.stories(), []);
  assert.equal(s.held().length, 3);
  assert.equal(s.ledger().harvests[0].privacyUnchecked, 3);
  assert.equal(s.ledger().lastLine, 8);

  const u = setup({ privacy: false });
  const r2 = u.run(['harvest', '--transcript', u.tr, '--fake-llm', path.join(FIX, 'llm-ok')], { MOMENTRY_ALLOW_UNCHECKED: '1' });
  assert.equal(r2.code, 0, r2.err + r2.out);
  assert.equal(u.stories().length, 3);
  for (const f of u.stories()) assert.equal(u.read(f).data.privacy, 'unchecked');
});

test('--dry-run writes no file anywhere, with or without --fake-llm', () => {
  const s = setup();
  const before = snapshot(s.base);
  const r = s.run(['harvest', '--transcript', s.tr, '--dry-run']);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /dry-run claude:5e5510aa L1-L8: 10 Entry, 1 khúc, ~\d+ token, 4 điểm nóng/);
  assert.match(r.out, /chi phí ước tính/);
  const f = s.harvest('llm-ok', '--dry-run');
  assert.equal(f.code, 0, f.err + f.out);
  assert.match(f.out, /sẽ ghi 3 mới/);
  assert.deepEqual(snapshot(s.base), before);
  assert.equal(fs.existsSync(s.cache), false);
  assert.equal(fs.existsSync(s.box), false);
});

test('--dry-run on a Codex rollout picks the codex source', () => {
  const s = setup();
  const rollout = path.join(HERE, 'fixtures', 'transcripts', 'rollout-2026-01-10T09-00-00-0f9e8d7c-aaaa-7bbb-8ccc-ddddeeeeffff.jsonl');
  const r = s.run(['harvest', '--transcript', rollout, '--dry-run']);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /dry-run codex:eeeeffff/);
});

test('--blind writes nothing (no box, no ledger)', () => {
  const s = setup();
  const r = s.harvest('llm-ok', '--blind');
  assert.equal(r.code, 0, r.err + r.out);
  assert.match(r.out, /^blind /);
  assert.deepEqual(s.stories(), []);
  assert.equal(fs.existsSync(path.join(s.cache, 'ledger.json')), false);
});

test('a live lock: exit 5 and pending set', () => {
  const s = setup();
  fs.mkdirSync(path.join(s.cache, 'locks'), { recursive: true });
  fs.writeFileSync(path.join(s.cache, 'locks', 'claude_5e5510aa.lock'), JSON.stringify({ pid: process.pid, startedAt: 'x' }));
  const r = s.harvest('llm-ok');
  assert.equal(r.code, 5);
  assert.equal(s.ledger().pending, true);
  assert.deepEqual(s.stories(), []);
});

test('add: human story through the privacy gate', () => {
  const s = setup();
  let r = s.run(['add', '--title', 'Máy pha tự tắt giữa chừng', '--note', 'Máy tắt sau 3 tách, bật lại thì chạy.', '--session', SID]);
  assert.equal(r.code, 0, r.err + r.out);
  const [f] = s.stories();
  const { data, body } = s.read(f);
  assert.equal(f, `${data.date}-may-pha-tu-tat-giua-chung.md`);
  assert.equal(data.captured_by, 'human'); assert.deepEqual(data.hit_by, ['bip']);
  assert.deepEqual(data.sessions, [SID]); assert.equal(data.privacy, 'checked');
  assert.match(body, /\*\*Chuyện gì xảy ra:\*\* Máy tắt sau 3 tách/);
  r = s.run(['add', '--note', 'Gửi bản nháp cho Trần Thị Bích Ngọc']);
  assert.equal(r.code, 1);
  assert.match(r.out, /vi phạm riêng tư \(.*T… \(18\)/);
  assert.doesNotMatch(r.out, /Bích Ngọc/);
  assert.equal(s.stories().length, 1);
  assert.equal(s.held().length, 1);
  const u = setup({ privacy: false });
  r = u.run(['add', '--note', 'Một ghi chú thường.']);
  assert.equal(r.code, 3);
  assert.deepEqual(u.stories(), []);
});

test('scan: harvests sessions of the repo found under HOME, skips open and unchanged ones', () => {
  const s = setup();
  const dir = path.join(s.env.HOME, '.claude', 'projects', encodeProjectDir(s.repo));
  fs.mkdirSync(dir, { recursive: true });
  const t = path.join(dir, `${UUID}.jsonl`);
  fs.copyFileSync(s.tr, t);
  const old = new Date(Date.now() - 3600e3);
  fs.utimesSync(t, old, old);
  const open = path.join(dir, '7a7a7a7a-0000-4000-8000-000000000002.jsonl');
  fs.copyFileSync(s.tr, open);
  const fake = { MOMENTRY_FAKE_LLM: path.join(FIX, 'llm-ok') };
  let r = s.run(['scan', '--claude'], fake);
  assert.equal(r.code, 0, r.err + r.out);
  assert.match(r.out, /2 phiên; gom 1, bỏ qua 1 đang mở/);
  assert.equal(s.stories().length, 3);
  r = s.run(['scan', '--claude'], fake);
  assert.match(r.out, /gom 0, bỏ qua 1 đang mở \(< 30 phút\), 1 không đổi/);
  r = s.run(['harvest', '--session', SID, '--dry-run']);
  assert.match(r.out, /không có dòng mới/);
});

test('reduce prints hotspots; --out writes reduced.txt and hotspots.txt', () => {
  const s = setup();
  let r = s.run(['reduce', '--transcript', s.tr]);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /\[L1\] USER: Đo lại máy pha/);
  assert.match(r.out, /^H4 \[L4\] git reset$/m);
  const out = path.join(s.base, 'red');
  r = s.run(['reduce', '--transcript', s.tr, '--to-line', '3', '--out', out]);
  assert.equal(r.code, 0, r.err);
  assert.equal(fs.readFileSync(path.join(out, 'hotspots.txt'), 'utf8'), 'H1 [L1] số 40→12\nH3 [L3] exit 1\n');
});

test('runs = 3 with one failed run: the other two are used, runs records 2', () => {
  const s = setup();
  const fake = path.join(s.base, 'fake3');
  fs.mkdirSync(fake);
  const ok = (o) => JSON.stringify({ type: 'result', is_error: false, total_cost_usd: 0.01, result: JSON.stringify(o) });
  const src = (k) => JSON.parse(JSON.parse(fs.readFileSync(path.join(FIX, 'llm-ok', `${k}.json`), 'utf8')).result);
  const h = src('harvest-c1-r1');
  fs.writeFileSync(path.join(fake, 'harvest-c1-r1.json'), ok(h));
  fs.writeFileSync(path.join(fake, 'harvest-c1-r2.json'), JSON.stringify({ type: 'result', is_error: true, result: 'x' }));
  fs.writeFileSync(path.join(fake, 'harvest-c1-r3.json'), ok({ stories: [h.stories[0]], hotspots: h.hotspots }));
  fs.writeFileSync(path.join(fake, 'cluster-1.json'), ok({ clusters: [
    { title: h.stories[0].title, summary: 's', signals: [], members: ['r1-c1-S1', 'r3-c1-S1'] },
    { title: h.stories[1].title, summary: 's', signals: [], members: ['r1-c1-S2'] },
  ] }));
  fs.copyFileSync(path.join(FIX, 'llm-privacy-leak', 'hook-tension-1.json'), path.join(fake, 'hook-tension-1.json'));
  fs.copyFileSync(path.join(FIX, 'llm-privacy-leak', 'stakes-1.json'), path.join(fake, 'stakes-1.json'));
  const r = s.run(['harvest', '--transcript', s.tr, '--fake-llm', fake, '--runs', '3', '--no-outsider']);
  assert.equal(r.code, 0, r.err + r.out);
  assert.match(r.out, /lần chạy 2\/3/);
  const rec = s.ledger().harvests[0];
  assert.equal(rec.runs, 2); assert.equal(rec.runsFailed, 1); assert.equal(rec.status, 'partial');
  const a = s.read('2026-01-10-may-pha-nhanh-gap-ba-nho.md').data;
  const b = s.read('2026-01-10-quay-lui-commit-khi-test-do.md').data;
  assert.deepEqual([a.hits, a.runs, b.hits, b.runs], [2, 2, 1, 2]);
});

test('pending set during a run makes the holder take one more round, then clears it', async () => {
  const s = setup();
  const { runSession } = await import('../lib/pipeline.mjs');
  const { loadConfig } = await import('../lib/config.mjs');
  const cfg = loadConfig({ cwd: s.repo, env: s.env, flags: { 'fake-llm': path.join(FIX, 'llm-ok') } });
  fs.mkdirSync(s.cache, { recursive: true });
  fs.writeFileSync(path.join(s.cache, 'ledger.json'), JSON.stringify({ version: 1, sessions: { [SID]: { lastLine: 0, pending: true } } }));
  const r = await runSession(null, { cfg, transcript: s.tr, env: s.env });
  assert.equal(r.exitCode, 0, r.message);
  assert.match(r.message, /L1-L8: done/);
  assert.equal(s.ledger().pending, false);
  assert.equal(s.ledger().harvests.length, 1);
});
