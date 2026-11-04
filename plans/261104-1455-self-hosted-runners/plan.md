---
title: "Self-hosted runner cho CI, release và kiểm hook Windows"
description: "Chạy các workflow của momentry trên máy riêng (Linux, Windows, macOS) thay cho runner GitHub-hosted đang bị chặn vì hết quota; cô lập HOME để job không đụng cấu hình thật của máy."
status: in-progress
priority: P1
effort: 1.5d
branch: main
tags: [ci, infra]
blockedBy: []
blocks: []
created: 2026-11-04
---

# Self-hosted runner cho CI, release và kiểm hook Windows

## Overview

Repo `vantt/momentry` là private trên gói Free. Hạn mức 2.000 phút Actions của tháng 11 đã hết ngày 2026-11-03 (macOS tính ×10, Windows ×2), nên mọi job GitHub-hosted bị chặn tới 2026-12-01. Plan này đăng ký runner trên máy riêng của chủ repo, một máy cho mỗi hệ điều hành, và cho workflow chọn giữa runner GitHub-hosted và self-hosted bằng một biến repo. Máy Windows chạy `agy` thật để đóng issue #2.

Một repo có thể có nhiều runner. Mỗi runner gắn nhãn (`self-hosted`, `linux`/`windows`/`macos`, `x64`/`arm64` do GitHub tự gắn), và `runs-on` chọn runner theo nhãn. Mỗi runner chạy một job một lúc, nên các job của ma trận chạy song song trên các máy khác nhau.

## Outcome

`ci.yml`, `release.yml` và `windows-hook-probe.yml` chạy xanh trên runner self-hosted của Linux, Windows và macOS khi bật biến `MOMENTRY_SELF_HOSTED`, không sửa hay xoá gì trong cấu hình thật của máy chạy runner. Issue #2 đóng với kết quả `hook fired: True` từ `agy` thật trên Windows.

## Ràng buộc

- **Không đụng dữ liệu thật của máy.** Workflow hiện ghi `~/.claude/settings.json`, `~/.codex/config.toml`, `~/.omp/agent/models.yml`, cài/gỡ momentry trong `%LOCALAPPDATA%`/`~/.local`, và `npm install -g`. Trên self-hosted, mỗi job phải dùng HOME/USERPROFILE/LOCALAPPDATA/APPDATA và npm prefix tạm dưới `$RUNNER_TEMP`. Riêng bước `agy` thật là ngoại lệ có chủ đích (cần phiên đăng nhập thật) và chỉ dùng `scripts/probe-agy-windows.ps1`, script này tự gỡ hook sau khi chạy.
- **Quay lại được bất cứ lúc nào.** Mặc định vẫn là runner GitHub-hosted; chỉ khi biến repo `MOMENTRY_SELF_HOSTED=true` thì job mới chạy trên máy riêng. Xoá biến là trở về như cũ.
- **Repo private.** Không chạy job của PR từ fork trên self-hosted. Nếu repo chuyển sang public, phải xem lại plan này trước.
- Runner chạy dưới một tài khoản người dùng thường, không phải root/Administrator. Trên Windows, runner chạy bằng `run.cmd` dưới tài khoản đã đăng nhập `agy` khi cần kiểm Antigravity.
- Không thêm phụ thuộc vào repo; không commit token đăng ký runner.

## Non-goals

- Không dựng runner tự co giãn (ARC, Kubernetes) hay runner trong cloud.
- Không thay `website.yml`: GitHub Pages deploy vẫn chạy trên GitHub-hosted Linux (job ngắn, ít phút).
- Không bỏ hẳn runner GitHub-hosted.

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Runner Linux và kiểm self-hosted có bị chặn không](./phase-01-linux-runner-gate.md) | Done |
| 2 | [Workflow chọn runner và cô lập HOME](./phase-02-workflow-runner-switch.md) | In progress (Linux xong) |
| 3 | [Runner Windows và kiểm agy thật (issue #2)](./phase-03-windows-runner-agy.md) | Pending |
| 4 | [Runner macOS](./phase-04-macos-runner.md) | Pending |
| 5 | [Tài liệu vận hành runner](./phase-05-docs.md) | Pending |

Phase 1 là cổng: nếu GitHub cũng chặn job self-hosted khi tài khoản hết quota, dừng plan và báo lại. Phase 3 và 4 cần máy Windows/macOS của chủ repo; chúng độc lập với nhau sau phase 2.

## Acceptance criteria

- [x] Phase 1 xác nhận bằng một lần chạy thật: job `runs-on: [self-hosted, linux]` chạy được hay bị chặn khi tài khoản đang hết quota.
- [ ] Với `MOMENTRY_SELF_HOSTED=true`, `ci` chạy đủ ma trận 3 OS × Node 20/22/24 trên runner self-hosted và xanh.
- [ ] Không có biến đó, workflow chạy trên runner GitHub-hosted y như trước (so `runs-on` trong log).
- [ ] Sau một lần chạy `ci`, `release` smoke và `windows-hook-probe` trên máy riêng: `~/.claude`, `~/.codex`, `~/.pi`, `~/.omp`, bản momentry đã cài và npm global của máy không đổi (so checksum/danh sách trước và sau).
- [ ] `windows-hook-probe` trên runner Windows có bước `agy` thật in `hook fired: True`; issue #2 đóng với link tới run.
- [ ] Một release thử (tag pre-release) đi hết draft → smoke 3 OS → publish trên self-hosted, rồi xoá release thử.
- [ ] `docs/development.md` có cách đăng ký, chạy, gỡ runner và bật/tắt biến.

## Rủi ro

- **GitHub chặn cả self-hosted khi hết quota/billing.** Phase 1 kiểm trước khi làm gì khác.
- **Job ghi đè cấu hình thật của máy.** Phase 2 cô lập HOME; tiêu chí ở trên kiểm bằng so sánh trước/sau.
- **Máy ngủ hoặc tắt thì job xếp hàng.** Job chờ tối đa 24 giờ rồi huỷ; ghi rõ trong tài liệu.
- **Runner thường chỉ đủ một job một lúc.** Ma trận 3 Node trên cùng một máy sẽ chạy tuần tự; chấp nhận được, hoặc đăng ký thêm runner thứ hai trên cùng máy.
