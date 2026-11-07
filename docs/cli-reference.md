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

Bật momentry cho repo này: tạo .momentry.json và hộp chuyện, cài hook, lệnh momentry-bip/momentry-ui và skill momentry cho các agent tìm thấy, rồi chạy doctor.

**Thay đổi:** <repo>/.momentry.json, thư mục hộp <repo>/docs/storytelling-material, <config>/projects.json (danh sách dự án trên máy), <cache>/metrics.json (lần đầu: thời điểm cài, chỉ nằm trên máy); phần của agent như momentry connect (ví dụ ~/.claude/settings.json khoá hooks, ~/.claude/commands/momentry-bip.md, ~/.codex/hooks.json, ~/.agents/skills/momentry-bip/), có sao lưu *.momentry-bak-*. Chạy lại không đổi gì nếu đã đủ.

**Cần:** git repo; Node ≥ 20; `claude` CLI đã đăng nhập; privacy.sources trong cấu hình người dùng (init chỉ cách khai báo nếu thiếu).

| Cờ | Ý nghĩa |
|---|---|
| `--repo DIR` | repo cần làm (mặc định: git root của thư mục hiện tại) |
| `--no-connect` | không cài hook, lệnh và skill cho agent |

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

Tóm tắt nhanh (không gọi claude) và đúng một lệnh nên chạy tiếp, kèm repo có đang tạm dừng gom chuyện không; --json kèm số đo trên máy (thời gian từ cài tới chuyện đầu, tỉ lệ Use trong top 5).

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

