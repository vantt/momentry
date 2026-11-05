# Bộ đo chất lượng và chi phí (eval harness)

Chụp đầu ra model của pipeline thật một lần, rồi chạy lại bao nhiêu lần cũng được bằng `--fake-llm`, không tốn tiền model. Dùng để đo mọi thay đổi xếp hạng, chấm điểm, rút gọn input: tốt lên hay tệ đi, trên nhiều phiên.

Node ≥ 20, không dependency, như phần còn lại của repo.

```sh
node scripts/eval/run.mjs --manifest docs/_private/eval/manifest.json --capture   # gọi model thật, tốn tiền
node scripts/eval/run.mjs --manifest docs/_private/eval/manifest.json             # chạy lại, 0 USD
node scripts/eval/review.mjs                                                       # trang duyệt nhãn trên máy
```

`review.mjs` mở trang trên 127.0.0.1 và địa chỉ Tailscale của máy (in link có khoá; `--local` chỉ nghe trên máy): tick chuyện đáng kể, xoá dòng không phải chuyện, thêm chuyện còn thiếu (gõ tay hoặc chọn từ danh sách momentry tìm ra trong bản chụp mới nhất), rồi đánh dấu đã duyệt. Trang ghi thẳng vào file nhãn, cùng định dạng ở dưới. Cờ: `--labels DIR`, `--data DIR` (bản chụp để lấy danh sách và hạng, mặc định `docs/_private/eval/new-defaults`), `--port N` (mặc định 4826).

| Cờ | Nghĩa |
|---|---|
| `--manifest FILE` | danh sách phiên (bắt buộc) |
| `--capture` | mỗi phiên một lần chụp mới bằng model thật, rồi đo như chạy lại. Chụp hai lần một phiên để đo độ lệch giữa hai lần chạy |
| `--out DIR` | thư mục dữ liệu, mặc định `docs/_private/eval/` của repo chứa script |
| `--only ID,ID` | chỉ các phiên này |
| `--jobs N` | số phiên chạy song song (mặc định 1) |
| `--budget USD` | với `--capture`: bỏ phiên tiếp theo khi số đã tiêu trong lần gọi này cộng 1,3 × ước tính `dry-run` của phiên vượt mức. Ước tính lệch 0,65–1,16 lần so với thực tế ([giảm chi phí](../../docs/experiments/2026-11-05-cost-cuts/README.md)) |
| `--keep` | giữ repo nháp của lần chạy lại để soi |

Mã thoát: 0 xong; 1 có phiên hỏng (chụp, chạy lại, file nhãn); 2 sai cú pháp hoặc manifest hỏng.

**Dữ liệu chứa nội dung transcript.** Mọi thứ dưới `docs/_private/` bị gitignore và không bao giờ được commit. Chỉ số tổng hợp (không tiêu đề, không trích đoạn) mới được chép sang `docs/experiments/`.

## Cô lập

Mỗi lần chạy (chụp hay chạy lại) dùng một repo git nháp mới với `.momentry.json`, cache (`MOMENTRY_CACHE`), file cấu hình (`MOMENTRY_CONFIG`) và danh sách dự án (`XDG_CONFIG_HOME`) riêng, đều nằm trong thư mục dữ liệu. Hộp, sổ, cache và cấu hình thật không bị ghi. Từ cấu hình thật chỉ đọc `privacy.sources` (tên riêng tư) để cổng riêng tư chạy như thật; cấu hình nháp bật `allowUnchecked`, nên khi máy không có nguồn chặn, chuyện vẫn vào hộp nháp. Chuyện bị cổng riêng tư giữ lại vẫn được tính vào danh sách xếp hạng (đánh dấu `held`), để chỉ số không phụ thuộc tên riêng tư.

Lời gọi model chạy với môi trường thật (đăng nhập `claude`), cấu hình mặc định (harvest và người ngoài `haiku`, chấm `sonnet`, `runs` 1), không theo cấu hình riêng của người dùng.

## Manifest

```json
{
  "sessions": [
    { "id": "2dfb5915", "host": "claude", "transcript": "/abs/path/2dfb5915-....jsonl", "fromLine": 1, "toLine": 4000, "labels": "labels/2dfb5915.md" }
  ]
}
```

- `id`: tên thư mục, `[A-Za-z0-9._-]`, không trùng. Quy ước: 8 ký tự hex của id phiên momentry.
- `host`: nguồn transcript của momentry (`claude`, `codex`, `pi`, `omp`, `agy`).
- `transcript`: đường dẫn tuyệt đối. `fromLine` mặc định 1; `toLine` lớn hơn số dòng thì cắt ở cuối file.
- `labels`: tuỳ chọn, đường dẫn tương đối theo thư mục manifest. Không có file nhãn (hoặc file chưa tồn tại) thì chỉ đo chi phí, thời gian và số chuyện.

## Bố cục dữ liệu

```
<out>/<id>/runs/<n>/capture.json   cửa sổ thật đã chạy, sha của cửa sổ, ước tính dry-run, báo cáo --json, danh sách xếp hạng
<out>/<id>/runs/<n>/llm/           đầu ra thô của mọi lời gọi model (--save-llm), dùng lại bằng --fake-llm
<out>/<id>/runs/<n>/scratch/       repo, hộp, cache nháp của lần chụp (prompt nằm ở scratch/cache/runs/)
<out>/results/<thời điểm>.json     mọi chỉ số của một lần chạy harness
```

