# Phát triển momentry

Dành cho người sửa code. Người dùng đọc [README](../README.md).

## Chạy từ mã nguồn

Node ≥ 20, không npm, không `package.json`. Mọi import module có sẵn dùng tiền tố `node:`.

```sh
git clone https://github.com/vantt/momentry && cd momentry
node bin/momentry.mjs --help
```

Chạy từ mã nguồn thì `momentry init` cài hook dạng `"<node>" "<repo>/bin/momentry.mjs" hook …`. Nâng Node hay chuyển thư mục clone làm hook trỏ tới file không còn; `momentry doctor` báo và `momentry doctor --fix` sửa. Bản cài bằng installer không gặp chuyện này vì hook gọi shim.

## Test

```sh
node --test test/*.test.mjs        # đơn vị và tích hợp, chỉ dữ liệu bịa trong test/fixtures/
sh scripts/test-installer.sh       # vòng đời installer: cài, init, doctor, update, archive bị sửa, gỡ (HOME tạm)
sh scripts/test-agent-native.sh    # agent chỉ dùng --json đi tới doctor ok
```

Trên Windows: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-installer.ps1`. CI chạy cả ba với Node 20, 22, 24 ([.github/workflows/ci.yml](../.github/workflows/ci.yml)). Hiện CI và bước cài thử bản nháp của release chỉ chạy Linux, vì phút runner GitHub đã hết và chưa có runner Windows/macOS tự host; khi có, thêm lại dòng `windows`/`macos` vào ma trận.

### Runner tự host

Biến repo `MOMENTRY_SELF_HOSTED` liệt kê các OS chạy trên máy riêng, ví dụ `linux` hoặc `linux,windows,macos`. OS có trong biến chạy trên runner `[self-hosted, <os>]`; OS không có, hoặc khi chưa đặt biến, chạy trên runner của GitHub. Trên runner tự host, mỗi job dùng HOME/USERPROFILE, LOCALAPPDATA, APPDATA và npm prefix tạm dưới `$RUNNER_TEMP`, và không sửa PATH người dùng, nên job không đụng cấu hình thật của máy.

```sh
gh variable set MOMENTRY_SELF_HOSTED --body linux      # bật cho Linux
gh variable delete MOMENTRY_SELF_HOSTED                # trở về runner GitHub
gh api repos/vantt/momentry/actions/runners --jq '.runners[] | [.name, .status, (.labels|map(.name)|join(","))] | @tsv'
gh api -X POST repos/vantt/momentry/actions/runners/registration-token --jq .token   # token đăng ký, sống 1 giờ
```

Runner Linux chạy trong Docker; volume giữ đăng ký nên khởi động lại không cần token mới:

```sh
docker volume create momentry-runner-linux
TOKEN=$(gh api -X POST repos/vantt/momentry/actions/runners/registration-token --jq .token)
docker run -d --name momentry-runner-linux --restart unless-stopped \
  -v momentry-runner-linux:/home/runner/state -e TOKEN="$TOKEN" -e RUNNER_NAME="linux-$(hostname)-docker" \
  --entrypoint bash ghcr.io/actions/actions-runner:2.338.2 -c 'cd ~ && for f in .runner .credentials .credentials_rsaparams; do [ -f state/$f ] && cp state/$f .; done; if [ ! -f .runner ]; then ./config.sh --url https://github.com/vantt/momentry --token "$TOKEN" --name "$RUNNER_NAME" --labels linux,docker --unattended --replace && cp .runner .credentials .credentials_rsaparams state/; fi; unset TOKEN; exec ./run.sh'
