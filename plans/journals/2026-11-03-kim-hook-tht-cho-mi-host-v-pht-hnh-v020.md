---
title: Kiểm hook thật cho mọi host và phát hành v0.2.0
date: 2026-11-03
summary: "Codex Windows (PowerShell), id Codex UUIDv7, agy với tài khoản thật; v0.2.0 công bố"
---

# Kiểm hook thật cho mọi host và phát hành v0.2.0

## What happened
Kiểm hook bằng chương trình thật cho cả năm host. Lộ ra ba lỗi, đã sửa:
- Codex chạy hook bằng shell của phiên; trên Windows đó là PowerShell, nơi lệnh bắt đầu bằng đường dẫn trong dấu nháy là một chuỗi. Codex nay được ghi đường dẫn shim không nháy.
- Id Codex là UUIDv7: hai phiên thật liên tiếp trùng 8 hex đầu. Đổi sang 8 hex cuối; sổ tự chuyển khoá cũ theo đường dẫn transcript.
- Profile agy chạy với HOME riêng nên hook tìm cấu hình, cache và đăng nhập claude sai chỗ. Hook ở profile agy mang `--user-home`. Phiên agy vừa mở không bị gom ngay nữa.

Đã chạy thật: Claude Code (Windows), Codex (Linux, Windows), pi, omp, Antigravity (Linux, tài khoản tetnu, user cho phép; đã gỡ hook khỏi profile sau khi thử). Issue #1 đóng.

## Decision
Phát hành v0.2.0 (user chọn). release.yml 14/14 xanh; cập nhật v0.1.0 → v0.2.0 qua GitHub chạy đúng.

## Next steps
Chưa chạy thật trên Windows: pi, omp, Antigravity.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
