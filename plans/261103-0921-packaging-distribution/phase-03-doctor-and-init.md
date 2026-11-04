---
phase: 3
title: "Doctor engine và init"
status: done
priority: P1
effort: "1.5d"
dependencies: [1, 2]
---

# Phase 3: Doctor engine và init

## Goal
Một engine kiểm tra duy nhất: `doctor` chỉ đọc, `doctor --fix` sửa cái đã có, `init` = `doctor --fix` cộng các check `creates`, kết thúc bằng "✓ Sẵn sàng" và một bước tiếp (CMD-01..05, DOC-01..04, ONB-10).

## Key Insights
- Hiện `init` chỉ tạo `.momentry.json`; `list`/`check` ngay sau đó thoát lỗi vì chưa có hộp.
- Chạy không có `privacy.sources` thì mọi chuyện vào quarantine (thoát 3); người mới không biết vì sao. Đây phải là check có hướng dẫn sửa, không tự đoán nguồn chặn (dữ liệu riêng tư là của user).
- `claude` CLI là phụ thuộc bắt buộc của harvest nhưng chưa được kiểm trước khi chạy.

## Files to Create / Modify
- Create: `lib/doctor.mjs` — registry: `register({code, title, critical, creates, check(ctx) → {status, detail, fix}, apply?(ctx)})`; `run(ctx, {fix, creates, dryRun, rounds: 3})` chạy từng check có timeout, sau mỗi vòng sửa thì chạy lại, trả kết quả sau cùng.
- Create: `lib/checks.mjs` — các check (host hook/bip đăng ký ở phase 4):
  | code | critical | creates | Kiểm | fix |
  |---|---|---|---|---|
  | `node.version` | có | | Node ≥ 20 | cách cài Node theo OS |
  | `git.present` | có | | `git --version` | cách cài git |
  | `claude.present` | có | | `claude --version` chạy được | `npm i -g @anthropic-ai/claude-code` hoặc trang cài đặt |
  | `config.valid` | có | | đọc được cấu hình người dùng và repo | dòng/khóa lỗi + lệnh `momentry config show` |
  | `privacy.sources` | có | | có ít nhất một nguồn và đọc được | `momentry config set privacy.sources …` (ví dụ cụ thể) |
  | `repo.observed` | có | có | có `.momentry.json` ở git root | tạo file `{}` |
  | `box.exists` | | có | thư mục hộp tồn tại | tạo hộp kèm `README.md` khuôn |
  | `cache.private` | | | cache 0700 (bỏ qua trên Windows) | `chmod 700 …` (tự sửa) |
  | `locks.stale` | | | không có khoá chết | gỡ khoá chết (tự sửa) |
  | `install.path` | | | `momentry` trên PATH trỏ tới bản đang chạy | dòng `export PATH=…` theo shell |
  | `update.available` | | | (cache 1 lần/ngày, tắt khi `--json`/CI) | `momentry update` |
- Create: `lib/config-cmd.mjs` — `config path|show|get|set|unset|default`. `show` in giá trị hiệu lực kèm nguồn (cờ/env/repo/user/mặc định). `default` sinh JSON đầy đủ từ `DEFAULTS` (CFG-05). `set`/`unset` ghi atomic, giữ quyền file, từ chối khoá lạ kèm "did you mean". Khoá `privacy.*` chỉ ghi vào cấu hình người dùng.
- Modify: `bin/momentry.mjs` — thêm `doctor [--fix] [--json] [--dry-run]`, `status`, `paths [--json]`, `config …`; `init [--yes] [--dry-run] [--json] [--repo]`.
- Create: `test/doctor.test.mjs`, `test/config-cmd.test.mjs`.

## Tasks & Steps
- [x] Registry + vòng sửa có giới hạn 3 vòng; exit 0 chỉ khi mọi check critical ok sau vòng cuối (DOC-02).
- [x] Các check trên, mỗi check một hàm thuần nhận `ctx` (env, platform, cwd, spawn giả được) để test.
- [x] `doctor` mặc định chỉ đọc; `--fix` không chạy check `creates` (CMD-02).
- [x] `init`: chạy `creates` + fix, rồi in danh sách đã làm, "✓ Sẵn sàng" và đúng một bước tiếp. Nếu thiếu `privacy.sources`: không ✓, in lệnh cụ thể để khai báo và thoát 1. Chạy lại: "không có gì phải làm".
- [x] `--json`: phong bì, `data.checks[]` có `code,status,detail,fix`, `next[]` là lệnh không tương tác.
- [x] `status`: tập check nhanh (không spawn `claude`), một dòng tiếp theo.
- [x] `config` như trên; `paths --json` lấy từ `lib/paths.mjs` (CFG-03).

## Verification
- HOME tạm: `momentry doctor --json; echo $?` → `ok:false`, thoát 1, mỗi check hỏng có `fix`.
- Sau `momentry config set privacy.sources '[{"type":"lines","path":"…"}]'` và `momentry init --yes`: "✓ Sẵn sàng", `doctor` thoát 0.
- `momentry init --yes` lần hai: không thay đổi gì.
- `momentry doctor` không tạo file nào (so sánh cây thư mục trước/sau trong test).

## Risk
- `claude --version` chậm hoặc treo: timeout 5 giây, coi là `warn`.
- Doctor spawn hook thật để kiểm (DOC-05) có thể chạy harvest tốn tiền: chỉ chạy `hook` với `STORY_HARVEST=1` (thoát ngay) để xác nhận lệnh gọi được.

## Ghi chú triển khai (2026-11-03)
- Bỏ check `locks.stale`: `lib/ledger.mjs` `lock()` đã tự thay khoá chết (pid không còn hoặc quá `lock.staleSec`), check riêng không thêm gì.
- `update.available` không thành check của doctor; `momentry update --check` làm việc đó (UX-06 gợi ý định kỳ vẫn là việc sau).
- Thêm `momentry config privacy-add TÊN…` sau thử agent-native: lệnh sửa của check `privacy.sources` phải chạy được, không phải câu văn.
