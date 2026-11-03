import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nfc, stripDiacritics, toTelex, slugify } from '../lib/viet.mjs';

test('nfc merges decomposed marks', () => {
  const nfd = 'nghiệm'.normalize('NFD');
  assert.notEqual(nfd, 'nghiệm');
  assert.equal(nfc(nfd), 'nghiệm');
});

test('stripDiacritics drops marks and maps đ', () => {
  assert.equal(stripDiacritics('xét nghiệm'), 'xet nghiem');
  assert.equal(stripDiacritics('Đặng Thị Hằng, đường ướt'), 'Dang Thi Hang, duong uot');
  assert.equal(stripDiacritics('ASCII only 123'), 'ASCII only 123');
  assert.equal(stripDiacritics('nghiệm'.normalize('NFD')), 'nghiem');
});

test('toTelex puts tone at end of syllable', () => {
  assert.equal(toTelex('xét nghiệm'), 'xets nghieemj');
  assert.equal(toTelex('Đặng Quốc Vĩnh'), 'DDawngj Quoocs Vinhx');
  assert.equal(toTelex('người ướt, cả mỏ'), 'nguwowif uwowts, car mor');
  assert.equal(toTelex('ăn ở'), 'awn owr');
  assert.equal(toTelex('plain text'), 'plain text');
});

test('slugify: no diacritics, lowercase, max words, fallback', () => {
  assert.equal(slugify('Một ký tự Unicode làm điểm tìm kiếm tụt 8 lần'), 'mot-ky-tu-unicode-lam-diem');
  assert.equal(slugify('Đường đi: "ngắn" #1', 3), 'duong-di-ngan');
  assert.equal(slugify('  —  '), 'chuyen');
  assert.match(slugify('Mã lỗi ≠ 0 ở bước 5'), /^[a-z0-9]+(-[a-z0-9]+)*$/);
});
