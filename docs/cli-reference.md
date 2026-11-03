# Tham chiếu lệnh momentry

<!-- Sinh từ lib/commands.mjs bằng `node scripts/gen-cli-reference.mjs`. Đừng sửa tay. -->

Trợ giúp trong máy: `momentry --help`, `momentry <lệnh> --help`, `momentry help --json`.

## Cờ chung

| Cờ | Ý nghĩa |
|---|---|
| `--json` | in kết quả dạng JSON {schema,ok,data,error,next} ra stdout, kể cả khi lỗi |
| `-y`, `--yes` | đồng ý mọi thay đổi, không hỏi (bắt buộc khi không có TTY cho lệnh có thay đổi) |
| `--dry-run` | chỉ in sẽ làm gì, không ghi gì |
| `-q`, `--quiet` | bớt thông báo phụ trên stderr |
| `-v`, `--verbose` | thêm thông tin chẩn đoán trên stderr |
| `--no-color` | không dùng màu (cũng theo biến NO_COLOR) |
| `-c`, `--config FILE` | file cấu hình người dùng thay cho mặc định (như MOMENTRY_CONFIG) |
| `-h`, `--help` | trợ giúp của lệnh |

## Mã thoát

| Mã | Nghĩa |
|---|---|
| 0 | xong |
| 1 | lỗi, hoặc `check` thấy lỗi khuôn / vi phạm riêng tư, hoặc doctor còn check quan trọng chưa đạt |
| 2 | sai cú pháp lệnh hoặc cờ; thiếu `--yes` khi không có TTY |
| 3 | bỏ qua kiểm riêng tư vì chưa có nguồn chặn |
| 4 | model lỗi |
| 5 | phiên đang bị tiến trình khác khoá |
| 10 | `update --check`: có bản mới |

## JSON

Mọi lệnh nhận `--json` và in đúng một object ra stdout, kể cả khi lỗi:

```json
{"schema": 1, "ok": true, "data": {}, "error": null, "next": ["momentry …"]}
```

`error` khi lỗi: `{"code", "why", "fix"}`. `next` là các lệnh không tương tác nên chạy tiếp.

## Lệnh

### `momentry init`

Bật momentry cho repo này: tạo .momentry.json và hộp chuyện, cài hook + /bip cho Claude Code/Codex, rồi chạy doctor.

**Thay đổi:** <repo>/.momentry.json, thư mục hộp <repo>/docs/storytelling-material; ~/.claude/settings.json (khoá hooks), ~/.claude/commands/bip.md, ~/.codex/hooks.json, ~/.codex/prompts/bip.md (có sao lưu *.momentry-bak-*). Chạy lại không đổi gì nếu đã đủ.

**Cần:** git repo; Node ≥ 20; `claude` CLI đã đăng nhập; privacy.sources trong cấu hình người dùng (init chỉ cách khai báo nếu thiếu).

| Cờ | Ý nghĩa |
|---|---|
| `--repo DIR` | repo cần làm (mặc định: git root của thư mục hiện tại) |
| `--no-connect` | không cài hook và /bip cho Claude Code/Codex |

```sh
momentry init
momentry init --yes --json        # không hỏi, cho agent/CI
momentry init --dry-run           # xem sẽ thay đổi gì
momentry init --no-connect        # chỉ bật repo, không đụng ~/.claude
```

Mã thoát: 0 xong; 1 còn check chưa đạt (xem "sửa"; thường là thiếu privacy.sources); 2 sai cú pháp lệnh hoặc cờ.

Tiếp theo: momentry scan --max-sessions 1

### `momentry doctor`

Kiểm momentry có chạy được không: Node, git, claude, cấu hình, nguồn chặn riêng tư, repo, hộp, hook, bản cài. Chỉ đọc, trừ khi có --fix.

**Thay đổi:** không gì; với --fix: sửa cái đã có nhưng hỏng (quyền cache, khoá chết, hook dạng cũ). Không tạo repo/hộp mới (đó là việc của init).

| Cờ | Ý nghĩa |
|---|---|
| `--repo DIR` | repo cần làm (mặc định: git root của thư mục hiện tại) |
| `--fix` | sửa những gì sửa được rồi kiểm lại (tối đa 3 vòng) |

```sh
momentry doctor
momentry doctor --json            # cho agent: chạy mọi lệnh trong "fix"
momentry doctor --fix --yes
```

Mã thoát: 0 mọi check quan trọng đều đạt; 1 có check quan trọng chưa đạt; 2 sai cú pháp.

Tiếp theo: chạy lệnh ở cột "sửa" của từng check chưa đạt, rồi momentry doctor lại

