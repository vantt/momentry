# Góc kể: bước 13 (2026-11-05)

**Mục đích:** tiêu đề chuyện chỉ gọi tên sự kiện; người đọc phải tự nghĩ ra chuyện đằng sau. Bước mới viết cho mỗi chuyện đầu bảng một góc kể (điều người ta tưởng → điều hoá ra → vì sao người nghe nên quan tâm), kèm ai muốn nghe và số dòng làm bằng chứng, hoặc nói thẳng là không có. Đo chi phí mỗi phiên và so `sonnet` với `haiku` để chọn mặc định.

**Dữ liệu thô** (góc kể, trích đoạn, hộp nháp, bản so sánh cạnh nhau) nằm trong `docs/_private/eval/angle-trial/`, không commit. Bản ghi này chỉ có số.

## Kết quả

| | `sonnet` | `haiku` (mặc định) |
|---|---|---|
| Chuyện xét (10 đầu bảng × 2 phiên) | 20 | 20 |
| Có góc kể / `none` / hỏng | 20 / 0 / 0 | 19 / 1 / 0 |
| Gọi lại vì đầu ra sai khuôn | 0 | 0 |
| USD mỗi phiên (10 lời gọi) | 0,210 | **0,017** |
| USD mỗi lời gọi | 0,0210 | 0,0017 |
| Token vào / ra mỗi lời gọi | 8 925 / 317 | 9 749 / 1 366 |
| Giây mỗi lời gọi | 3,6 | 7,6 |
| Độ dài góc kể trung bình (ký tự) | 344 | 328 |
| Góc kể quá 3 câu | 6/20 | 3/19 |
| Số dòng bằng chứng trung bình | 3,0 | 2,5 |

Mặc định `angle.model = haiku`. So với chi phí gom hiện tại của hai phiên này (0,108 và 0,374 USD, [giảm chi phí](../2026-11-05-cost-cuts/README.md)), `haiku` thêm khoảng 7%, `sonnet` khoảng 87%.

Đã tiêu 0,45 USD (mức trần 3 USD).

## 1. Thiết lập

- **Mã:** nhánh của agent trên `main` `0c14aef`. Claude Code 2.1.318; model `claude-sonnet-5-5`, `claude-haiku-5-5`; giá theo `total_cost_usd`.
- **Phiên:** `c4caee3c` (34 chuyện) và `ab9a1dd8` (27 chuyện), lần chụp 1 của bộ `new-defaults`. Các bước 1–11 chạy lại bằng `--fake-llm` (0 USD) vào repo nháp; bước góc kể gọi model thật bằng `momentry angle` trên hộp nháp đó: `sonnet` trước, rồi `haiku` với `--force` trên cùng 10 chuyện mỗi phiên.
- **Đầu vào mỗi lời gọi:** hook, tension, sides, stakes, thân chuyện, cộng các dòng transcript rút gọn quanh `lines` của chuyện (±2 Entry). Trích đoạn 1,6k–21k ký tự, trung bình ~8,4k; không chuyện nào phải thu hẹp cửa sổ.
- **Chấm chất lượng:** chỉ là đọc của agent trên 20 cặp, chưa có nhãn người. Trang duyệt có nút kiểm góc kể (kể được / không ra chuyện / bịa) để user chấm và đo lại khi đổi prompt.

## 2. Vì sao `haiku`

- Hai model cho cùng cấu trúc (tưởng → hoá ra → vì sao quan tâm) ở hầu hết chuyện, cùng nhận ra chỗ ngoặt chính của từng chuyện.
- `haiku` theo luật "1–3 câu" tốt hơn (quá 3 câu: 3 so với 6) và trả `none` ở một chuyện chỉ có kết quả, không ai tin sai điều gì; `sonnet` viết góc kể cho chuyện đó bằng một niềm tin chung chung không có trong trích đoạn.
- Mỗi model có một chỗ thêm chủ ngữ không có trong phiên (`haiku`: "nhóm"; `sonnet`: "người ta hay nghĩ"). Không model nào bịa con số; mọi số dòng bằng chứng nằm trong trích đoạn (bộ kiểm chặn số ngoài trích đoạn, không lần nào phải gọi lại).
- `sonnet` có vài câu gọn và sắc hơn, nhưng giữ thuật ngữ đo (`nDCG@5`, `Hit@5`) nhiều hơn.
- Chênh chất lượng nhỏ hơn chênh giá ~13 lần.

## 3. Một lời gọi mỗi chuyện, không gộp

Gộp 10 chuyện vào một lời gọi chỉ bỏ được phần prompt hệ thống lặp lại (~3,5k token mỗi lời gọi, khoảng 35% token vào). Với `haiku` là ~0,006 USD mỗi phiên. Đổi lại: một chuyện sai khuôn làm hỏng cả mẻ, các trích đoạn lẫn vào nhau, và prompt gộp (~60k token) tới gần ngưỡng 100k token mà `haiku` tính giá gấp 5. Không đáng.

## 4. Giới hạn

- Hai phiên, 20 chuyện, đều là chuyện đầu bảng (có giằng xé), nên tỉ lệ `none` ở đây thấp hơn mức chung.
- Chưa có nhãn người chấm; kết luận "ngang chất lượng" là đọc của agent.
- Giá ước tính của `dry-run` cho bước này: `angle.topN` × giá một lời gọi đo ở trên (lời gọi `haiku` ra nhiều token hơn vì có phần nghĩ).
