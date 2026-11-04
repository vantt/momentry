---
phase: 5
title: "Tài liệu vận hành runner"
status: todo
priority: P2
effort: "1h"
dependencies: [2, 3]
---

# Phase 5: Tài liệu vận hành runner

## Goal
Người bảo trì biết cách đăng ký, chạy, gỡ runner và bật/tắt self-hosted mà không cần đọc plan.

## Files
- Modify: `docs/development.md` (mục mới "Self-hosted runners"), `docs/release-runbook.md` (một dòng: release dùng runner nào theo biến `MOMENTRY_SELF_HOSTED`).
- Modify: comment đầu `ci.yml` (dòng nói về chi phí macOS/Windows) cho đúng với cơ chế mới.

## Nội dung
- Bảng runner: tên, máy, nhãn, cách chạy (service hay `run.cmd`).
- Lệnh lấy token đăng ký/gỡ bằng `gh api`.
- Bật/tắt: `gh variable set MOMENTRY_SELF_HOSTED --body true` / `gh variable delete MOMENTRY_SELF_HOSTED`.
- Cô lập HOME: job nào cô lập, job `agy-real` thì không và vì sao.
- Lưu ý: repo phải private hoặc tắt chạy workflow cho PR từ fork; máy tắt thì job chờ tối đa 24 giờ.

## Verification
- Đọc lại tài liệu, chạy đúng từng lệnh trong đó trên máy Linux (lấy token, liệt kê runner, bật/tắt biến).
