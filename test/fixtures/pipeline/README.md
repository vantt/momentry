Dữ liệu bịa cho `pipeline.test.mjs` (không lấy từ phiên thật).

- `claude-mini.jsonl`: transcript Claude giả 12 dòng, `__REPO__` được thay bằng repo tạm. Cửa sổ 1 = L1–L8 (điểm nóng H1 H3 H4 H6), cửa sổ 2 = L9–L12 (H9 H10). Test chép ra `<uuid>.jsonl` để có id phiên `claude:5e5510aa`.
- Các thư mục `llm-*`: đầu ra `claude -p --output-format json` giả cho `--fake-llm`, sinh bằng `node make-fixtures.mjs`.
  - `llm-ok`: mọi bước thành công; người ngoài thêm góc kể cho K1 và một chuyện mới.
  - `llm-missing-hotspots`: lần đầu bỏ H4, H6; lần gọi bù trả lời đủ.
  - `llm-is-error`: harvest `is_error` cả hai lần.
  - `llm-bad-json`: hook-tension hỏng JSON cả hai lần.
  - `llm-rescore`: chấm lại hai chuyện của `llm-bad-json`.
  - `llm-privacy-leak`: một chuyện chứa tên note bịa trong `privacy/vault` (dạng bỏ dấu).
  - `llm-two-windows`: cửa sổ 2, gộp vào file của cửa sổ 1.
