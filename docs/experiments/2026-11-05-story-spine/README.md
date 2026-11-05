# Xương chuyện: góc kể mở bằng bối cảnh (2026-11-05)

**Mục đích:** góc kể của [bước 13](../2026-11-05-angle/README.md) tốt hơn tiêu đề, nhưng người ngoài đọc vẫn không biết dự án là gì, người làm đang cố làm gì, và vì sao điều đó quan trọng. Ví dụ: "Bộ test tiếng Việt cho kết quả Hit@5 0,93 nên trông tìm kiếm đã tốt…" không nói đây là một app ghi chú chạy trên máy và phải tìm được chữ gõ không dấu. Nguyên nhân: lời gọi góc kể chỉ thấy file chuyện và vài dòng transcript quanh bằng chứng của nó.

**Dữ liệu thô** (góc kể cũ và mới, xương chuyện, hồ sơ dự án, hộp nháp) nằm trong `docs/_private/eval/angle-trial/spine/` (lần chạy cuối) và `spine-v1/` (lần đầu), không commit. Bản ghi này chỉ có số và cơ chế.

## Thay đổi

1. **Hồ sơ dự án** (`lib/project-profile.mjs`, `prompts/profile.md`): mỗi dự án một lần gọi `haiku` đọc README*, PRD/prd*, vision*, requirement(s)*, AGENTS.md, CLAUDE.md, GEMINI.md, ANTIGRAVITY.md ở gốc repo rồi `docs/` (mỗi loại file đầu tiên khớp, tối đa ~14k ký tự), viết 3–5 câu: dự án là gì, cho ai, ràng buộc chính, mục tiêu hiện tại nếu tài liệu nói. Lưu ở `<cache>/profiles/`, kèm hash của tài liệu và hash của chữ đã viết: viết lại chỉ khi tài liệu đổi và người dùng chưa sửa file. Không có tài liệu thì không có hồ sơ.
2. **Yêu cầu của chủ phiên** (`lib/asks.mjs`): lượt nói thật của người dùng (không phải kết quả tool, `/bip` hay dòng harness), bỏ câu kiểu "tiếp tục", "ok", "commit push". Mỗi chuyện nhận yêu cầu đầu phiên và tối đa 3 yêu cầu gần nhất trước dòng bằng chứng đầu tiên của chuyện (~2,4k ký tự), có `[Lnnn]` nên dẫn làm bằng chứng được.
3. **Xương chuyện** (`prompts/angle.md`): model điền bảy ô `context`, `want`, `obstacle`, `turn`, `action`, `outcome`, `takeaway`, mỗi ô một câu kèm số dòng hoặc để trống; `context` được dẫn `profile`. `completeness` = số ô đã điền. Góc kể giờ 2–4 câu và câu đầu phải là bối cảnh. Xương chuyện ghi vào frontmatter (`spine_<ô>`, `spine_<ô>_lines`, `completeness`); không đổi khoá xếp hạng.

## Kết quả

Hai phiên, 10 chuyện đầu bảng mỗi phiên, cùng 20 chuyện với [thử góc kể](../2026-11-05-angle/README.md); `haiku`, `momentry angle --force` trên hộp nháp.

| | Góc kể cũ (`haiku`) | Xương chuyện, lần đầu | Xương chuyện, lần cuối |
|---|---|---|---|
| Có góc kể / `none` / hỏng | 19 / 1 / 0 | 14 / 6 / 0 | **16 / 4 / 0** |
| Câu đầu nói dự án hay công cụ là gì | 4/19 | 14/14 | **16/16** |
| Gọi lại vì đầu ra sai khuôn | 0 | 0 | 0 |
| Độ dài góc kể trung bình (ký tự, câu) | 328, ~3 | 420, 3,6 | 462, 3,9 |
| Góc kể quá 4 câu | | 0 | 0 |
| `completeness` trung bình (0–7) | | 6,5 | 6,6 |
| Token vào / ra mỗi lời gọi | 9 749 / 1 366 | 11 535 / 3 681 | 11 775 / 3 849 |
| USD mỗi phiên (10 góc kể) | 0,017 | 0,030 | **0,031** |
| USD hồ sơ dự án (một lần mỗi dự án) | | 0,001 | 0,001 |