# gỡ: docker rm -f momentry-runner-linux && docker volume rm momentry-runner-linux, rồi xoá runner offline trong Settings → Actions → Runners
```

#### Runner Windows

Runner chạy như Windows service dưới một tài khoản riêng `ghrunner`, không phải tài khoản làm việc hằng ngày: job chạy với quyền của tài khoản đó, gồm cả action bên thứ ba và gói npm, nên không được đọc được token, SSH key hay cấu hình host thật của bạn. Service chạy nền, không ảnh hưởng khi bạn đăng nhập và làm việc trên cùng máy, nhưng job làm máy nặng vài phút và dừng khi máy ngủ.

Cần: Windows 10/11 x64, quyền Administrator, Git for Windows (CI có bước `bash`), Node ≥ 20 (không có thì workflow tự tải). Tắt Sleep nếu muốn runner luôn nhận job.

1. Tạo tài khoản (PowerShell Administrator):
   ```powershell
   $pw = Read-Host -AsSecureString "Mật khẩu cho ghrunner"
   New-LocalUser ghrunner -Password $pw -PasswordNeverExpires -Description "GitHub Actions runner"
   Add-LocalGroupMember -Group Users -Member ghrunner
   ```
   Đăng nhập Windows bằng `ghrunner` một lần để tạo profile; muốn kiểm Antigravity thì cài và đăng nhập `agy` trong phiên này. Đăng xuất.
2. Tải runner (PowerShell Administrator, tài khoản của bạn). Lấy URL và sha256 của bản mới nhất ở [actions/runner releases](https://github.com/actions/runner/releases):
   ```powershell
   mkdir C:\actions-runner; cd C:\actions-runner
   Invoke-WebRequest https://github.com/actions/runner/releases/download/v2.338.2/actions-runner-win-x64-2.338.2.zip -OutFile runner.zip
   if ((Get-FileHash runner.zip -Algorithm SHA256).Hash -ne 'a1f17aa987fc8158bc7521d284912267a0d01b7c2c4684b33c86783b5e8221cc') { throw 'sai checksum' }
   Expand-Archive runner.zip -DestinationPath .
   icacls C:\actions-runner /grant "ghrunner:(OI)(CI)M"
   ```
3. Lấy token đăng ký (sống 1 giờ): `gh api -X POST repos/vantt/momentry/actions/runners/registration-token --jq .token`, hoặc Settings → Actions → Runners → New self-hosted runner.
4. Đăng ký và cài service:
   ```powershell
   .\config.cmd --url https://github.com/vantt/momentry --token <TOKEN> `
     --name "windows-$env:COMPUTERNAME" --labels windows,agy --unattended `
     --runasservice --windowslogonaccount "$env:COMPUTERNAME\ghrunner" --windowslogonpassword "<mật khẩu ghrunner>"
   Get-Service actions.runner.*    # Running
   ```
   Nhãn `agy` chỉ thêm khi `ghrunner` đã đăng nhập `agy`.
5. Bật: thêm `{os: windows-2025, label: windows, ...}` vào ma trận `ci.yml` và dòng `windows` trong smoke của `release.yml`, rồi `gh variable set MOMENTRY_SELF_HOSTED --body linux,windows`.

Chỉ chạy runner khi cần: `Set-Service actions.runner.* -StartupType Manual`, rồi `Start-Service`/`Stop-Service`. Gỡ: `.\config.cmd remove --token <REMOVE_TOKEN>` (token lấy bằng `gh api -X POST repos/vantt/momentry/actions/runners/remove-token --jq .token`), xoá `C:\actions-runner` và tài khoản `ghrunner`.

Cài dưới tài khoản của chính bạn cũng được (bỏ bước 1, bỏ `--windowslogonaccount`/`--windowslogonpassword` hoặc chạy `.\run.cmd` thay service), nhưng mọi job khi đó có toàn quyền của bạn; chỉ nên làm trên máy phụ hoặc máy ảo dành cho CI.

#### Runner macOS

Settings → Actions → Runners → New self-hosted runner (macOS), nhãn `macos`, chạy `./svc.sh install && ./svc.sh start` dưới một tài khoản thường riêng.

Runner chạy dưới tài khoản thường, không phải Administrator/root. Chỉ dùng runner tự host khi repo còn private, hoặc khi đã chặn workflow chạy từ PR của fork.

Bộ `--fake-llm` của test đầu cuối nằm ở `test/fixtures/pipeline/`, sinh lại bằng `node test/fixtures/pipeline/make-fixtures.mjs`. Không test nào gọi `claude` thật; `test/fixtures/fake-claude/claude` đứng thay khi cần. `contract.test.mjs` giữ tên và số tham số của mọi export công khai; `imports.test.mjs` cấm import ngoài `node:` và đường dẫn tương đối; `commands.test.mjs` giữ bảng lệnh, handler và tài liệu khớp nhau.

Sửa `lib/commands.mjs` thì sinh lại tham chiếu lệnh:

```sh
node scripts/gen-cli-reference.mjs
```

## `--fake-llm DIR`

Mỗi lời gọi model đọc `DIR/<key>.json`, đúng dạng đầu ra `claude -p --output-format json` (`result`, `total_cost_usd`, `is_error`, `duration_ms`). Thiếu file thì mã 4. `--save-llm DIR` ghi theo cùng tên (chỉ ghi ra ngoài repo).