**Thay đổi:** <box>/*.md (chuyện mới hoặc gộp), <cache>/ledger.json, <cache>/runs/, <config>/projects.json (thêm repo vào danh sách dự án), <cache>/metrics.json (lúc có chuyện đầu tiên).

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

Bảng chuyện trong hộp: code (mã M-XXXX), id, date, status, hook, tension, stakes, strength, hits.

| Cờ | Ý nghĩa |
|---|---|
| `--rank` | xếp theo độ mạnh (theo gu nếu bật rank.personal); --json có why: vì sao chuyện đứng đó |
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

### `momentry ui`

Mở giao diện web trên máy (đọc chuyện, chọn chuyện, riêng tư, chi phí, sức khoẻ, thiết lập). Một tiến trình, nghe 127.0.0.1 và địa chỉ Tailscale của máy (tắt bằng momentry config set ui.tailscale false), tự tắt khi không còn tab nào mở.

**Thay đổi:** <cache>/ui.json (cổng, mã truy cập, pid của tiến trình đang chạy), <cache>/ui-open.html (trang mở có mã truy cập, chỉ bạn đọc được), <cache>/ui-state.json (chuyện đã đọc, để sau, kiểm góc kể), <cache>/taste.json (việc bạn làm với chuyện kèm đặc trưng của chuyện, chỉ nằm trên máy). Mọi thay đổi khác do bạn bấm trên giao diện.

| Cờ | Ý nghĩa |
|---|---|
| `--no-open` | không mở trình duyệt, chỉ in đường dẫn file mở giao diện (mã truy cập nằm trong file, không in ra) |
| `--port N` | cổng muốn dùng (mặc định: 4825) |
| `--remote` | in link có mã truy cập để mở từ máy khác trong tailnet (không mở trình duyệt) |
| `--serve` | chạy tiến trình web ngay trong terminal này (thường do momentry ui tự gọi) |

```sh
momentry ui
momentry ui --remote                # link cho điện thoại hoặc máy khác trong tailnet
momentry ui --no-open --json       # cho agent: in file mở giao diện để đưa người dùng
```

Mã thoát: 0 xong; 1 lỗi (xem dòng "sửa"); 2 sai cú pháp lệnh hoặc cờ.

### `momentry show <id|mã>`

In đầy đủ một chuyện trong hộp: mã, tiêu đề, trạng thái, các phần (bối cảnh, chuyện gì xảy ra, bài học…). Nhận id hoặc mã chuyện (M-XXXX, hoa thường đều được, M- có thể bỏ). Chỉ đọc.

| Cờ | Ý nghĩa |
|---|---|
| `--repo DIR` | repo cần làm (mặc định: git root của thư mục hiện tại) |

```sh
momentry show 2026-11-04-cache-lru
momentry show M-7K3Q
momentry show 7k3q --json                  # cho agent (skill momentry)
```

Mã thoát: 0 xong; 1 không có chuyện này trong hộp, hoặc file chuyện sai khuôn; 2 sai cú pháp hoặc id sai khuôn.

### `momentry mark <id|mã> <use|later|drop>`

Đánh dấu một chuyện (theo id hoặc mã M-XXXX): use (sẽ dùng, status picked), later (để sau, chỉ ghi trên máy này), drop (bỏ, status dropped).

**Thay đổi:** use/drop: dòng status trong <box>/<id>.md; later: <cache>/ui-state.json; quyết định kèm hạng của chuyện lúc đó: <cache>/metrics.json, và kèm đặc trưng của chuyện (không có chữ của chuyện): <cache>/taste.json (cả hai chỉ nằm trên máy).

| Cờ | Ý nghĩa |
|---|---|
| `--repo DIR` | repo cần làm (mặc định: git root của thư mục hiện tại) |

```sh
momentry mark 2026-11-04-cache-lru use
momentry mark M-7K3Q drop --json
```

Mã thoát: 0 xong; 1 không có chuyện này trong hộp, mã trùng, hoặc file chuyện sai khuôn; 2 sai cú pháp, id hoặc nhãn sai.

### `momentry taste`

Xem gu của bạn từ những gì bạn đã làm với chuyện: trong các chuyện top 5 đã quyết, bao nhiêu chuyện bạn dùng (use, drafted, published), chuyện bạn dùng nằm hạng trung bình mấy, và đặc trưng bạn hay dùng hay bỏ (giằng xé, tín hiệu, stakes), số chuyện bạn tự ghi (momentry bỏ sót) và số lần bạn sửa chữ model viết; xếp theo gu (rank.personal) đang bật hay chưa, còn thiếu bao nhiêu quyết định, và gu học được. Chỉ đọc <cache>/taste.json trên máy, không gọi model (0 USD).

| Cờ | Ý nghĩa |
|---|---|
| `--repo DIR` | chỉ tính dự án ở repo này (mặc định: mọi dự án trên máy) |

```sh
momentry taste
momentry taste --repo ~/code/du-an
momentry taste --json             # cho agent
```

Mã thoát: 0 xong; 1 lỗi (xem dòng "sửa"); 2 sai cú pháp lệnh hoặc cờ.

Tiếp theo: momentry list --rank

### `momentry add`

Ghi một chuyện tay (lệnh momentry-bip của agent gọi lệnh này). Qua kiểm riêng tư.

**Thay đổi:** <box>/<date>-<slug>.md, hoặc <cache>/quarantine/ nếu vi phạm hay chưa có nguồn chặn; với --by live: <cache>/metrics.json (lúc có chuyện đầu tiên); với --by human: <cache>/taste.json (chuyện momentry bỏ sót, chỉ đặc trưng, chỉ nằm trên máy).

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

Kiểm khuôn frontmatter, id khớp tên file, link không gãy, mã chuyện không trùng, và riêng tư. Dùng được làm git pre-commit hook.

**Thay đổi:** không gì; với --fix: thêm code và aliases (mã chuyện M-XXXX) vào chuyện chưa có, đúng mã chúng đang mang.

| Cờ | Ý nghĩa |
|---|---|
| `--box DIR` | thư mục hộp |
| `--staged` | chỉ file đã git add |
| `--fix` | ghi mã chuyện vào file chưa có (code, aliases) rồi kiểm |
| `--repo DIR` | repo cần làm (mặc định: git root của thư mục hiện tại) |

```sh
momentry check
momentry check --staged            # trong .git/hooks/pre-commit
momentry check --fix               # ghi mã M-XXXX vào chuyện cũ
```

Mã thoát: 0 sạch; 1 có lỗi khuôn hoặc vi phạm riêng tư; 2 sai cú pháp; 3 khuôn sạch nhưng chưa kiểm được riêng tư (không có nguồn chặn).

### `momentry pause`

Tạm dừng gom chuyện cho repo này trên máy này: hook không tự gom, scan --auto bỏ qua, đầu phiên không nhắc. Giữ .momentry.json, hộp và chuyện cũ. Lối tắt của momentry config set paused true --project.

**Thay đổi:** <config>/projects.json (dấu tạm dừng của repo; chỉ nằm trên máy, repo không tự đặt hay gỡ được).

**Cần:** repo đã init (hoặc nằm trong MOMENTRY_REPOS).

| Cờ | Ý nghĩa |
|---|---|
| `--repo DIR` | repo cần làm (mặc định: git root của thư mục hiện tại) |

```sh
momentry pause
momentry pause --repo ~/code/du-an --json
momentry pause --dry-run
```

Mã thoát: 0 đã tạm dừng (hoặc đã dừng sẵn); 1 không ở trong repo được quan sát, hoặc danh sách dự án hỏng; 2 sai cú pháp.

Tiếp theo: momentry status

### `momentry resume`

Bật lại gom chuyện cho repo đã tạm dừng. Phiên trong lúc dừng không tự gom; muốn gom thì chạy tay momentry scan. Lối tắt của momentry config set paused false --project.

**Thay đổi:** <config>/projects.json (bỏ dấu tạm dừng, ghi lúc bật lại).

| Cờ | Ý nghĩa |
|---|---|
| `--repo DIR` | repo cần làm (mặc định: git root của thư mục hiện tại) |

```sh
momentry resume
momentry resume --repo ~/code/du-an --json
```

Mã thoát: 0 đã bật lại (hoặc vốn không tạm dừng); 1 không ở trong git repo, hoặc danh sách dự án hỏng; 2 sai cú pháp.

Tiếp theo: momentry status

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

### `momentry angle`

Viết cốt truyện và góc kể cho chuyện đã có trong hộp mà chưa có góc kể: mặc định các chuyện đầu bảng xếp hạng. Góc kể mở bằng bối cảnh (dự án gì, người làm đang cố làm gì), rồi điều người ta tưởng, điều hoá ra, vì sao người nghe nên quan tâm. Cùng bước mà harvest chạy sau khi xếp hạng.

**Thay đổi:** <box>/<id>.md (trường angle, audience, spine_*, completeness và dòng **Góc kể:** trong thân; angle: none khi không có góc kể), hoặc <cache>/quarantine/ nếu vi phạm riêng tư hay chưa có nguồn chặn; <cache>/profiles/ (hồ sơ dự án, sửa tay được); <cache>/ledger.json (chi phí, tính vào ngân sách ngày); <cache>/runs/angle/.

**Cần:** repo đã init; `claude` CLI; transcript của phiên còn trên máy. Mỗi chuyện một lần gọi model (angle.model); mỗi dự án thêm một lần gọi (angle.profileModel) khi chưa có hồ sơ hoặc README/docs đã đổi.

| Cờ | Ý nghĩa |
|---|---|
| `--top N` | xét N chuyện đầu bảng xếp hạng của cả hộp (mặc định: angle.topN) |
| `--story ID` | chỉ chuyện này (id hoặc mã M-XXXX) |
| `--force` | viết lại cả góc kể đã có (kể cả angle: none) |
| `--repo DIR` | repo cần làm (mặc định: git root của thư mục hiện tại) |

```sh
momentry angle --dry-run             # xem chuyện nào sẽ được viết góc kể, ước tính chi phí
momentry angle --top 5
momentry angle --story M-7K3Q --force --json
```

Mã thoát: 0 xong; 1 không có chuyện này trong hộp, hoặc lỗi; 2 sai cú pháp; 3 có góc kể giữ ngoài repo vì chưa có nguồn chặn; 4 model lỗi ở ít nhất một chuyện (chuyện đó chưa có góc kể); 5 phiên của ít nhất một chuyện đang được gom, chuyện đó bỏ qua (chạy lại sau).

Tiếp theo: momentry list --rank

### `momentry quarantine`

Liệt kê chuyện bị giữ ngoài repo; --release ID|all thả chuyện qua được kiểm riêng tư vào hộp.

**Thay đổi:** --release: ghi chuyện vào hộp và xoá bản giữ trong <cache>/quarantine, <cache>/metrics.json (lúc có chuyện đầu tiên); chuyện còn vi phạm vẫn bị giữ.

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

### `momentry connect [claude|codex|pi|omp|agy]`

Cài (hoặc --remove gỡ) hook/extension, lệnh momentry-bip, momentry-ui và skill momentry cho Claude Code, Codex, pi, omp, Antigravity, ở mọi profile tìm thấy. init đã gọi bước này.

**Thay đổi:** Mỗi profile tìm thấy (~/.claude; ~/.codex, ~/.codex-*; ~/.pi/agent, ~/.pi/accounts/*; ~/.omp/agent, ~/.omp/profiles/*/agent; ~/.gemini, ~/.agy-homes/*/.gemini): Claude: khoá hooks trong settings.json, commands/{momentry-bip,momentry-ui}.md, skills/momentry/SKILL.md; Codex: khoá hooks trong hooks.json; pi: extensions/momentry.ts, prompts/{momentry-bip,momentry-ui}.md; omp: extensions/momentry.ts, commands/{momentry-bip,momentry-ui}.md, skills/momentry/SKILL.md; Antigravity: nhóm "momentry" trong config/hooks.json và config/skills/{momentry-bip,momentry-ui,momentry}/SKILL.md. Một lần cho mọi profile: ~/.agents/skills/{momentry-bip,momentry-ui}/ (Codex) và ~/.agents/skills/momentry/ (Codex, pi). Gỡ file cũ của momentry mà bạn chưa sửa: bí danh /bip, ~/.codex/prompts/bip.md, skill trong ~/.codex*/skills, ~/.pi/agent/skills/momentry. Sao lưu *.momentry-bak-* trước khi sửa; chỉ đụng phần của momentry.

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

