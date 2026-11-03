# Changelog

Định dạng theo [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); phiên bản theo [SemVer](https://semver.org/). Mục của mỗi bản là ghi chú phát hành trên GitHub.

## [Unreleased]

### Added

- `momentry quarantine --release all`: kiểm lại mọi chuyện đang bị giữ, thả chuyện sạch vào hộp, chuyện còn vi phạm vẫn bị giữ (thoát 1 nếu còn chuyện bị giữ).

### Fixed

- Hook Codex dùng khoá sự kiện PascalCase (`PreCompact`, `SessionEnd`, `SessionStart`) như Codex yêu cầu; khoá snake_case cũ bị Codex bỏ qua nên hook Codex chưa từng chạy. `momentry connect codex --yes` (hoặc `doctor --fix`) thay mục cũ.
- Windows: lệnh hook dùng `"C:/…/momentry.cmd"` (Claude Code chạy hook qua Git Bash); `/bip` gọi `momentry` theo tên.

## [0.1.0] - 2026-11-03

Bản phát hành đầu tiên có cài đặt một lệnh.

### Added

- `install.sh` (Linux, macOS, WSL) và `install.ps1` (Windows): tải archive, kiểm sha256 theo đúng tên, chạy thử rồi mới kích hoạt, đặt shim `momentry` lên PATH. Cài lại cùng bản thì không đổi gì.
- `momentry init` tạo `.momentry.json` và hộp chuyện, cài hook và lệnh `/bip` cho Claude Code và Codex (khi có `--yes` hoặc bạn đồng ý; sao lưu file trước khi sửa), rồi kiểm và in "✓ Sẵn sàng" cùng bước tiếp theo.
- `momentry doctor [--fix]`, `momentry status`: kiểm Node, git, claude, cấu hình, nguồn chặn riêng tư, repo, hộp, cache, bản cài, hook; mỗi check chưa đạt có lệnh sửa.
- `momentry connect [claude|codex] [--remove]`, `momentry update [--check]`, `momentry uninstall [--purge]`, `momentry config path|show|get|set|unset|default`, `momentry paths`, `momentry version`, `momentry --version`.
- Cờ chung cho mọi lệnh: `--json`, `--yes`, `--dry-run`, `--quiet`, `--verbose`, `--no-color`, `--config`. `--help` của từng lệnh có mô tả, cờ và mặc định, ví dụ, mã thoát, bước tiếp. `momentry` không đối số in 3 bước bắt đầu và mục cho agent.
- Hỗ trợ Windows native: đường dẫn `%APPDATA%`/`%LOCALAPPDATA%`, gọi `claude.cmd`, danh sách trong biến môi trường tách bằng `;`.
- Tôn trọng `XDG_*`, `CLAUDE_CONFIG_DIR`, `CODEX_HOME`.

### Changed (breaking)

- **Mã thoát** theo một chuẩn cho mọi lệnh: 1 là lỗi (kể cả `check` thấy lỗi khuôn hay vi phạm riêng tư, trước là 2), 2 là sai cú pháp (trước là 1). 3, 4, 5 giữ nguyên; thêm 10 cho `update --check` có bản mới. Script hay pre-commit hook dựa vào mã cũ cần sửa.
- **`--json`** của mọi lệnh in một phong bì `{"schema":1,"ok","data","error","next"}`; `list --json` trước in mảng trần, nay mảng nằm ở `data`.
- **Hook** gọi shim đã cài (`"…/momentry" hook …`) thay vì đường dẫn Node tuyệt đối, nên nâng Node không làm hook chết. Hook dạng cũ được `momentry doctor` báo và `momentry doctor --fix` hoặc `momentry connect --yes` thay.
- `momentry init` tự cài hook và `/bip` (trước chỉ in để dán tay; `momentry hooks --print` vẫn còn).
