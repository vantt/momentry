---
phase: 1
title: "Nền tảng đa nền, phiên bản, mã thoát"
status: todo
priority: P1
effort: "1.5d"
dependencies: []
---

# Phase 1: Nền tảng đa nền, phiên bản, mã thoát

## Goal
Có một nguồn sự thật cho phiên bản, đường dẫn theo OS và mã thoát, và code chạy đúng trên Windows native, để mọi phase sau dựng lên trên đó.

## Key Insights
- `lib/config.mjs` cứng `~/.config/momentry`, `~/.cache/momentry`, bỏ qua XDG; trên Windows là sai chỗ (CFG-01).
- `MOMENTRY_REPOS` và `MOMENTRY_PRIVACY_SOURCES` tách bằng `:`, vỡ với `C:\…` trên Windows.
- `lib/llm.mjs` gọi `spawn('claude', …)` không qua shell: trên Windows `claude` có thể là `claude.cmd` (cài qua npm), Node ≥ 18.20/20.12 từ chối chạy `.cmd` không có `shell: true`.
- `lib/hook.mjs` tách tiến trình `detached: true`; trên Windows cần thêm `windowsHide: true` để không bật cửa sổ console.
- `lib/sources/claude.mjs` và `codex.mjs` cứng `~/.claude/projects`, `~/.codex/sessions`; nên tôn trọng `CLAUDE_CONFIG_DIR` và `CODEX_HOME`. Cách mã hoá tên thư mục dự án Claude trên Windows (`C:\x` → `C--x`) phải kiểm trên máy thật.
- `test/imports.test.mjs` duyệt toàn cây, vỡ khi có `.claude/`, `.agentkit/` chưa track.

## Files to Create / Modify
- Create: `lib/version.mjs` (hằng `VERSION`, hàm `fingerprint()` đọc commit sha + thời gian commit nếu chạy từ git checkout, ngược lại đọc file `BUILD` do script đóng gói ghi).
- Create: `lib/paths.mjs` (`paths(env, platform)` trả `{config, configFile, cache, data, bin, install}`; Linux XDG (chỉ nhận giá trị tuyệt đối), macOS giữ `~/.config`/`~/.cache` như Linux (user chọn 2026-11-03; lệch CFG-01 có chủ ý, không cần migrate), Windows `%APPDATA%\momentry`, `%LOCALAPPDATA%\momentry\cache`, `%LOCALAPPDATA%\momentry\bin`; `MOMENTRY_CONFIG`, `MOMENTRY_CACHE` vẫn thắng).
- Modify: `lib/config.mjs` (dùng `lib/paths.mjs`; `EXIT` mới; tách danh sách bằng `path.delimiter`).
- Modify: `bin/momentry.mjs` (dùng `EXIT` từ `lib/config.mjs`, bỏ bản sao thứ hai).
- Modify: `lib/llm.mjs` (Windows: phân giải `claude` qua PATHEXT; `.cmd` → `shell: true` với đối số đã quote an toàn, hoặc gọi thẳng `claude.exe` khi có).
- Modify: `lib/hook.mjs` (`windowsHide: true`).
- Modify: `lib/sources/claude.mjs`, `lib/sources/codex.mjs` (`CLAUDE_CONFIG_DIR`, `CODEX_HOME`).
- Modify: mọi file trong `lib/` và `test/` đang dùng mã thoát số trực tiếp.
- Modify: `test/imports.test.mjs` (chỉ quét `bin/`, `lib/`, `test/`, `scripts/`).
- Create: `test/paths.test.mjs`, `test/version.test.mjs`.

## Mã thoát mới
| Mã | Nghĩa | Trước |
|---|---|---|
| 0 | xong | 0 |
| 1 | có lỗi: `check` thấy lỗi khuôn/vi phạm, repo chưa được quan sát, cấu hình hỏng, lệnh thất bại | 2 (check), 1 (còn lại) |
| 2 | sai cú pháp: lệnh lạ, cờ lạ, thiếu đối số | 1 |
| 3 | bỏ qua kiểm riêng tư (không có nguồn chặn) | 3 |
| 4 | model lỗi | 4 |
| 5 | phiên đang bị khoá | 5 |
| 10 | `update --check` có bản mới | — |

## Tasks & Steps
- [x] Sửa `imports.test.mjs` trước để bộ test chạy sạch trong bản làm việc.
- [x] Viết `lib/version.mjs` với `VERSION = '0.1.0'` và `fingerprint()`; test.
- [x] Viết `lib/paths.mjs` thuần (nhận `env`, `platform`, `homedir` làm tham số để test được cả ba OS trên một máy); test cho Linux (XDG có/không, giá trị tương đối bị bỏ qua), macOS, Windows.
- [x] Chuyển `config.mjs` sang `paths.mjs`; giữ tên biến môi trường cũ.
- [x] Đổi `EXIT` theo bảng; tìm mọi chỗ dùng (`grep -rn "exitCode\|EXIT\." lib bin test`), sửa và cập nhật test. `check` vi phạm → 1; sai cú pháp → 2.
- [x] Tách danh sách theo `path.delimiter`; test có đường dẫn `C:\…` với `platform: 'win32'`.
- [x] Windows spawn cho `claude` và `windowsHide`; test bằng `spawn` giả.
- [x] `CLAUDE_CONFIG_DIR`, `CODEX_HOME` trong sources; test.

## Verification
- `node --test test/*.test.mjs` xanh trong bản làm việc có `.claude/`.
- `node -e "import('./lib/paths.mjs').then(m=>console.log(m.paths(process.env)))"` in đúng thư mục trên máy hiện tại.
- `node bin/momentry.mjs --bogus; echo $?` → 2. Một hộp có lỗi khuôn: `momentry check; echo $?` → 1.

## Risk
- Đổi mã thoát phá script người dùng (pre-commit `check --staged`). Giảm: ghi CHANGELOG mục "Breaking", README nêu rõ, phiên bản 0.x.
- `shell: true` trên Windows mở đường injection nếu quote sai. Giảm: chỉ dùng khi bin kết thúc `.cmd`/`.bat`, đối số là hằng và đường dẫn đã kiểm, có test với ký tự đặc biệt.

## Rollback
Mỗi bước là commit riêng; revert từng commit.
