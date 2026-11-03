---
title: Audit đóng gói momentry và lập plan phân phối
date: 2026-11-03
summary: "Audit theo cs-packaging-distribution, chốt 4 quyết định, lập plan 8 phase"
---

# Audit đóng gói momentry và lập plan phân phối

## What happened
Audit cách đóng gói, phân phối, cài đặt momentry theo skill cs-packaging-distribution. Lõi CLI chắc (không phụ thuộc ngoài, stdout sạch, cache 0700, cấu hình hỏng là lỗi), nhưng không có phiên bản, release, installer, doctor, update, uninstall; quick start dùng `<momentry>` chưa định nghĩa.

Phát hiện đáng nhớ: cấu hình hook và mẫu `/bip` in ra ghi cứng đường dẫn Node tuyệt đối (`process.execPath`), nên nâng Node qua nvm/fnm làm hook chết im lặng vì `hook` luôn thoát 0. `test/imports.test.mjs` quét cả thư mục chưa track (`.claude/`, `.agentkit/`) nên hỏng 1 test trong bản làm việc, bản clone sạch vẫn 205/205.

## Decision
- `init` tự cài hook Claude/Codex và `/bip` (đảo PRD 3.2/6.4/12), có sao lưu, `--dry-run`, gỡ ngược.
- Mã thoát theo CMD-08: 1 lỗi, 2 sai cú pháp; giữ 3/4/5.
- Hỗ trợ Linux, macOS, Windows native, WSL.
- Tarball mã nguồn + shim `momentry` (`momentry.cmd` trên Windows), vẫn không npm.
- PATH: Unix chỉ in `export`; Windows tự thêm HKCU. macOS giữ `~/.config`.

## Next steps
Thực thi `plans/261103-0921-packaging-distribution/plan.md` bằng `/ak-cook`. Còn mở: shell mà Claude Code/Codex dùng chạy hook trên Windows native (spike phase 4).

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
