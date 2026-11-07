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
| Danh sách dự án trên máy | `~/.config/momentry/projects.json` (quyền 0600) | `%APPDATA%\momentry\projects.json` |
| Cache (sổ, khoá, quarantine, `hook.log`, số đo `metrics.json`) | `~/.cache/momentry` (quyền 0700) | `%LOCALAPPDATA%\momentry\cache` |
| Hook, extension, lệnh và skill của các agent | xem [Host được hỗ trợ](#host-được-hỗ-trợ) | như cột bên trái, dưới `%USERPROFILE%` |

Linux tôn trọng `XDG_CONFIG_HOME`, `XDG_CACHE_HOME`, `XDG_DATA_HOME` khi là đường dẫn tuyệt đối. macOS dùng cùng bố cục `~/.config`, `~/.cache` như Linux (có chủ ý, giống đa số CLI dành cho dev).

Danh sách dự án (`projects.json`, khoá là git root) là nơi `momentry ui` tìm dự án. `init`, nút bật dự án trong giao diện và mọi lệnh hook gọi (`scan`, `harvest`) thêm repo đang quan sát vào đó; máy cài từ bản cũ được điền một lần từ sổ phiên và `MOMENTRY_REPOS`. Repo vẫn được quan sát nhờ `.momentry.json` hoặc `MOMENTRY_REPOS`, như trước. Thư mục dự án bị chuyển hay xoá vẫn nằm trong danh sách, được đánh dấu mất, cho tới khi bạn xoá dự án đó trong giao diện.

Tạm dừng gom chuyện cho một dự án mà không xoá `.momentry.json`: `momentry pause` trong repo (hoặc `--repo DIR`; lối tắt của `momentry config set paused true --project`), hay tắt công tắc "Gather stories" của dự án trong Settings. Dấu tạm dừng nằm trong `projects.json` của máy, nên repo clone về không tự dừng hay bật lại được. Khi tạm dừng, hook không chạy `scan`/`harvest` cho repo đó, `scan --auto` bỏ qua, dòng nhắc lúc mở phiên im lặng; chuyện cũ vẫn đọc được trong giao diện và CLI, còn `momentry scan`, `add` chạy tay vẫn làm (kèm một dòng báo đang tạm dừng). `momentry status` và `doctor` hiện trạng thái này như thông tin, không phải lỗi. `momentry resume` bật lại; phiên làm trong lúc tạm dừng không được gom tự động, muốn gom thì chạy tay `momentry scan`.

Số đo (`metrics.json` trong cache, quyền 0600) chỉ nằm trên máy, không gửi đi đâu: thời điểm cài, lúc có chuyện đầu tiên ở mỗi dự án, và mỗi lần bạn chọn Use, Later, Drop kèm hạng của chuyện lúc đó. File không chứa tên chuyện, id hay đường dẫn (dự án và chuyện chỉ là mã băm) và giữ tối đa 1000 quyết định gần nhất. Máy đã dùng momentry trước khi có số đo thì thời điểm cài ghi là không rõ, không đoán. Màn Cost của `momentry ui` và `momentry status --json` hiện hai số: thời gian từ cài tới chuyện đầu, và tỉ lệ chuyện được Use trong số chuyện bạn đã quyết khi chúng nằm trong top 5 (hiện từ 10 chuyện trở lên).

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

Mỗi host có hai lệnh: `momentry-bip` (đánh dấu khoảnh khắc vừa rồi, gọi `momentry add`) và `momentry-ui` (chạy `momentry ui`: mở giao diện web, hoặc in đường dẫn file để mở; mã truy cập nằm trong file, không bao giờ in ra). Tên cũ `/bip` đã bỏ; dùng `/momentry-bip` (`$momentry-bip` ở Codex). Ngoài ra là skill `momentry`: lúc thường chỉ tên và mô tả nằm trong context của agent; thân skill chỉ nạp khi bạn hỏi về chuyện ("tuần này có chuyện gì hay?", "viết chuyện X thành thread"), và nó chỉ bảo agent gọi `momentry list --rank --json`, `momentry show <id> --json`, `momentry mark <id> use|later|drop --json`. Bài nháp do chính agent của bạn viết, bằng model bạn đã trả; momentry không gọi model nào cho việc này.

| Host | Gọi lệnh | File lệnh | Skill `momentry` |
|---|---|---|---|
| Claude Code | `/momentry-bip`, `/momentry-ui` | `<profile>/commands/{momentry-bip,momentry-ui}.md` | `<profile>/skills/momentry/SKILL.md` |
| Codex | `$momentry-bip`, `$momentry-ui` (hoặc chọn trong `/skills`) | skill `~/.agents/skills/{momentry-bip,momentry-ui}/SKILL.md` kèm `agents/openai.yaml` (`allow_implicit_invocation: false`) | `~/.agents/skills/momentry/SKILL.md` |
| pi | `/momentry-bip`, `/momentry-ui` | `<profile>/prompts/{momentry-bip,momentry-ui}.md` | `~/.agents/skills/momentry/SKILL.md` (gọi tay: `/skill:momentry`) |
| omp (oh-my-pi) | `/momentry-bip`, `/momentry-ui` | `<profile>/commands/{momentry-bip,momentry-ui}.md` | `<profile>/skills/momentry/SKILL.md` |
| Antigravity | `/momentry-bip`, `/momentry-ui` | skill `<profile>/config/skills/{momentry-bip,momentry-ui}/SKILL.md` (`disable-model-invocation: true`) | `<profile>/config/skills/momentry/SKILL.md` |

`~/.agents/skills` là thư mục Agent Skills dùng chung: mọi profile Codex và mọi profile pi đều đọc nó, nên momentry đặt skill của hai host này ở đó đúng một lần. Vì vậy không host nào thấy cùng một skill hai lần:

- Codex coi `$CODEX_HOME/skills` là chỗ cũ (deprecated). Từ bản này momentry không ghi vào đó nữa.
- pi đọc cả `<profile>/skills` lẫn `~/.agents/skills` và cảnh báo khi một tên có ở cả hai, nên momentry không đặt bản riêng trong profile pi. Trong `/skill:` của pi còn thấy `momentry-bip` và `momentry-ui` của Codex; hai skill này chỉ chạy khi gọi tên (`disable-model-invocation: true`).
- omp chỉ đọc `~/.agents/skills` (và `~/.claude/skills`) khi bạn bật trong cài đặt của omp, và khi đó bỏ qua bản trùng y hệt. momentry giữ bản trong profile omp; nội dung skill `momentry` giống nhau từng byte ở mọi host.
- Claude Code và Antigravity không đọc `~/.agents/skills`.

Gỡ một host (`momentry connect codex --remove`) để nguyên `~/.agents/skills/momentry` khi host kia (pi) vẫn đang kết nối; host cuối cùng gỡ thì xoá. `momentry uninstall` xoá hết.

Codex từ 0.117 bỏ hẳn custom prompt (`~/.codex/prompts`), nên ở Codex hai lệnh là skill, gọi bằng `$tên`.

**Máy đã cài bản cũ.** `momentry update` (qua `doctor --fix`, không hỏi lại), `momentry doctor --fix` và `momentry connect` dọn ở mọi profile đã kết nối: thêm file mới; xoá bí danh `/bip` (`commands/bip.md`, `prompts/bip.md`, `config/skills/bip/`), `~/.codex/prompts/bip.md`, skill trong `~/.codex/skills` và mỗi `~/.codex-*/skills`, và `~/.pi/agent/skills/momentry` (pi đọc bản trong `~/.agents/skills`). Chỉ xoá file momentry ghi mà bạn chưa sửa. File bạn đã sửa thì được giữ. Nếu một skill bạn đã sửa vẫn nằm ở chỗ cũ, `momentry doctor` báo rằng host sẽ thấy skill đó hai lần; xoá nó, hoặc gộp phần bạn sửa vào bản mới. Profile chưa kết nối vẫn cần `momentry connect --yes`.

### Dòng nhắc lúc mở phiên

Khi bạn mở một phiên agent trong repo đang được quan sát, hook `SessionStart` (pi, omp: sự kiện `session_start` của extension) in một dòng, ví dụ:

```text
momentry: 3 chuyện mới (/momentry-ui) · 2 phiên chờ ngân sách ngày (momentry scan) · 1 lỗi cần sửa (momentry doctor)
```

- **chuyện mới**: chuyện trạng thái `raw` trong hộp của repo đó mà bạn chưa mở trong `momentry ui`.
- **phiên chờ ngân sách**: phiên của repo đó mà lần quét tự động hôm nay chưa gom vì hết ngân sách ngày.
- **lỗi cần sửa**: kiểm nhanh, chỉ đọc file: cấu hình, nguồn chặn riêng tư, hộp chuyện, quyền cache, kết nối của chính host đó (hook, lệnh, skill), và shim `momentry` của bản cài (hook và lệnh agent gọi nó; mất thì chạy lại lệnh cài, hoặc `momentry doctor --fix`, để ghi lại). Chỉ đếm cái có cách sửa; `momentry doctor` cho biết chi tiết. Dòng nhắc không kiểm PATH, vì trong hook PATH là của agent, không phải của bạn.

Mỗi phần chỉ hiện khi khác 0. Khi không có gì để nói, hook không in gì (Antigravity nhận `{}`). Dòng nhắc chỉ nói về repo của phiên, không gọi mạng hay model, và chạy trong khoảng 50 ms. Mọi lỗi được nuốt (ghi vào `hook.log`), nên phiên luôn mở được. Sau compact (Claude, Codex) hay `/reload` (pi, omp), hook không nhắc lại.

| Host | Cách dòng nhắc tới | Ai thấy |
|---|---|---|
| Claude Code | JSON: `systemMessage` và `hookSpecificOutput.additionalContext` | bạn, và agent (một dòng trong context) |
| Codex | như Claude Code; tên lệnh là `$momentry-ui` | bạn, và agent |
| pi, omp | extension đọc dòng in ra và gọi `ctx.ui.notify` | chỉ bạn (không vào context) |
| Antigravity | `injectSteps` với `systemMessage` và `metadata.user_markdown` | bạn, và agent |

Máy đã cài bản cũ không cần làm gì thêm cho Claude Code, Codex và Antigravity: hook `SessionStart` đã có sẵn. Extension pi/omp được viết lại khi chạy `momentry update` (hoặc `momentry doctor --fix`).

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

Installer chỉ tải qua HTTPS, kiểm sha256 của archive theo đúng tên trong `checksums.txt`, từ chối archive có link hay file ngoài `bin/ lib/ prompts/ ui/`, chạy thử bản mới trước khi đổi `current`, và không ghi đè một `momentry` không do nó cài. Chữ ký (cosign) chưa có; installer nói rõ "chưa kiểm chữ ký".

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

Mọi cài đặt đổi bằng một lệnh, `momentry config` (giao diện web ghi qua đúng các hàm đó). `momentry config default` in mọi khoá và giá trị mặc định; `momentry config show` in giá trị đang dùng kèm nơi đặt nó. Không có `--project`, `set`/`unset` sửa cấu hình người dùng, chung mọi dự án.

### Cài đặt riêng từng dự án

Thêm `--project` để xem và đổi cài đặt của repo đang đứng (hoặc `--repo DIR`). `show --project` in từng khoá kèm nơi đặt: `repo` (`.momentry.json`), `dự án trên máy này`, `người dùng`, `mặc định` hoặc biến env.

| Khoá | Ghi vào | Ghi chú |
|---|---|---|
| `box` | trong repo: `.momentry.json` (đường dẫn tương đối); ngoài repo: `projects.json` của máy | Thư mục chuyện. Đường dẫn tương đối tính từ git root; ngoài repo phải là đường dẫn tuyệt đối (`~` được mở). Không nhận `.`, `..`, chính repo hay thư mục chứa repo. `unset` gỡ cái riêng nhất trước: thư mục của máy, rồi tới `.momentry.json` |
| `repo` | `.momentry.json` | Tên dự án ghi trên chuyện |
| `budget.dailyUsd` | cấu hình người dùng (`budget.projects`, khoá là git root) | Ngân sách mỗi ngày riêng của dự án; chưa đặt thì chỉ ngân sách chung giới hạn |
| `private` | cấu hình người dùng (`privacy.privateProjects`) | Chế độ riêng tư: chuyện của dự án không vào bản nháp và nhãn dùng chung |
| `paused` | `projects.json` của máy | Tạm dừng gom chuyện; `momentry pause` / `resume` là lối tắt |

Đặt `box` trong repo, `repo` hay `paused true` cần repo đã `momentry init`; config không tự bật repo. Ba khoá cuối và thư mục chuyện ngoài repo chỉ nằm trên máy: `.momentry.json` có ghi `paused`, `private` hay `budget` cũng bị bỏ qua, nên repo clone về không tự dừng, tự tắt riêng tư hay nâng ngân sách được.

```sh
momentry config set box ~/Documents/momentry-chuyen --project   # thư mục chuyện ngoài repo, chỉ trên máy này
momentry config set budget.dailyUsd 1 --project
momentry config show --project --json
momentry config unset box --project --dry-run
```

### Mọi khoá

| Khoá | Mặc định | Ghi chú |
|---|---|---|
| `box` | `docs/storytelling-material` | Tương đối với git root. Hộp ngoài repo chọn cho một dự án (`config set box … --project` hoặc giao diện) chỉ nằm trong danh sách dự án, thắng `.momentry.json`; env và cờ vẫn thắng nó |
| `repo` | tên thư mục git root | |
| `budget.dailyUsd` | 3 | Ngân sách mỗi ngày (USD) cho phiên gom tự động, chung mọi dự án; 0 là không giới hạn. Chỉ nhận từ cấu hình người dùng |
| `harvest.runs` / `.model` / `.fillRetries` / `.maxInputTokens` / `.timeoutSec` | 1 / `haiku` / 1 / 150000 / 600 | |
| `rank.model` | `sonnet` | |
| `rank.weights.<id>` / `rank.disabled` | không / `[]` | Đổi trọng số hoặc tắt một luật xếp hạng theo id trong [`lib/rules/rank.json`](../lib/rules/rank.json), ví dụ `momentry config set rank.weights.stakes 2`, `momentry config set rank.disabled '["outsider_only_unscored"]'`. Chỉ đổi thứ tự, không ẩn chuyện; không thêm điều kiện mới được. Chỉ đặt trong cấu hình người dùng |
| `outsider.enabled` / `.model` | true / `haiku` | `sonnet` đọc kỹ hơn nhưng tốn gấp ~8 lần ở bước này, không thấy hơn trên bộ đo ([số đo](experiments/2026-11-05-cost-cuts/README.md)) |
| `angle.enabled` / `.model` / `.topN` | true / `haiku` / 10 | Cốt truyện và góc kể cho N chuyện đầu bảng của mỗi phiên sau khi xếp hạng, mỗi chuyện một lần gọi (~0,003 USD với `haiku`). `sonnet` tốn ~13 lần, chưa thấy hơn ([số đo](experiments/2026-11-05-angle/README.md), [cốt truyện](experiments/2026-11-05-story-spine/README.md)). `momentry angle` làm bù cho chuyện cũ |
| `angle.profileModel` | `haiku` | Viết hồ sơ dự án 3–5 câu từ README và `docs/` (mỗi dự án một lần, ~0,002 USD), để góc kể mở bằng bối cảnh. File ở `<cache>/profiles/`, sửa tay được: momentry giữ bản bạn sửa. Xoá file để viết lại |
| `llm.promptCache` | `off` | `off`: mỗi prompt tính một lần như input thường (prompt không bao giờ được đọc lại); `5m` / `1h`: trả thêm để cache; `auto`: để Claude Code tự chọn (1 giờ với gói thuê bao) |
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

`momentry uninstall` (hoặc `sh install.sh --uninstall`) gỡ hook, lệnh agent và skill (cả trong `~/.agents/skills`, bí danh `/bip` cũ và chỗ cũ `~/.codex*/skills`; chỉ file của mình mà bạn chưa sửa, có sao lưu), shim, thư mục cài và mục PATH (Windows). Cấu hình, cache, hộp chuyện và `.momentry.json` trong các repo được giữ; `--purge` xoá thêm cấu hình và cache.
