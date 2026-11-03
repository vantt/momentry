---
phase: 3
title: "Cài extension, hooks.json, /bip"
status: todo
priority: P1
effort: "1d"
dependencies: [2]
---

# Phase 3: Cài extension, hooks.json, /bip

## Goal
`hosts.mjs` cài/gỡ theo từng thư mục profile: Claude/Codex như cũ (nay cho mọi profile); pi/omp ghi `<agentDir>/extensions/momentry.ts` (file sở hữu theo dòng đánh dấu sha256 như `bip.md`); agy ghi mục `momentry` vào `<home>/.gemini/config/hooks.json`; `/bip` ở `<agentDir>/prompts/bip.md` (pi), `<agentDir>/commands/bip.md` (omp), `<home>/.gemini/config/skills/bip/SKILL.md` (agy, `disable-model-invocation: true`).

## Files
- Modify: `lib/hosts.mjs`, `lib/checks.mjs` (một check mỗi host, liệt kê profile chưa cài), `lib/uninstall.mjs`, `lib/commands.mjs` (`connect [claude|codex|pi|omp|agy]`).
- Create: `prompts/pi-extension.ts` (mẫu), `prompts/agy-bip.md`.

## Tasks & Steps
- [x] hosts.mjs đa profile, đa kiểu cài
- [x] extension pi/omp: gọi node tuyệt đối + `bin/momentry.mjs` (omp chạy Bun; Windows không spawn `.cmd`)
- [x] agy hooks.json + skill
- [x] doctor/uninstall
- [x] Thử thật: `omp`/`pi` nạp extension không lỗi (chế độ không gọi model nếu có), agy hooks.json hợp lệ

## Verification
- `node --test test/hosts.test.mjs`; `sh scripts/test-installer.sh`

## Ghi chú triển khai (2026-11-03)
- Thử thật trên Linux, HOME tạm: pi 1.4.0 nạp `extensions/momentry.ts`, `session_start` → `hook.spawned runtime=pi cmd=scan`; omp 18.12.6: `session_start` → scan, `session_shutdown` → harvest đọc transcript. Lúc thử omp, omp bỏ qua `OPENAI_BASE_URL` và gửi một yêu cầu tới OpenAI với khoá giả (bị 401); không khoá thật nào bị gửi.
- Antigravity 1.4.4 đòi đăng nhập trước khi mở phiên nên hook chưa chạy được trong sandbox; định dạng `hooks.json` khớp nhóm `herdr` có sẵn trên máy và tài liệu chính thức. Chưa kiểm: một phiên agy thật đã đăng nhập.
- `/bip` của omp đặt ở `<agentDir>/commands/bip.md` mỗi profile (thay vì `~/.agents/commands`), để đi cùng cơ chế tìm profile.
