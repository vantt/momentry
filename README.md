# momentry

Nhặt chất liệu kể chuyện (build in public) từ chính các phiên làm việc với coding agent (Claude Code, Codex). Công cụ đọc transcript sau phiên, tìm những khoảnh khắc đáng kể (con số đổi, nguyên nhân bất ngờ, quyết định bị đảo, cách làm người ngoài muốn học), ghi mỗi chuyện một file markdown trong repo, rồi xếp hạng theo câu hook, sự giằng xé (tension) và mức ảnh hưởng tới việc chính (stakes). Ghi nhiều, lọc sau; người duyệt quyết định chuyện nào được kể.

*Picks build-in-public story material out of your Claude Code and Codex sessions: one markdown file per moment, ranked by hook, tension and stakes. Node only, no npm.*

- Đặc tả: [docs/prd.md](docs/prd.md). Mục lục tài liệu: [docs/README.md](docs/README.md).
- Bằng chứng thiết kế: [thí nghiệm 2026-11-03](docs/experiments/2026-11-03-harvest/README.md), [debate](docs/history/debate-2026-11-03.md).
- Trạng thái: DM.1–DM.6 có code và test (dữ liệu giả). Đã chạy thật một lần trên một phiên (28/28 điểm nóng, bắt đủ 8/8 chuyện người gắn nhãn đáng kể, 0,95 USD). Hook tự động và Codex chưa kiểm trên máy thật. Xem PRD mục 9.

## Bắt đầu nhanh

```sh
cd <repo muốn quan sát>
node <momentry>/bin/momentry.mjs init                 # bật quan sát repo này
# khai báo nguồn chặn riêng tư trong ~/.config/momentry/config.json (xem mục Cấu hình)
node <momentry>/bin/momentry.mjs scan --dry-run       # xem sẽ gom gì, không tốn tiền
node <momentry>/bin/momentry.mjs scan --max-sessions 1
node <momentry>/bin/momentry.mjs list --rank
node <momentry>/bin/momentry.mjs hooks --print --claude   # đoạn cấu hình hook để tự dán
```

Cần `claude` CLI đã đăng nhập; mỗi phiên cỡ 150k token tốn khoảng 1 USD.

## Chạy

Node ≥ 20, không npm, không `package.json`. Mọi import module có sẵn dùng tiền tố `node:`.

```sh
node bin/momentry.mjs <lệnh> [cờ]
```

## Lệnh

| Lệnh | Việc | Cờ |
|---|---|---|
| `init` | Tạo `.momentry.json` (`{}`) ở git root | `--repo DIR` |
| `list` | Bảng id, date, status, hook, tension, stakes, strength, hits | `--rank`, `--status S`, `--thread T`, `--session ID`, `--json`, `--box DIR` |
| `check` | Khuôn frontmatter, `id` khớp tên file, link không gãy, riêng tư | `--box DIR`, `--staged` |
| `harvest` | Bước 1–11 cho một phiên hoặc một file | `--session ID`, `--transcript FILE`, `--from-line N`, `--to-line N`, `--runs N`, `--no-outsider`, `--dry-run`, `--save-prompts DIR`, `--fake-llm DIR`, `--save-llm DIR`, `--blind`, `--repo DIR` |
| `scan` | Gom mọi phiên của repo chưa gom hết | `--repo DIR`, `--claude`, `--codex`, `--dry-run`, `--quiet-minutes N`, `--max-sessions N` (0 = không giới hạn), `--except ID`, `--auto` (hook dùng) |
| `hook <event>` | Gọi từ hook (`pre-compact`, `session-end`, `session-start`); tách nền, thoát 0 | `--codex` |
| `hooks --print` | In cấu hình hook và mẫu `/bip` (user tự dán) | `--claude`, `--codex` |
| `add` | Ghi một chuyện tay (cho `/bip`) | `--title`, `--note`, `--by human`, `--session ID` |
| `rescore` | Chấm lại chuyện `status: raw` của một phiên | `--session ID`, `--no-outsider`, `--fake-llm DIR` |
| `quarantine` | Liệt kê chuyện bị giữ ngoài repo; thả nếu qua kiểm | `--release ID`, `--repo DIR` |
| `reduce` | In văn bản rút gọn và điểm nóng | `--transcript FILE`, `--from-line N`, `--to-line N`, `--out DIR` |
| `ledger` | Xem hoặc quên một phiên trong sổ | `--show`, `--forget ID` |

Mã thoát: 0 xong; 1 sai cờ, sai cấu hình, repo không được quan sát, lệnh chưa triển khai; 2 `check` thấy lỗi khuôn hoặc vi phạm riêng tư; 3 bỏ qua kiểm riêng tư (không có nguồn chặn); 4 model lỗi hoặc thiếu file `--fake-llm`; 5 phiên đang bị khoá.

`check` không bao giờ trả 0 khi chưa kiểm được riêng tư.

