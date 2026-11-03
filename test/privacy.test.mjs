import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadBlocklist, loadAllow, variants, check, checkStory, checkPatch, mask } from '../lib/privacy.mjs';
import { stringify } from '../lib/frontmatter.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIX = path.join(HERE, 'fixtures', 'privacy');
const BIN = path.resolve(HERE, '../bin/momentry.mjs');
const VAULT = { type: 'vault-titles', path: path.join(FIX, 'vault') };
const NAMES = { type: 'lines', path: path.join(FIX, 'names.txt'), proper: true };
const GOLDEN = { type: 'json-fields', path: path.join(FIX, 'golden.json'), fields: ['query', 'relevant_paths'] };

const bl = loadBlocklist([VAULT, NAMES, GOLDEN]);
const terms = (vs) => vs.map((v) => v.term).sort();

test('variants: exact, plain, telex', () => {
  assert.deepEqual(variants('Xét  Nghiệm'), ['xét nghiệm', 'xet nghiem', 'xets nghieemj']);
  assert.deepEqual(variants('Ideas'), ['ideas']);
  assert.deepEqual(variants('Đức'), ['đức', 'duc', 'dduwcs']);
  assert.deepEqual(variants(' — '), []);
});

test('loadBlocklist: vault titles skip _ and . folders and non-md; json fields include file names', () => {
  assert.ok(bl);
  const all = bl.terms.map((t) => t.term);
  for (const t of ['Trần Thị Bích Ngọc', 'Đặng Quốc Vĩnh', 'Dự án Hồ Sen', 'Ideas', 'Khuê', 'Lò Mỹ', 'lịch khám răng tháng chín', 'Hồ sơ nha khoa Mai Lâm']) {
    assert.ok(all.includes(t), t);
  }
  for (const t of ['Phạm Hữu Lộc', 'Lưu Gia Khánh', 'Tạ Minh Châu', 'trường này không được lấy']) assert.ok(!all.includes(t), t);
  assert.equal(bl.terms.find((t) => t.term === 'Khuê').proper, true);
  assert.equal(bl.terms.find((t) => t.term === 'Ideas').proper, false);
});

test('loadBlocklist: null when no source, unreadable, unknown type or no term', () => {
  assert.equal(loadBlocklist([]), null);
  assert.equal(loadBlocklist(undefined), null);
  assert.equal(loadBlocklist([VAULT, { type: 'lines', path: path.join(FIX, 'missing.txt') }]), null);
  assert.equal(loadBlocklist([{ type: 'vault-titles', path: path.join(FIX, 'names.txt') }]), null);
  assert.equal(loadBlocklist([{ type: 'weird', path: FIX }]), null);
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'dm-priv-'));
  assert.equal(loadBlocklist([{ type: 'vault-titles', path: empty }]), null);
});

test('loadBlocklist expands ~ from env HOME', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dm-home-'));
  fs.writeFileSync(path.join(home, 'n.txt'), 'Trương Vô Kỵ\n');
  const b = loadBlocklist([{ type: 'lines', path: '~/n.txt' }], { env: { HOME: home } });
  assert.deepEqual(b.terms.map((t) => t.term), ['Trương Vô Kỵ']);
});

test('check blocks all three forms of a multi-word name', () => {
  assert.deepEqual(check('Hôm qua gặp Trần Thị Bích Ngọc ở quán.', bl), [{ field: '', term: 'Trần Thị Bích Ngọc', kind: 'exact' }]);
  assert.deepEqual(check('hom qua gap tran thi bich ngoc o quan', bl), [{ field: '', term: 'Trần Thị Bích Ngọc', kind: 'plain' }]);
  assert.deepEqual(check('gặp Traanf Thij Bichs Ngocj rồi', bl), [{ field: '', term: 'Trần Thị Bích Ngọc', kind: 'telex' }]);
  assert.equal(check('DDawngj Quoocs Vinhx', bl)[0].kind, 'telex');
  assert.equal(check('dang quoc vinh', bl)[0].kind, 'plain');
  // text keeps diacritics but differs from the term's: caught on the stripped side
  assert.equal(check('Dư an Hô Sen', bl)[0].term, 'Dự án Hồ Sen');
});

