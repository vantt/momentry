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
- [ ] hosts.mjs đa profile, đa kiểu cài
- [ ] extension pi/omp: gọi node tuyệt đối + `bin/momentry.mjs` (omp chạy Bun; Windows không spawn `.cmd`)
- [ ] agy hooks.json + skill
- [ ] doctor/uninstall
- [ ] Thử thật: `omp`/`pi` nạp extension không lỗi (chế độ không gọi model nếu có), agy hooks.json hợp lệ

## Verification
- `node --test test/hosts.test.mjs`; `sh scripts/test-installer.sh`
