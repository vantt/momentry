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
