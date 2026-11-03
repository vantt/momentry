---
phase: 4
title: "Tự cài hook và /bip"
status: todo
priority: P1
effort: "1.5d"
dependencies: [3]
---

# Phase 4: Tự cài hook và /bip

## Goal
`init` tự cài hook Claude Code/Codex và mẫu `/bip` cho các host có trên máy, an toàn với file của user, và `connect --remove`/`uninstall` gỡ ngược đúng phần của mình (AGT-01..03, AGT-07/08, PRN-03/04).

## Key Insights
- Sau phase 5, lệnh hook ổn định là `momentry hook <event>` (qua shim). Chuỗi `momentry hook` là dấu sở hữu: mục nào có lệnh bắt đầu bằng nó là của mình.
- `~/.claude/settings.json` và `~/.codex/hooks.json` là JSON thuần nên sửa được bằng `JSON.parse/stringify`, giữ thứ tự khoá; thụt lề có thể đổi, chấp nhận và nêu trong tài liệu.
- Codex tự hỏi duyệt tin cậy hook mới, nên không sửa `~/.codex/config.toml`.
- Mẫu `/bip` hiện nhúng đường dẫn Node tuyệt đối; đổi thành `momentry add …`.
- Hook in ra hiện dùng `"<execPath>" "<binPath>"`; người đã dán bản cũ cần được doctor phát hiện và nâng cấp.
- Windows native: chưa rõ Claude Code và Codex chạy lệnh hook qua cmd, PowerShell hay Git Bash. Cài cả shim `momentry` (sh) và `momentry.cmd` (phase 5) thì gọi được từ cả hai; phải kiểm trên máy thật.

## Files to Create / Modify
- Create: `lib/hosts.mjs` — bảng adapter (AGT-02):
  | Host | Phát hiện | File hook | File /bip |
  |---|---|---|---|
  | Claude Code | `claude` trên PATH hoặc có `~/.claude` (`CLAUDE_CONFIG_DIR`) | `~/.claude/settings.json` khoá `hooks`: `PreCompact`, `SessionEnd`, `SessionStart` | `~/.claude/commands/bip.md` |
  | Codex | `codex` trên PATH hoặc có `~/.codex` (`CODEX_HOME`) | `~/.codex/hooks.json`: `pre_compact`, `session_start` | `~/.codex/prompts/bip.md` |
  Hàm: `detect()`, `plan(host)` → danh sách thay đổi, `apply(plan, {dryRun})`, `remove(host, {dryRun})`, `inspect(host)` → trạng thái cho doctor.
- Create: `lib/safe-edit.mjs` — sửa JSON an toàn: đọc + digest preimage; file hỏng → từ chối, không ghi; sao lưu `<file>.momentry-bak-<ts>`; ghi file tạm cùng thư mục rồi rename, giữ mode; đọc lại digest ngay trước rename, khác thì huỷ và báo (CAS); không trùng lặp mục đã có.
- Modify: `lib/hook.mjs` — `printHookConfig` dùng lệnh `momentry hook …`; giữ `hooks --print` cho ai muốn tự dán.
- Modify: `prompts/bip.md` — `{bin}` → `momentry`.
- Modify: `lib/checks.mjs` — thêm check `host.<name>.hooks` và `host.<name>.bip` (`creates: true` vì ghi ra ngoài repo; `fix` = `momentry connect <host> --yes`). Phát hiện mục cũ dạng `"<node>" "…/momentry.mjs" hook` → `warn` + sửa thành dạng shim. Kiểm hook chạy được: gọi lệnh trong mục với `STORY_HARVEST=1`.
- Modify: `bin/momentry.mjs` — `connect [claude|codex] [--dry-run] [--yes] [--remove]`.
- File `/bip` sở hữu theo digest: ghi kèm bảng digest các bản đã phát hành (`lib/bip-digests.mjs`); file có digest lạ là của user, không ghi đè, chỉ báo (AGT-07).
- Create: `test/hosts.test.mjs`, `test/safe-edit.test.mjs` với HOME tạm.

## Tasks & Steps
- [x] `safe-edit.mjs` + test: file không tồn tại, file rỗng, JSON hỏng (từ chối), có hook khác của user (giữ nguyên), đã có mục của mình (không thêm), file đổi giữa chừng (huỷ), giữ mode 0600.
- [x] `hosts.mjs` cho Claude, rồi Codex.
- [x] `init`: với `--yes` (hoặc TTY và user đồng ý) cài cho mọi host phát hiện được; không TTY và không `--yes` → không cài, check báo `fix`. `--dry-run` in đúng từng thay đổi (file, khoá, nội dung).
- [x] `connect --remove` gỡ chỉ mục có dấu sở hữu và file `/bip` có digest đã biết; báo những gì để lại.
- [x] Doctor nhận diện và nâng cấp mục hook dạng cũ.
- [x] Spike trên Windows thật: Claude Code và Codex chạy `momentry hook session-start` được không, qua shell nào; ghi kết quả vào phase này và vào `docs/installation.md`.
  Kết quả (2026-11-03): runner CI `windows-2025` (Windows thật, PowerShell 5.1) cài, `init` ghi hook, `doctor`, `update`, `uninstall` qua. Shell chạy hook lấy từ báo cáo cộng đồng: Claude Code dùng Git Bash, Codex dùng cmd; lệnh hook đổi sang `"C:/…/momentry.cmd"` chạy được ở cả hai, `/bip` gọi `momentry` theo tên. Chưa đo bằng một phiên Claude Code/Codex thật trên Windows (ghi trong `docs/installation.md`).

## Verification
- HOME tạm có `settings.json` chứa hook khác: `momentry init --yes` thêm 3 mục, giữ hook khác, tạo bản sao lưu; chạy lại không đổi gì; `momentry connect claude --remove --yes` trả file về nội dung tương đương ban đầu.
- `momentry init --dry-run` không ghi file nào.
- `momentry doctor --json` báo `host.claude.hooks: ok`.

## Risk
- Claude Code đang chạy ghi `settings.json` cùng lúc: CAS + rename atomic; mất cuộc đua thì huỷ, báo chạy lại.
- Sửa file cấu hình toàn cục của user là việc nhạy cảm: luôn sao lưu, luôn liệt kê thay đổi, `--dry-run` có sẵn.

## Security
Không ghi bí mật vào file host. Lệnh hook không chứa đường dẫn có thể bị user khác ghi (shim nằm trong thư mục của user).

## Ghi chú triển khai (2026-11-03)
- Hook gọi shim bằng đường dẫn tuyệt đối (`"…/.local/bin/momentry" hook …`; Windows `momentry.cmd`), không phụ thuộc PATH của host.
- Spike Windows: xem kết quả ở việc cuối phần Tasks; điểm còn chưa đo ghi trong `docs/installation.md` mục "Hook trên Windows".
