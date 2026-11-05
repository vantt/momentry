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
| Hook, extension, lệnh và skill của các agent | xem [Host được hỗ trợ](#host-được-hỗ-trợ) | như cột bên trái, dưới `%USERPROFILE%` |

Linux tôn trọng `XDG_CONFIG_HOME`, `XDG_CACHE_HOME`, `XDG_DATA_HOME` khi là đường dẫn tuyệt đối. macOS dùng cùng bố cục `~/.config`, `~/.cache` như Linux (có chủ ý, giống đa số CLI dành cho dev).

Shim tìm `node` trên PATH lúc chạy và đọc bản đang dùng từ `current`, nên nâng Node hay `momentry update` không làm hook hỏng. Hook trong `settings.json` gọi shim bằng đường dẫn tuyệt đối, nên vẫn chạy kể cả khi `~/.local/bin` chưa có trong PATH của Claude Code.

## Host được hỗ trợ

`momentry init` (và `momentry connect`) cài cho mọi host có trên máy, **ở mọi profile tìm thấy**: thư mục mặc định cùng các profile theo quy ước `~/.codex-*`, `~/.pi/accounts/*`, `~/.omp/profiles/*/agent`, `~/.agy-homes/*/.gemini`. `momentry doctor` báo profile mới chưa được cài; `momentry connect <host> --yes` cài bù. `momentry scan` đọc transcript ở mọi profile.

| Host | Gom tự động bằng | Transcript |
|---|---|---|
| Claude Code | hook `PreCompact`, `SessionEnd`, `SessionStart` trong `settings.json` | `projects/<cwd mã hoá>/<uuid>.jsonl` |
| Codex | hook `PreCompact`, `SessionEnd`, `SessionStart` trong `hooks.json` (Codex hỏi duyệt tin cậy hook mới) | `sessions/YYYY/MM/DD/rollout-*.jsonl` |
| pi | extension `extensions/momentry.ts` (sự kiện `session_start`, `session_before_compact`, `session_shutdown`) | `sessions/<cwd>/<ts>_<uuid>.jsonl` |
| omp (oh-my-pi) | extension `extensions/momentry.ts` (cùng file với pi) | `sessions/<cwd>/<ts>_<uuid>.jsonl` |
| Antigravity (`agy`, IDE) | hook `SessionStart` trong nhóm `"momentry"` của `config/hooks.json`; gom các phiên agy trước đó của repo | `antigravity-*/brain/<id>/.system_generated/logs/transcript_full.jsonl` |

### Lệnh agent và skill `momentry`

Mỗi host có hai lệnh: `momentry-bip` (đánh dấu khoảnh khắc vừa rồi, gọi `momentry add`) và `momentry-ui` (chạy `momentry ui`: mở giao diện web, hoặc in đường dẫn file để mở; mã truy cập nằm trong file, không bao giờ in ra). Tên cũ `/bip` được giữ làm bí danh một thời gian ở những host đã có nó. Ngoài ra là skill `momentry`: lúc thường chỉ tên và mô tả nằm trong context của agent; thân skill chỉ nạp khi bạn hỏi về chuyện ("tuần này có chuyện gì hay?", "viết chuyện X thành thread"), và nó chỉ bảo agent gọi `momentry list --rank --json`, `momentry show <id> --json`, `momentry mark <id> use|later|drop --json`. Bài nháp do chính agent của bạn viết, bằng model bạn đã trả; momentry không gọi model nào cho việc này.

| Host | Gọi lệnh | File lệnh (trong thư mục profile) | Skill `momentry` |
|---|---|---|---|
| Claude Code | `/momentry-bip`, `/momentry-ui`, `/bip` | `commands/{momentry-bip,momentry-ui,bip}.md` | `skills/momentry/SKILL.md` |
| Codex | `$momentry-bip`, `$momentry-ui` (hoặc chọn trong `/skills`) | skill `skills/{momentry-bip,momentry-ui}/SKILL.md` kèm `agents/openai.yaml` (`allow_implicit_invocation: false`) | `skills/momentry/SKILL.md` |
| pi | `/momentry-bip`, `/momentry-ui`, `/bip` | `prompts/{momentry-bip,momentry-ui,bip}.md` | `skills/momentry/SKILL.md` (gọi tay: `/skill:momentry`) |
| omp (oh-my-pi) | `/momentry-bip`, `/momentry-ui`, `/bip` | `commands/{momentry-bip,momentry-ui,bip}.md` | `skills/momentry/SKILL.md` |
| Antigravity | `/momentry-bip`, `/momentry-ui`, `/bip` | skill `config/skills/{momentry-bip,momentry-ui,bip}/SKILL.md` (`disable-model-invocation: true`) | `config/skills/momentry/SKILL.md` |

Codex từ 0.117 bỏ hẳn custom prompt (`~/.codex/prompts`, `/prompts:bip`), nên ở Codex hai lệnh là skill, gọi bằng `$tên`; `momentry connect` (và `momentry update`, qua `doctor --fix`) xoá `prompts/bip.md` cũ do momentry ghi. Skill Codex nằm ở `$CODEX_HOME/skills` (Codex vẫn đọc chỗ này bên cạnh `~/.agents/skills`), để mỗi profile `~/.codex-*` có bản riêng như hook. Máy đã cài bản cũ: `momentry update` (hoặc `momentry doctor --fix`) thêm các tên mới ở profile đã kết nối mà không hỏi lại; profile chưa kết nối vẫn cần `momentry connect --yes`.

Antigravity không có sự kiện kết thúc phiên hay trước compact, chỉ có `SessionStart` và `Stop` (chạy sau mỗi lượt và chặn agent). Theo quyết định 2026-11-03, momentry chỉ dùng `SessionStart`: một phiên agy được gom khi bạn mở phiên agy kế tiếp trong repo đó, hoặc khi chạy `momentry scan --agy`. Transcript của agy không có thư mục làm việc, nên momentry ghi chỉ mục `<cache>/agy-sessions.jsonl` lúc phiên mở; phiên mở trước khi cài momentry không được gom.

Profile Antigravity chạy agy với `HOME` riêng (`~/.agy-homes/<tài khoản>`), nên lệnh hook ở đó mang thêm `--user-home "<home thật>"`: momentry dùng cấu hình, nguồn chặn, cache và đăng nhập `claude` của home thật.

Đã kiểm với chương trình thật trên Linux (2026-11-03): pi 1.4.0 và omp 18.12.6 nạp extension và gọi hook (`session_start` → `scan`; với omp cả `session_shutdown` → `harvest` đọc transcript); Antigravity 1.4.4 với một tài khoản đã đăng nhập gọi hook `SessionStart`, chỉ mục ghi đúng phiên và thư mục repo, `--user-home` đưa momentry về home thật; phiên vừa mở không bị gom ngay (nó được gom ở lần mở phiên sau).

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

Mỗi host chạy lệnh hook bằng một shell khác nhau trên Windows, nên `momentry init` ghi lệnh theo host:

| Host | Shell chạy hook | Lệnh momentry ghi |
|---|---|---|
| Claude Code | Git Bash ([anthropics/claude-code#21878](https://github.com/anthropics/claude-code/issues/21878)) | `"C:/Users/<bạn>/AppData/Local/momentry/bin/momentry.cmd" hook session-end` |
| Codex | shell của phiên, mặc định PowerShell (`build_hooks_config` trong mã nguồn Codex) | `C:/Users/<bạn>/AppData/Local/momentry/bin/momentry.cmd hook session-end --codex` (không nháy; có khoảng trắng thì `momentry` theo tên) |
| pi, omp | extension gọi thẳng `cmd.exe` | (trong `momentry.ts`) |
| Antigravity | `cmd /c` | `"C:/…/momentry.cmd" hook session-start --agy` |

Lệnh `momentry-bip`, `momentry-ui` và skill `momentry` do agent tự chạy trong shell của nó (PowerShell là mặc định), nên gọi `momentry` theo tên; `install.ps1` đã thêm thư mục shim vào PATH.

Đã kiểm trên Windows thật (runner CI `windows-2025`, workflow `windows-hook-probe`, 2026-11-04): Claude Code gọi hook lúc mở và kết thúc phiên, `harvest` đọc được transcript; Codex v0.166, pi 1.5.0 và omp 18.16 gọi hook lúc mở phiên. Antigravity chưa chạy thật trên Windows vì cần một tài khoản đã đăng nhập (đã kiểm trên Linux). Nếu `hook.log` không có dòng `hook.spawned` sau một phiên, chạy `momentry doctor` và báo lỗi kèm kết quả.

## Gỡ

`momentry uninstall` (hoặc `sh install.sh --uninstall`) gỡ hook, lệnh agent (tên mới, bí danh `/bip` và tên cũ) và skill `momentry` (chỉ file của mình mà bạn chưa sửa, có sao lưu), shim, thư mục cài và mục PATH (Windows). Cấu hình, cache, hộp chuyện và `.momentry.json` trong các repo được giữ; `--purge` xoá thêm cấu hình và cache.
