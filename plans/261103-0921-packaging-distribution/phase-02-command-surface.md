---
phase: 2
title: "Bề mặt lệnh agent-native"
status: done
priority: P1
effort: "1d"
dependencies: [1]
---

# Phase 2: Bề mặt lệnh agent-native

## Goal
Một định nghĩa lệnh duy nhất sinh ra parser, `--help` tự đủ, `help --json` và gợi ý "did you mean", để người và agent dùng được chỉ với `--help` và `--json` (CMD-06..19).

## Key Insights
- Hiện `SPEC` trong `bin/momentry.mjs` chỉ có tên cờ và kiểu; help sinh ra chỉ là `momentry init [--repo]`.
- CMD-09 đã đạt (stdout sạch), giữ nguyên.
- `list --json` in mảng trần; phong bì CMD-11 là thay đổi hợp đồng nhỏ, làm cùng đợt đổi mã thoát.

## Files to Create / Modify
- Create: `lib/commands.mjs` — bảng lệnh: với mỗi lệnh `summary`, `changes` (thay đổi gì trên đĩa), `prereq`, `flags` (kiểu, mặc định, mô tả), `examples` (2–4, có một bản không tương tác), `exit` (mã → nghĩa), `next`. Đây là nguồn duy nhất (PRN-02).
- Create: `lib/cli-output.mjs` — `envelope({ok, data, error, next})` → `{"schema":1,"ok","data","error":{"code","why","fix"}|null,"next":[]}`; `formatError({code, why, fix})` dạng Error / Why / Fix; `didYouMean(word, candidates)` (khoảng cách Levenshtein ≤ 2).
- Modify: `bin/momentry.mjs` — parser đọc từ `lib/commands.mjs`; thêm `--version`, `version [--json]`, `help [--json]`; cờ toàn cục `--json`, `-y/--yes`, `--dry-run`, `-q/--quiet`, `--no-color` (+ `NO_COLOR`) được nhận ở mọi lệnh (lệnh không dùng thì bỏ qua, không báo lỗi); `list --json` và `ledger --json` dùng phong bì.
- Create: `test/commands.test.mjs` — mỗi lệnh có đủ trường; mỗi cờ trong parser có trong help; README không nhắc lệnh/cờ không tồn tại (TST-06 rút gọn).
- Modify: `test/cli.test.mjs`, `test/contract.test.mjs`.

## Tasks & Steps
- [x] Viết `lib/commands.mjs` cho 12 lệnh hiện có, chép mô tả từ README (tiếng Việt), thêm chỗ trống cho `doctor`, `update`, `uninstall`, `paths`, `config`, `connect` (điền ở phase 3–6).
- [x] Không đối số: in "Bắt đầu: 1. `momentry init` 2. `momentry scan --max-sessions 1` 3. `momentry list --rank`", danh sách lệnh, và mục "Agents / tự động hoá" nêu vòng `init --yes --json` → `doctor --json` → chạy mọi `fix`. Thoát 0 (CMD-15).
- [x] `<lệnh> --help`: mô tả, thay đổi gì, điều kiện, cờ + mặc định, ví dụ, mã thoát, bước tiếp.
- [x] Lệnh hay cờ lạ: Error/Why/Fix + "ý bạn là `list`?", thoát 2.
- [x] Mọi lỗi CLI đi qua `formatError`; với `--json` in phong bì lên stdout, kể cả khi lỗi.
- [x] `version --json`: `{version, commit, commitTime, node, platform, arch, installDir}`.

## Verification
- `node bin/momentry.mjs; echo $?` → help theo nhiệm vụ, 0.
- `node bin/momentry.mjs lisst; echo $?` → gợi ý `list`, 2.
- `node bin/momentry.mjs list --json | node -e "JSON.parse(require('fs').readFileSync(0))"` parse được kể cả khi không có hộp.
- `node --test test/*.test.mjs`.

## Risk
Phong bì `--json` đổi đầu ra `list --json`. Giảm: ghi CHANGELOG cùng mục Breaking với mã thoát.
