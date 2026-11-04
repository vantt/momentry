---
title: "Đóng gói, phân phối và cài đặt momentry"
description: "Biến momentry từ cây mã chạy tay thành công cụ cài một lệnh, tự cài hook, có doctor/update/uninstall, chạy trên Linux, macOS, Windows và WSL."
status: completed
priority: P1
effort: 9d
branch: main
tags: [feature, infra, docs]
blockedBy: []
blocks: []
created: 2026-11-03
---

# Đóng gói, phân phối và cài đặt momentry

## Overview

Audit theo skill `cs-packaging-distribution` cho thấy lõi momentry chắc nhưng phần phân phối gần như chưa có: không phiên bản, không release, không installer, không `doctor`, `update`, `uninstall`, và quick start không chạy được như viết. Plan này làm đủ phần đó, ưu tiên trải nghiệm lần đầu (tầng 1) trước.

Nguồn: [audit](../reports/packaging-audit-261103-1557-cs-packaging-distribution.md), [checklist](../../docs/packaging-checklist.md). Luật trích theo id của skill (CMD-xx, INS-xx…); bản luật ở `~/.claude/skills/cs-packaging-distribution/`.

## Quyết định đã chốt (user, 2026-11-03)

1. **`init` tự cài hook** Claude Code/Codex và mẫu `/bip`, có `--dry-run`, sao lưu, nhận diện mục của mình, `uninstall` gỡ ngược. Đảo quyết định PRD 3.2, 6.4, 12: phải sửa PRD.
2. **Mã thoát theo CMD-08:** 0 xong, 1 có lỗi (kể cả `check` thấy vi phạm), 2 sai cú pháp; giữ 3/4/5; 10 = `update --check` có bản mới.
3. **Nền tảng:** Linux, macOS, Windows native, WSL.
4. **Đóng gói:** tarball mã nguồn + shim `momentry` (thêm `momentry.cmd` trên Windows); cần Node ≥ 20; vẫn không `package.json`, không npm.

## Ràng buộc và ngoài phạm vi

- Không thêm phụ thuộc ngoài (`imports.test.mjs` vẫn giữ). Giải nén tarball trong `update` bằng bộ đọc ustar tự viết (`node:zlib` + parser nhỏ), không gọi `tar` hệ thống.
- Không daemon, không MCP, không marketplace plugin, không Node SEA, không ký số cosign (SEC-02/03 để sau; checksum SHA-256 là bắt buộc).
- Không đổi pipeline harvest/scoring.

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Nền tảng đa nền, phiên bản, mã thoát](./phase-01-platform-foundation.md) | Done |
| 2 | [Bề mặt lệnh agent-native](./phase-02-command-surface.md) | Done |
| 3 | [Doctor engine và init](./phase-03-doctor-and-init.md) | Done |
| 4 | [Tự cài hook và /bip](./phase-04-host-integration.md) | Done |
| 5 | [Đóng gói release và installer](./phase-05-release-packaging-and-installers.md) | Done |
| 6 | [Update và uninstall](./phase-06-update-and-uninstall.md) | Done |
| 7 | [CI và test phân phối](./phase-07-ci-and-distribution-tests.md) | Done |
| 8 | [README, docs, PRD](./phase-08-docs-and-first-contact.md) | Done |

Thứ tự phụ thuộc: 1 → 2 → 3 → 4; 5 cần 1 (version, paths); 6 cần 3, 4, 5; 7 cần 5, 6; 8 viết sau cùng nhưng nội dung quick start chốt ngay ở phase 3.

## Success Criteria

- [ ] Trên máy sạch (Linux, macOS, Windows, WSL): `curl … | sh` (hoặc `irm … | iex`) rồi `momentry init --yes` cho ra "✓ Sẵn sàng", hook và `/bip` đã cài, `momentry doctor` thoát 0.
- [ ] Agent chỉ đọc `momentry --help`, `init --help`, `doctor --help` đi được tới `doctor --json` ok (TST-04).
- [ ] `momentry update` từ bản trước lên bản mới giữ cấu hình, hook vẫn chạy; `momentry uninstall --yes` gỡ sạch thứ mình cài, giữ dữ liệu.
- [ ] Nâng Node (nvm/fnm) không làm hook chết.
- [ ] CI xanh trên ubuntu/macos/windows × Node 20/22/24; release có `checksums.txt`, tag khớp `lib/version.mjs`.
- [ ] `docs/packaging-checklist.md` không còn MUST nào ở trạng thái `gap`, trừ mục ghi rõ lý do.

<!-- slug: packaging-distribution -->

## Validation Log

2026-11-03, kiểm đường dẫn và ký hiệu trong plan với code hiện tại (`bin/momentry.mjs`, `lib/config.mjs`, `lib/hook.mjs`, `lib/llm.mjs`, `lib/sources/*.mjs`, `test/imports.test.mjs`, `prompts/bip.md`): khớp. Quyết định của user trong vòng validate:
- macOS giữ `~/.config`/`~/.cache` như Linux (lệch CFG-01 có chủ ý).
- Linux/macOS/WSL: installer không sửa rc file, chỉ in dòng `export`.
- Windows: `install.ps1` tự thêm vào PATH user (HKCU), uninstall gỡ ra.

Còn mở: shell mà Claude Code và Codex dùng để chạy hook trên Windows native (spike ở phase 4).
