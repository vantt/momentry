<!-- Mẫu lệnh /bip (PRD 6.4). Cùng một thân dùng cho Claude (.claude/commands/bip.md) và Codex (~/.codex/prompts/bip.md); cả hai thay $ARGUMENTS bằng chữ user gõ sau /bip. Chỗ điền: {bin} lệnh gọi công cụ bằng đường dẫn tuyệt đối, ví dụ "/usr/bin/node" "/…/bin/momentry.mjs" -->
---
description: Ghi lại khoảnh khắc vừa rồi vào hộp chuyện (momentry)
argument-hint: <ghi chú ngắn>
---
User vừa đánh dấu một khoảnh khắc đáng kể chuyện. Ghi chú của user: $ARGUMENTS

Việc của bạn:
1. Viết một ghi chú 2-4 câu về chuyện vừa xảy ra ngay trước lệnh này: chuyện gì, con số trước/sau nếu có, vì sao đáng kể. Có ghi chú của user thì giữ ý của user, chỉ bổ sung chi tiết.
2. Riêng tư: chỉ ghi cơ chế, con số, tên công cụ. Không ghi tên note, đường dẫn trong vault, câu hỏi thật, nội dung riêng, tên người.
3. Chạy đúng một lệnh shell, trong thư mục repo hiện tại:

   {bin} add --by human --title "<tiêu đề một dòng>" --note "<ghi chú>"

4. Báo lại cho user một dòng: id chuyện hoặc lỗi mà lệnh in ra. Không làm gì thêm, quay lại việc đang dở.
