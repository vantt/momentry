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

Trên Windows: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-installer.ps1`. CI chạy cả ba trên Linux, macOS, Windows với Node 20, 22, 24 ([.github/workflows/ci.yml](../.github/workflows/ci.yml)).

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

Windows và macOS: Settings → Actions → Runners → New self-hosted runner, thêm nhãn `windows` hoặc `macos`. Runner chạy dưới tài khoản thường, không phải Administrator/root. Chỉ dùng runner tự host khi repo còn private, hoặc khi đã chặn workflow chạy từ PR của fork.

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

Gọi lại vì JSON hỏng hay sai khuôn: thêm hậu tố `-retry` (ví dụ `harvest-c1-r1-retry`).

`--save-prompts DIR` giữ prompt (`<key>.prompt.txt`) và đầu ra thô của model (`<key>.json`) ở DIR thay cho `<cache>/runs/<phiên>/<ts>/`; với `--dry-run` không kèm `--fake-llm` chỉ ghi prompt harvest.

## Hợp đồng giữa các module

Mỗi module trong `lib/` có JSDoc là hợp đồng. Lỗi mang mã thoát gắn `err.exitCode` (bảng mã ở `EXIT` trong `lib/config.mjs`). Lệnh trong `pipeline.mjs` trả `{exitCode, message?}`; `lib/cli.mjs` in `message` và thoát theo `exitCode`, hoặc gói vào phong bì `--json`.

| Module | Việc |
|---|---|
| `lib/commands.mjs` | Bảng lệnh duy nhất; sinh parser, `--help`, `help --json`, `docs/cli-reference.md` |
| `lib/cli.mjs` | Parse, gọi handler, in văn bản hoặc phong bì `{schema, ok, data, error, next}` |
| `lib/doctor.mjs`, `lib/checks.mjs` | Engine kiểm và sửa; `init` = các check `creates` + `doctor --fix` |
| `lib/hosts.mjs`, `lib/safe-edit.mjs` | Cài/gỡ hook và `/bip`; sửa JSON của host có sao lưu và kiểm đổi giữa chừng |
| `lib/paths.mjs` | Mọi đường dẫn theo OS (nguồn duy nhất cho installer, update, uninstall, doctor) |
| `lib/install.mjs`, `lib/update.mjs`, `lib/uninstall.mjs`, `lib/tar.mjs` | Bố cục bản cài, shim, tự cập nhật, gỡ, đọc/ghi tarball |
| `lib/version.mjs` | Nguồn phiên bản duy nhất |

## Phát hành

Xem [release-runbook.md](release-runbook.md).