test('check normalises NFC, case, whitespace and punctuation', () => {
  assert.equal(check('TRẦN   THỊ\nBÍCH-NGỌC', bl)[0].term, 'Trần Thị Bích Ngọc');
  assert.equal(check('trần thị bích ngọc'.normalize('NFD'), bl)[0].kind, 'exact');
});

test('check respects word boundaries', () => {
  assert.deepEqual(check('xtrần thị bích ngọcx', bl), []);
  assert.deepEqual(check('Đặng Quốc Vĩnhviễn', bl), []);
});

test('single words: only proper sources, short ones ignored', () => {
  assert.deepEqual(check('Một vài ideas cho bài sau', bl), []);
  assert.deepEqual(terms(check('Chị Khuê nói', bl)), ['Khuê']);
  assert.equal(check('chi khue noi', bl)[0].kind, 'plain');
  assert.equal(check('chij khueee', bl).length, 0);
  assert.equal(check('Khueee', bl).length, 0);
  assert.equal(check('Khuee noi', bl)[0].kind, 'telex');
  assert.deepEqual(check('an toàn, ăn uống, An', bl), []);
});

test('common words do not trigger', () => {
  const text = 'Chạy lại test sau khi sửa lỗi Unicode; điểm tìm kiếm tăng lên. Hồ sơ đã lưu, ghi chép.';
  assert.deepEqual(check(text, bl), []);
});

test('allowlist suppresses a term in any form', () => {
  assert.equal(check('Bài học cũ hôm nay', bl).length, 1);
  const allow = loadAllow(path.join(FIX, 'allow.txt'));
  assert.equal(allow.size, 0);
  const a = new Set(['bai hoc cu']);
  assert.deepEqual(check('Bài học cũ hôm nay', bl, a), []);
  assert.deepEqual(check('bai hoc cu', bl, a), []);
  assert.equal(check('Bài học cũ của Trần Thị Bích Ngọc', bl, a).length, 1);
});

test('loadAllow reads lines and ignores comments; missing file -> empty', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dm-allow-'));
  const f = path.join(dir, '.privacy-allow');
  fs.writeFileSync(f, '# chung\nBài học\n\n  sổ tay  \n');
  assert.deepEqual([...loadAllow(f)], ['Bài học', 'sổ tay']);
  assert.equal(loadAllow(null).size, 0);
  assert.equal(loadAllow(path.join(dir, 'none')).size, 0);
});

test('checkStory covers frontmatter fields, body and slug', () => {
  const clean = { data: { hook: 'Một dấu cách thừa', sides: ['dấu cách', 'lỗi build'] }, body: '# Một dấu cách thừa\n' };
  assert.deepEqual(checkStory(clean, '2026-11-02-mot-dau-cach-thua', bl), []);
  const slugOnly = checkStory(clean, '2026-11-02-gap-tran-thi-bich-ngoc', bl);
  assert.deepEqual(slugOnly.map((v) => [v.field, v.kind]), [['slug', 'plain']]);
  const v = checkStory({ data: { hook: 'Khuê bỏ cuộc', sides: ['a', 'Lò Mỹ'] }, body: 'Dự án Hồ Sen' }, 'x', bl);
  assert.deepEqual(v.map((x) => x.field).sort(), ['body', 'hook', 'sides']);
});

test('checkStory ignores template section labels but not the same words in content', () => {
  const body = '# T\n\n**Bối cảnh:** a\n**Chuyện gì xảy ra:** b\n**Bài học:** c\n**Artefact:** d\n';
  assert.deepEqual(checkStory({ data: {}, body }, 'x', bl), []);
  assert.equal(checkStory({ data: {}, body: body + 'Rút ra bài học cũ.\n' }, 'x', bl).length, 1);
});

test('checkPatch covers appended lines, outsider section, set values', () => {
  assert.deepEqual(checkPatch({ append: { lines: ['claude:0a1b#L3'] }, add: { runs: 1 } }, bl), []);
  const v = checkPatch({ append: { signals: ['nguyen nhan', 'tran thi bich ngoc'] }, set: { hook: 'Khuê' }, outsider: 'Dự án Hồ Sen làm khác' }, bl);
  assert.deepEqual(v.map((x) => x.field).sort(), ['append.outsider', 'append.signals', 'set.hook']);
});

test('mask shows first char and length only', () => {
  assert.equal(mask('Trần Thị Bích Ngọc'), 'T… (18)');
  assert.equal(mask('nghiệm'.normalize('NFD')), 'n… (6)');
});

