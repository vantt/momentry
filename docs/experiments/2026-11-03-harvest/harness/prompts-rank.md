# Prompt cho các bước sau harvest (đợt 2–5)

Các prompt này được chạy bằng lệnh tay trong thí nghiệm, chưa nằm trong `prompts.mjs`. Ghi lại nguyên văn để triển khai dùng. `{...}` là chỗ điền dữ liệu.

Tất cả gọi bằng:

```bash
STORY_HARVEST=1 claude -p --model <model> --setting-sources "" --tools "" --strict-mcp-config --no-session-persistence --output-format json < prompt.txt
```

Kết quả nằm ở trường `result` của JSON đầu ra. Cắt từ `{` đầu tiên tới `}` cuối cùng rồi parse.

## 1. Gộp cụm (Sonnet, đợt 3)

Đầu vào: mọi chuyện của N lần harvest. Mỗi chuyện có id dạng `<run>:S<k>`.

```text
Dưới đây là {N} chuyện do {R} lần chạy độc lập nhặt từ CÙNG một phiên làm việc. Nhiều chuyện trùng nhau giữa các lần chạy.
Gộp các chuyện nói về CÙNG một sự kiện cốt lõi thành một cụm. Hai sự kiện khác nhau (dù cùng chủ đề) thì để hai cụm. Mọi id phải nằm trong đúng một cụm.
Với mỗi cụm: title (tiêu đề tốt nhất, tiếng Việt, một dòng), summary (2-3 câu gộp các chi tiết tốt nhất, có con số), signals (gộp), members (danh sách id).
Riêng tư: không ghi tên note, đường dẫn trong vault, câu hỏi thật, tên người; nếu chuyện gốc có thì bỏ đi.

{id} | {title} | {what_happened, ≤350 ký tự} | lines {lines}
...

Chỉ trả JSON: {"clusters":[{"title":"","summary":"","signals":[],"members":[]}]}
```

Kiểm bằng script: mọi id đầu vào phải nằm trong đúng một cụm (thí nghiệm đạt 142/142). Số lần bắt của một cụm = số run khác nhau trong `members`.

## 2. Hook và tension (Sonnet hoặc Haiku, đợt 4)

Đầu vào: các cụm, **trộn thứ tự**, ẩn số lần bắt. Id dạng `M<k>`.

```text
Bạn là biên tập viên build-in-public. Người đọc: dev làm một mình, dùng AI hằng ngày, không rành lĩnh vực của các chuyện dưới đây.
Một câu hook tốt có SỰ GIẰNG XÉ (irony): hai vế đối nhau trong cùng một câu, khiến người đọc thấy chỗ hở giữa điều họ tưởng và điều đã xảy ra. Các dạng thường gặp:
- nho_ma_to: nguyên nhân bé tí, hậu quả lớn
- giup_ma_hai: làm để tốt hơn, kết quả tệ hơn
- tuong_ma_hoa_ra: ai cũng nghĩ X, thật ra là Y
- hop_ma_tan: gộp nhiều thứ tốt, ra kết quả tệ
- cam_ma_van_lot: đã chặn, vẫn lọt qua chỗ không ai canh
- it_ma_nhieu: bỏ ra rất ít, thu về rất nhiều
- khac: giằng xé dạng khác
- none: không có giằng xé thật, chỉ là sự kiện, mẹo, hay việc vặt

Với TỪNG chuyện: viết hook (một câu tiếng Việt, dưới 15 chữ, có con số hoặc chi tiết cụ thể nếu có, không thuật ngữ người ngoài không hiểu), chọn tension, ghi side_a và side_b (hai vế đối nhau, rỗng nếu none), và strength 0-3 (0 = không có giằng xé; 3 = người đọc không thể không đọc tiếp). Đừng ép giằng xé khi không có: none là câu trả lời hợp lệ và thường gặp.

{id}. {title}
   {summary}
...

Chỉ trả JSON: {"hooks":[{"id":"M1","hook":"","tension":"","side_a":"","side_b":"","strength":0}]}
```

## 3. Stakes, tự suy việc chính (Sonnet, đợt 5, biến thể `si`)

```text
Dưới đây là {N} chuyện nhặt được từ CÙNG một phiên làm việc dài giữa user và coding agent.
Trước hết, từ toàn bộ danh sách, suy ra việc chính (mạch chính) của phiên: user đang cố đạt kết quả gì. Viết vào main_goal (1-2 câu).
Rồi chấm stakes 0-3 cho TỪNG chuyện: chuyện này có làm đổi kết quả của việc chính không?
- 0: sự cố bên lề (công cụ, môi trường, quy trình) không ảnh hưởng kết quả việc chính
- 1: có liên quan nhưng chỉ làm chậm hay phiền, kết quả việc chính không đổi
- 2: làm đổi một phần kết quả hoặc cách làm việc chính
- 3: là bước ngoặt của việc chính: đổi kết quả, đổi hướng, hoặc là kết quả chính
Chấm stakes độc lập với việc chuyện có hay, có lạ hay không.

{id}. {title}
   {summary}
...

Chỉ trả JSON: {"main_goal":"","stakes":[{"id":"M1","stakes":0,"reason":"ngắn"}]}
```

Biến thể `sg` thay đoạn "suy ra việc chính" bằng câu giao việc đầu phiên trong thẻ `<goal>`. `sg` kém hơn `si`.

## 4. Người ngoài, lần gọi riêng (Sonnet, đợt 2)

Đầu vào: transcript rút gọn (đặt đầu prompt như trong `prompts.mjs`) cộng danh sách chuyện đã nhặt.

```text
Một lượt trước đã nhặt các chuyện sau từ phiên này:
<picked>
S1. {title}
...
</picked>

Nhiệm vụ của bạn chỉ là bước người ngoài. Người đọc: dev làm một mình, dùng AI hằng ngày, không rành lĩnh vực của phiên này.
Tìm những việc user hoặc agent làm trơn tru, coi là hiển nhiên, không ai trong phiên ngạc nhiên, nhưng người đọc kia sẽ hỏi lại "làm sao vậy?" hoặc "tôi cũng muốn có cái đó". Bỏ qua những việc mà dev bình thường đã làm (chạy test, commit, đọc log...). Với mỗi việc, so với cách làm phổ biến thật sự ngoài đời, không so với chuẩn chuyên gia.
Liệt kê 3-8 việc. Mỗi việc: what, common_practice, gap (khác ở đâu, vì sao người đọc muốn biết), lines, already_picked (S-id nếu trùng chuyện đã nhặt, không thì null).
Riêng tư: không ghi tên note, đường dẫn trong vault, câu hỏi thật, tên người.
Chỉ trả JSON: {"outsider":[{"what":"","common_practice":"","gap":"","lines":[],"already_picked":null}]}
```
