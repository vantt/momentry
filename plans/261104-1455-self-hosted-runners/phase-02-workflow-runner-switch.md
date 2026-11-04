---
phase: 2
title: "Workflow chọn runner và cô lập HOME"
status: todo
priority: P1
effort: "4h"
dependencies: [1]
---

# Phase 2: Workflow chọn runner và cô lập HOME

## Goal
Một biến repo `MOMENTRY_SELF_HOSTED` quyết định job chạy trên GitHub-hosted hay self-hosted. Trên self-hosted, mọi job dùng thư mục nhà tạm nên không đụng cấu hình thật của máy.

## Files
- Modify: `.github/workflows/ci.yml`, `.github/workflows/release.yml`, `.github/workflows/windows-hook-probe.yml`.
- Không sửa `website.yml`.

## Thiết kế
- Mỗi phần tử ma trận giữ `os` (nhãn GitHub-hosted) và thêm `label` (`linux`/`windows`/`macos`). `runs-on`:
  `${{ vars.MOMENTRY_SELF_HOSTED == 'true' && fromJSON(format('["self-hosted","{0}"]', matrix.label)) || matrix.os }}`.
  Job không có ma trận (`draft`, `publish`) dùng cùng biểu thức với nhãn `linux`.
- Bước đầu của mỗi job, chỉ khi `runner.environment == 'self-hosted'`: tạo `$RUNNER_TEMP/home` và ghi vào `$GITHUB_ENV` các biến `HOME`, `USERPROFILE`, `XDG_CONFIG_HOME`, `XDG_CACHE_HOME`, `XDG_DATA_HOME`, `LOCALAPPDATA`, `APPDATA`, `npm_config_prefix`, `MOMENTRY_NO_MODIFY_PATH=1`, và thêm `<npm prefix>` vào `$GITHUB_PATH`. Dùng chung một đoạn cho bash và một cho PowerShell; không tách action riêng khi chỉ có ba workflow dùng.
- `MOMENTRY_ALLOW_ROOT=1` chỉ đặt trên GitHub-hosted Windows (chạy Administrator); runner self-hosted chạy tài khoản thường nên không cần.
- `windows-hook-probe`: `npm install -g` vào prefix tạm; đường dẫn `.claude`/`.codex`/`.omp` đã đi theo `USERPROFILE` nên tự vào thư mục tạm.
- `actions/setup-node` và `oven-sh/setup-bun` giữ nguyên (chúng tải vào tool cache của runner, không đụng HOME thật).

## Steps
- [ ] Thêm `label` vào ma trận `ci.yml` (cả bản rút gọn và bản đầy đủ) và `release.yml` smoke; đổi `runs-on` theo biểu thức trên.
- [ ] Thêm bước cô lập HOME vào mọi job chạy code của repo hoặc cài momentry.
- [ ] Kiểm trên GitHub-hosted là không đổi hành vi: so `runs-on` trong log của một run khi biến chưa bật (khi hạn mức có lại hoặc qua `act` cho phần Linux).
- [ ] Bật `gh variable set MOMENTRY_SELF_HOSTED --body true`, chạy `ci` trên runner Linux; chụp danh sách và sha256 của `~ghrunner/.claude`, `.codex`, `.pi`, `.omp`, `.local/bin` trước và sau, phải giống nhau.

## Verification
- `gh workflow run ci.yml` với biến bật: các job Linux xanh trên runner `linux-<hostname>`.
- So sánh trước/sau ở trên không có khác biệt.
- `actionlint` (chạy bằng Docker `rhysd/actionlint`) không báo lỗi.

## Rollback
`gh variable delete MOMENTRY_SELF_HOSTED`; workflow trở về GitHub-hosted. Revert commit nếu biểu thức `runs-on` gây lỗi.