In đoạn cấu hình hook và mẫu lệnh momentry-bip, momentry-ui để tự dán (thay cho connect).

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

Lệnh duy nhất để xem và đổi mọi cài đặt: path | show | get KEY | set KEY VALUE | unset KEY | default | privacy-add TÊN…. Không có --project: cấu hình người dùng, chung mọi dự án. Có --project: cài đặt riêng của repo đang đứng (hoặc --repo DIR): box (thư mục chuyện; trong repo ghi vào .momentry.json, ngoài repo chỉ ghi trên máy này), repo (tên dự án trên chuyện), budget.dailyUsd (ngân sách mỗi ngày riêng của dự án), private (chế độ riêng tư), paused (tạm dừng gom chuyện; pause/resume là lối tắt). show --project in từng khoá kèm nơi đặt: repo, dự án trên máy này, người dùng, mặc định hoặc env. Giao diện web ghi qua đúng các hàm này.

**Thay đổi:** set/unset: file cấu hình người dùng (ghi atomic, giữ quyền file). Với --project: box/repo vào <repo>/.momentry.json (box ngoài repo vào <config>/projects.json), budget.dailyUsd và private vào cấu hình người dùng theo đường dẫn repo, paused vào <config>/projects.json; khoá chỉ của máy này không bao giờ ghi vào repo. privacy-add: thêm tên vào <config>/names.txt (0600) và khai báo file đó trong privacy.sources.