| Key | Lời gọi |
|---|---|
| `harvest-c<k>-r<n>` | harvest, khúc k, lần chạy n (từ 1) |
| `harvest-fill-c<k>-r<n>-f<m>` | vòng gọi bù thứ m cho khúc k, lần chạy n |
| `cluster-<a>` | gộp cụm, lần gọi a (2 nếu gọi lại vì phân hoạch sai) |
| `outsider-<a>` | bước 9 |
| `hook-tension-<a>` | bước 7 |
| `stakes-<a>` | bước 8 |
| `angle-<k>` | bước 13 (góc kể), chuyện thứ k được chọn theo hạng; thiếu file trong `harvest` chỉ để chuyện đó chưa có góc kể, không đổi mã thoát |
| `profile-<n>` | bước 13, hồ sơ dự án thứ n của lần chạy (chỉ khi chưa có hoặc README/docs đã đổi); thiếu file thì góc kể viết không có hồ sơ, không đổi mã thoát |

Gọi lại vì JSON hỏng hay sai khuôn: thêm hậu tố `-retry` (ví dụ `harvest-c1-r1-retry`).

Bộ đo chất lượng và chi phí ([scripts/eval/](../scripts/eval/README.md)) dùng đúng cặp `--save-llm`/`--fake-llm` này: chụp đầu ra model của nhiều phiên một lần, rồi chạy lại 0 USD để đo mọi thay đổi xếp hạng, chấm điểm, rút gọn. Dữ liệu và nhãn nằm trong `docs/_private/eval/`, không commit.

`--save-prompts DIR` giữ prompt (`<key>.prompt.txt`) và đầu ra thô của model (`<key>.json`) ở DIR thay cho `<cache>/runs/<phiên>/<ts>/`; với `--dry-run` không kèm `--fake-llm` chỉ ghi prompt harvest.

## Thêm từ vựng điểm nóng

Từ vựng của bộ dò điểm nóng (câu chọn, phản đối, ngắt của chủ phiên bằng tiếng Việt và tiếng Anh; từ nối và từ chỉ khoảng của `metricPair`; lệnh git đảo lịch sử; đường dẫn bài học và cấu hình agent; thông báo bị chặn) nằm ở [`lib/rules/hotspots.json`](../lib/rules/hotspots.json), không trong code. Thuật toán, ngưỡng và nhãn tín hiệu vẫn ở `lib/hotspots.mjs`.

1. Sửa `lib/rules/hotspots.json`. Mỗi chuỗi là một mảnh regex JavaScript (thoát `. ( ) ? *` khi muốn ký tự thật), không mở nhóm bắt (dùng `(?:…)`), chữ Việt ở dạng NFC. Danh sách chia theo ngôn ngữ (`vi`, `en`); thêm ngôn ngữ thì thêm khoá mới. Cờ regex do code đặt theo từng danh sách, ghi trong `$comment`.
2. `node --test test/hotspots-rules.test.mjs`: kiểm bảng (mảnh sai thì báo đúng tên mục, ví dụ `ownerVoice.choiceWords.vi[2]`), và so điểm nóng với bản dò cũ đóng băng (`test/fixtures/hotspots-legacy.mjs`) trên các mẫu, transcript fixture và transcript của bộ đo nếu máy có (`path:` trong `docs/_private/eval/labels/*.md`, hoặc `MOMENTRY_EVAL_LABELS=<thư mục nhãn>`). Khi bảng còn giống bảng mặc định thì điểm nóng phải trùng hoàn toàn; khi bạn cố ý thêm từ, test in ra những dòng đổi (`shipped table changes N detector outputs`) thay vì hỏng.
3. Đo trên bộ đề: `node scripts/eval/run.mjs --manifest docs/_private/eval/manifest.json` (chạy lại, 0 USD), hoặc so đầu ra `momentry reduce --transcript … --out DIR` trước và sau. Chỉ số không được tụt.

Bảng hỏng hay thiếu lúc chạy thì momentry báo một lần trên stderr và dùng bảng mặc định trong `lib/hotspots-default.mjs` (lưới an toàn, không cần chép theo mỗi lần thêm từ).

## Cài đặt

Mọi cài đặt đổi qua `momentry config` (CLI), kể cả cài đặt riêng từng dự án (`--project`). Không thêm cờ lẻ kiểu `init --box`; khoá mới đi vào `lib/config-schema.mjs` (chung) hoặc `PROJECT_KEYS` trong `lib/config-cmd.mjs` (riêng dự án). Giao diện web (`lib/ui-api.mjs`) gọi đúng các hàm ghi của `lib/config-cmd.mjs` (`write`, `setProjectBox`, `setProjectBudget`, `setPrivateProject`) và `Projects.setPaused`, không có bản ghi thứ hai, nên quy tắc như "khoá chỉ của máy không vào file repo" chỉ nằm một chỗ.

## Luật xếp hạng và từ vựng chuyện

Luật chọn nằm trong bảng ở `lib/rules/`, tra lúc chạy, không viết cứng trong code. Thư mục này nằm trong `lib/` để bản cài cũ (bộ giải nén chỉ nhận `bin/ lib/ prompts/ ui/`) vẫn `momentry update` lên được.