`harvest`/`rescore`: 0 xong (kể cả `partial` chỉ vì thiếu điểm nóng sau gọi bù, hoặc có chuyện vi phạm bị giữ ngoài repo); 3 có chuyện giữ ngoài repo vì không có nguồn chặn; 4 mọi lần harvest hỏng (`failed`) hoặc một bước model hỏng sau khi gọi lại (`partial`, chuyện đã có vẫn được ghi); 5 phiên đang bị khoá. `add`: 2 vi phạm, 3 không có nguồn chặn (chuyện vào `quarantine`).

`--save-prompts DIR` giữ prompt (`<key>.prompt.txt`) và đầu ra thô của model (`<key>.json`) ở DIR thay cho `<cache>/runs/<phiên>/<ts>/`; với `--dry-run` không kèm `--fake-llm` chỉ ghi prompt harvest.

## Hook

`momentry hooks --print --claude` (hoặc `--codex`) in đoạn JSON và mẫu `/bip` để user tự dán; công cụ không sửa `~/.claude/settings.json` hay `~/.codex/*`. Hook `pre-compact`/`session-end` tách nền `harvest --transcript <transcript_path>`; `session-start` tách nền `scan --claude|--codex --auto --except <phiên>`. Tiến trình nền ghi kết quả vào `<cache>/hook.log` (không chép nội dung chuyện, lỗi chỉ ghi loại lỗi).

Quét tự động (`--auto`) có giới hạn chi phí: lần đầu chỉ đánh dấu mốc, các phiên cũ hơn mốc phải chạy tay `momentry scan`; mỗi lần quét gom tối đa `scan.maxSessions` phiên, mới nhất trước; phiên hỏng `scan.maxFailures` lần liền mà file không đổi thì ngừng thử. `--from-line`/`--to-line` không kéo `lastLine` lùi lại và không nhảy cóc.

## Cấu hình

Thứ tự: cờ > biến môi trường > `<repo>/.momentry.json` > `~/.config/momentry/config.json` > mặc định. Khoá lồng (`{"harvest": {"runs": 3}}`) hoặc có chấm (`{"harvest.runs": 3}`) đều nhận.

| Khoá | Mặc định |
|---|---|
| `box` | `docs/storytelling-material` (env `MOMENTRY_BOX`) |
| `repo` | tên thư mục git root |
| `harvest.runs` / `.model` / `.fillRetries` / `.maxInputTokens` / `.timeoutSec` | 1 / `haiku` / 1 / 150000 / 600 |
| `rank.model` | `sonnet` |
| `outsider.enabled` / `.model` | true / `sonnet` |
| `scan.quietMinutes` | 30 |
| `scan.maxSessions` | 3 (số phiên tối đa mỗi lần quét tự động) |
| `scan.maxFailures` | 3 (hỏng liền chừng ấy lần, file chưa đổi thì quét ngừng thử) |
| `privacy.sources` | `[]`, chỉ từ cấu hình người dùng hoặc `MOMENTRY_PRIVACY_SOURCES` |
| `privacy.allowFile` | `<box>/.privacy-allow` |
| `privacy.allowUnchecked` | false, chỉ từ cấu hình người dùng hoặc `MOMENTRY_ALLOW_UNCHECKED=1` |
| `lock.staleSec` | 3600 |

`MOMENTRY_PRIVACY_SOURCES`: mảng JSON như trong cấu hình, hoặc danh sách đường dẫn phân cách `:` (mỗi đường dẫn thành nguồn `{"type":"lines"}`).

Biến khác: `MOMENTRY_CONFIG` (file cấu hình người dùng), `MOMENTRY_CACHE` (mặc định `~/.cache/momentry`, quyền 0700), `MOMENTRY_REPOS` (repo quan sát thêm, phân cách `:`), `MOMENTRY_FAKE_LLM`, `STORY_HARVEST=1` (hook thoát ngay).

Repo được quan sát khi có `.momentry.json` ở git root hoặc nằm trong `MOMENTRY_REPOS`.

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

## Test

```sh
node --test test/*.test.mjs
```

Chỉ dùng dữ liệu bịa trong `test/fixtures/`. Bộ `--fake-llm` của test đầu cuối nằm ở `test/fixtures/pipeline/`, sinh lại bằng `node test/fixtures/pipeline/make-fixtures.mjs`. Không test nào gọi `claude`. `contract.test.mjs` giữ tên và số tham số của mọi export công khai; `imports.test.mjs` cấm import ngoài `node:` và đường dẫn tương đối.

## Hợp đồng giữa các module

Mỗi module trong `lib/` có JSDoc là hợp đồng. Lỗi mang mã thoát gắn `err.exitCode`. Lệnh trong `pipeline.mjs` trả `{exitCode, message?}`; CLI in `message` ra stdout và thoát theo `exitCode`.