**Cần:** với --project: ở trong git repo (hoặc --repo DIR); đặt box trong repo, repo hay paused true cần repo đã init.

| Cờ | Ý nghĩa |
|---|---|
| `--repo DIR` | repo cần làm (mặc định: git root của thư mục hiện tại) |
| `--project` | cài đặt riêng của repo (box, repo, budget.dailyUsd, private, paused) thay cho cấu hình người dùng; dùng với show, get, set, unset |

```sh
momentry config show
momentry config set harvest.runs 2
momentry config privacy-add "Trần Văn A" "du-an-bi-mat"   # tên cần chặn khỏi repo
momentry config show --project --json
momentry config set box ~/Documents/momentry-chuyen --project   # thư mục chuyện ngoài repo, chỉ trên máy này
momentry config set budget.dailyUsd 1 --project --repo ~/code/du-an
momentry config unset box --project --dry-run
```

Mã thoát: 0 xong; 1 khoá lạ, giá trị sai, khoá không đặt riêng được cho dự án, repo chưa init, không ở trong git repo hoặc file hỏng; 2 sai cú pháp.

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

Gỡ momentry: hook, lệnh agent và skill, shim, bản cài. Giữ cấu hình, cache, hộp chuyện trừ khi --purge.

Tên khác: `remove`.

**Thay đổi:** gỡ mục "momentry hook" khỏi ~/.claude/settings.json, ~/.codex/hooks.json và các host khác; xoá file lệnh và skill do momentry ghi mà bạn chưa sửa (cả ~/.agents/skills, bí danh /bip cũ và chỗ cũ ~/.codex*/skills); xoá shim và <install>. --purge: xoá thêm thư mục cấu hình và cache. Không đụng hộp chuyện và .momentry.json trong các repo.

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