- [`lib/rules/rank.json`](../lib/rules/rank.json): thứ tự của `list --rank`, tường chuyện và N chuyện đầu được viết góc kể. Khuôn và nghĩa: [PRD 5.9](prd.md#59-xếp-hạng-bước-12).
- [`lib/rules/story-vocab.json`](../lib/rules/story-vocab.json): loại tension và tín hiệu harvest. `lib/prompts.mjs` điền `{tensions}` (`hook-tension.md`) và `{signals}` (`harvest.md`, `harvest-fill.md`); `validateHookTension` và tường chuyện (`TWISTS`) đọc cùng danh sách. Sửa `description` là sửa chữ model đọc.

Thêm hay đổi một luật xếp hạng:

1. Thêm hoặc sửa một dòng trong `tiers` hay `adjust`: `id` mới (a-z0-9_, không trùng), điều kiện chỉ dùng đặc trưng và phép so có sẵn (thiếu đặc trưng thì thêm vào `FEATURES` trong `lib/rank.mjs`, kèm test), `why` một câu, `evidence` là đường dẫn trong repo tới số đo (thường `docs/experiments/<ngày>-<tên>/README.md`).
2. Chạy bộ đo trên bản chụp, 0 USD: `node scripts/eval/run.mjs --manifest docs/_private/eval/manifest.json --out docs/_private/eval/new-defaults`, so với lần chạy trước khi đổi. **Không được tụt** `t` nửa trên, p@5, hạng-t trung bình; ghi số trước/sau vào bản ghi thí nghiệm mà `evidence` trỏ tới.
3. Đổi thứ tự mặc định là đổi hành vi: sửa `BUILTIN_TABLE` trong `lib/rank.mjs` cho khớp (test kiểm hai bảng giống nhau), sửa test thứ tự trong `test/rank.test.mjs` (khoá cũ ở đó chỉ là mốc của bảng hiện tại), ghi CHANGELOG.

Người dùng chỉ đổi trọng số (`rank.weights.<id>`) và tắt luật (`rank.disabled`), trong cấu hình người dùng. Đổi tên hay bỏ một `id` thì cấu hình cũ trỏ tới nó bị bỏ qua kèm cảnh báo, không làm hỏng lệnh.

## Hợp đồng giữa các module

Mỗi module trong `lib/` có JSDoc là hợp đồng. Lỗi mang mã thoát gắn `err.exitCode` (bảng mã ở `EXIT` trong `lib/config.mjs`). Lệnh trong `pipeline.mjs` trả `{exitCode, message?}`; `lib/cli.mjs` in `message` và thoát theo `exitCode`, hoặc gói vào phong bì `--json`.

| Module | Việc |
|---|---|
| `lib/commands.mjs` | Bảng lệnh duy nhất; sinh parser, `--help`, `help --json`, `docs/cli-reference.md` |
| `lib/cli.mjs` | Parse, gọi handler, in văn bản hoặc phong bì `{schema, ok, data, error, next}` |
| `lib/doctor.mjs`, `lib/checks.mjs` | Engine kiểm và sửa; `init` = các check `creates` + `doctor --fix` |
| `lib/hosts.mjs`, `lib/safe-edit.mjs` | Cài/gỡ hook, lệnh agent và skill; sửa JSON của host có sao lưu và kiểm đổi giữa chừng |
| `lib/projects.mjs` | Danh sách dự án trên máy (`projects.json`): UI đọc, `init` và lệnh hook thêm vào, hộp ngoài repo theo dự án, dấu tạm dừng gom chuyện |
| `lib/project-id.mjs` | Mã dự án từ commit gốc của git (giống nhau trên mọi máy, khoá của gu, số đo, hồ sơ) và mã checkout từ đường dẫn (URL và trạng thái của giao diện web); `<cache>/project-ids.json`; chuyển dữ liệu cũ khoá theo đường dẫn |
| `lib/metrics.mjs` | Số đo trên máy (`metrics.json`): thời gian từ cài tới chuyện đầu, tỉ lệ chuyện top 5 được Use; không gửi đi đâu |
| `lib/paths.mjs` | Mọi đường dẫn theo OS (nguồn duy nhất cho installer, update, uninstall, doctor) |
| `lib/install.mjs`, `lib/update.mjs`, `lib/uninstall.mjs`, `lib/tar.mjs` | Bố cục bản cài, shim, tự cập nhật, gỡ, đọc/ghi tarball |
| `lib/version.mjs` | Nguồn phiên bản duy nhất |

## Phát hành

Xem [release-runbook.md](release-runbook.md).
