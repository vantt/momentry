# Changelog

Định dạng theo [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); phiên bản theo [SemVer](https://semver.org/). Mục của mỗi bản là ghi chú phát hành trên GitHub.

## [Unreleased]

### Added

- **Góc kể** cho chuyện: sau khi xếp hạng, 10 chuyện đầu bảng của phiên (chưa có góc kể) được viết một đến ba câu nói điều người ta tưởng, điều hoá ra đúng và vì sao người nghe nên quan tâm, kèm ai muốn nghe. Model đọc file chuyện và vài dòng transcript quanh các dòng của chuyện (không đọc cả phiên), phải dẫn số dòng làm bằng chứng, không được bịa; không có chỗ ngoặt thật thì ghi `angle: none`. Ghi vào frontmatter (`angle`, `audience`) và dòng `**Góc kể:**` dưới tiêu đề, qua cùng cổng riêng tư như mọi chữ khác của chuyện; lần gom sau gộp vào chuyện không đổi góc kể đã có. Tường chuyện và trang đọc lấy góc kể làm dòng chính, tiêu đề sự kiện thành dòng phụ. Khoảng 0,03 USD mỗi phiên với `haiku`, kể cả xương chuyện bên dưới ([số đo](docs/experiments/2026-11-05-angle/README.md), [xương chuyện](docs/experiments/2026-11-05-story-spine/README.md)). Khoá mới `angle.enabled`, `angle.model` (mặc định `haiku`), `angle.topN` (mặc định 10).
- **Mã chuyện** `M-XXXX` (4 ký tự Crockford base32, tính từ id) để gọi nhanh một chuyện trong CLI, giao diện web, chat và link `[[M-XXXX]]` của Obsidian. Id và tên file không đổi. Chuyện mới được ghi `code` và `aliases: [M-XXXX]` trong frontmatter; chuyện cũ chưa có mã vẫn có mã (tính ra), `momentry check --fix` ghi mã vào file mà không mã nào đổi. `show`, `mark`, `angle --story` và giao diện web nhận cả mã, hoa thường đều được, `M-` có thể bỏ (`momentry show 7k3q`). `list` có thêm cột `code` (cả trong `--json`); thẻ chuyện, trang chuyện và trang duyệt nhãn của bộ đo hiện mã. `check` báo hai file ghi cùng một mã. Luật tính và luật khi trùng: [PRD 6.6](docs/prd.md#66-định-dạng-hộp).
- Lệnh `momentry angle [--top N] [--story ID] [--force]` viết góc kể cho chuyện đã có trong hộp (`--dry-run` xem trước và ước tính chi phí).
- Trang đọc chuyện của giao diện web có nút **Write the angle** cho chuyện chưa có góc kể (chuyện dưới 10 chuyện đầu của phiên), và **Try again** cho chuyện bị chấm `none`: chạy `momentry angle --story` cho riêng chuyện đó, khoảng 0,004 USD và 25 giây. Trang duyệt nhãn của bộ đo có nút tương tự, ghi góc kể mới vào bản chụp.
- **Xương chuyện** cho góc kể: model điền bảy ô (bối cảnh, muốn gì, vướng gì, tưởng là… hoá ra…, làm gì, giờ thì sao, người nghe dùng được gì), mỗi ô kèm số dòng làm bằng chứng hoặc để trống khi không có gì đỡ được. Ghi vào frontmatter (`spine_<ô>`, `spine_<ô>_lines`) cùng `completeness` (số ô đã điền, 0–7); dòng `**Góc kể:**` giữ như cũ. Góc kể giờ dài 2–4 câu và câu đầu luôn là bối cảnh, để người chưa biết dự án hiểu ngay ([số đo](docs/experiments/2026-11-05-story-spine/README.md)).
- **Hồ sơ dự án**: mỗi dự án một lần gọi model rẻ (khoá mới `angle.profileModel`, mặc định `haiku`) đọc README, PRD, vision, requirements, AGENTS.md, CLAUDE.md, GEMINI.md, ANTIGRAVITY.md ở gốc repo và `docs/`, viết 3–5 câu: dự án là gì, cho ai, ràng buộc chính, mục tiêu hiện tại. Lưu ở `<cache>/profiles/`, sửa tay được: momentry chỉ viết lại khi các tài liệu đó đổi và bạn chưa sửa file. Không có tài liệu thì không có hồ sơ. Hồ sơ chứa tên riêng tư thì không được dùng.
- Góc kể đọc thêm **yêu cầu của chủ phiên**: yêu cầu đầu phiên và các yêu cầu gần nhất trước chuyện (bỏ câu kiểu "tiếp tục", "ok", "commit push"), dẫn số dòng được như trích đoạn.
- Trang duyệt của bộ đo hiện xương chuyện, góc kể cũ cạnh góc kể mới, và thêm câu hỏi "Đọc xong hiểu được, không cần hỏi thêm?" (có / không) lưu cạnh nhãn kiểm góc kể. Bộ đo có `--rank-by completeness` để đo thứ tự theo số ô đã điền; thứ tự mặc định của sản phẩm không đổi.
- **Luật xếp hạng thành bảng** [`rules/rank.json`](rules/rank.json), tra lúc chạy: tầng theo thứ tự, điều chỉnh điểm trong tầng, tiebreak; mỗi luật có id, lý do và đường dẫn tới số đo. Thứ tự không đổi (test so với khoá cũ; bộ đo chạy lại trên 8 phiên ra đúng số cũ). `momentry list --rank --json` có trường `why` (tầng và điểm của từng điều chỉnh). Khoá mới `rank.weights.<id>` và `rank.disabled` (chỉ cấu hình người dùng) đổi trọng số hoặc tắt một luật; bảng hỏng thì báo lỗi nêu tên luật và dùng bảng có sẵn. Danh sách tension và tín hiệu harvest cũng thành một bảng chung [`rules/story-vocab.json`](rules/story-vocab.json) cho prompt, validate và giao diện; prompt model đọc không đổi một byte. Archive phát hành có thêm thư mục `rules/`.
- Giao diện web nghe cả địa chỉ Tailscale của máy (mặc định bật), để điện thoại hoặc máy khác trong tailnet mở được; `momentry ui --remote` in link có mã truy cập. Vẫn cần mã truy cập; chỉ nhận tên `*.ts.net`, tên máy và IP Tailscale. Tắt: `momentry config set ui.tailscale false` (chỉ đặt trong cấu hình người dùng).

### Changed

- Điểm nóng bắt đúng chỗ hơn, để harvest bớt chuyện rác và thấy quyết định của người dùng ([số đo](docs/experiments/2026-11-05-material-signals/README.md), 4 phiên thật):
  - Loại mới `ownerVoice`: người dùng chọn phương án ("A", "đồng ý phương án 2"), phản đối hoặc thúc ("sao lại", "lâu quá"), ngắt, từ chối lệnh tool, hoặc trả lời ngắn sau một đoạn agent tự chạy dài. Chỉ có trên Claude.
  - Loại mới `lessonWrite`: ghi vào memory, bản ghi quyết định, `journals/`, `CHANGELOG`, kể cả qua shell (`>`, `tee`, heredoc, `cp`, `mv`). `metaWrite` giữ phần cấu hình agent.
  - Loại mới `blocked`: lệnh bị hook, quyền hoặc sandbox chặn tách khỏi `nonzeroExit`.
  - `metricPair` bỏ khoảng số ("rows 0 to 190") và đọc số Việt ("4 301", "8,3%"): 216 xuống 51 lượt bắt. `gitReversal` bỏ `checkout --detach`, `rebase` thường lên upstream, `checkout -- <lockfile>` và chữ trong heredoc: 109 xuống 52.
- Thứ tự của `list --rank` và tường chuyện: chuyện chỉ bước người ngoài tìm ra (không lần harvest nào bắt được) xếp cuối; stakes và strength được cộng thay vì nhân, nên một trục bằng 0 không còn xoá trục kia (chuyện không có giằng xé nhưng stakes cao giờ đứng trên các chuyện không giằng xé khác). Trên 8 phiên chạy lại: chuyện đáng kể ở nửa trên 21/30 → 23/30, hạng trung bình 6,41 → 5,79 ([bản ghi](docs/experiments/2026-11-05-ranking/README.md)).
- Gom chuyện rẻ hơn khoảng 3 lần (đo trên 8 phiên: 0,83 xuống 0,26 USD mỗi phiên), chất lượng xếp hạng không giảm. Chi tiết: [số đo](docs/experiments/2026-11-05-cost-cuts/README.md).
  - Bước người ngoài dùng `haiku` thay `sonnet` (`outsider.model`). Muốn như cũ: `momentry config set outsider.model sonnet`.
  - Không trả phí ghi cache prompt nữa: mỗi prompt chỉ gửi một lần, nên mọi lời gọi model chạy với cache tắt (khoá mới `llm.promptCache`, mặc định `off`; `auto` để Claude Code tự chọn như trước).
- `--dry-run` ước tính chi phí theo giá đo được của từng model (kể cả giá cao hơn của `haiku` khi prompt quá 100k token) và theo từng khúc; trước đây ước tính thấp khoảng 1,5 lần.

### Fixed

- Harvest không còn mất mọi chuyện của một cửa sổ khi model trả lời một điểm nóng bằng id lạ: câu trả lời đó bị bỏ và điểm nóng được hỏi lại ở vòng gọi bù.
- `momentry angle` ghi chi phí (góc kể và hồ sơ dự án) vào sổ, nên ngân sách ngày (`budget.dailyUsd`) và trang chi phí tính cả nó; trước đây chỉ bước góc kể chạy trong lúc gom mới được tính. Lệnh cũng giữ khoá của phiên như các lệnh ghi khác: phiên đang được gom thì chuyện của nó được bỏ qua và báo mã 5.

## [0.3.0] - 2026-11-05

### Changed (cần làm khi nâng cấp)

- Bỏ `/bip`. Lệnh mới ở mọi host: `/momentry-bip` (ghi khoảnh khắc) và `/momentry-ui` (mở giao diện); trên Codex gõ `$momentry-bip`, `$momentry-ui`. `momentry update` tự xoá file `/bip` cũ, trừ file bạn đã sửa.
- Skill của Codex nằm ở `~/.agents/skills` (dùng chung mọi profile Codex; pi cũng đọc ở đây). `update` chuyển bản cũ khỏi `~/.codex*/skills`.
- `.momentry.json` của repo không còn đặt được `budget.dailyUsd`: repo clone về không nâng được mức chi tiêu của bạn. Đặt trong cấu hình người dùng, hoặc `momentry config set budget.dailyUsd N --project`.

### Added

- **Giao diện web trên máy**: `momentry ui` mở tường chuyện, trang đọc và sửa chuyện, chuỗi chuyện, quyền riêng tư (tên chặn, chuyện bị giữ), chi phí, sức khoẻ, cài đặt và trình hướng dẫn lần đầu. Chạy ở 127.0.0.1 với mã truy cập mỗi lần mở, không gọi ra ngoài.
- Use / Later / Drop trên từng chuyện; tường tự đẩy lên vài bậc loại chuyện bạn hay dùng (nhãn "Your kind"), chỉ học trên máy.
- Ngân sách ngày cho lần đọc tự động (`budget.dailyUsd`, mặc định 3 USD) và ngân sách riêng từng dự án; phiên vượt ngân sách chờ sang ngày sau.
- Chế độ kín theo dự án: chuyện của dự án đó không bao giờ dùng cho bài nháp hay nhãn chia sẻ sau này.
- Danh sách dự án trên máy (`projects.json`): UI, `init` và hook dùng chung; máy cài cũ tự lấy dự án từ sổ phiên. Thư mục chuyện có thể đặt ngoài repo.
- Tạm ngừng gom chuyện theo dự án: `momentry pause` / `momentry resume`, hoặc công tắc trong Settings.
- `momentry config ... --project`: mọi thiết lập theo dự án (`box`, `budget.dailyUsd`, `private`, `paused`) qua một lệnh, cùng hàm ghi với UI.
- Skill `momentry` cho cả 5 host: hỏi agent "tuần này có chuyện gì hay?" hay "viết chuyện X thành thread", agent gọi `momentry list/show/mark --json`; bài nháp do agent của bạn viết. Lệnh mới `momentry show <id>` và `momentry mark <id> use|later|drop`.
- Dòng nhắc khi mở phiên agent: số chuyện mới, phiên chờ ngân sách, lỗi cần sửa, kèm đúng tên lệnh của host; im lặng khi không có gì.
- Số đo trên máy (màn Cost và `status --json`): thời gian từ cài tới chuyện đầu, tỉ lệ chuyện top 5 được Use. Không gửi đi đâu.

### Fixed

- Windows: hook đọc được dữ liệu bắt đầu bằng BOM (PowerShell 5.1 thêm vào khi pipe), trước đây dòng nhắc lúc mở phiên im lặng.

## [0.2.0] - 2026-11-03

### Added

- Host mới: **pi**, **omp (oh-my-pi)**, **Antigravity**. `momentry scan --pi|--omp|--agy` đọc transcript của chúng; `init`/`connect` cài extension `momentry.ts` cho pi/omp, hook `SessionStart` cho Antigravity và `/bip` cho cả ba.
- Cài và quét ở **mọi profile**: `~/.codex-*`, `~/.pi/accounts/*`, `~/.omp/profiles/*/agent`, `~/.agy-homes/*/.gemini`; `doctor` báo profile chưa cài.

- `momentry quarantine --release all`: kiểm lại mọi chuyện đang bị giữ, thả chuyện sạch vào hộp, chuyện còn vi phạm vẫn bị giữ (thoát 1 nếu còn chuyện bị giữ).

### Fixed

- Antigravity: hook ở profile `~/.agy-homes/*` truyền `--user-home` để momentry dùng home thật (cấu hình, nguồn chặn, cache, đăng nhập `claude`); phiên vừa mở không bị gom ngay lúc `SessionStart`.
- Codex trên Windows chạy hook bằng PowerShell, nên lệnh bắt đầu bằng đường dẫn trong dấu nháy không chạy; momentry ghi đường dẫn shim không nháy cho Codex.
- Id phiên Codex lấy 8 hex cuối của uuid (UUIDv7 làm hai phiên liên tiếp trùng 8 hex đầu); sổ tự chuyển khoá cũ theo đường dẫn transcript, không gom lại phiên đã gom.
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
