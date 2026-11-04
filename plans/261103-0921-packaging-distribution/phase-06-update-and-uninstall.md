---
phase: 6
title: "Update và uninstall"
status: done
priority: P1
effort: "1d"
dependencies: [3, 4, 5]
---

# Phase 6: Update và uninstall

## Goal
`momentry update` một lệnh, có kiểm tra và quay lui; `momentry uninstall` gỡ đúng phần mình cài, giữ dữ liệu trừ khi `--purge` (UX-04, UPD-01..07, UNI-01..06).

## Key Insights
- Bố cục `versions/` + `current` (phase 5) làm cho update an toàn: giải nén cạnh bản cũ, thử, rồi đổi con trỏ. Quay lui là trỏ lại bản trước.
- Tarball là mã nguồn, không có binary đang chạy bị khoá trên Windows; chỉ cần đổi `current.txt`.
- Chỉ update khi có marker `.momentry-managed` (UPD-01); chạy từ git checkout thì in `git pull`.

## Files to Create / Modify
- Create: `lib/update.mjs` — `resolveTarget({latest|version})` (đọc redirect `releases/latest/download/`, không gọi API), `decide(current, target, {explicit})` thuần (`latest` không hạ cấp; `--version` được hạ cấp), `download` (HTTPS, timeout, giới hạn byte), kiểm `checksums.txt` khớp đúng tên, giải nén bằng `lib/tar.mjs` vào `versions/vNEW.tmp`, `node …/momentry.mjs --version` khớp, rename, đổi `current` atomic, rồi chạy `<new> doctor --after-update --json` (UPD-07); lỗi ở bất kỳ bước nào → trỏ lại bản cũ. Giữ bản trước, xoá bản cũ hơn nữa. Nguồn release: hằng `REPO = 'vantt/momentry'` + `MOMENTRY_RELEASE_BASE` cho test và mirror (UPD-03).
- Create: `lib/uninstall.mjs` — lập kế hoạch: gỡ mục hook và `/bip` (qua `lib/hosts.mjs`), shim, `versions/`, marker; giữ cấu hình, cache, hộp trong các repo, `.momentry.json`; `--purge` xoá thêm cấu hình và cache (đường dẫn từ `lib/paths.mjs`, từ chối nếu là `/`, `$HOME` hoặc chứa `..`). In đường dẫn dữ liệu được giữ **trước** khi xoá. Bước không đảo được (xoá thư mục cài) làm cuối, bỏ qua nếu bước trước lỗi.
- Modify: `bin/momentry.mjs` — `update [--check] [--version vX.Y.Z] [--force] [--yes] [--json]` (alias `upgrade`; `--check` có bản mới → thoát 10); `uninstall [--purge] [--dry-run] [--yes]` (alias `remove`); không TTY mà thiếu `--yes` → thoát 2 kèm cờ cần thêm.
- Modify: `install.sh`, `install.ps1` — `--uninstall` gọi `momentry uninstall` nếu còn chạy được, nếu không thì gỡ shim + thư mục có marker.
- Modify: `lib/checks.mjs` — `update.available` (cache 1 lần/ngày, `MOMENTRY_NO_UPDATE_CHECK=1` để tắt); `--after-update` (ẩn) chạy migration cấu hình (chỉ thêm khoá còn thiếu, sao lưu trước) và nâng mục hook dạng cũ.
- Create: `test/update.test.mjs` (máy chủ HTTP local phục vụ `dist/` của hai phiên bản giả), `test/uninstall.test.mjs`.

## Tasks & Steps
- [x] `decide()` thuần + test bảng.
- [x] Update đầu cuối với máy chủ local: lên bản mới, cùng bản (no-op), checksum sai (giữ bản cũ), bản mới hỏng `--version` (quay lui).
- [x] Uninstall: `--dry-run` in kế hoạch; thực thi; chạy lại → "không có gì để gỡ".
- [x] Chạy từ git checkout: `update` in hướng dẫn `git pull`, thoát 1.

## Verification
- HOME tạm: cài v0.1.0 từ fixture, `momentry update --check; echo $?` → 10, `momentry update --yes` → v0.1.1, `momentry doctor` thoát 0, cấu hình còn nguyên.
- `momentry uninstall --yes` → shim mất, hook gỡ khỏi `settings.json`, `~/.config/momentry` còn; `--purge --yes` xoá nốt.

## Risk
Uninstall xoá nhầm: đường dẫn chỉ lấy từ `lib/paths.mjs` và marker; test xác nhận thư mục ngoài danh sách không bị chạm.
