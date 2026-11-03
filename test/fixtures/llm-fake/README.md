Kết quả `claude -p --output-format json` bịa cho test `llm.test.mjs` (`--fake-llm`). Nội dung không lấy từ phiên thật.

- `harvest-c1-r1`: thành công.
- `stakes-1` sai miền (`stakes: 5`), `stakes-1-retry` đúng: gọi lại một lần rồi qua.
- `hook-tension-1` có `is_error: true`; `hook-tension-1-retry` có `tension` ngoài danh sách: bước hỏng.
- `outsider-1` JSON hỏng, không có `outsider-1-retry`: bước hỏng (thiếu file).
