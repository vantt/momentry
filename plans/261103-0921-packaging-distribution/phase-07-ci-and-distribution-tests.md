---
phase: 7
title: "CI và test phân phối"
status: todo
priority: P2
effort: "1.5d"
dependencies: [5, 6]
---

# Phase 7: CI và test phân phối

## Goal
CI chứng minh trên ba OS rằng gói cài được, init được, update được, gỡ được; release chỉ công bố khi các bước đó qua (REL-03/04/06/07/10, VER-02, TST-01..05).

## Files to Create / Modify
- Create: `.github/workflows/ci.yml` — mọi PR/push: ma trận `ubuntu-latest`, `macos-latest`, `windows-latest` × Node 20, 22, 24, `fail-fast: false`; `node --test test/*.test.mjs`; `node scripts/package-release.mjs`; vòng đời installer offline (`scripts/test-installer.sh` trên Linux/macOS, `scripts/test-installer.ps1` trên Windows).
- Create: `.github/workflows/release.yml` — trên tag `v*`: gọi lại `ci.yml` (reusable), kiểm tag == `VERSION` (VER-02), đóng gói, `checksums.txt` ở job cuối `needs:` mọi job, tạo **draft** release, smoke test từ draft trên ba OS qua `MOMENTRY_RELEASE_BASE`, rồi mới publish (REL-07). `permissions: {}` + quyền theo job; action ghim theo SHA (REL-10).
- Create: `scripts/test-installer.sh`, `scripts/test-installer.ps1` — HOME tạm: cài từ fixture → `momentry --version` trong shell login mới → `momentry init --yes` (với `privacy.sources` giả, `claude` giả từ `test/fixtures/fake-claude`) → `doctor --json` ok → cài lại cùng bản (no-op) → update lên bản fixture thứ hai → checksum sai bị từ chối → `uninstall --yes` → lệnh không còn.
- Create: `scripts/test-agent-native.sh` — vòng CMD-18 không tương tác: `init --yes --json`, lặp `doctor --json` và chạy mọi `fix` tối đa 3 vòng, kết thúc ok (TST-04).
- Create: `scripts/prepare-release.mjs` — kiểm cây sạch, `main` == `origin/main`, tag chưa có; nâng `VERSION`, thêm mục CHANGELOG; `--dry-run`; in lệnh tag/push để người chạy (VER-05).

## Tasks & Steps
- [x] `ci.yml` chạy test trên ma trận; sửa lỗi riêng Windows lộ ra (đường dẫn, xuống dòng CRLF — thêm `.gitattributes` `* text=auto eol=lf`).
- [x] Script vòng đời installer cho sh và PowerShell.
- [x] Test agent-native.
- [x] `release.yml` với draft → smoke → publish.
- [x] ~~Cắt thử `v0.1.0-rc.1`~~: bỏ theo quyết định của user (2026-11-03: push `main`, chưa tag). Đường phát hành được kiểm bằng CI và `docs/release-runbook.md`; tag đầu tiên do user quyết.

## Verification
- CI xanh trên 9 tổ hợp.
- Tag `v0.1.0-rc.1` tạo draft, smoke qua, release có `momentry-v0.1.0-rc.1.tar.gz`, `install.sh`, `install.ps1`, `checksums.txt`.
- Thử agent-native thật (bước 12 của skill): subagent mới chỉ được đọc `--help`/`--json`, cài từ URL release, đạt `doctor` ok.

## Risk
Runner Windows không có Git Bash trong PATH cho shim sh: test cả hai shim riêng.

## Ghi chú triển khai (2026-11-03)
- CI chạy trên GitHub từ 2026-11-03: 9/9 tổ hợp (ubuntu, macos, windows × Node 20/22/24) xanh, gồm vòng đời installer sh và PowerShell 5.1 và vòng agent. Lần đầu lộ ra lỗi chỉ có trên macOS (repo sau symlink) và Windows (đường dẫn 8.3, test giả định POSIX, runner chạy quyền Administrator, PowerShell làm hỏng đối số JSON); đã sửa.
- `release.yml` chưa chạy vì chưa có tag.
