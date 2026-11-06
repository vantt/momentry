// Story vocabulary (lib/rules/story-vocab.json): one list of tension types and harvest signals for prompts, validators, UI.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { VOCAB, VOCAB_FILE, TENSION_IDS, checkVocab, loadVocab, promptLists } from '../lib/vocab.mjs';
import { render } from '../lib/prompts.mjs';
import { TENSIONS } from '../lib/box.mjs';
import { validateHookTension } from '../lib/validate.mjs';
import { TWISTS } from '../lib/ui-api.mjs';

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

// The lists as they were written into the prompts before the vocabulary file; the model must read the same bytes.
const OLD_TENSIONS = `- nho_ma_to: nguyên nhân bé tí, hậu quả lớn
- giup_ma_hai: làm để tốt hơn, kết quả tệ hơn
- tuong_ma_hoa_ra: ai cũng nghĩ X, thật ra là Y
- hop_ma_tan: gộp nhiều thứ tốt, ra kết quả tệ
- cam_ma_van_lot: đã chặn, vẫn lọt qua chỗ không ai canh
- it_ma_nhieu: bỏ ra rất ít, thu về rất nhiều
- khac: giằng xé dạng khác
- none: không có giằng xé thật, chỉ là sự kiện, mẹo, hay việc vặt`;
const OLD_SIGNALS = `1. Số trước, số sau: một phép đo đổi rõ (điểm tìm kiếm, thời gian, số note).
2. Nguyên nhân bất ngờ: lỗi to mà gốc nhỏ, hoặc gốc nằm ở chỗ không ai nghi.
3. Đảo quyết định có lý do: làm A, đo thấy tệ, bỏ A; điều tưởng đúng hoá sai.
4. Người duyệt thứ máy soạn: bảng duyệt, hàng chờ, vòng lặp người với máy chạy được thật.
5. Ràng buộc định hình thiết kế: riêng tư, chạy trên máy, chỉ JS hay Rust... buộc chọn cách khác thường.
6. Artefact nhìn được: bảng, biểu đồ, màn hình đáng chụp.`;

test('vocab: rendered prompt text is byte-identical to the lists it replaced', () => {
  assert.deepEqual(promptLists(), { tensions: OLD_TENSIONS, signals: OLD_SIGNALS });
  // whole hook-tension prompt, hashed before the list moved into lib/rules/story-vocab.json
  assert.equal(sha(render('hook-tension', { stories: 'S' })), '300dc6ed22e77ed26a2f98e568986c3cf6628e875da0b690b76b671537983a65');
  for (const name of ['harvest', 'harvest-fill']) {
    const p = render(name, { transcript: 'T', hotspots: 'H' });
    assert.ok(p.includes(`Tín hiệu gợi ý (để nhận ra, không phải ngưỡng):\n${OLD_SIGNALS}\nKhông khớp tín hiệu nào`), name);
  }
  assert.ok(render('hook-tension', { stories: 'S' }).includes(`Các dạng thường gặp:\n${OLD_TENSIONS}\n\nVới TỪNG chuyện`));
});

test('vocab: validators and the UI read the same tension list', () => {
  assert.deepEqual(TENSIONS, TENSION_IDS);
  assert.deepEqual(TENSIONS, VOCAB.tensions.map((t) => t.id));
  for (const tension of TENSIONS) assert.deepEqual(validateHookTension({ hooks: [{ id: 'M1', hook: 'h', tension, strength: 1 }] }, { ids: ['M1'] }), [], tension);
  assert.match(validateHookTension({ hooks: [{ id: 'M1', hook: 'h', tension: 'la', strength: 1 }] }, { ids: ['M1'] })[0], /ngoài danh sách/);
  assert.deepEqual(Object.keys(TWISTS), TENSIONS.filter((t) => t !== 'none'));
  assert.equal(TWISTS.nho_ma_to, 'Tiny cause, big effect');
});

test('vocab: a broken file is refused with every problem named', () => {
  const raw = JSON.parse(fs.readFileSync(VOCAB_FILE, 'utf8'));
  assert.deepEqual(checkVocab(raw), []);
  const bad = structuredClone(raw);
  bad.tensions[1].id = 'nho_ma_to';
  bad.tensions = bad.tensions.filter((t) => t.id !== 'none');
  delete bad.signals[0].label;
  bad.signals[1].description = 'hai\ndòng';
  bad.signals[2].extra = 1;
  const errs = checkVocab(bad).join('\n');
  assert.match(errs, /tensions\[1\] nho_ma_to: id lặp/);
  assert.match(errs, /tensions: thiếu none/);
  assert.match(errs, /signals\[0\] so_truoc_so_sau: thiếu label/);
  assert.match(errs, /signals\[1\] nguyen_nhan_bat_ngo: thiếu description/);
  assert.match(errs, /signals\[2\] dao_quyet_dinh: khoá lạ extra/);
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'dm-vocab-'));
  fs.writeFileSync(path.join(d, 'v.json'), JSON.stringify(bad));
  assert.throws(() => loadVocab(path.join(d, 'v.json')), /từ vựng chuyện .* sai: .*id lặp/);
  assert.throws(() => loadVocab(path.join(d, 'none.json')), /không đọc được từ vựng chuyện/);
});
