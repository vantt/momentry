# momentry: sưu tầm pain point và selling point

File gom câu chữ, nỗi đau, lý do mua, dùng khi viết landing page, pricing, bài đăng. Mỗi mục ghi ngày và ngữ cảnh. Bản dựa trên nguồn đã kiểm nằm ở [product-marketing.md](product-marketing.md).

## Câu chữ đắt

- **"Anh không thiếu ý tưởng, anh quên mất mình đã làm gì."** (2026-11-04)
  Ngữ cảnh: mở sang content creator, không chỉ dev. Đối lập với công cụ AI sinh ý tưởng từ khoảng trống: momentry đào chất liệu thật từ công việc thật.

- **"You could write the script. This is the rest of it."** (2026-11-04)
  Ngữ cảnh: trả lời "sao phải trả tiền cho một script" (landing v2, mục Why pay). Gửi một transcript cho Claude mất một buổi chiều; chạy sau mọi phiên, trên năm agent, không lộ tên, không làm hỏng cấu hình mới là phần tốn công.

- **"Pay once. Run it on your own Claude account."** (2026-11-04)
  Ngữ cảnh: heading mục Pricing. Dev A1 đã trả Anthropic khoảng 1 USD mỗi phiên qua `claude` của chính họ, nên thuê bao nghe như trả hai lần (audiences.md).

- **"Get last week back."** (2026-11-04)
  Ngữ cảnh: heading CTA cuối landing v2. Ngắn, nối thẳng vào câu dẫn "quên mất mình đã làm gì".

## Ứng viên headline (2026-11-04)

Góc nhìn: ai cũng muốn xây kênh mạng xã hội, ai cũng ngại viết. Thứ thiếu là chuyện để kể, không phải câu chữ. momentry không viết bài, nên headline không được hứa "viết hộ".

So sánh hai câu đã có:
- "Your agent sessions are full of stories. momentry writes them down." (v1): nói rõ chuyện đến từ đâu và sản phẩm làm gì, giọng tích cực. Cần đổi "agent sessions" thành "AI sessions" cho bản chung.
- "You're not short of ideas. You forgot what you did." (v2): đánh trúng nỗi đau nhưng trách người đọc ("anh quên"), không nói sản phẩm làm gì. Hợp làm câu phụ hoặc câu trong phần Pain hơn là headline.

Ứng viên:
1. **You did the work. momentry finds the story.** (em chọn: ngắn, khen người đọc, nói đúng việc máy làm)
2. Your AI sessions are full of stories. momentry writes them down. (v1, bản chung)
3. Your next post is already in your chat history.
4. Every session with your AI hides a story worth posting.
5. Post about the work you actually did.
6. Build in public without keeping a diary.
7. Nothing to post? You did plenty this week.
8. The hard part of posting isn't writing. It's remembering what happened.
9. Show your work. momentry keeps the receipts.
10. Real stories for your feed, dug out of your real work.

Subhead đi với số 1: "Every session with your AI agent hides a post: a number that moved, a fix nobody expected, a call you reversed. momentry reads your sessions and hands you a ranked list of stories worth telling. You just tell them."

### Nhánh "kho báu bị giấu" (2026-11-04)

Ý: trong lúc làm, mình đi ngang qua những chuyện đáng kể mà không nhận ra. Chúng nằm lại trong phiên chat. momentry giúp nhận ra chúng.

11. **The best stories are buried in your work. momentry digs them up.** (em chọn: hình ảnh đào lên khớp với chữ "mined", nói rõ việc máy làm)
12. You walked past your best story this week. momentry didn't.
13. Your best post is hiding in work you already finished.
14. Somewhere in today's session is a story you didn't notice.
15. The story was there. You were too busy working to see it.
16. Every session leaves something worth telling behind. momentry picks it up.
17. Hidden in your work: the stories people actually want to read.
18. You don't need new ideas. You need to see the ones you already had.
19. The good stories happen mid-task. That's why nobody notices them.
20. Treasure in plain sight: the moments you were too close to see.

Dùng làm tiêu đề phần Pain (giải thích vì sao bị giấu): 15, 19 hoặc 20. Câu 20 nối với điểm "chuyện mình thấy bình thường" trong PRD (curse of knowledge).

## Pain point

- **Thứ đáng kể thì thấy bình thường vì mình ở trong đó.** (2026-11-04)
  Ngữ cảnh: mục Pain landing v2. Curse of knowledge (PRD §5.2 bước 3); bước "outsider" của momentry làm đúng việc nhìn bằng mắt người ngoài.

- **Báo cáo tuần viết từ `git log`: thấy cái gì đổi, không thấy vì sao nó hay.** (2026-11-04)
  Ngữ cảnh: mục Pain. Nguyên nhân gốc, quyết định đảo ngược, con số nằm trong chat với agent, không nằm trong commit.

- **Sợ cài hook của phần mềm đóng nguồn vào cấu hình agent.** (2026-11-04)
  Ngữ cảnh: phản đối mới khi chuyển sang bán, đóng nguồn. Trả lời bằng thứ người mua tự kiểm được: `hooks --print`, sao lưu trước khi sửa, chỉ chạm mục của momentry, `uninstall --dry-run`.

- **"Tôi đã trả Anthropic rồi."** (2026-11-04)
  Ngữ cảnh: phản đối về giá. Trả lời: tiền model đi thẳng tới Anthropic qua tài khoản họ đang có, đúng giá Anthropic; 29 USD là trả cho công cụ, một lần, không thuê bao, không ăn chênh token.

## Selling point

- **Không có server momentry: transcript không bao giờ tới tay mình.** (2026-11-04)
  Ngữ cảnh: v0.2.0 chỉ có `lib/update.mjs` gọi mạng (grep 2026-11-04). Transcript đi từ máy người dùng tới Anthropic qua `claude -p` của họ. Phải kiểm lại khi thêm kiểm license key.

- **Xếp hạng được kiểm với nhãn người chấm: 7/8 chuyện người đánh dấu đáng kể nằm nửa trên của 38.** (2026-11-04)
  Ngữ cảnh: bản ghi chạy thật docs/experiments/2026-11-04-dm-real-run. Số thật, nhỏ, không tô: tốt hơn "AI-powered ranking".

- **Mỗi host có tật riêng, momentry lo hết.** (2026-11-04)
  Ngữ cảnh: Codex lặng lẽ bỏ qua khoá sự kiện sai kiểu chữ; trên Windows Claude Code chạy hook bằng Git Bash, Codex bằng PowerShell, Antigravity bằng `cmd`. Đây là bằng chứng cụ thể nhất cho "phần đánh bóng" đáng tiền.

- **Lưới riêng tư hiểu cách gõ tiếng Việt (không dấu, Telex).** (2026-11-04)
  Ngữ cảnh: tên riêng từng rò qua dạng Telex trong test fixture (mẫu `lo-rieng-tu-trong-commit`). Công cụ khác không có lý do làm việc này.