Lần cuối khác lần đầu ở hai chỉnh prompt: ô `turn` được phép dựa vào điều người làm đã giả định qua việc họ làm (không cần câu nào nói thẳng "tôi tưởng"), và hồ sơ không viết câu kiểu "tài liệu không nói mục tiêu". Lần đầu, `haiku` đòi một dòng nói thẳng niềm tin sai, nên trả `none` cho 6 chuyện.

Chi phí thử: 0,062 + 0,064 USD cho hai lần chạy, 0,003 USD viết lại hai hồ sơ với prompt cuối; tổng **0,13 USD** (trần 0,5 USD). Góc kể đắt gần gấp đôi vì đầu ra dài hơn (xương chuyện cộng phần nghĩ của `haiku`), không phải vì đầu vào: hồ sơ và yêu cầu chỉ thêm ~2k token vào.

## Trước và sau (tóm tắt cơ chế)

- **Benchmark tìm kiếm quá dễ.** Trước: mở bằng con số ("Hit@5 0,93 nên trông đã tốt"), người đọc phải tự đoán đây là gì. Sau: câu đầu nói đó là công cụ tìm ghi chú và người làm muốn gói tiếng Việt tìm tốt gấp đôi baseline; rồi mới tới chỗ ngoặt (tiêu đề ghi chú trùng câu tìm, bỏ dấu là điểm rơi còn 0,27). Ô `want` lấy từ yêu cầu của chủ phiên, không có trong trích đoạn cũ.
- **Installer đa nền tảng.** Trước: "Agent tưởng đã xong: 230 test xanh…". Sau: mở bằng "một công cụ dòng lệnh đọc transcript phiên làm việc với coding agent, đang làm bộ cài cho Windows", rồi cùng chỗ ngoặt (reviewer đọc code theo hành vi shell Windows thấy gỡ cài báo thành công mà không xoá gì).
- **Giới hạn của một host.** Trước: góc kể dựng một niềm tin chung ("dễ tưởng công cụ nào cũng có sự kiện kết thúc phiên") không có trong trích đoạn. Sau: `none`, lý do "giới hạn của host phát hiện khi thiết kế, không ai tin sai điều gì"; xương chuyện vẫn có 4 ô.
- **Hết chỗ đĩa khi chạy nhiều agent.** Lần đầu `none` (không dòng nào nói ai tưởng gì). Lần cuối có góc kể: việc đặt worktree vào thư mục tạm cho thấy giả định "đủ chỗ", và dòng lỗi hạn mức đĩa cho thấy điều khác.

## Nhận xét

- Góc kể giờ đọc được mà không cần biết dự án; ô `context` của 19/20 chuyện dẫn `profile`, nên hồ sơ dự án là nguồn chính của câu mở đầu.
- `completeness` ở 10 chuyện đầu bảng gần như luôn 7; chuyện `none` có 4–6 (ô `turn` trống). Xếp theo `completeness` có lẽ chỉ tách được chuyện có chỗ ngoặt khỏi chuyện không có; cần đo trên cả danh sách (bộ đo: `node scripts/eval/run.mjs --rank-by completeness`) trước khi bàn đổi khoá xếp hạng.
- Hồ sơ viết theo ngôn ngữ của tài liệu: một dự án README tiếng Anh cho hồ sơ tiếng Anh, góc kể (tiếng Việt) vẫn dịch đúng ý.

## Giới hạn

- Hai phiên, 20 chuyện đầu bảng; chưa có nhãn người. Trang duyệt có thêm câu "Đọc xong hiểu được, không cần hỏi thêm?" (có / không) cạnh nhãn kể được / không ra chuyện / bịa, và hiện góc kể cũ cạnh góc kể mới để chấm.
- `haiku` vẫn đôi khi gọi người làm là "nhóm" dù prompt dặn không đoán (2/16).
- Giá `sonnet` với xương chuyện chưa đo; ước tính `dry-run` cho `sonnet` cộng phần xương chuyện vào số đo cũ.
