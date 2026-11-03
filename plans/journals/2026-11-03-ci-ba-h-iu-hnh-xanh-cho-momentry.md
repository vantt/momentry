---
title: CI ba hệ điều hành xanh cho momentry
date: 2026-11-03
summary: "Push main, sửa lỗi riêng macOS/Windows tới khi CI 9/9 xanh"
---

# CI ba hệ điều hành xanh cho momentry

## What happened
Push lên main theo lựa chọn của user. CI lần đầu: Linux xanh; macOS đỏ 2 test (repo sau symlink /var → /private/var); Windows đỏ 38 test vì bộ test cũ giả định POSIX (đường dẫn chèn thô vào JSONL, quyền 0600, dấu `:`, import đường dẫn tuyệt đối, claude giả có shebang), cộng tên ngắn 8.3, runner chạy quyền Administrator và PowerShell 5.1 làm hỏng đối số JSON truyền cho lệnh ngoài.

Sự cố do tôi: một `git commit` đã kéo theo việc đổi tên README.md → README.vi.md mà phiên khác stage sẵn, làm main thiếu README.md và CI đỏ toàn bộ. User chọn commit README song ngữ đang có. Từ đó chỉ stage đúng file của mình và kiểm `git diff --cached` trước khi commit.

## Decision
- So khớp repo theo cả đường dẫn thật (`realpathSync.native`) và không phân biệt hoa thường trên Windows.
- Hook trên Windows dùng `"C:/…/momentry.cmd"` (Claude Code chạy hook qua Git Bash, Codex qua cmd, theo báo cáo cộng đồng); `/bip` gọi `momentry` theo tên.

## Next steps
Cắt v0.1.0 để release.yml chạy lần đầu; đo một phiên Claude Code/Codex thật trên Windows.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