Chạy lại dùng đúng cửa sổ đã ghi trong `capture.json` (không đọc lại `toLine` của manifest), và báo `transcript đã đổi` khi sha của các dòng đó khác lúc chụp. Cột `replay` báo `khác lần chụp` khi danh sách id (bỏ ngày) khác lần chụp: mong đợi sau khi sửa xếp hạng hay chấm điểm, còn khi mã không đổi thì là dấu hiệu chạy lại không tất định.

Chạy lại tất định: cùng đầu ra model và cùng cửa sổ thì ra cùng chuyện, cùng thứ tự (test: `test/eval.test.mjs`). Ngoại lệ đã biết: chuyện không có dòng mang mốc thời gian lấy ngày chạy làm `date`, nên id của nó đổi theo ngày; vì vậy so id bỏ phần ngày.

## File nhãn

Markdown: frontmatter tuỳ chọn (bỏ qua), rồi một bảng. Mỗi dòng bảng là một chuyện đáp án. Cột nhận theo tên ở dòng tiêu đề (không phân biệt dấu, hoa thường); cột khác (`#`, `lý do`) bỏ qua:

| Cột | Bắt buộc | Nghĩa |
|---|---|---|
| `keywords` | có (hoặc `slug`) | 3–6 từ hoặc cụm từ, cách nhau dấu phẩy. `abc*` khớp mọi từ bắt đầu bằng `abc` |
| `t` | có | `x` (hoặc `yes`) là chuyện thật sự đáng kể; trống là không |
| `slug` | không | gợi ý slug; cũng là tên hiển thị |
| `dòng` | không | khoảng dòng transcript, ví dụ `1363-1364, 2344-2345` |
| `tiêu đề` | không | chỉ để hiển thị khi không có `slug` |
| `min` | không | số từ khoá cần có để khớp chỉ bằng từ khoá; mặc định min(2, số từ khoá) |

```markdown
---
session: 2dfb5915
status: draft
---
| # | slug | tiêu đề | dòng | keywords | t | lý do |
|---|---|---|---|---|---|---|
| 1 | stop-hook-vong-lap | Stop hook chặn hơn 20 lần | 2147-2872 | Stop hook, /goal clear, vẫn đang chờ | x | Mâu thuẫn công cụ tốn nhiều lượt. |
```

### Khớp chuyện với nhãn

Tất định, không dùng LLM chấm. Mọi chữ được đưa về dạng slug: bỏ dấu, `đ` thành `d`, chữ thường, các từ nối bằng `-`. Văn bản của chuyện là `hook` cộng thân file (tiêu đề, bối cảnh, chuyện gì xảy ra, bài học, artefact, góc người ngoài). Chuyện khớp nhãn khi có ít nhất một điều:

1. một `slug` của nhãn là chuỗi con của phần slug trong id chuyện (bỏ ngày);
2. ít nhất `min` từ khoá xuất hiện trọn từ trong văn bản chuyện (`repo` không khớp `report`);
3. một dòng của chuyện (`lines`) nằm trong khoảng `dòng` của nhãn và có ít nhất một từ khoá xuất hiện.

Một nhãn có thể khớp nhiều chuyện (hạng của nhãn là hạng tốt nhất); một chuyện có thể khớp nhiều nhãn.

## Chỉ số

Danh sách xếp hạng là toàn bộ chuyện của hộp nháp sau lần chạy (cộng chuyện bị giữ), theo `sortRanked` của `lib/rank.mjs`, như `momentry list --rank`. N là số chuyện.

| Chỉ số | Định nghĩa |
|---|---|
| recall | số nhãn khớp ít nhất một chuyện / số nhãn |
| p@5, p@10 | trong min(k, N) chuyện đầu, tỉ lệ chuyện khớp ít nhất một nhãn. Chia cho min(k, N), không phải k, để danh sách ngắn không bị phạt |
| hạng-t | trung bình hạng tốt nhất của các nhãn `t` có khớp. Nhãn `t` không khớp không tính vào trung bình mà làm giảm `t-nửa-trên` |
| t-nửa-trên | số nhãn `t` có hạng ≤ ⌈N/2⌉, trên tổng nhãn `t` (DM.5 muốn bằng nhau) |
| USD, giây | báo cáo của pipeline lúc chụp: tổng `total_cost_usd`, thời gian thật; `giây-model` là tổng `duration_ms` của các lời gọi |
| lệch giữa hai lần chụp | lần n so với lần 1 của cùng phiên: chênh số chuyện, USD, recall, p@5, hạng-t; `nhãn trùng` = tỉ lệ nhãn có cùng trạng thái tìm thấy ở cả hai lần; `t-nửa-trên trùng` = như vậy cho "nhãn `t` ở nửa trên" |

Dòng tổng: trung bình các chỉ số chất lượng trên lần chụp đầu của mỗi phiên; USD và giây cộng mọi lần chụp.

### Chi phí từng bước

Đọc từ `llm/<key>.json`. Bước suy từ key của `--fake-llm` ([docs/development.md](../../docs/development.md#--fake-llm-dir)), hậu tố `-retry` tính vào bước của nó:

| Bước | Key |
|---|---|
| harvest | `harvest-c<k>-r<n>` |
| fill | `harvest-fill-c<k>-r<n>-f<m>` |
| cluster | `cluster-<a>` |
| outsider | `outsider-1`, `outsider-c<k>-1` |
| hook-tension | `hook-tension-1` |
| stakes | `stakes-1` |

Token vào = `input_tokens + cache_creation_input_tokens + cache_read_input_tokens`; token ra = `output_tokens`; USD = `total_cost_usd`; phần = USD của bước / tổng.
