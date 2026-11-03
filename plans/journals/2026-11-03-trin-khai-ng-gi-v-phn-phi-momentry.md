---
title: Triển khai đóng gói và phân phối momentry
date: 2026-11-03
summary: "Cook plan packaging: installer, doctor/init, tự cài hook, update/uninstall, CI; 16 phát hiện review đã sửa"
---

# Triển khai đóng gói và phân phối momentry

## What happened
Thực thi plan plans/261103-0921-packaging-distribution bằng /ak-cook --auto. Thêm bảng lệnh duy nhất (lib/commands.mjs) sinh parser, help và docs/cli-reference.md; doctor engine dùng chung cho init/doctor/status; init tự cài hook và /bip cho Claude Code/Codex có sao lưu và gỡ ngược; bố cục cài versions/ + current + shim; update có checksum và quay lui; uninstall giữ dữ liệu; install.sh, install.ps1; CI ba OS và release draft → smoke → publish. Mã thoát đổi sang 0/1/2 (breaking, ghi CHANGELOG).

Thử agent-native bằng agent thật: tới doctor ok nhưng lệnh sửa nguồn chặn là câu văn, không chạy được. Thêm `momentry config privacy-add`, vòng agent hội tụ ngay vòng đầu.

Review độc lập tìm 4 lỗi nặng: install.ps1 hỏng do quoting `node -p` trên PowerShell 5.1; xoá trễ trên Windows không chạy vì Node escape `\"`; uninstall Windows sẽ xoá cache vì cache nằm trong thư mục cài; cài với --home/--install-dir thì CLI không thấy. Đã sửa hết cùng 12 lỗi vừa và nhẹ.

## Decision
- Thư mục cài Windows tách `%LOCALAPPDATA%\momentry\{app,bin,cache}`.
- Bằng chứng sở hữu để xoá là marker `.momentry-managed`, không phải tên thư mục.
- Thư mục shim ghi vào marker; thư mục cài suy từ nơi code chạy.

## Next steps
Push để CI chạy lần đầu (Windows chưa được chạy thật), kiểm shell chạy hook trên Windows, cắt v0.1.0. 232 test, lifecycle installer và vòng agent qua trên Linux.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