// ---- CLI: check with real sources ----

function sandbox() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'dm-privcli-'));
  const repo = path.join(base, 'repo');
  fs.mkdirSync(path.join(repo, '.git'), { recursive: true });
  const box = path.join(repo, 'docs/storytelling-material');
  fs.mkdirSync(box, { recursive: true });
  const env = {
    PATH: process.env.PATH, HOME: path.join(base, 'home'),
    MOMENTRY_CACHE: path.join(base, 'cache'), MOMENTRY_CONFIG: path.join(base, 'user.json'),
  };
  return { base, repo, box, env };
}
const run = (args, { cwd, env }) => {
  const r = spawnSync(process.execPath, [BIN, ...args], { cwd, env, encoding: 'utf8' });
  return { code: r.status, out: r.stdout, err: r.stderr };
};
const story = (hook, body) => stringify({ date: '2026-11-02', status: 'raw', hook, signals: ['bất ngờ'] }, `# ${hook}\n\n**Chuyện gì xảy ra:** ${body}\n`);

test('cli check: 0 when clean, 1 with masked violation, 3 without source', () => {
  const { repo, box, env } = sandbox();
  fs.writeFileSync(path.join(box, '2026-11-02-mot-dau-cach-thua.md'), story('Một dấu cách thừa', 'Build hỏng vì một dấu cách.'));
  fs.writeFileSync(env.MOMENTRY_CONFIG, JSON.stringify({ privacy: { sources: [VAULT, NAMES] } }));
  let r = run(['check'], { cwd: repo, env });
  assert.equal(r.code, 0, r.err);

  fs.writeFileSync(path.join(box, '2026-11-02-gap-dang-quoc-vinh.md'), story('Hẹn gặp', 'Nói chuyện với DDawngj Quoocs Vinhx.'));
  r = run(['check'], { cwd: repo, env });
  assert.equal(r.code, 1);
  assert.match(r.err, /2026-11-02-gap-dang-quoc-vinh\.md: slug: riêng tư: Đ… \(14\)/);
  assert.match(r.err, /body: riêng tư: Đ… \(14\)/);
  assert.doesNotMatch(r.err + r.out, /Vĩnh|Vinhx/);

  fs.writeFileSync(env.MOMENTRY_CONFIG, '{}');
  r = run(['check'], { cwd: repo, env });
  assert.equal(r.code, 3);
  assert.match(r.err, /bỏ qua kiểm riêng tư: không có nguồn chặn/);
});

test('cli check: sources in .momentry.json are ignored -> 3', () => {
  const { repo, box, env } = sandbox();
  fs.writeFileSync(path.join(box, '2026-11-02-mot-dau-cach-thua.md'), story('Một dấu cách thừa', 'x'));
  fs.writeFileSync(path.join(repo, '.momentry.json'), JSON.stringify({ privacy: { sources: [VAULT], allowUnchecked: true } }));
  const r = run(['check'], { cwd: repo, env });
  assert.equal(r.code, 3);
});

test('cli check: env sources and box .privacy-allow', () => {
  const { repo, box, env } = sandbox();
  fs.writeFileSync(path.join(box, '2026-11-02-bai-hoc.md'), story('Bài học cũ về cache', 'Ghi lại bài học cũ.'));
  const e = { ...env, MOMENTRY_PRIVACY_SOURCES: JSON.stringify([VAULT]) };
  assert.equal(run(['check'], { cwd: repo, env: e }).code, 1);
  fs.writeFileSync(path.join(box, '.privacy-allow'), '# từ chung\nbài học cũ\n');
  assert.equal(run(['check'], { cwd: repo, env: e }).code, 0);
});

test('two-word titles: common phrases skipped, title-cased names still blocked', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dm-priv2-'));
  for (const t of ['Câu hỏi', 'Cửa sổ', 'Minh Khang', 'Kế hoạch quý bốn']) fs.writeFileSync(path.join(dir, `${t}.md`), '');
  const b = loadBlocklist([{ type: 'vault-titles', path: dir }]);
  assert.deepEqual(terms(check('Máy soạn 51 câu hỏi, mở cửa sổ duyệt.', b)), []);
  assert.deepEqual(terms(check('Gửi cho Minh Khang bản kế hoạch quý bốn.', b)), ['Kế hoạch quý bốn', 'Minh Khang']);
});
