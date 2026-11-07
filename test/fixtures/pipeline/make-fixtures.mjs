// Regenerates the invented `--fake-llm` sets in this folder: node test/fixtures/pipeline/make-fixtures.mjs
// Window 1 = claude-mini.jsonl L1-L8 (hotspots H1 H3 H4 H6), window 2 = L9-L12 (H9 H10). Content is made up.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { slugify } from '../../../lib/viet.mjs';
import { originTag } from '../../../lib/box.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATE = '2026-01-10';

const ok = (obj) => ({ type: 'result', subtype: 'success', is_error: false, duration_ms: 1000, total_cost_usd: 0.01, result: typeof obj === 'string' ? obj : JSON.stringify(obj) });
const err = () => ({ type: 'result', subtype: 'error_during_execution', is_error: true, duration_ms: 500, total_cost_usd: 0.001, result: 'API Error' });

function write(dir, files) {
  const d = path.join(HERE, dir);
  fs.rmSync(d, { recursive: true, force: true });
  fs.mkdirSync(d, { recursive: true });
  for (const [k, v] of Object.entries(files)) fs.writeFileSync(path.join(d, `${k}.json`), JSON.stringify(v) + '\n');
}

const story = (title, lines, what, extra = {}) => ({
  title, signals: ['số trước, số sau'], lines, context: 'Máy pha giả trong một repo giả.', what_happened: what,
  lesson: 'Đo trước khi tối ưu.', artefact: 'bảng số trước và sau', ...extra,
});
const S1 = story('Máy pha nhanh gấp ba nhờ bỏ một bước', ['L1', 'L3'], 'Thời gian pha giảm từ 40 xuống 12 giây khi bỏ bước nghiền thừa; test đỏ một lần vì tên công thức có dấu cách.');
const S2 = story('Quay lui commit khi test đỏ', ['L4'], 'Agent chạy git reset để bỏ commit làm test đỏ, rồi đo lại.', { signals: ['đảo quyết định có lý do'] });
const S3 = story('Lệnh bip đánh dấu đúng lúc máy nhanh hẳn', ['L6'], 'User gõ bip ngay khi thấy máy pha nhanh hẳn, thành điểm neo cho lần gom sau.', { signals: ['khác'] });
const answers = (ids, verdict = 'story') => ids.map((id) => ({ id, verdict, story_title: verdict === 'story' ? 'x' : '', reason: verdict === 'skip' ? 'vặt' : '' }));
const hooks = (n) => ({ hooks: Array.from({ length: n }, (_, i) => ({ id: `M${i + 1}`, hook: `Bỏ một bước, máy nhanh gấp ${i + 2}`, tension: i === n - 1 ? 'none' : 'it_ma_nhieu', side_a: i === n - 1 ? '' : 'bỏ bớt', side_b: i === n - 1 ? '' : 'nhanh hơn', strength: i === n - 1 ? 0 : 2 })) });
const stakes = (n) => ({ main_goal: 'Làm máy pha giả chạy nhanh hơn.', stakes: Array.from({ length: n }, (_, i) => ({ id: `M${i + 1}`, stakes: 3 - (i % 4), reason: 'ngắn' })) });
const OUT = { what: 'Đo thời gian từng bước bằng một lệnh shell một dòng', common_practice: 'đoán bằng mắt', gap: 'có số trước sau ngay trong phiên', lines: ['L2'] };

/** Id the pipeline gives a story of this title harvested from the fixture session (claude-mini.jsonl). */
const idOf = (title) => `${DATE}-${slugify(title)}-${originTag('claude:5e5510aa')}`;

// window 1: everything works; outsider adds an angle to K1 and one new story
write('llm-ok', {
  'harvest-c1-r1': ok({ stories: [S1, S2], hotspots: [...answers(['H1', 'H3', 'H4']), ...answers(['H6'], 'skip')] }),
  'outsider-1': ok({ outsider: [{ ...OUT, what: 'So số trước và sau ngay khi đổi', lines: ['L1'], already_picked: 'K1' }, { ...OUT, already_picked: null }] }),
  'hook-tension-1': ok(hooks(3)),
  'stakes-1': ok(stakes(3)),
});

// hotspots H4 and H6 unanswered by the first call; the fill call answers them and adds a story
write('llm-missing-hotspots', {
  'harvest-c1-r1': ok({ stories: [S1, S2], hotspots: answers(['H1', 'H3']) }),
  'harvest-fill-c1-r1-f1': ok({ stories: [S3], hotspots: [...answers(['H4'], 'skip'), ...answers(['H6'])] }),
  'hook-tension-1': ok(hooks(3)),
  'stakes-1': ok(stakes(3)),
});

// harvest fails twice (is_error then is_error): window failed, lastLine kept
write('llm-is-error', { 'harvest-c1-r1': err(), 'harvest-c1-r1-retry': err() });

// hook-tension returns broken JSON twice: stories written without hook, window partial
write('llm-bad-json', {
  'harvest-c1-r1': ok({ stories: [S1, S2], hotspots: answers(['H1', 'H3', 'H4', 'H6']) }),
  'hook-tension-1': ok('{"hooks": [ {"id": "M1", '),
  'hook-tension-1-retry': ok('không phải JSON'),
  'stakes-1': ok(stakes(2)),
});

// rescore of the two stories written by llm-bad-json (no outsider)
write('llm-rescore', { 'hook-tension-1': ok(hooks(2)), 'stakes-1': ok(stakes(2)) });

// one story names a made-up vault note (plain form, no diacritics); the other is clean
write('llm-privacy-leak', {
  'harvest-c1-r1': ok({ stories: [S1, story('Ghi chú Du an Ho Sen bị lộ', ['L4'], 'Agent chép tên note Du an Ho Sen vào log.')], hotspots: answers(['H1', 'H3', 'H4', 'H6']) }),
  'hook-tension-1': ok(hooks(2)),
  'stakes-1': ok(stakes(2)),
});

// window 2 (after llm-ok, run with --no-outsider): the new story merges into S1's file
const outNew = idOf(OUT.what);
write('llm-two-windows', {
  'harvest-c1-r1': ok({ stories: [story('Làm nóng sẵn: 12 xuống 9 giây', ['L9'], 'Làm nóng sẵn làm thời gian pha giảm tiếp từ 12 xuống 9 giây; bước này được ghi vào cấu hình agent.')], hotspots: answers(['H9', 'H10']) }),
  'cluster-1': ok({ clusters: [
    { title: 'Máy pha nhanh dần qua hai lần đo', summary: '40 xuống 12 rồi xuống 9 giây.', signals: ['số trước, số sau'], members: ['r1-c1-S1', `box:${idOf(S1.title)}`] },
    { title: S2.title, summary: S2.what_happened, signals: [], members: [`box:${idOf(S2.title)}`] },
    { title: OUT.what, summary: OUT.what, signals: [], members: [`box:${outNew}`] },
  ] }),
  'hook-tension-1': ok(hooks(1)),
  'stakes-1': ok(stakes(3)),
});
