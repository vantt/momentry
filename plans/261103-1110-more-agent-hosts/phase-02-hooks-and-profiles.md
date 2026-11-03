---
phase: 2
title: "Hook runtime và tìm profile"
status: todo
priority: P1
effort: "0.5d"
dependencies: [1]
---

# Phase 2: Hook runtime và tìm profile

## Goal
`momentry hook <event> --pi|--omp|--agy` xử lý payload từng host; một nguồn duy nhất liệt kê thư mục cấu hình của mọi host và profile.

## Files
- Modify: `lib/hook.mjs` — runtime mới; agy: chuẩn hoá `conversationId`/`transcriptPath`/`workspacePaths[0]`, ghi chỉ mục, in `{}`, tách nền `scan --agy --except`.
- Modify: `bin`/`lib/cli.mjs` runHook (cờ mới; agy cần stdout `{}`).
- Create: `lib/profiles.mjs` — `hostRoots(name, env)`: claude `[CLAUDE_CONFIG_DIR||~/.claude]`; codex `[CODEX_HOME||~/.codex, ~/.codex-*]`; pi `[PI_CODING_AGENT_DIR||~/.pi/agent, ~/.pi/accounts/*]`; omp `[~/.omp/agent, ~/.omp/profiles/*/agent]`; agy `[~/.gemini, ~/.agy-homes/*/.gemini]`; chỉ giữ thư mục tồn tại.

## Tasks & Steps
- [x] profiles.mjs + test (HOME tạm)
- [x] hook runtime pi/omp/agy + test
- [x] scan đọc transcript ở mọi profile

## Verification
- `node --test test/hook.test.mjs test/paths.test.mjs`
