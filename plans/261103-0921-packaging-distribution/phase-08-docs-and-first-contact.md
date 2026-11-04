---
phase: 8
title: "README, docs, PRD"
status: done
priority: P1
effort: "0.5d"
dependencies: [3, 4, 5, 6]
---

# Phase 8: README, docs, PRD

## Goal
Người mới đọc màn hình đầu README là biết momentry giúp gì, cài một lệnh, tới chuyện đầu tiên trong ≤ 3 lệnh; tài liệu và PRD khớp với hành vi mới (ONB-01..16).

## Files to Create / Modify
- Modify: `README.md` theo thứ tự ONB-04:
  1. Tên + một câu lợi ích (nháp: "Không phải nhớ lại tuần này có gì đáng kể: momentry tự nhặt chuyện từ phiên Claude Code/Codex của bạn và xếp hạng để bạn chọn.") + 2–3 câu cho ai, vì sao. Bỏ dòng "Trạng thái DM.x" khỏi màn hình đầu.
  2. Bắt đầu nhanh: lời hứa "Từ con số 0 tới danh sách chuyện đã xếp hạng trong khoảng 5 phút. Cần: Node ≥ 20, git, `claude` CLI đã đăng nhập." Lệnh cài Linux/macOS/WSL; Windows trong `<details>`. Ba bước giống hệt dòng "Tiếp" của installer và `init` (ONB-12). Prompt "cài bằng agent" (ONB-13).
  3. Tính năng ngắn.
  4. Cập nhật / Cấu hình (ví dụ `privacy.sources` tối thiểu) / Gỡ / Sự cố (`momentry doctor`).
  5. Link `docs/`.
- Create: `docs/installation.md` — nền tảng hỗ trợ, bố cục thư mục từng OS, biến môi trường, PATH, cài bản cụ thể, Windows (shell chạy hook, kết quả spike phase 4), WSL (Claude chạy trong WSL dùng cấu hình WSL).
- Create: `docs/cli-reference.md` — sinh từ `lib/commands.mjs` (`node scripts/gen-cli-reference.mjs`); chuyển bảng lệnh, mã thoát, `--fake-llm`, hợp đồng module khỏi README sang đây.
- Create: `docs/release-runbook.md` — cắt, kiểm, quay lui, rút release (REL-13).
- Create: `CHANGELOG.md` — mục 0.1.0, phần "Breaking": mã thoát mới, phong bì `--json`, hook đổi dạng lệnh.
- Modify: `docs/prd.md` — mục 3.2 (bỏ dòng "không tự sửa settings"), 6.4 (init tự cài hook có sao lưu, dry-run, gỡ ngược), 7.2 (mã thoát mới, lệnh mới), 12 (ghi quyết định đảo, ngày, lý do). Thêm mục nền tảng hỗ trợ.
- Modify: `docs/README.md` — thêm link `installation.md`, `cli-reference.md`, `packaging-checklist.md`, `release-runbook.md`.
- Modify: `docs/packaging-checklist.md` — cập nhật trạng thái từng luật sau khi chạy lại bảng Verify của skill.

## Tasks & Steps
- [x] Viết README mới; mọi khối lệnh chạy được nguyên văn.
- [x] Script sinh `docs/cli-reference.md`; test so README/`--help`/docs không lệch (TST-06).
- [x] Sửa PRD, CHANGELOG, runbook, installation.
- [x] Chạy lại bảng Verify 1–12 của skill trong HOME tạm; cập nhật checklist.

## Verification
- Bảng Verify của skill: 1–11 pass, 12 pass qua `scripts/test-agent-native.sh` và một lần thử bằng subagent.
- Link trong `docs/` không gãy.
