---
phase: 1
title: "Bộ đọc transcript pi/omp/agy"
status: todo
priority: P1
effort: "1d"
dependencies: []
---

# Phase 1: Bộ đọc transcript pi/omp/agy

## Goal
`lib/sources/pi.mjs` (dùng chung cho pi và omp) và `lib/sources/agy.mjs` theo cùng hợp đồng với `claude.mjs`/`codex.mjs`: `sessionId`, `listTranscripts(repoRoot, opts)`, `readEntries(file, range)`, `countLines`.

## Files
- Create: `lib/sources/pi.mjs` — mapping theo mục "Entry mapping" của báo cáo; công tắc omp: bỏ dòng `title`, bỏ user `attribution:"agent"`, bỏ `tool_execution_start`, lấy path edit từ `toolResult.details.path` rồi mới tới `patchPaths`.
- Create: `lib/sources/agy.mjs` — đọc `transcript_full.jsonl` nếu có; `listTranscripts` dựa vào chỉ mục `<cache>/agy-sessions.jsonl` (transcript không có cwd).
- Modify: `lib/pipeline.mjs` (`SOURCES`, `transcriptDirs`, `sourceOf` theo đường dẫn/dòng đầu, `scan` cờ `--pi/--omp/--agy`), `lib/commands.mjs`, `lib/cli.mjs`.
- Create: fixture `test/fixtures/transcripts/pi-session.jsonl`, `omp-session.jsonl`, `agy/transcript_full.jsonl` (bịa, đúng schema).

## Tasks & Steps
- [ ] pi/omp reader + test
- [ ] agy reader + chỉ mục + test
- [ ] pipeline/scan/sourceOf + test
- [ ] Thử trên dữ liệu thật trong máy: đếm Entry theo loại, không in nội dung

## Verification
- `node --test test/sources.test.mjs`
