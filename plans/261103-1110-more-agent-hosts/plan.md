---
title: "Thêm host pi, omp, Antigravity; tự tìm mọi profile"
description: "momentry đọc transcript, cài hook/extension và /bip cho pi, omp, Antigravity (agy), và cho mọi profile/tài khoản của các host."
status: in-progress
priority: P1
effort: 3d
branch: main
tags: [feature]
blockedBy: []
blocks: []
created: 2026-11-03
---

# Thêm host pi, omp, Antigravity; tự tìm mọi profile

## Overview

User thêm vào goal (2026-11-03): hỗ trợ `antigravity / pi / omp`. Thiết kế theo [báo cáo researcher](../reports/researcher-261103-1750-pi-omp-antigravity-hosts.md).

## Quyết định của user (2026-11-03)

- **agy gom khi mở phiên sau:** hook `SessionStart` ghi phiên vào chỉ mục và quét các phiên agy cũ của repo. Không dùng `Stop` (chạy mỗi lượt, chặn agent).
- **Tự tìm mọi profile:** cài và quét ở thư mục mặc định cùng mọi profile tìm thấy: `~/.codex-*`, `~/.pi/accounts/*`, `~/.omp/profiles/*/agent`, `~/.agy-homes/*/.gemini`; `doctor` báo profile chưa cài.

## Ràng buộc

- Không thêm phụ thuộc; không đọc SQLite/protobuf của agy (chỉ `transcript*.jsonl`).
- Session id của host mới lấy 8 hex cuối của uuid (uuidv7 trùng 8 hex đầu trong ~65 giây). Claude, Codex giữ nguyên để không gãy sổ.
- README.md / README.vi.md đang có thay đổi của phiên khác: không sửa trong plan này.

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Bộ đọc transcript pi/omp/agy](./phase-01-transcript-readers.md) | Done |
| 2 | [Hook runtime và tìm profile](./phase-02-hooks-and-profiles.md) | Done |
| 3 | [Cài extension, hooks.json, /bip](./phase-03-host-integration.md) | Done |
| 4 | [Test, tài liệu, CI](./phase-04-tests-docs-ci.md) | Done |

## Success Criteria

- [x] `momentry scan --pi|--omp|--agy` tìm và đọc được phiên của repo (fixture theo đúng schema; thử trên dữ liệu thật trong máy, chỉ đếm, không in nội dung).
- [x] `momentry init --yes` cài extension `momentry.ts` cho pi/omp, hook `SessionStart` cho agy, `/bip` cho cả ba, vào mọi profile tìm thấy; chạy lại không đổi gì; `uninstall` gỡ sạch.
- [x] Extension pi/omp gọi `momentry hook … --pi|--omp` với payload chuẩn; hook agy in `{}` và ghi chỉ mục.
- [x] Test, lifecycle installer, CI 9/9 xanh.

Bằng chứng: phát hành trong v0.2.0 (CHANGELOG, release.yml 14/14 xanh); hook chạy thật với pi, omp trên Linux và Windows, Antigravity trên Linux ([journal](../journals/2026-11-03-kim-hook-tht-cho-mi-host-v-pht-hnh-v020.md), `docs/installation.md` mục Windows).

## Còn mở

- [ ] Antigravity chạy thật trên Windows ([issue #2](https://github.com/vantt/momentry/issues/2)): người có máy Windows đã đăng nhập agy chạy `scripts/probe-agy-windows.ps1`, đạt khi `hook fired: True`. Xong thì đặt plan `completed`.
