---
phase: 5
title: "Đóng gói release và installer"
status: done
priority: P1
effort: "1.5d"
dependencies: [1]
---

# Phase 5: Đóng gói release và installer

## Goal
Một script đóng gói dùng chung cho máy local, CI và release; `install.sh` và `install.ps1` cài trong vài giây, kiểm checksum, đặt shim lên PATH và in bước tiếp `momentry init` (REL-02/05/06/08, INS-01..17, SEC-01/04/05).

## Key Insights
- Không có bước build: tarball chỉ là `bin/ lib/ prompts/ LICENSE README.md BUILD`. Một asset dùng cho mọi nền.
- Điểm xuất phát: `~/.claude/skills/cs-packaging-distribution/templates/install.sh` (đã test) và forgent `scripts/package-release-assets.mjs`, skillstation `scripts/install.ps1` (INS-17).
- Node là phụ thuộc: installer kiểm `node --version` ≥ 20 trước khi cài, báo cách cài nếu thiếu (UX-07).

## Bố cục cài đặt
```text
Linux/macOS/WSL                                  Windows
~/.local/share/momentry/                         %LOCALAPPDATA%\momentry\
  versions/vX.Y.Z/{bin,lib,prompts,BUILD}          versions\vX.Y.Z\…
  current -> versions/vX.Y.Z                       current.txt  (Windows: không dùng symlink)
  .momentry-managed  (chứa phiên bản)              .momentry-managed
~/.local/bin/momentry      (sh shim)             %LOCALAPPDATA%\momentry\bin\momentry.cmd
                                                 %LOCALAPPDATA%\momentry\bin\momentry   (sh shim cho Git Bash)
```
Shim sh: `exec node "$HOME/.local/share/momentry/current/bin/momentry.mjs" "$@"` (đường dẫn ghi tuyệt đối lúc cài). Shim cmd: đọc `current.txt`, `node "%~dp0..\versions\%V%\bin\momentry.mjs" %*`. Tìm `node` trên PATH lúc chạy, không ghi cứng: nâng Node không làm hỏng.

## Files to Create / Modify
- Create: `scripts/package-release.mjs` — đọc `VERSION` từ `lib/version.mjs`; tạo `dist/momentry-vX.Y.Z.tar.gz` xác định (mtime = thời điểm commit, sắp tên, uid/gid 0) bằng bộ ghi ustar tự viết; đóng dấu phiên bản vào `dist/install.sh`, `dist/install.ps1` (`@VERSION@`); ghi `dist/checksums.txt` (sắp xếp, gồm cả installer); `--dry-run` in danh sách.
- Create: `lib/tar.mjs` — đọc/ghi ustar + gzip qua `node:zlib`. Khi đọc: từ chối đường dẫn tuyệt đối, `..`, ký tự ổ đĩa, symlink, hardlink, thiết bị; chỉ nhận các thư mục gốc trong allow-list (SEC-05, INS-16). Dùng chung cho `package-release.mjs` và `update`.
- Create: `install.sh` — từ template của skill: POSIX `sh`, `set -eu`, `main "$@"` cuối file; cờ + env `MOMENTRY_VERSION`, `_INSTALL_DIR`, `_RELEASE_BASE`, `_DRY_RUN`, `_NO_MODIFY_PATH`, `_YES`; tải qua `releases/latest/download/` (không API); kiểm SHA-256 (`sha256sum` → `shasum -a 256` → `openssl`) khớp đúng tên file; HTTPS, timeout; giải nén vào thư mục tạm, kiểm layout, `node …/momentry.mjs --version` khớp, rồi đổi `current`; marker; giữ bản trước để quay lui; từ chối root trừ khi `MOMENTRY_ALLOW_ROOT=1`; PATH policy (A, user chọn): không sửa rc file, chỉ in đúng một dòng `export` khi `~/.local/bin` chưa có trong PATH; cuối cùng in "Tiếp: <abs>/momentry init". `--local-fixture DIR` cho test offline (INS-14).
- Create: `install.ps1` — PowerShell 5.1+: TLS 1.2, `Get-FileHash`, giải nén bằng `%SystemRoot%\System32\tar.exe`, cùng kiểm tra; ghi `momentry.cmd` + shim sh; PATH (user chọn 2026-11-03): tự thêm vào `HKCU\Environment`, giữ `REG_EXPAND_SZ`, broadcast `WM_SETTINGCHANGE`; `-NoModifyPath` thì chỉ in lệnh; uninstall gỡ mục PATH đã thêm.
- Create: `test/tar.test.mjs`, `test/package-release.test.mjs`.
- Modify: `.gitignore` (`/dist/`).

## Tasks & Steps
- [x] `lib/tar.mjs` + test (vòng ghi → đọc; các mục độc hại bị từ chối).
- [x] `scripts/package-release.mjs`; chạy hai lần ra cùng sha256 (REL-09).
- [x] `install.sh` từ template; `sh -n`, `shellcheck` nếu có; `install.sh --help` thoát 0.
- [x] `install.ps1`.
- [x] Thử tay: `MOMENTRY_RELEASE_BASE=file://…/dist sh install.sh` hoặc `--local-fixture dist` trong HOME tạm; `momentry --version` trong shell mới.

## Verification
- `node scripts/package-release.mjs && sha256sum -c dist/checksums.txt` (trong `dist/`).
- `HOME=$(mktemp -d) sh install.sh --local-fixture dist --yes` → in "Tiếp: …/momentry init"; `~/.local/bin/momentry --version` = `VERSION`.
- Chạy lại cùng phiên bản → "đã cài vX.Y.Z", không đổi gì.
- Sửa một byte trong tarball → installer dừng, không đụng bản cài cũ.

## Risk
- Windows không có Node trên PATH của tiến trình hook: doctor `install.path` + `node.version` báo.
- Thiếu `tar.exe` trên Windows cũ (trước 1803): installer báo không hỗ trợ.
