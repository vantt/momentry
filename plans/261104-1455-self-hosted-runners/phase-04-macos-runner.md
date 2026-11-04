---
phase: 4
title: "Runner macOS"
status: todo
priority: P2
effort: "2h"
dependencies: [2]
---

# Phase 4: Runner macOS

## Goal
Runner trên máy Mac của chủ repo chạy phần macOS của `ci` và `release` smoke. Đây là phần tốn phút nhất trên GitHub-hosted (×10).

## Cần từ user
- Một máy macOS (Apple Silicon hoặc Intel) có Git và Node ≥ 20. Nếu chưa có Mac, phase này để `Pending`; khi đó job macOS chỉ chạy được trên GitHub-hosted khi có hạn mức.

## Files
- Không sửa file repo (phase 2 đã có nhãn `macos`).

## Steps
- [ ] User cài runner theo trang New self-hosted runner (macOS) vào `~/actions-runner`, `./config.sh ... --name macos-<máy> --labels macos`.
- [ ] Chạy như LaunchAgent dưới tài khoản thường: `./svc.sh install && ./svc.sh start`.
- [ ] Chạy `ci` với input/tag kích ma trận đầy đủ; kiểm so sánh trước/sau HOME thật như phase 2.
- [ ] Chạy một release thử: tag `v0.2.1-rc.0`, xem draft → smoke 3 OS → publish chạy hết trên self-hosted; sau đó xoá release và tag thử (`gh release delete v0.2.1-rc.0 --cleanup-tag --yes`). Hỏi user trước khi tạo tag.

## Verification
- Job `test (macos, node 20/22/24)` và `smoke (macos)` xanh trên runner `macos-<máy>`.

## Rollback
`./svc.sh stop && ./svc.sh uninstall && ./config.sh remove --token <REMOVE_TOKEN>`.
