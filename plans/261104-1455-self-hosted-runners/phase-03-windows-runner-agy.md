---
phase: 3
title: "Runner Windows và kiểm agy thật (issue #2)"
status: todo
priority: P1
effort: "3h"
dependencies: [2]
---

# Phase 3: Runner Windows và kiểm agy thật (issue #2)

## Goal
Runner trên máy Windows của chủ repo chạy phần Windows của `ci`, `release` smoke và `windows-hook-probe`; probe có thêm bước gọi `agy` thật để đóng issue #2.

## Cần từ user
- Một máy Windows 10/11 x64 có Git, Node ≥ 20 và PowerShell 5.1; `agy` đã đăng nhập dưới tài khoản Windows sẽ chạy runner.
- User tự chạy các lệnh cài runner trên máy đó (agent không vào được máy Windows). Token đăng ký do agent tạo bằng `gh api` và đưa cho user, hết hạn sau 1 giờ.

## Files
- Modify: `.github/workflows/windows-hook-probe.yml` (thêm job `agy-real`).
- Modify: `scripts/probe-agy-windows.ps1` chỉ nếu cần cho môi trường runner (ví dụ nhận đường dẫn momentry đã cài sẵn).

## Steps
- [ ] User cài runner theo lệnh trên trang Settings → Actions → Runners → New self-hosted runner (Windows x64) vào `C:\actions-runner`, `config.cmd ... --name windows-<máy> --labels windows,agy`, rồi chạy `run.cmd` dưới tài khoản đã đăng nhập `agy`. Không cài dạng service cho runner này: service chạy tài khoản khác, không thấy phiên `agy`.
- [ ] Thêm job `agy-real` chỉ chạy khi `workflow_dispatch` có input `agy: true`, `runs-on: [self-hosted, windows, agy]`. Job này **không** cô lập HOME (cần phiên `agy` thật), chạy `scripts/probe-agy-windows.ps1` từ checkout và fail nếu output không có `hook fired: True`. Script đã tự gỡ hook `agy` của momentry sau khi chạy.
- [ ] Chạy `ci` (phần Windows) và `windows-hook-probe` (cả bốn host giả lập và `agy-real`).
- [ ] Ghi kết quả vào `docs/installation.md` (bảng trạng thái đã kiểm), đóng issue #2 kèm link run.

## Verification
- Run `windows-hook-probe` với `agy: true` xanh, log có `hook fired: True` và `session recorded for this repo: True`.
- Trên máy Windows, `%USERPROFILE%\.claude`, `.codex`, `.omp` và `%LOCALAPPDATA%\momentry` không đổi sau các job cô lập.

## Rollback
User chạy `.\config.cmd remove --token <REMOVE_TOKEN>` trong `C:\actions-runner` rồi xoá thư mục. Gỡ nhãn `agy` khỏi workflow nếu runner không còn.
