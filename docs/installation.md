# Cài đặt momentry

Cách cài nhanh ở [README](../README.vi.md#bắt-đầu-nhanh). Trang này nói rõ cài vào đâu, chỉnh thế nào và từng nền tảng khác nhau ra sao. Mọi đường dẫn thật trên máy bạn: `momentry paths`.

## Nền tảng

| Nền tảng | Installer | Ghi chú |
|---|---|---|
| Linux | `install.sh` | x64, arm64; momentry là mã nguồn chạy bằng Node nên không phụ thuộc kiến trúc CPU |
| macOS | `install.sh` | |
| WSL | `install.sh` | Claude Code/Codex chạy trong WSL dùng cấu hình trong WSL (`~/.claude` của WSL), tách khỏi bản Windows |
| Windows | `install.ps1` | PowerShell 5.1 trở lên, Windows 10 1803 trở lên (cần `tar.exe` có sẵn); không cần quyền admin |

Cần sẵn: Node ≥ 20 trên PATH, git, và `claude` CLI đã đăng nhập. Installer từ chối chạy bằng root/Administrator (đặt `MOMENTRY_ALLOW_ROOT=1` nếu thật sự muốn).

## Cài vào đâu

| Thứ | Linux, macOS, WSL | Windows |
|---|---|---|
| Lệnh `momentry` (shim) | `~/.local/bin/momentry` | `%LOCALAPPDATA%\momentry\bin\momentry.cmd` (thêm `momentry` dạng sh cho Git Bash) |
| Mã nguồn các bản | `~/.local/share/momentry/versions/<v>` | `%LOCALAPPDATA%\momentry\app\versions\<v>` |
| Bản đang dùng | `~/.local/share/momentry/current` | `%LOCALAPPDATA%\momentry\app\current` |
| Dấu bản cài (ghi cả thư mục shim) | `~/.local/share/momentry/.momentry-managed` | `%LOCALAPPDATA%\momentry\app\.momentry-managed` |
| Cấu hình người dùng | `~/.config/momentry/config.json` | `%APPDATA%\momentry\config.json` |
| Cache (sổ, khoá, quarantine, `hook.log`) | `~/.cache/momentry` (quyền 0700) | `%LOCALAPPDATA%\momentry\cache` |
| Hook, `/bip` Claude Code | `~/.claude/settings.json`, `~/.claude/commands/bip.md` | `%USERPROFILE%\.claude\…` |
| Hook, `/bip` Codex | `~/.codex/hooks.json`, `~/.codex/prompts/bip.md` | `%USERPROFILE%\.codex\…` |

Linux tôn trọng `XDG_CONFIG_HOME`, `XDG_CACHE_HOME`, `XDG_DATA_HOME` khi là đường dẫn tuyệt đối. macOS dùng cùng bố cục `~/.config`, `~/.cache` như Linux (có chủ ý, giống đa số CLI dành cho dev).

Shim tìm `node` trên PATH lúc chạy và đọc bản đang dùng từ `current`, nên nâng Node hay `momentry update` không làm hook hỏng. Hook trong `settings.json` gọi shim bằng đường dẫn tuyệt đối, nên vẫn chạy kể cả khi `~/.local/bin` chưa có trong PATH của Claude Code.

## PATH

- Linux, macOS, WSL: installer **không sửa** file rc. Nếu `~/.local/bin` chưa có trong PATH, nó in đúng một dòng để bạn thêm vào `~/.bashrc` hoặc `~/.zshrc`:

  ```sh
  export PATH="$HOME/.local/bin:$PATH"
  ```

- Windows: `install.ps1` thêm `%LOCALAPPDATA%\momentry\bin` vào PATH của user (`HKCU\Environment`, giữ kiểu `REG_EXPAND_SZ`) và báo cho các cửa sổ khác; mở terminal mới để thấy. `momentry uninstall` gỡ mục này. Không muốn sửa PATH: đặt `MOMENTRY_NO_MODIFY_PATH=1` trước khi cài.

## Tuỳ chọn installer

Mỗi tuỳ chọn là một cờ của `install.sh` và một biến môi trường (dùng được cho cả `install.ps1`):

| Cờ `install.sh` | Biến | Ý nghĩa |
|---|---|---|
| `--version vX.Y.Z` | `MOMENTRY_VERSION` | Cài bản cụ thể (mặc định: bản của installer, tức bản mới nhất) |
| `--install-dir DIR` | `MOMENTRY_INSTALL_DIR` | Nơi đặt shim `momentry` |
| `--home DIR` | `MOMENTRY_HOME` | Nơi đặt mã nguồn các bản |
| `--local-fixture DIR` | `MOMENTRY_RELEASE_BASE` | Cài từ thư mục chứa asset (test, mirror, máy không có mạng) |
| `--dry-run` | `MOMENTRY_DRY_RUN=1` | Chỉ in sẽ làm gì |
| `--no-modify-path` | `MOMENTRY_NO_MODIFY_PATH=1` | Không in hoặc sửa PATH |
| `--uninstall` | `MOMENTRY_UNINSTALL=1` | Gỡ (gọi `momentry uninstall`) |
| `-y`, `--yes` | `MOMENTRY_YES=1` | Không hỏi |

Truyền cờ qua `curl | sh`:

```sh
curl -fsSL https://github.com/vantt/momentry/releases/latest/download/install.sh | sh -s -- --version v0.1.0
```

Bản phát hành có `-` trong tên (ví dụ `v0.2.0-rc.1`) không bao giờ là "latest"; cài bằng `--version`.

Installer chỉ tải qua HTTPS, kiểm sha256 của archive theo đúng tên trong `checksums.txt`, từ chối archive có link hay file ngoài `bin/ lib/ prompts/`, chạy thử bản mới trước khi đổi `current`, và không ghi đè một `momentry` không do nó cài. Chữ ký (cosign) chưa có; installer nói rõ "chưa kiểm chữ ký".

## Biến môi trường khi chạy

| Biến | Ý nghĩa |
|---|---|
| `MOMENTRY_CONFIG` | File cấu hình người dùng (như cờ `--config`) |
| `MOMENTRY_CACHE` | Thư mục cache |
| `MOMENTRY_HOME`, `MOMENTRY_INSTALL_DIR` | Nơi cài (installer, update, uninstall đọc chung) |
| `MOMENTRY_RELEASE_BASE` | Nguồn bản phát hành cho `update` (mirror, test) |
| `MOMENTRY_BOX` | Thư mục hộp chuyện |
| `MOMENTRY_PRIVACY_SOURCES` | Nguồn chặn: mảng JSON như trong cấu hình, hoặc danh sách đường dẫn (`:`; `;` trên Windows) |
| `MOMENTRY_ALLOW_UNCHECKED=1` | Cho chuyện vào hộp khi chưa có nguồn chặn (kèm `privacy: unchecked`) |
| `MOMENTRY_REPOS` | Repo quan sát thêm, không cần `.momentry.json` (`:`; `;` trên Windows) |
| `CLAUDE_CONFIG_DIR`, `CODEX_HOME` | Thư mục cấu hình Claude Code, Codex nếu bạn đổi |
| `STORY_HARVEST=1` | Hook thoát ngay (momentry tự đặt khi gọi model) |

## Khoá cấu hình

`momentry config default` in mọi khoá và giá trị mặc định; `momentry config show` in giá trị đang dùng kèm nơi đặt nó.

| Khoá | Mặc định | Ghi chú |
|---|---|---|
| `box` | `docs/storytelling-material` | Tương đối với git root |
| `repo` | tên thư mục git root | |
| `harvest.runs` / `.model` / `.fillRetries` / `.maxInputTokens` / `.timeoutSec` | 1 / `haiku` / 1 / 150000 / 600 | |
| `rank.model` | `sonnet` | |
| `outsider.enabled` / `.model` | true / `sonnet` | |
| `scan.quietMinutes` | 30 | Bỏ qua phiên vừa ghi trong N phút |
| `scan.maxSessions` | 3 | Số phiên tối đa mỗi lần quét tự động |
| `scan.maxFailures` | 3 | Hỏng liền chừng ấy lần, file chưa đổi thì ngừng thử |
| `privacy.sources` | `[]` | Chỉ nhận từ cấu hình người dùng hoặc env, không từ `.momentry.json` |
| `privacy.allowFile` | `<box>/.privacy-allow` | Từ chung hay bị báo nhầm |
| `privacy.allowUnchecked` | false | Chỉ nhận từ cấu hình người dùng hoặc env |
| `lock.staleSec` | 3600 | |

Cách nhanh nhất, và là cách nên dùng trên Windows (PowerShell 5.1 làm hỏng đối số JSON truyền cho chương trình ngoài): `momentry config privacy-add "Tên" …` thêm tên vào `<thư mục cấu hình>/names.txt` (quyền 0600) và khai báo file đó. Nguồn chặn (`privacy.sources`) nhận ba loại: `{"type":"lines","path":"…"}` (mỗi dòng một tên), `{"type":"vault-titles","path":"<vault>"}` (tên file trong vault Obsidian), `{"type":"json-fields","path":"…","fields":["…"]}`.

## Hook trên Windows

`momentry init` ghi hook dạng `"…\momentry\bin\momentry.cmd" hook session-end`. Lệnh này chạy được từ cmd và Git Bash. Shell mà Claude Code và Codex dùng để chạy hook trên Windows native chưa được kiểm trên máy thật; nếu `hook.log` không có dòng `hook.spawned` sau một phiên, chạy `momentry doctor` và báo lỗi kèm kết quả.

## Gỡ

`momentry uninstall` (hoặc `sh install.sh --uninstall`) gỡ hook và `/bip` của momentry (chỉ mục của mình, có sao lưu), shim, thư mục cài và mục PATH (Windows). Cấu hình, cache, hộp chuyện và `.momentry.json` trong các repo được giữ; `--purge` xoá thêm cấu hình và cache.