### `momentry status`

Tóm tắt nhanh (không gọi claude) và đúng một lệnh nên chạy tiếp.

| Cờ | Ý nghĩa |
|---|---|
| `--repo DIR` | repo cần làm (mặc định: git root của thư mục hiện tại) |

```sh
momentry status
momentry status --json
```

Mã thoát: 0 ổn; 1 có việc cần làm (xem "tiếp"); 2 sai cú pháp.

### `momentry scan`

Gom mọi phiên Claude Code, Codex, pi, omp, Antigravity của repo chưa gom hết, ở mọi profile (bỏ qua phiên đang mở).

**Thay đổi:** <box>/*.md (chuyện mới hoặc gộp), <cache>/ledger.json, <cache>/runs/.

**Cần:** repo đã init; `claude` CLI; tốn ~1 USD cho phiên cỡ 150k token.

| Cờ | Ý nghĩa |
|---|---|
| `--repo DIR` | repo cần làm (mặc định: git root của thư mục hiện tại) |
| `--claude` | chỉ phiên Claude Code |
| `--codex` | chỉ phiên Codex |
| `--pi` | chỉ phiên pi |
| `--omp` | chỉ phiên omp (oh-my-pi) |
| `--agy` | chỉ phiên Antigravity |
| `--quiet-minutes N` | bỏ qua phiên có ghi trong N phút gần đây (mặc định: 30) |
| `--max-sessions N` | gom tối đa N phiên (0 = không giới hạn) |
| `--except ID` | bỏ qua phiên này |
| `--auto` | chế độ hook: giới hạn chi phí, lần đầu chỉ đánh dấu mốc |

```sh
momentry scan --dry-run            # xem sẽ gom gì, không tốn tiền
momentry scan --max-sessions 1
momentry scan --codex
```

Mã thoát: 0 xong; 1 lỗi; 2 sai cú pháp; 3 có chuyện giữ ngoài repo vì chưa có nguồn chặn; 4 model lỗi; 5 phiên đang bị khoá.

Tiếp theo: momentry list --rank

### `momentry list`

Bảng chuyện trong hộp: id, date, status, hook, tension, stakes, strength, hits.

| Cờ | Ý nghĩa |
|---|---|
| `--rank` | xếp theo độ mạnh |
| `--status S` | lọc theo status |
| `--thread T` | lọc theo thread |
| `--session ID` | lọc theo phiên |
| `--box DIR` | thư mục hộp |
| `--repo DIR` | repo cần làm (mặc định: git root của thư mục hiện tại) |

```sh
momentry list --rank
momentry list --status picked --json
```

Mã thoát: 0 xong; 1 không có hộp (chạy momentry init); 2 sai cú pháp.

### `momentry add`

Ghi một chuyện tay (lệnh /bip gọi lệnh này). Qua kiểm riêng tư.

**Thay đổi:** <box>/<date>-<slug>.md, hoặc <cache>/quarantine/ nếu vi phạm hay chưa có nguồn chặn.

| Cờ | Ý nghĩa |
|---|---|
| `--title X` | tiêu đề một dòng |
| `--note X` | ghi chú 2-4 câu |
| `--by X` | human hoặc live (mặc định: human) |
| `--session ID` | phiên liên quan |
| `--repo DIR` | repo cần làm (mặc định: git root của thư mục hiện tại) |

```sh
momentry add --title "Cache LRU" --note "p95 800ms → 90ms sau khi đổi Map sang LRU"
```

Mã thoát: 0 đã ghi; 1 vi phạm riêng tư (chuyện vào quarantine); 2 sai cú pháp; 3 chưa có nguồn chặn (chuyện vào quarantine).

### `momentry check`

Kiểm khuôn frontmatter, id khớp tên file, link không gãy, và riêng tư. Dùng được làm git pre-commit hook.

| Cờ | Ý nghĩa |
|---|---|
| `--box DIR` | thư mục hộp |
| `--staged` | chỉ file đã git add |
| `--repo DIR` | repo cần làm (mặc định: git root của thư mục hiện tại) |

```sh
momentry check
momentry check --staged            # trong .git/hooks/pre-commit
```

Mã thoát: 0 sạch; 1 có lỗi khuôn hoặc vi phạm riêng tư; 2 sai cú pháp; 3 khuôn sạch nhưng chưa kiểm được riêng tư (không có nguồn chặn).

### `momentry harvest`

Gom một phiên hoặc một file transcript (bước 1–11 của pipeline).

**Thay đổi:** như scan, cho một phiên.

| Cờ | Ý nghĩa |
|---|---|
| `--session ID` | id phiên dạng claude:xxxxxxxx hoặc codex:xxxxxxxx |
| `--transcript FILE` | file transcript |
| `--from-line N` | từ dòng |
| `--to-line N` | tới dòng |
| `--runs N` | số lần chạy harvest |
| `--no-outsider` | bỏ bước người ngoài |
| `--save-prompts DIR` | giữ prompt và đầu ra thô vào DIR |
| `--fake-llm DIR` | đọc đầu ra model từ DIR thay vì gọi claude |
| `--save-llm DIR` | ghi đầu ra model vào DIR |
| `--blind` | không ghi hộp, không ghi sổ |
| `--repo DIR` | repo cần làm (mặc định: git root của thư mục hiện tại) |

```sh
momentry harvest --session claude:1a2b3c4d
momentry harvest --transcript ~/.claude/projects/x/abc.jsonl --dry-run
```

Mã thoát: 0 xong (kể cả partial); 1 lỗi; 2 sai cú pháp; 3 có chuyện giữ ngoài repo vì chưa có nguồn chặn; 4 model lỗi; 5 phiên đang bị khoá.

### `momentry rescore`

Chấm lại các chuyện status: raw của một phiên.

| Cờ | Ý nghĩa |
|---|---|
| `--session ID` | id phiên |
| `--no-outsider` | bỏ bước người ngoài |
| `--fake-llm DIR` | đầu ra model giả |
| `--repo DIR` | repo cần làm (mặc định: git root của thư mục hiện tại) |

```sh
momentry rescore --session claude:1a2b3c4d
```

Mã thoát: 0 xong; 1 lỗi; 2 sai cú pháp; 3 chưa có nguồn chặn; 4 model lỗi; 5 phiên đang bị khoá.

### `momentry quarantine`

Liệt kê chuyện bị giữ ngoài repo; --release ID|all thả chuyện qua được kiểm riêng tư vào hộp.

**Thay đổi:** --release: ghi chuyện vào hộp và xoá bản giữ trong <cache>/quarantine; chuyện còn vi phạm vẫn bị giữ.

| Cờ | Ý nghĩa |
|---|---|
| `--release ID|all` | id chuyện cần thả, hoặc all để thử thả mọi chuyện đang giữ |
| `--repo DIR` | repo cần làm (mặc định: git root của thư mục hiện tại) |

```sh
momentry quarantine
momentry quarantine --release 2026-01-10-gop-nhanh-lai-cham
momentry quarantine --release all --json
```

Mã thoát: 0 xong (với all: mọi chuyện đã thả, hoặc không có gì đang giữ); 1 còn chuyện vi phạm hoặc lỗi (vẫn bị giữ); 2 sai cú pháp; 3 chưa có nguồn chặn.

### `momentry reduce`

In văn bản rút gọn và điểm nóng của một transcript (gỡ lỗi).

| Cờ | Ý nghĩa |
|---|---|
| `--transcript FILE` | file transcript |
| `--from-line N` | từ dòng |
| `--to-line N` | tới dòng |
| `--out DIR` | ghi reduced.txt, hotspots.txt vào DIR |

```sh
momentry reduce --transcript session.jsonl --out /tmp/r
```

Mã thoát: 0 xong; 1 lỗi (xem dòng "sửa"); 2 sai cú pháp lệnh hoặc cờ.

### `momentry ledger`

Xem sổ các phiên đã gom, hoặc quên một phiên để gom lại.

**Thay đổi:** với --forget: <cache>/ledger.json.

| Cờ | Ý nghĩa |
|---|---|
| `--show` | in sổ (mặc định) |
| `--forget ID` | quên phiên này |

```sh
momentry ledger --json
momentry ledger --forget claude:1a2b3c4d
```

Mã thoát: 0 xong; 1 lỗi (xem dòng "sửa"); 2 sai cú pháp lệnh hoặc cờ.

### `momentry connect [claude|codex]`

Cài (hoặc --remove gỡ) hook và lệnh /bip cho Claude Code và/hoặc Codex. init đã gọi bước này.

**Thay đổi:** Claude: ~/.claude/settings.json (khoá hooks), ~/.claude/commands/bip.md. Codex: ~/.codex/hooks.json, ~/.codex/prompts/bip.md. Sao lưu *.momentry-bak-<ts> trước khi sửa; chỉ đụng mục có lệnh "momentry hook".

| Cờ | Ý nghĩa |
|---|---|
| `--remove` | gỡ phần momentry đã cài |

```sh
momentry connect --dry-run
momentry connect claude --yes
momentry connect --remove --yes
```

Mã thoát: 0 xong; 1 không sửa được (file hỏng, file bị đổi giữa chừng, host chưa cài); 2 sai cú pháp hoặc thiếu --yes khi không có TTY.

Tiếp theo: momentry doctor

### `momentry hooks`

In đoạn cấu hình hook và mẫu /bip để tự dán (thay cho connect).

| Cờ | Ý nghĩa |
|---|---|
| `--print` | in ra |
| `--claude` | cho Claude Code (mặc định) |
| `--codex` | cho Codex |

```sh
momentry hooks --print --claude
```

Mã thoát: 0 xong; 1 lỗi (xem dòng "sửa"); 2 sai cú pháp lệnh hoặc cờ.

### `momentry config <path|show|get|set|unset|default|privacy-add> [KEY] [VALUE | TÊN…]`

Xem và sửa cấu hình người dùng: path | show | get KEY | set KEY VALUE | unset KEY | default | privacy-add TÊN….

**Thay đổi:** set/unset: file cấu hình người dùng (ghi atomic, giữ quyền file). privacy-add: thêm tên vào <config>/names.txt (0600) và khai báo file đó trong privacy.sources.

| Cờ | Ý nghĩa |
|---|---|
| `--repo DIR` | repo cần làm (mặc định: git root của thư mục hiện tại) |

```sh
momentry config show
momentry config privacy-add "Trần Văn A" "du-an-bi-mat"   # tên cần chặn khỏi repo
momentry config set harvest.runs 2
momentry config default
```

Mã thoát: 0 xong; 1 khoá lạ, giá trị sai hoặc file hỏng; 2 sai cú pháp.

### `momentry paths`

In mọi đường dẫn momentry dùng: cấu hình, cache, bản cài, shim, Claude, Codex.

```sh
momentry paths
momentry paths --json
```

Mã thoát: 0 xong; 1 lỗi (xem dòng "sửa"); 2 sai cú pháp lệnh hoặc cờ.

### `momentry version`

In phiên bản (--json: kèm commit, Node, nền tảng, nơi cài).

```sh
momentry --version
momentry version --json
```

Mã thoát: 0 xong; 1 lỗi (xem dòng "sửa"); 2 sai cú pháp lệnh hoặc cờ.

### `momentry update`

Cập nhật momentry lên bản mới nhất (hoặc --version). Kiểm checksum, thử bản mới, lỗi thì quay lại bản cũ.

Tên khác: `upgrade`.

**Thay đổi:** <install>/versions/, <install>/current; giữ cấu hình, cache, hộp. Sau khi đổi, chạy doctor --after-update trong bản mới.

**Cần:** momentry được cài bằng install.sh/install.ps1 (có .momentry-managed). Bản chạy từ git checkout: dùng git pull.

| Cờ | Ý nghĩa |
|---|---|
| `--check` | chỉ kiểm có bản mới không |
| `--version vX.Y.Z` | cài đúng bản này (được phép hạ cấp) |
| `--force` | cài lại kể cả khi cùng bản |

```sh
momentry update --check
momentry update --yes
momentry update --version v0.1.0 --yes
```

Mã thoát: 0 đã mới nhất hoặc đã cập nhật; 1 lỗi (bản cũ vẫn giữ nguyên); 2 sai cú pháp; 10 --check: có bản mới.

Tiếp theo: momentry doctor

### `momentry uninstall`

Gỡ momentry: hook và /bip, shim, bản cài. Giữ cấu hình, cache, hộp chuyện trừ khi --purge.

Tên khác: `remove`.

**Thay đổi:** gỡ mục "momentry hook" khỏi ~/.claude/settings.json, ~/.codex/hooks.json; xoá bip.md của mình; xoá shim và <install>. --purge: xoá thêm thư mục cấu hình và cache. Không đụng hộp chuyện và .momentry.json trong các repo.

| Cờ | Ý nghĩa |
|---|---|
| `--purge` | xoá cả cấu hình và cache |

```sh
momentry uninstall --dry-run
momentry uninstall --yes
momentry uninstall --purge --yes
```

Mã thoát: 0 đã gỡ; 1 có bước lỗi (các bước sau bị bỏ qua); 2 sai cú pháp hoặc thiếu --yes khi không có TTY.

### `momentry help [lệnh]`

Trợ giúp chung hoặc của một lệnh (--json: toàn bộ lệnh và cờ).

```sh
momentry help init
momentry help --json
```

Mã thoát: 0 xong; 1 lỗi (xem dòng "sửa"); 2 sai cú pháp lệnh hoặc cờ.
