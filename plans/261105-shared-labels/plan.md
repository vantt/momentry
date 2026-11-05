---
title: "Nhãn chia sẻ: người dùng tự chọn gửi Use/Later/Drop ẩn danh để cải thiện xếp hạng chung (E19)"
description: "Gửi nhãn ẩn danh về server momentry, chỉ khi người dùng đồng ý và biết rõ gửi gì. Backlog: chưa làm."
status: backlog
priority: P3
branch: main
tags: [privacy, quality, server]
blockedBy: []
blocks: []
created: 2026-11-05
---

# Nhãn chia sẻ (E19)

Tách từ U.7b của [ui-ux-followup](../261104-ui-ux-followup/plan.md) ngày 2026-11-05. Board: [board.md](../board.md).

**Quyết định 2026-11-05:** hiện chưa làm. Để nâng chất lượng chọn chuyện, momentry chỉ dùng dữ liệu của chính đội làm sản phẩm ([story-quality](../261104-story-quality/plan.md), E17). Plan này chỉ mở khi có nhiều người dùng và dữ liệu của đội không đủ.

## Mục tiêu

Học từ lựa chọn Use / Later / Drop của nhiều người dùng để xếp hạng mặc định tốt hơn cho mọi người, kể cả người mới cài.

## Điều kiện bắt buộc

1. **Xin quyền rõ ràng.** Mặc định tắt. Người dùng bật bằng một hành động riêng (màn hỏi trong UI hoặc `momentry config set`). Không bật ngầm qua update, cài đặt hay file trong repo (khoá chỉ nằm trong cấu hình người dùng, như `USER_ONLY`).
2. **Nói cụ thể lấy gì, trước khi xin quyền.** Màn hỏi liệt kê từng trường sẽ gửi, kèm một bản ghi mẫu thật lấy từ máy người dùng. Không gửi gì ngoài danh sách đó. Danh sách dự kiến (chốt khi làm):
   - lựa chọn: `use` / `later` / `drop`;
   - hạng của chuyện lúc quyết định;
   - đặc điểm chuyện đã có sẵn trong frontmatter: `signals`, `tension`, `stakes`, `strength`;
   - phiên bản momentry, host (claude, codex, …);
   - một mã máy ngẫu nhiên, đổi được, không gắn với tài khoản.

   **Không bao giờ gửi:** tiêu đề, nội dung chuyện, trích đoạn, tên repo, đường dẫn, tên file, tên người, email, code, transcript.
3. **Dự án ở chế độ kín không bao giờ gửi** (`cfg.privateMode`, cờ `private` đã có trong `metrics.json`).
4. **Xem và rút lại được.** Màn Privacy có nhật ký những gì đã gửi. Tắt là dừng ngay. Có nút xin xoá dữ liệu đã gửi theo mã máy.
5. **Sửa lời hứa sản phẩm.** Câu "No momentry server" trong UI, trang Privacy và website phải đổi cho đúng khi tính năng này có. Viết chính sách dữ liệu trước khi bật.

## Việc

| ID | Việc | Ai | Trạng thái |
|---|---|---|---|
| L.1 | Chốt danh sách trường gửi và câu chữ màn xin quyền (tiếng Anh), kèm bản ghi mẫu | Anh duyệt; agent soạn | ⬜ |
| L.2 | Chính sách dữ liệu: lưu ở đâu, bao lâu, ai đọc, xoá thế nào | Anh | ⬜ |
| L.3 | Server nhận nhãn: nơi chạy, chi phí, chống spam, không log IP lâu dài | Agent; anh chọn nơi chạy | ⬜ |
| L.4 | Client: khoá đồng ý (user-only), hàng đợi gửi, bỏ dự án kín, nhật ký đã gửi trong Privacy, nút tắt và xin xoá | Agent | ⬜ |
| L.5 | Dùng dữ liệu chung để chỉnh xếp hạng mặc định, đo bằng harness của E17 | Agent | ⬜ |
| L.6 | Sửa câu "no momentry server" ở UI, Privacy, website | Agent | ⬜ |

## Rủi ro

- Người mua quan tâm quyền riêng tư e ngại khi sản phẩm có server, dù tự chọn và ẩn danh.
- `signals` là chữ tự do do model viết, có thể lọt tên riêng. Trước khi gửi phải chạy bộ chặn tên riêng tư, hoặc chỉ gửi nhãn thuộc danh sách cố định.
