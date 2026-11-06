# momentry PRD v2: nhặt chất liệu kể chuyện từ phiên làm việc với coding agent

**Trạng thái:** bản duy nhất có hiệu lực, 2026-11-03. Thay cho [thiết kế v1][v1] và [PRD bàn giao][bg]. Hai file đó giữ trong `history/` để tra lý do, không dùng để làm.

**Nguồn sự thật cao nhất:** [kết quả thí nghiệm harvest][tn], mục 6, 6b, 6c, 6d. Khi PRD này và thí nghiệm lệch nhau, thí nghiệm đúng, PRD phải sửa.

**Ký hiệu bằng chứng:**

| Ký hiệu | Tài liệu |
|---|---|
| TN x | [Thí nghiệm harvest 2026-11-03][tn], mục x |
| DB x | [Debate 3 agent][db], mục x của phần kết luận |
| BG x | [PRD bàn giao từ obsidian-pkm-automation][bg], mục x |
| V1 x | [Thiết kế v1 Body/Brain][v1], mục x |
| MẪU | [Hộp mẫu và 8 chuyện thật][mau] |

Mục nào ghi **(mặc định, user có thể đổi)** là quyết định do người viết PRD chọn để có chỗ bắt đầu, chưa phải user chốt.

---

## 1. Mục đích

Người làm một mình cần kể công việc của mình ra ngoài (build in public) nhưng không có thời gian nhớ lại. Chuyện hay nhất xảy ra giữa lúc làm, trong chat với agent: một con số đổi, một lỗi có gốc bất ngờ, một quyết định bị đảo. Hết phiên là quên. Transcript thì dài và không ai đọc lại.

momentry đọc transcript của Claude Code và Codex sau khi phiên (hoặc một đoạn phiên) xong, nhặt mọi chuyện có thể kể, ghi mỗi chuyện thành một file markdown trong repo, và xếp hạng để người chọn nhanh. Máy làm phần nhặt và xếp. Người giữ phần chọn và viết.

```text
Không bỏ sót chuyện đáng kể, kể cả chuyện người làm thấy bình thường.
Không làm chậm hay lệch phiên làm việc chính.
Không để lọt dữ liệu riêng vào repo.
```

Đặt trong CIS: momentry là một nhánh hẹp của raw capture (thiết kế trong repo riêng của CIS). Nó dùng chung nguyên tắc không can thiệp (raw capture mục 14) và bắt ở ranh giới phiên. Nó không dùng buffer, envelope hay candidate marker của raw capture: đầu ra là file chuyện đọc được ngay.

## 2. Người dùng

| Ai | Dùng thế nào |
|---|---|
| **User (người làm một mình)** | Làm việc bình thường với Claude Code hoặc Codex. Thỉnh thoảng gõ `/bip` khi tự thấy có chuyện. Khi muốn viết bài thì mở hộp, xem danh sách đã xếp hạng, đổi `status`. |
| **Agent trong phiên** | Không phải làm gì. Nếu repo có luật tự ghi (kiểu DM.0) thì agent có thể ghi thêm chuyện `captured_by: live`, nhưng đó không phải chỗ dựa (DB 1). |
| **Người đọc đích của chuyện** | Dev làm một mình, dùng AI hằng ngày, không rành lĩnh vực của phiên. Mô tả này được đóng băng trong prompt (DB 2). |

## 3. Phạm vi

### 3.1 Trong phạm vi v2

1. Đọc transcript Claude Code và Codex trên máy, rút gọn, tính điểm nóng.
2. Harvest bằng model rẻ, kiểm đủ điểm nóng, gọi bù.
3. Gộp cụm, chấm cụm (hook, tension, strength, stakes), bước người ngoài.
4. Bộ kiểm riêng tư chạy trên mọi chuyện trước khi ghi.
5. Ghi hộp chuyện, sổ đã gom, xếp hạng khi liệt kê.
6. Hook PreCompact, SessionEnd, SessionStart cho cả Claude Code và Codex, chạy nền; dự phòng `momentry scan`. `momentry init` tự cài hook và `/bip` khi user đồng ý (`--yes` hoặc trả lời có), có sao lưu và gỡ ngược được (mục 6.4).
7. Lệnh `/bip` cho user chủ động đánh dấu.
8. Test đơn vị với dữ liệu giả, chế độ `--dry-run` và `--fake-llm`.

### 3.2 Ngoài phạm vi v2

| Việc | Vì sao để sau |
|---|---|
| Biên tập, gom mạch, dựng dàn ý, bản nháp bài | Cần hộp có từ 30 chuyện thật trở lên (BG 6.6). Thí nghiệm cho thấy lỗi nằm ở cách kể, không ở phát hiện (TN 6b mục 5), nên đây là việc riêng. |
| Gom nhiều repo vào một hộp, mạch xuyên repo | Trường `repo` và `sessions` đã để sẵn (BG 6.7). Quyết cách gom khi tới đó. |
| Sinh `threads.md` tự động, `--fix` link hai chiều | Đã hoãn trong debate (DB 4). |
| Đăng bài, lịch đăng, kênh phân phối | Thuộc Content Intelligence Service. |
| Thu phản ứng khán giả sau khi đăng | Chưa có bài đăng nào. |
| Tự commit chuyện vào git | User commit. Công cụ chỉ ghi file. |

## 4. Nguyên tắc (đã chốt)

1. **Ghi nhiều, nối nhiều, lọc sau cùng.** Không chấm điểm hay lọc lúc ghi. Điểm chỉ dùng để xếp hạng khi liệt kê. "Bỏ" là đổi `status: dropped`, không xoá file (BG 2; MẪU).
2. **Động cơ chính là gom ngoài phiên bằng LLM.** Không gọi model trong phiên. Agent tự ghi giữa phiên chỉ là phần thêm (DB 1).
3. **Không hook Stop.** Điểm nóng tính lại được từ transcript lúc harvest (TN 6, bất đồng 1, kết luận sau thí nghiệm 4). User chốt không đưa Stop lại khi giao viết PRD v2 (2026-11-03). DB 7 chỉ ghi trạng thái trước thí nghiệm ("chờ thí nghiệm 4").
4. **Không regex ngôn ngữ, không persona panel, không `keep_threshold`.** Chỉ giữ `/bip` dạng literal (DB 1).
5. **Điểm nóng là neo sự chú ý, không phải bộ lọc.** Harvest phải trả lời từng điểm nóng, script kiểm đủ số (TN 5 mục 1 và 3).
6. **Stakes dùng để xếp hạng, không lọc cứng** (TN 6d mục 3 và 4).
7. **Riêng tư là chốt chặn, không phải lời dặn.** Bộ kiểm chạy trên mọi chuyện (cả tên file, `add`, phần nối vào file cũ) trước khi ghi vào repo. Không có nguồn chặn thì báo "bỏ qua", không coi là qua: chuyện không vào repo mà nằm chờ ngoài repo (mục 6.7) (BG 6.4; DB 4).
8. **Không can thiệp phiên chính.** Hook thoát ngay với mã 0, không in gì ra stdout, việc nặng chạy nền (raw capture mục 14).
9. **Công cụ:** `.mjs` chạy trên Node, không npm, test bằng `node --test`. Không Python. Chạy cho cả Claude Code và Codex (BG 2).
10. **Gọi model cô lập:** `claude -p --setting-sources "" --tools "" --strict-mcp-config --no-session-persistence`, kèm `STORY_HARVEST=1` để hook của chính lần gọi đó thoát ngay ([harness/run.sh][h-run]), và mặc định `DISABLE_PROMPT_CACHING=1` (`llm.promptCache`).

---

## 5. Cơ chế phát hiện moment

### 5.1 Pipeline

```text
transcript trên đĩa (Claude .jsonl hoặc Codex rollout)
  -> [1] đọc nguồn, chuẩn hoá              script
  -> [2] rút gọn                            script
  -> [3] điểm nóng (4 hàm thuần + /bip)     script
  -> [4] harvest x N lần                    Haiku
  -> [5] kiểm đủ điểm nóng, gọi bù          script + Haiku
  -> [6] gộp cụm, đếm số lần bắt            Sonnet + script kiểm
  -> [9] người ngoài (lần gọi riêng)        Sonnet
  -> [7] chấm hook, tension, strength       Sonnet
  -> [8] chấm main_goal, stakes             Sonnet
  -> [10] kiểm riêng tư                     script
  -> [11] dựng file chuyện, ghi hộp, sổ     script
  -> [13] góc kể cho top N chuyện của phiên Haiku (xếp hạng như bước 12, rồi kiểm riêng tư)
  ...
  -> [12] liệt kê có xếp hạng (khi user mở) script
```

Thứ tự chạy là 1 → 6 → **9 → 7 → 8** → 10 → 11: bước người ngoài chạy trước hai bước chấm để chuyện mới của nó được chấm cùng các cụm khác. Số bước giữ như cũ để khớp bảng dưới và các mục khác. Thí nghiệm đặt người ngoài sau bước chấm (TN 6d) vì ở đó nó chỉ đổi góc kể, không sinh chuyện cần chấm.

Bước 1–11 chạy một lần cho mỗi cửa sổ transcript chưa gom (mục 6.3), rồi bước 13 (góc kể) cho các chuyện đầu bảng của phiên còn thiếu góc kể. Bước 12 chạy khi user gọi `list --rank`; bước 13 dùng cùng thứ tự đó. `momentry angle` chạy riêng bước 13 cho chuyện đã có trong hộp.

### 5.2 Từng bước

| # | Bước | Ai làm | Đầu vào | Đầu ra | Vì sao | Bằng chứng |
|---|---|---|---|---|---|---|
| 1 | Đọc nguồn | `sources/claude.mjs`, `sources/codex.mjs` | File transcript, khoảng dòng | Dãy `Entry` chuẩn hoá (mục 6.2) | Hai định dạng khác nhau, một động cơ chung | BG 6.2; DB 4 |
| 2 | Rút gọn | `reduce.mjs` | `Entry[]` | Văn bản `[Lnnn] USER/AGENT/TOOL/RESULT: ...` | Vừa ngữ cảnh model, giữ đủ dấu vết. Bỏ thinking. **Bỏ bản tóm tắt compact** | TN 1; TN 5 mục 2 (e5 đạt 7/7 khi không có compact) |
| 3 | Điểm nóng | `hotspots.mjs` | `Entry[]` | Danh sách `H1..Hn` (khoảng dòng, tên tín hiệu, không chép chữ) | Dấu vết khách quan, không cần ai ngạc nhiên. Xử lý một phần curse of knowledge | DB 1, DB 2; TN 3 mục 3 |
| 4 | Harvest | Haiku, N lần (mặc định 1) | Văn bản rút gọn + điểm nóng + prompt `harvest.md` | JSON `stories[]` và `hotspots[]` (verdict cho từng điểm) | Rẻ (0,08–0,30 USD mỗi lần). Câu chống tự lọc vá lỗi LLM tự lọc. Bắt trả lời từng điểm nóng đẩy model sang chế độ rà kỹ | TN 3 mục 1–3; TN 5 mục 1; TN 4.3 |
| 5 | Kiểm đủ, gọi bù | Script; Haiku cho lần bù | `hotspots[]` của bước 4 | Mọi điểm nóng có verdict; chuyện thêm từ lần bù | Model có thể lờ phần (b): e5-2 chỉ trả 8/28 rồi trượt 2 chuyện | TN 5 mục 3 |
| 6 | Gộp cụm | Sonnet (`cluster.md`), script kiểm phân hoạch | Mọi chuyện của N lần chạy, cộng chuyện đã có trong hộp của cùng phiên | `clusters[]`: title, summary, signals, members. `hits` = số lần chạy khác nhau trong members | Một sự kiện một file. Đếm đồng thuận là tín hiệu xếp hạng mạnh khi N > 1 | TN 6b (142/142 phủ đủ; cả 8 chuyện `t` được ≥ 4/5 lần bắt) |
| 7 | Hook, tension | Sonnet (`hook-tension.md`) | Các cụm (gồm chuyện mới của bước 9), trộn thứ tự, ẩn `hits` | Mỗi cụm: `hook` (< 15 chữ), `tension`, `sides`, `strength` 0–3 | Mọi chuyện `t` viết được hook có giằng xé. `none` loại được 8–12 chuyện `s` mà không mất `t`. Hook máy viết có ví dụ tốt, nhưng **chưa ai chấm hook**; hook viết từ tóm tắt đã gộp, mà tóm tắt có thể đã được viết sẵn theo hướng có giằng xé | TN 6c mục 1 và 3, giới hạn của TN 6c |
| 8 | Stakes | Sonnet (`stakes.md`) | Các cụm của cả phiên (cũ và mới), trộn thứ tự | `main_goal` tự suy; mỗi cụm `stakes` 0–3 và lý do | Tín hiệu mạnh nhất tới giờ. Biến thể chọn `si` Sonnet: AUC 0,93–0,94; nhân strength (strength của lần "tension Sonnet 1") 0,96–0,98. **Lạc quan: đo trên chính dữ liệu đã gợi giả thuyết.** Tự suy việc chính (`si`) tốt hơn lấy câu đầu phiên (`sg` Sonnet: 0,85–0,92). Haiku kém ở trục này | TN 6d bảng, mục 1, 2, 5, cảnh báo. **Chưa kiểm trên phiên mới (DM.10)** |
| 9 | Người ngoài | Sonnet, lần gọi riêng (`outsider.md`); chạy ngay sau bước 6 | Văn bản rút gọn + danh sách tiêu đề cụm | `outsider[]`: what, common_practice, gap, lines, already_picked | Đổi góc kể sang "cách làm người khác muốn học". Haiku gộp chung cho gap 0,45; Sonnet gọi riêng cho gap 2,31. **Opus chấm, có thể thiên vị văn phong chi tiết của Sonnet; so sánh đổi cùng lúc model, cách gọi và câu dặn**, nên không quy kết quả cho riêng việc "gọi riêng" | TN 4.2; TN 5 mục 4; TN 7. **Chưa qua phép thử cất kín** |
| 10 | Kiểm riêng tư | `privacy.mjs` | Mọi trường văn bản của mỗi chuyện sắp ghi, tên file (slug), phần sẽ nối vào file cũ | Qua / vi phạm / bỏ qua (không có nguồn chặn) | Transcript chứa tên note, câu hỏi thật. Mẫu `lo-rieng-tu` rò qua dạng Telex | BG 6.4; DB 4; MẪU |
| 11 | Dựng file, ghi hộp, sổ | `story.mjs`, `box.mjs`, `ledger.mjs` | Cụm đã chấm và qua kiểm | File chuyện mới hoặc cập nhật file cũ (mục 6.6); sổ ghi dòng cuối đã gom | Chạy lại không ghi trùng; hook gọi nhiều lần vẫn an toàn | BG 6.2; DB 4 |
| 12 | Xếp hạng | `rank.mjs` | Frontmatter các chuyện | Thứ tự: chuyện chỉ outsider thấy xuống cuối → `tension ≠ none` → `stakes + strength` → `hits` | Không bỏ chuyện nào, chỉ đẩy chuyện đáng xem lên đầu | TN 6d mục 4 |
| 13 | Góc kể | Haiku (`angle.md`), mỗi chuyện một lần gọi; `angle.mjs` chọn chuyện và cắt trích đoạn; `asks.mjs` lấy yêu cầu của chủ phiên; `project-profile.mjs` viết hồ sơ dự án (Haiku, `profile.md`, mỗi dự án một lần) | `angle.topN` chuyện đầu bảng của phiên chưa có `angle` (bỏ chuyện `dropped`); với mỗi chuyện: **hồ sơ dự án** (3–5 câu: dự án là gì, cho ai, ràng buộc chính, mục tiêu hiện tại; viết từ README*, PRD/prd*, vision*, requirement(s)*, AGENTS.md, CLAUDE.md, GEMINI.md, ANTIGRAVITY.md ở gốc repo rồi `docs/`, mỗi loại file đầu tiên khớp, tối đa ~14k ký tự; lưu `<cache>/profiles/<repo>-<id>.md`, viết lại chỉ khi các file đó đổi và người dùng chưa sửa file; không có file thì không có hồ sơ; chứa tên riêng tư thì không dùng), **yêu cầu của chủ phiên** (yêu cầu đầu phiên và tối đa 3 yêu cầu gần nhất trước dòng đầu của chuyện, bỏ câu kiểu "tiếp tục", "ok", "commit push", ~2,4k ký tự, có `[Lnnn]`), hook, tension, sides, stakes, thân bài, cộng các `Entry` rút gọn quanh từng dòng trong `lines` (±2 Entry, thu lại tới khi dưới ~24k ký tự), chỉ của phiên có nhiều dòng nhất | **Xương chuyện** `spine`: bảy ô `context` (ai, dự án gì, đang làm gì), `want`, `obstacle`, `turn` (tưởng là… hoá ra…), `action`, `outcome` (có số thì ghi số), `takeaway`; mỗi ô một câu kèm số dòng, hoặc để trống (`context` được dẫn `profile`); `completeness` = số ô đã điền (0–7). Rồi `angle` (2–4 câu, câu đầu là bối cảnh để người ngoài hiểu không cần hỏi, rồi điều người ta tưởng → điều hoá ra → vì sao người nghe nên quan tâm), `audience`, `evidence`; hoặc `none: true` kèm lý do (vẫn có xương chuyện). Số dòng phải nằm trong trích đoạn hoặc khối yêu cầu | Tiêu đề chỉ gọi tên sự kiện; người đọc phải tự nghĩ ra chuyện đằng sau. Góc kể không có bối cảnh thì người ngoài không biết dự án là gì, người làm đang cố làm gì. Lời gọi hỏng (sau một lần gọi lại) không làm hỏng cửa sổ: chuyện chưa có góc kể, `momentry angle` làm bù. Chi phí của `momentry angle` ghi vào sổ (`spend`), tính vào ngân sách ngày | [TN góc kể](experiments/2026-11-05-angle/README.md): 20 chuyện, haiku 19 góc kể và 1 none, ~0,017 USD mỗi phiên. [TN xương chuyện](experiments/2026-11-05-story-spine/README.md): 20 chuyện, 16 góc kể (đều mở bằng bối cảnh) và 4 none, ~0,031 USD mỗi phiên. **Chưa có nhãn người chấm** (kiểm ở trang duyệt, có câu "Đọc xong hiểu được, không cần hỏi thêm?") |

### 5.3 Điểm nóng

Các hàm thuần, mỗi hàm chỉ nhìn một `Entry` (riêng `ownerVoice` nhận thêm số entry đã qua kể từ lượt người trước). Bốn hàm nguyên thuỷ (`nonzeroExit`, `metricPair`, `gitReversal`, `metaWrite`) port từ [harness/reduce.mjs][h-reduce]. Harness lọc theo tên tool của Claude (`Bash`; `Edit/Write/MultiEdit/NotebookEdit`). Bản port **không** xét tên tool mà xét `op` và `paths` của `Entry` chuẩn hoá (mục 6.2), để chạy được trên Codex (`shell`/`exec_command`, `apply_patch`).

| Hàm | Bắt gì | Xét trường | Ví dụ thật (TN 3 mục 3) |
|---|---|---|---|
| `nonzeroExit` | Kết quả tool có exit ≠ 0 hoặc cờ lỗi. `exitCode: null` và `isError: false` thì không tính. Không tính lệnh bị chặn (`blocked`) và lệnh người dùng từ chối (`ownerVoice`) | `kind: result`, `exitCode`, `isError` | `H14` exit 144 thành "pkill -f giết luôn shell đang chạy" |
| `blocked` | Kết quả lỗi do môi trường chặn chứ không phải do lệnh: hook (`PreToolUse … hook error`), từ chối quyền, sandbox, chốt worktree. Loại riêng, ít khi là chuyện | `kind: result`, `isError`, `text` | Hook chặn câu hỏi của agent |
| `metricPair` | Cặp số trước/sau trong lời user hoặc agent (`a → b`, `->`, `=>`, `lên`, `xuống`, `thành`, `tới`, `to`). Bỏ khoảng vị trí và khoảng id ("rows 0 to 190", "dòng 12 tới 40", "mapping-0241 to 0300", "8 to 12 days"), cặp bằng nhau, và dòng user do harness chèn. Hiểu số có dấu cách ngăn nghìn ("4 301"), dấu phẩy thập phân, `%` | `kind: user/assistant`, `text` | 0,667 → 0,307 |
| `gitReversal` | `git reset/revert/rebase/restore/checkout --/commit --amend/push -f`, squash. Không tính `checkout --detach/--ours/--theirs`, `rebase` thường lên `origin/…`/`upstream/…`/nhánh chính (giữ `--abort`, `-i`, `--onto`), `checkout -- <lockfile>`, và chữ nằm trong thân heredoc | `op: shell`, `text` (lệnh) | `H22` git reset thành chuyện gộp 6 commit gỡ dữ liệu lộ |
| `metaWrite` | Ghi vào `.claude/`, `.codex/`, `.agents/`, `AGENTS.md`, `CLAUDE.md`, `skills/`, `hooks/`, `settings*.json` (trừ file bài học, thuộc `lessonWrite`) | `op: write`, `paths[]` | Tự làm công cụ cho agent |
| `lessonWrite` | Ghi vào memory (`/memory/`, `MEMORY.md`), bản ghi quyết định (`decisions/`, `adr/`), `journals/`, `CHANGELOG`: bằng công cụ sửa file hoặc bằng shell (`>`, `>>`, `tee`, heredoc, `cp`, `mv`). Chỉ xét đường dẫn, không xét chữ "Lịch sử quyết định" trong nội dung | `op: write` `paths[]`, hoặc `op: shell` `text` | Bài học agent tự ghi ở bước ngoặt |
| `ownerVoice` | Tiếng người dùng: ngắt (`[Request interrupted by user]`), từ chối lệnh tool, câu trả lời lựa chọn ("A", "2B", "chọn …", "đồng ý …", "phương án 2"), phản đối hoặc thúc ("không", "sao lại", "thông minh hơn", "lâu quá", "no", "stop", "why did"), câu ngắn (≤ 100 ký tự) sau ≥ 30 entry agent tự chạy. Bỏ dòng do harness chèn (thẻ `<…>`, tin liên phiên) và `/bip` | `kind: user` `text`; `kind: result` `rejected`; số entry từ lượt người trước | Quyết định của chủ dự án |

Thêm một loại không phải hàm ngôn ngữ: `Entry` có `bip: true` thành điểm nóng loại `bip`. Trên Claude, `sources/claude` đặt cờ này khi đọc thẻ `<command-name>/bip</command-name>` **trước** khi lọc bỏ dòng `<command-` (mục 6.1). Trên Codex, prompt tuỳ chỉnh được bung ra thành chữ nên không còn `/bip` nguyên văn: Codex chỉ dựa vào `momentry add` (mục 6.4). Phần này là đề xuất của PRD, chưa thử.

Gộp điểm nóng cùng loại cách nhau ≤ 5 dòng thành một điểm. Trên phiên thí nghiệm ra 28 điểm (TN 1). Id điểm nóng là toàn cục theo dòng gốc: `H<L>` (ví dụ `H1325`), không đánh số lại theo khúc (mục 6.2).

Lưu ý: `metricPair` có điều kiện "mũi tên/từ nối" nên có ngoại lệ ngôn ngữ nhỏ (`lên`, `xuống`, `thành`, `tới`, `to`). Đây là từ nối số, không phải regex bắt cảm xúc hay quyết định. Bản harness chưa lọc khoảng số; bộ lọc khoảng, số Việt và `ownerVoice`/`lessonWrite`/`blocked` thêm sau, đo trên 4 phiên thật ở [số đo](experiments/2026-11-05-material-signals/README.md). Từ vựng phản đối của `ownerVoice` giữ hẹp có chủ ý: cụm cố định, không có "không" đứng giữa câu. `ownerVoice` và cờ `rejected` chỉ có trên Claude.

### 5.4 Harvest (bước 4)

Prompt `prompts/harvest.md` gồm, theo thứ tự (lấy từ biến thể e4 trong [harness/prompts.mjs][h-prompts]):

1. Transcript rút gọn trong thẻ `<transcript>`.
2. Nhiệm vụ, 6 tín hiệu gợi ý (không phải ngưỡng), "không khớp mà thấy hay thì vẫn ghi, `signals: [khác]`".
3. Luật riêng tư (chỉ ghi cơ chế, con số, tên công cụ).
4. **Câu chống tự lọc:** "chuyện nhỏ, vui, hỏng rồi sửa xong là quên... vẫn ghi; rà lại toàn bộ một lượt nữa".
5. **Danh sách điểm nóng và lệnh trả lời TỪNG điểm:** `id`, `verdict` (`story` | `skip`), `story_title` hoặc `reason`.
6. Định dạng JSON đầu ra.

Đầu ra mỗi chuyện: `title`, `signals`, `lines`, `context`, `what_happened`, `lesson`, `artefact`.

Khác e4 ở một điểm: **bỏ phần người ngoài khỏi prompt harvest**, vì bước người ngoài đã thành lần gọi riêng (bước 9). Thay đổi này **chưa được thử**. Nếu đo thấy harvest rơi về cụm ngắn nhiều hơn, đưa phần người ngoài có cấu trúc trở lại prompt harvest (giữ cả bước 9).

Prompt harvest **không** đưa danh sách chuyện đã có trong hộp. Thí nghiệm chỉ chạy với hộp rỗng; bất đồng 5 chưa thử (TN 6). Chống trùng làm ở bước 6.

### 5.5 Kiểm đủ điểm nóng và gọi bù (bước 5)

```text
answered = các id trong hotspots[] có verdict hợp lệ
missing  = điểm nóng đầu vào - answered
nếu missing rỗng: xong
nếu không: gọi prompts/harvest-fill.md (transcript + chỉ các điểm missing), gộp kết quả
lặp tối đa harvest.fillRetries lần (mặc định 1)
còn thiếu: ghi số thiếu vào sổ và log, không làm hỏng lần gom
```

Vòng gọi bù **chưa được thử** (TN 7).

**Kiểm đầu ra mọi lời gọi model** (áp cho bước 4–9):

1. `llm.call` chạy `claude -p ... --output-format json`, giết tiến trình khi quá `timeoutSec`. Lỗi khi: mã thoát ≠ 0, quá giờ, `is_error: true`, hoặc thiếu `result`. Chi phí lấy từ `total_cost_usd` (thiếu thì ghi `null`).
2. `extractJson(result)` rồi `validate<Step>(json, input)` trả danh sách lỗi. Ví dụ với harvest: id điểm nóng lạ hoặc thiếu, `verdict` ngoài `story|skip`, chuyện thiếu `title`/`what_happened`/`lines`. Với chấm: `tension` ngoài danh sách, `strength`/`stakes` ngoài 0–3, id cụm lạ hoặc thiếu.
3. Có lỗi thì gọi lại một lần. Vẫn lỗi: bước đó coi là hỏng, lần gom thành `partial` (mục 6.3). Riêng thiếu id điểm nóng thì đi vòng gọi bù ở trên, không tính là lỗi khuôn.
4. `runs = N > 1` mà một lần hỏng: dùng các lần còn lại, ghi số lần hỏng vào sổ. `hits` vẫn tính trên số lần chạy thành công (`runs` ghi số lần thành công).
5. Mọi lần chạy harvest đều hỏng: lần gom là `failed`.

### 5.6 Số lần chạy harvest

| Cấu hình | Dùng khi | Hệ quả |
|---|---|---|
| `harvest.runs = 1` (mặc định) | Dùng hằng ngày | Rẻ nhất. `hits` của mọi chuyện là 1, xếp hạng dựa vào tension và stakes + strength. Với prompt e4, mỗi lần riêng lẻ đạt 6–7/7 đáp án và 7–8/8 chuyện `t` (TN 4.1, 6b) |
| `harvest.runs = N > 1` | Muốn đếm đồng thuận, hoặc phiên quan trọng | Chi phí harvest nhân N. `hits` thành tín hiệu xếp hạng: chuyện chỉ 1–3/5 lần bắt đều là `s` (TN 6b) |

**Cấu hình `runs = 1` chưa được thử như một khối.** Các số trên đo với prompt e4 **có** phần người ngoài (c), mà (c) cũng sinh chuyện; prompt harvest v2 đã bỏ (c) (mục 5.4). Tension và stakes đo trên tóm tắt của 38 cụm gộp từ 5 lần chạy; với `runs = 1` và không có chuyện cũ, PRD bỏ bước gộp và chấm thẳng trên chuyện thô của một lần chạy (mục 5.7). Xem mục 11, điều 4 và 9.

### 5.7 Gộp cụm và chấm (bước 6–8)

- **Gộp cụm** dùng prompt "Gộp cụm" trong [prompts-rank.md][h-rank] mục 1. Đầu vào là mọi chuyện của mọi lần chạy và mọi khúc (mục 6.2), cộng các chuyện đã có trong hộp của **cùng phiên** (id dạng `box:<id>`, `summary` = đoạn "Chuyện gì xảy ra" của file đó), để chuyện của cửa sổ sau gộp vào file cũ thay vì tạo file mới. Phần thêm này chưa thử.
- Script kiểm: mọi id đầu vào nằm trong đúng một cụm. Sai thì gọi lại một lần, vẫn sai thì mỗi chuyện thành một cụm riêng và ghi log.
- Cụm chứa một id `box:` thì gộp vào file đó. Cụm chứa từ hai id `box:` trở lên: gộp phần mới vào id `box:` nhỏ nhất (theo thứ tự chữ), các file cũ còn lại để nguyên và ghi log "cụm trùng file cũ" (không xoá, không đổi file nào ngoài file đích). Cụm không có id `box:` thành file mới.
- `harvest.runs = 1` và không có chuyện cũ cùng phiên thì bỏ qua lời gọi gộp cụm: mỗi chuyện là một cụm.
- **Hook, tension** dùng prompt mục 2 của [prompts-rank.md][h-rank]. Trộn thứ tự, ẩn `hits`. `none` là câu trả lời hợp lệ.
- **Stakes** dùng prompt mục 3, biến thể `si` (tự suy việc chính). Không dùng `sg`. Gửi mọi cụm của phiên (cũ và mới) để suy `main_goal` đúng mạch. Mỗi cửa sổ suy lại `main_goal`; sổ giữ danh sách `mainGoals[]` theo cửa sổ (mục 6.3), không ghi đè. Điểm stakes của chuyện cũ `status: raw` được cập nhật theo lần chấm mới nhất.
- Hai prompt chấm giữ tách như lúc thử. Gộp làm một lời gọi là tối ưu chưa kiểm.
- Model: Sonnet cho cả ba bước. Haiku chấm tension tạm được (AUC 0,75–0,79) nhưng kém rõ ở stakes (0,83–0,85) (TN 6c, 6d mục 5).

### 5.8 Người ngoài (bước 9)

- Prompt mục 4 của [prompts-rank.md][h-rank]: transcript rút gọn **của cửa sổ đang gom** + danh sách tiêu đề cụm. **Đầu vào khác lúc thử:** thí nghiệm đưa danh sách chuyện của một lần cố định (e4-2) và chạy một lần trên cả phiên (TN 4, TN 7). Chạy theo cửa sổ và đưa tiêu đề cụm là thay đổi chưa thử.
- Chạy ngay sau bước 6, trước bước 7–8 (mục 5.1).
- Mục có `already_picked` thì thêm góc kể vào chuyện đó (mục "Góc người ngoài" trong thân file) và thêm `outsider` vào `hit_by`.
- Mục `already_picked: null` thành cụm mới (`hit_by: [outsider]`, `title` = `what`, `summary` = `what` + `common_practice`), rồi đi qua bước 7–8 như các cụm khác.
- Lúc thử, 13/16 mục trùng chuyện đã có (TN 4.2): bước này chủ yếu **đổi góc kể**, ít tìm thêm sự kiện. Nhánh "thành chuyện mới" chỉ dựa trên 3 mục.
- Chi phí khoảng 0,65 USD **mỗi lần gọi** (một cửa sổ cỡ 157k token), vì đọc lại toàn bộ transcript của cửa sổ (TN 4.3). Phiên có PreCompact rồi SessionEnd thì trả hai lần, mỗi lần trên phần mới. Tắt được bằng `outsider.enabled = false`.
- Nhãn user lệch với chấm của Opus ở 2 mục gap 3 (TN 6b mục 4). Chưa biết lỗi ở bước này hay ở curse of knowledge của user. Chờ thí nghiệm 7.

### 5.9 Xếp hạng (bước 12)

```text
khoá xếp = (chỉ outsider thấy ? 1 : 0, tension ≠ none ? 0 : 1, -(stakes + strength), -hits, -date)
```

- **Đổi 2026-11-05** ([thí nghiệm xếp hạng](experiments/2026-11-05-ranking/README.md)): cộng thay vì nhân, vì strength của chuyện tension `none` luôn là 0 nên phép nhân bỏ qua stakes của chúng; chuyện chỉ bước outsider tìm ra (không có harvest) xuống cuối vì hiếm khi là `t`. Trên 8 phiên nhãn nháp: `t` nửa trên 21/30 → 23/30.

- Không có ngưỡng. `list --rank` hiện hết, chỉ đổi thứ tự.
- Lọc `stakes ≥ 2` từng cho precision 100% nhưng mất 1–2 chuyện `t` (gộp commit gỡ dữ liệu lộ; máy đề xuất 179 viết tắt) (TN 6d mục 3). Vì vậy không có cờ lọc stakes mặc định.
- Số đo của biến thể chọn (`si` Sonnet, TN 6d bảng): AUC stakes 0,93–0,94; AUC stakes × strength 0,96–0,98, với strength lấy từ lần "tension Sonnet 1". Biến thể `sg` Sonnet thấp hơn và dao động hơn (0,85–0,92; nhân strength 0,87–0,95).
- **Cảnh báo:** giả thuyết stakes được đặt sau khi đã xem nhãn của chính bộ dữ liệu đó. Con số AUC 0,9+ chắc chắn lạc quan. Phải kiểm lại trên phiên mới có nhãn mới (DM.10) trước khi tin.

### 5.10 Chi phí ước tính một cửa sổ cỡ 157k token

Bảng tính cho **một cửa sổ** (một lần gom). Phiên gom hai lần (PreCompact rồi SessionEnd) trả gần gấp đôi phần đọc transcript (harvest, người ngoài).

| Bước | Model | USD | Nguồn |
|---|---|---:|---|
| Harvest, 1 lần | Haiku | 0,08–0,30 | TN 4.3 |
| Gọi bù | Haiku | chưa đo | |
| Gộp cụm | Sonnet | chưa đo (chỉ đọc tóm tắt, chắc nhỏ) | |
| Hook, tension | Sonnet | khoảng 0,08 | TN 6c |
| Stakes | Sonnet | khoảng 0,05 | TN 6d |
| Người ngoài | Sonnet | khoảng 0,65 | TN 4.3 |
| **Tổng, `runs = 1`** | | **khoảng 0,9–1,1** | |

---

## 6. Phần cơ học

### 6.1 Nguồn transcript

| | Claude Code | Codex |
|---|---|---|
| Vị trí | `~/.claude/projects/<cwd mã hoá>/<session-uuid>.jsonl` | `~/.codex/sessions/YYYY/MM/DD/rollout-<thời điểm>-<uuid>.jsonl` |
| Tìm theo repo | Dùng `transcript_path` từ hook nếu có. Quét bù: mọi thư mục trong `~/.claude/projects/` có tên **bắt đầu bằng** git root đã mã hoá (thay ký tự không phải chữ, số bằng `-`), để gồm cả phiên mở ở thư mục con; rồi xác nhận bằng trường `cwd` trong file (phải nằm trong git root). Worktree nằm ngoài thư mục repo: xem câu hỏi mở 5 | Dòng `session_meta` có `cwd`. Giữ phiên có `cwd` nằm trong git root của repo |
| Id phiên | `claude:<8 ký tự đầu uuid>` | `codex:<8 ký tự đầu uuid>` |
| Thời điểm | trường `timestamp` của dòng | trường `timestamp` của dòng (kiểm khi làm DM.3) |
| Lời user | dòng `type: user`, nội dung text. Trước khi lọc: thẻ `<command-name>/bip</command-name>` thành `Entry{kind: 'user', bip: true}`. Sau đó bỏ dòng bắt đầu `<command-`, `<local-command`, `<system-reminder` | `response_item` có `role: user` (bỏ `developer`). Không nhận ra `/bip` (prompt tuỳ chỉnh đã bung thành chữ) |
| Lời agent | `type: assistant`, phần `text` | `response_item` có `role: assistant` |
| Lệnh tool | phần `tool_use`. `Bash` → `op: shell`; `Edit/Write/MultiEdit/NotebookEdit` → `op: write`, `paths` = `file_path`/`notebook_path`; còn lại `op: other` | `function_call` hoặc `custom_tool_call`. `shell`/`exec_command` → `op: shell`; `apply_patch` → `op: write`, `paths` tách từ các dòng `*** Update File:`, `*** Add File:`, `*** Delete File:` trong thân patch; còn lại `op: other`. Tên tool thật **phải kiểm khi làm DM.3** |
| Kết quả tool | phần `tool_result`, `is_error`, chuỗi `Exit code N` | `response_item` loại `*_call_output`. Cách lấy exit code: **phải kiểm khi làm DM.3**. Không lấy được thì `exitCode: null` |
| Bỏ | thinking, dòng `isCompactSummary` | `reasoning`, `event_msg` (trùng với `response_item`), `turn_context`, `world_state` |

Định dạng Codex trên đây đọc từ cấu trúc một rollout trên máy (chỉ tên khoá). Pipeline chưa từng chạy trên transcript Codex. Nếu tên tool hay exit code của Codex khác giả định, `gitReversal`, `metaWrite`, `nonzeroExit` sẽ im lặng không bắt gì: DM.3 phải có ca kiểm trên một rollout thật cho cả ba (mục 11, điều 6).

### 6.2 Entry chuẩn hoá và rút gọn

```js
// Entry: một mục đã chuẩn hoá, độc lập với nguồn
{ L: 1325,                 // số dòng trong file gốc (1-based)
  ts: '2026-11-02T09:14:03Z', // timestamp của dòng; null nếu không có
  kind: 'user' | 'assistant' | 'tool' | 'result',
  name: 'Bash',            // tên tool gốc (chỉ để hiển thị)
  op: 'shell' | 'write' | 'other', // tool: loại thao tác, độc lập nguồn
  paths: [],               // tool op=write: các file bị ghi
  text: '...',             // tool op=shell: dòng lệnh
  bip: false,              // user: dòng là lệnh /bip (chỉ Claude)
  isError: false,
  rejected: true,          // result: người dùng từ chối lệnh tool (chỉ Claude)
  exitCode: 144 }          // result: số nếu biết, null nếu không biết
```

Luật rút gọn (giữ như harness, TN 1):

| Loại | Giữ |
|---|---|
| USER | ≤ 2.500 ký tự |
| AGENT | ≤ 2.000 ký tự |
| TOOL | một dòng, ≤ 300 ký tự |
| RESULT | 2 dòng đầu (≤ 250 ký tự); khi exit ≠ 0 thì 3 dòng cuối (≤ 500 ký tự) |
| Tóm tắt compact, thinking | bỏ |

Phần bị cắt ghi `…[+n]`. Ước lượng token = số ký tự / 3,2.

**Cắt cửa sổ:** nếu văn bản rút gọn vượt `harvest.maxInputTokens` (mặc định 150k, gần cỡ đã thử 157k), chia thành nhiều khúc theo ranh giới Entry, chồng nhau 20 Entry (chồng chỉ để model có ngữ cảnh). Luật:

- Id điểm nóng là toàn cục `H<L>` (mục 5.3), giống nhau ở mọi khúc.
- Điểm nóng nằm trong phần chồng chỉ thuộc **khúc đầu** chứa nó: chỉ khúc đó phải trả lời và chỉ khúc đó bị kiểm đủ.
- Mỗi khúc chạy bước 4–5 riêng. Bước 6 nhận chuyện của mọi khúc và mọi lần chạy; chuyện trùng ở phần chồng gộp ở đây. Với `runs = 1` mà có từ 2 khúc thì **không** bỏ lời gọi gộp cụm.
- `hits` đếm theo số lần chạy khác nhau (`r1`, `r2`...), không theo khúc: một lần chạy bắt cùng chuyện ở hai khúc vẫn tính 1.

Phần chia khúc **chưa thử**.

### 6.3 Sổ đã gom (ledger)

Đặt ở `~/.cache/momentry/` (đổi bằng `MOMENTRY_CACHE`). Không bao giờ nằm trong repo.

```text
~/.cache/momentry/
  ledger.json              # sổ đã gom
  locks/<session>.lock     # khoá một phiên đang gom
  runs/<session>/<ts>/     # prompt và kết quả thô của model (để gỡ lỗi; chứa nội dung phiên)
  quarantine/<repo>/       # chuyện bị chặn hoặc chưa kiểm riêng tư (mục 6.7); không bao giờ trong repo
  hook.log                 # log hook và harvest nền, không chép nội dung chuyện
```

Thư mục tạo với quyền `0700`.

Ví dụ dưới đây là **minh hoạ**: id phiên, số dòng, số liệu không phải kết quả chạy thật.

```json
{
  "version": 1,
  "sessions": {
    "claude:0a1b2c3d": {
      "source": "claude",
      "transcriptPath": "/home/u/.claude/projects/-home-u-projects-x/0a1b2c3d-....jsonl",
      "repoRoot": "/home/u/projects/x",
      "lastLine": 4405,
      "size": 18233411,
      "mtimeMs": 1793600000000,
      "status": "done",
      "pending": false,
      "needsRescore": [],
      "mainGoals": [ { "toLine": 4405, "text": "…" } ],
      "harvests": [
        { "at": "2026-11-03T10:12:00Z", "fromLine": 1, "toLine": 4405, "runs": 1, "runsFailed": 0,
          "chunks": 1, "hotspots": 28, "hotspotsMissing": 0, "stories": 27, "written": 22, "merged": 5,
          "privacyBlocked": 0, "privacyUnchecked": 0, "usd": 0.94, "secs": 210, "status": "done" }
      ]
    }
  }
}
```

Luật:

- Gom từ `lastLine + 1` tới cuối file. Không có dòng mới thì không làm gì.
- File bị rút ngắn hoặc ghi đè (`size` hiện tại nhỏ hơn `size` trong sổ, hoặc số dòng nhỏ hơn `lastLine`): gom lại từ dòng 1. Bước 6 gộp với chuyện cũ cùng phiên nên không tạo file trùng.
- Kết quả từng lần gom:
  - `done`: tăng `lastLine` tới dòng cuối đã gom.
  - `partial` (thiếu điểm nóng sau gọi bù, một lần chạy harvest hỏng, hoặc một bước chấm hỏng): vẫn ghi những chuyện đã có và tăng `lastLine`. Id các chuyện thiếu điểm vào `needsRescore`. Lệnh `rescore --session ID` chấm lại (bước 9 tuỳ chọn, 7, 8) mọi chuyện `status: raw` của phiên rồi xoá `needsRescore`.
  - `failed` (mọi lần harvest hỏng, hoặc không ghi được gì): **giữ nguyên** `lastLine`; lần quét sau thử lại.
- `status` của phiên là `status` của lần gom gần nhất.
- Một phiên chỉ một tiến trình gom cùng lúc. Khoá tạo bằng `openSync(path, 'wx')` (tạo mới, thất bại nếu đã có), nội dung là `{pid, startedAt}`. Tiến trình đang chạy chạm (`utimes`) khoá sau mỗi bước.
- Tiến trình thứ hai gặp khoá: nếu khoá còn sống thì đặt `pending: true` rồi thoát (mã 5); tiến trình đang giữ khoá thấy `pending` thì gom thêm một vòng trước khi nhả khoá.
- Khoá coi là chết khi pid ghi trong khoá không còn sống (`process.kill(pid, 0)` báo `ESRCH`), **hoặc** `mtime` của khoá cũ hơn `lock.staleSec` (mặc định 3600 giây, lớn hơn tổng timeout của mọi bước). Khoá chết được gỡ rồi tạo lại bằng `wx`.
- Ghi `ledger.json` bằng file tạm rồi đổi tên.

### 6.4 Hook

| Runtime | Sự kiện | Lệnh | Việc |
|---|---|---|---|
| Claude Code | `PreCompact` | `momentry hook pre-compact` | Gom nền phiên hiện tại (`transcript_path` từ stdin) |
| Claude Code | `SessionEnd` | `momentry hook session-end` | Như trên |
| Claude Code | `SessionStart` | `momentry hook session-start` | Quét bù nền: mọi phiên của repo có `mtime`/`size` khác sổ |
| Codex | `PreCompact` | `momentry hook pre-compact --codex` | Gom nền phiên hiện tại |
| Codex | `SessionEnd` | `momentry hook session-end --codex` | Như trên |
| Codex | `SessionStart` | `momentry hook session-start --codex` | Quét bù nền `~/.codex/sessions` theo `cwd` |

Codex (sửa 2026-11-03 theo mã nguồn `codex-rs/protocol/src/hooks.rs`): khoá sự kiện trong `hooks.json` là PascalCase như Claude Code (`PreCompact`, `SessionEnd`, `SessionStart`); khoá snake_case (`pre_compact`, `session_start`) bị Codex bỏ qua im lặng, nên bản cũ của PRD không bao giờ được gọi. Tên snake_case chỉ xuất hiện trong khoá `hooks.state` của `config.toml` (nhãn duyệt tin cậy). Codex chỉ chạy hook mới sau khi user duyệt tin cậy; tự động hoá có thể dùng `--dangerously-bypass-hook-trust`. Đường dự phòng `momentry scan --codex` vẫn còn.

**Luật của lệnh `hook`:**

1. `STORY_HARVEST=1` trong môi trường: thoát 0 ngay.
2. Đọc JSON stdin (`session_id`, `transcript_path`, `cwd`, `hook_event_name`). Lỗi đọc thì ghi `hook.log`, thoát 0.
3. Repo của `cwd` không được quan sát (mục 6.5): thoát 0.
4. Tách tiến trình nền bằng `spawn(process.execPath, [binPath, 'harvest' | 'scan', ...], {detached: true, stdio: 'ignore', env: {...process.env, STORY_HARVEST: '1'}})` rồi `unref()`. Dùng `process.execPath` (đường dẫn node đang chạy) để không phụ thuộc PATH của môi trường hook. Thoát 0.
5. Không in gì ra stdout. Mục tiêu dưới 100 ms.

Lệnh hook gọi **shim đã cài** bằng đường dẫn tuyệt đối, ví dụ `"/home/u/.local/bin/momentry" hook pre-compact` (Windows: `"…\momentry\bin\momentry.cmd" hook pre-compact`). Shim tìm `node` trên PATH lúc chạy và đọc bản đang dùng từ `<install>/current`, nên nâng Node hay `momentry update` không làm hook hỏng. Khi chạy thẳng từ mã nguồn (git checkout), lệnh hook là `"<node>" "<repo>/bin/momentry.mjs" hook …`; `momentry doctor` báo hook trỏ tới file không còn và `doctor --fix` sửa lại.

**Quét bù không đụng phiên đang mở:** bỏ qua file transcript có `mtime` trong `scan.quietMinutes` phút gần nhất (mặc định 30), trừ phiên vừa gọi hook. Nhiều phiên cùng chạy trên một máy là chuyện thường.

**Cài hook** (quyết định của user 2026-11-03, thay cho "chỉ in"): `momentry init` (và `momentry connect [claude|codex]`) cài hook vào `~/.claude/settings.json` / `~/.codex/hooks.json` và `/bip` vào `~/.claude/commands/bip.md` / `~/.codex/prompts/bip.md` cho host có trên máy. Điều kiện: có `--yes`, hoặc user trả lời có trên TTY; không TTY mà thiếu `--yes` thì bỏ qua và chỉ lệnh `momentry connect --yes`. Luật sửa file của host: từ chối file JSON hỏng; sao lưu `<file>.momentry-bak-<ts>` trước khi ghi; ghi atomic, giữ quyền file và thụt lề; huỷ nếu file bị đổi giữa lúc đọc và lúc ghi; chỉ đụng mục có lệnh `momentry … hook <event>`; `bip.md` mang dòng đánh dấu `momentry:bip sha256=…` ở cuối, user sửa file thì momentry không ghi đè và không xoá. `--dry-run` in đúng từng thay đổi. `momentry connect --remove` và `momentry uninstall` gỡ ngược. `momentry hooks --print` vẫn in đoạn cấu hình cho ai muốn tự dán. Bước duyệt tin cậy hook Codex (`hooks.state` trong `~/.codex/config.toml`) vẫn do Codex hỏi user.

**`/bip`:** một lệnh slash cho Claude (`~/.claude/commands/bip.md`) và prompt tương ứng cho Codex (`~/.codex/prompts/bip.md`), do `init`/`connect` cài. Lệnh này bảo agent gọi `momentry add --by human --note "<ghi chú>"`, tạo ngay một chuyện `captured_by: human`, `hit_by: [bip]`. `add` cũng qua bộ kiểm riêng tư (mục 6.7). Trên Claude, dòng `/bip` trong transcript còn thành điểm nóng loại `bip` ở lần gom sau (mục 5.3). Trên Codex chỉ có đường `add`.

**Host thêm (quyết định của user 2026-11-03):** pi, omp (oh-my-pi), Antigravity. pi/omp không có hook lệnh shell: momentry ghi extension `extensions/momentry.ts` gọi `momentry hook <event> --pi|--omp` khi `session_start`, `session_before_compact`, `session_shutdown`. Antigravity chỉ có `SessionStart` và `Stop` (chạy mỗi lượt, chặn agent): chỉ dùng `SessionStart`, ghi chỉ mục phiên (transcript không có cwd) và gom các phiên agy trước đó của repo. momentry cài và quét ở mọi profile tìm thấy (`~/.codex-*`, `~/.pi/accounts/*`, `~/.omp/profiles/*/agent`, `~/.agy-homes/*/.gemini`). Session id của host mới lấy 8 hex cuối của uuid (UUIDv7 trùng 8 hex đầu trong khoảng 65 giây). Chi tiết: [installation.md](installation.md#host-được-hỗ-trợ).

### 6.5 Cấu hình

**Repo được quan sát** **(mặc định, user có thể đổi):** chỉ repo có file `.momentry.json` ở git root (có thể là `{}`), hoặc nằm trong biến `MOMENTRY_REPOS` (danh sách đường dẫn, phân cách `:`; `;` trên Windows). Lý do: hook cài ở mức user sẽ chạy trong mọi repo, không nên tự ghi thư mục mới vào repo không liên quan. `momentry init` tạo file này.

**Thứ tự ưu tiên:** cờ dòng lệnh > biến môi trường > `<repo>/.momentry.json` > cấu hình người dùng (`~/.config/momentry/config.json`; Windows `%APPDATA%\momentry\config.json`; xem `momentry paths`) > mặc định. `momentry config show` in giá trị hiệu lực kèm lớp đặt nó; `momentry config set/unset` sửa có kiểm.

| Khoá | Mặc định | Ghi chú |
|---|---|---|
| `box` | `docs/storytelling-material` | Tương đối với git root. **Mặc định, user có thể đổi.** Env: `MOMENTRY_BOX` |
| `repo` | tên thư mục git root | Ghi vào trường `repo` |
| `harvest.runs` | 1 | Mục 5.6 |
| `harvest.model` | `haiku` | |
| `harvest.fillRetries` | 1 | |
| `harvest.maxInputTokens` | 150000 | |
| `harvest.timeoutSec` | 600 | Lần chạy dài từng mất 167 giây (TN 2) |
| `rank.model` | `sonnet` | Gộp cụm, hook/tension, stakes |
| `outsider.enabled` | true | |
| `outsider.model` | `haiku` | Đổi từ `sonnet` sau khi đo: rẻ hơn ~8 lần ở bước này, chất lượng xếp hạng không giảm ([cost-cuts](experiments/2026-11-05-cost-cuts/README.md)) |
| `angle.enabled` | true | Bước 13 trong lúc gom; `momentry angle` chạy được cả khi tắt |
| `angle.model` | `haiku` | `sonnet` viết gọn chữ hơn đôi chỗ nhưng tốn ~13 lần, hay quá 3 câu và chưa thấy hơn ([TN góc kể](experiments/2026-11-05-angle/README.md)) |
| `angle.topN` | 10 | Số chuyện đầu bảng của phiên được xét; 0 = không gọi |
| `angle.profileModel` | `haiku` | Viết hồ sơ dự án mà góc kể mở đầu bằng nó; mỗi dự án một lần (~0,001–0,002 USD), lại khi README/docs đổi ([TN xương chuyện](experiments/2026-11-05-story-spine/README.md)) |
| `llm.promptCache` | `off` | Mỗi prompt chỉ gửi một lần nên không cache (`DISABLE_PROMPT_CACHING=1`); `5m`, `1h`, `auto` (Claude Code tự chọn) |
| `scan.quietMinutes` | 30 | |
| `privacy.sources` | `[]` | **Chỉ đọc từ cấu hình người dùng hoặc env `MOMENTRY_PRIVACY_SOURCES`**, bỏ qua nếu nằm trong `.momentry.json`, để đường dẫn riêng không vào repo |
| `privacy.allowFile` | `<box>/.privacy-allow` | Chỉ chứa từ chung hay bị báo nhầm |
| `privacy.allowUnchecked` | false | true thì khi không có nguồn chặn vẫn ghi vào repo, kèm `privacy: unchecked`. **Chỉ đọc từ cấu hình người dùng hoặc env `MOMENTRY_ALLOW_UNCHECKED=1`**, bỏ qua nếu nằm trong `.momentry.json` |
| `lock.staleSec` | 3600 | Mục 6.3 |

Biến môi trường khác: `MOMENTRY_CONFIG` (đường dẫn cấu hình người dùng), `MOMENTRY_CACHE`, `MOMENTRY_FAKE_LLM` (như `--fake-llm`), `STORY_HARVEST`.

Cài đặt: `install.sh` (Linux, macOS, WSL) hoặc `install.ps1` (Windows) đặt mã nguồn vào `~/.local/share/momentry/versions/<v>` (Windows `%LOCALAPPDATA%\momentry\app`) và shim `momentry` vào `~/.local/bin`; chi tiết ở [installation.md](installation.md). Hook gọi shim bằng đường dẫn tuyệt đối (mục 6.4). Nền tảng hỗ trợ: Linux, macOS, Windows native, WSL.

**Node:** cần Node ≥ 20 (`Array.prototype.findLast`, `readdirSync({recursive})`). `bin/momentry.mjs` kiểm `process.versions.node` lúc chạy, thấp hơn thì in lỗi và thoát 1 (riêng lệnh `hook` vẫn thoát 0, không làm gì). Không có `package.json`; mọi `import` module có sẵn phải dùng tiền tố `node:`.

### 6.6 Định dạng hộp

Mỗi chuyện một file `<box>/YYYY-MM-DD-ten-ngan.md`. Tên file (bỏ `.md`) là id của chuyện, không đổi sau khi tạo. Trường `id` trong frontmatter là **tuỳ chọn**: máy luôn ghi cho file mới; file thiếu `id` (như 8 chuyện mẫu) lấy id từ tên file; có `id` mà khác tên file thì `check` báo lỗi khuôn. `ten-ngan` sinh từ tiêu đề: bỏ dấu, chữ thường, gạch nối, tối đa 6 chữ; trùng thì thêm `-2`. Slug cũng qua bộ kiểm riêng tư (mục 6.7). Khuôn theo bản B ([sample/README.md][mau]), thêm các trường máy.

**Mã chuyện** (`lib/story-code.mjs`): mỗi chuyện có thêm một mã ngắn dạng `M-XXXX` (4 ký tự Crockford base32: `0-9 A-Z` bỏ `I L O U`) để gọi nhanh trong CLI, giao diện web, chat và link `[[M-XXXX]]` của Obsidian. Id và tên file giữ nguyên; mã chỉ là tên gọi thêm.

- Ứng viên thứ k của một id: 20 bit đầu của `sha256(id)` (k = 0) hoặc `sha256("<id>#<k>")` (k ≥ 1), viết thành 4 ký tự.
- Mã đã ghi trong file (`code: M-XXXX`) là chuẩn, kể cả khi khác ứng viên 0. Chuyện chưa có `code` (file cũ, 8 chuyện mẫu) lấy mã bằng cách tính: theo thứ tự id (cũ trước), mỗi chuyện lấy ứng viên đầu tiên chưa bị mã đã ghi hay chuyện đứng trước trong cùng hộp giữ. Không cần chuyển đổi dữ liệu.
- Chuyện mới được ghi `code` và `aliases: [M-XXXX]` ngay sau `id`, lấy ứng viên đầu tiên chưa chuyện nào trong hộp giữ, nên không bao giờ làm mã của chuyện cũ đổi. `momentry check --fix` ghi mã đang tính vào các file chưa có (không mã nào đổi). Xoá một chuyện chưa ghi mã có thể làm mã tính của chuyện khác dời; ghi mã bằng `check --fix` để chốt.
- Hai file ghi cùng một mã (hiếm: hai tiến trình tạo chuyện cùng lúc, hoặc sửa tay) thì `check` báo lỗi khuôn ở cả hai; tra theo mã đó báo trùng, tra theo id vẫn được.
- Mọi chỗ nhận id chuyện cũng nhận mã, hoa thường đều được, có hoặc không `M-`: `show`, `mark`, `angle --story`, API của giao diện web (`/api/stories/<dự án>/<id hoặc mã>`), trang duyệt nhãn của bộ đo. `list` in cột `code`; `list --json` và `show --json` có trường `code`. Thẻ chuyện và trang chuyện trên giao diện web, thẻ trên trang duyệt nhãn hiện mã.
- Bộ kiểm riêng tư bỏ qua `code` và các mục mã trong `aliases` (alias tự viết vẫn bị kiểm); đối chiếu nhãn của bộ đo chỉ đọc `hook` và thân, không đọc frontmatter.

```yaml
# giá trị minh hoạ, không phải kết quả chạy thật
---
id: 2026-11-02-mot-ky-tu-unicode
code: M-7K3Q                        # mã chuyện; máy ghi cho file mới, file cũ tính ra (xem trên)
aliases: [M-7K3Q]                   # để [[M-7K3Q]] trong Obsidian trỏ tới file này
date: 2026-11-02                    # ngày chuyện xảy ra (timestamp của dòng đầu trong lines)
repo: obsidian-pkm-automation
status: raw                         # raw | picked | drafted | published | dropped
signals: [nguyên nhân bất ngờ]
source: chat Claude, V15            # người đọc hiểu
sessions: [claude:95ca719b]
captured_by: harvest                # live | harvest | human
hit_by: [hotspot, harvest, outsider] # hotspot | harvest | outsider | bip | live | human
lines: [claude:95ca719b#L812, claude:95ca719b#L861]
hook: "Một ký tự Unicode làm điểm tìm kiếm tụt 8 lần"
tension: nho_ma_to                  # nho_ma_to | giup_ma_hai | tuong_ma_hoa_ra | hop_ma_tan | cam_ma_van_lot | it_ma_nhieu | khac | none
sides: ["một kiểu viết Unicode", "điểm tụt 8 lần"]
strength: 3                         # 0-3
stakes: 3                           # 0-3, so với main_goal của phiên
hits: 1                             # số lần chạy harvest có bắt chuyện này (trên runs)
runs: 1                             # tổng số lần chạy harvest thành công đã xét chuyện này
angle: "Điểm tìm kiếm tụt mà code không đổi: ..." # bước 13; `none` = đã xét, không có góc kể; thiếu = chưa xét
audience: "dev làm tìm kiếm tiếng Việt" # bước 13; chỉ có khi angle có chữ
spine_context: "Một app ghi chú chạy trên máy, đang làm tìm kiếm tiếng Việt." # bước 13, xương chuyện; chỉ ô đã điền
spine_context_lines: [profile, "claude:95ca719b#L12"]   # bằng chứng của ô; `profile` = hồ sơ dự án
spine_turn: "Tưởng ... ; hoá ra ..."  # các ô: context, want, obstacle, turn, action, outcome, takeaway
spine_turn_lines: ["claude:95ca719b#L861"]
completeness: 5                     # bước 13: số ô xương chuyện đã điền, 0-7
privacy: checked                    # checked | unchecked (chỉ khi privacy.allowUnchecked)
links: [2026-11-02-do-tim-kiem-tieng-viet]
threads: [obsidian-hieu-tieng-viet]
---

# Một kiểu viết Unicode làm điểm tìm kiếm tụt 8 lần

**Góc kể:** ... (cùng chữ với `angle`; chỉ khi bước 13 có góc kể)
**Bối cảnh:** ...
**Chuyện gì xảy ra:** ...
**Bài học:** ...
**Artefact:** ... (phải che gì)
**Góc người ngoài:** cách làm phổ biến là ...; ở đây khác ở ... (chỉ khi bước 9 có)
```

**Dựng file từ cụm** (`story.mjs`, `buildStory(cluster, members, scores)`), hoàn toàn bằng script, không gọi thêm model:

| Trường | Lấy từ |
|---|---|
| Tiêu đề `#` | `cluster.title` (cụm một chuyện: `title` của chuyện đó) |
| Bối cảnh, Chuyện gì xảy ra, Bài học, Artefact | `context`, `what_happened`, `lesson`, `artefact` của **thành viên có `what_happened` dài nhất** (thành viên đại diện). Cụm từ bước 9 không có thành viên harvest: Chuyện gì xảy ra = `what`; Bài học, Artefact để trống |
| Góc người ngoài | `common_practice` và `what` của mục bước 9 trỏ vào cụm (nếu có) |
| `date` | `ts` của `Entry` có `L` nhỏ nhất trong `lines`, đổi sang ngày giờ địa phương; không có `ts` thì ngày của lần gom |
| `signals` | hợp `signals` của mọi thành viên |
| `lines` | hợp `lines` của mọi thành viên, khử trùng, sắp tăng, đổi dạng `<sid>#L<n>` |
| `hit_by` | `hotspot` nếu `lines` chứa dòng của một điểm nóng có verdict `story`; `harvest` nếu có thành viên harvest; `outsider` nếu bước 9 trỏ vào; `bip` nếu có điểm nóng `bip` |
| `hits` | số lần chạy khác nhau (`r1`, `r2`...) có thành viên trong cụm |
| `runs` | số lần chạy harvest thành công của cửa sổ này |
| `hook`, `tension`, `sides`, `strength`, `stakes` | bước 7–8 |
| `source` | `chat Claude` hoặc `chat Codex`, kèm id phiên |
| `angle`, `audience`, `spine_*`, `completeness`, dòng Góc kể | bước 13, ghi sau khi file đã có (một bản vá như lúc gộp); không có góc kể thì `angle: none`, không có `audience` và dòng Góc kể (xương chuyện vẫn ghi) |

Thử với prompt gộp cụm trả đủ 4 đoạn thân bài là tối ưu chưa kiểm; v2 giữ prompt gộp cụm như lúc thử.

Luật ghi:

- Chuyện mới: tạo file. Chuyện gộp vào file cũ (bước 6): chỉ **nối** vào các trường danh sách (`sessions`, `signals`, `hit_by`, `lines`, khử trùng); `runs += runs của cửa sổ này`; `hits += số lần chạy của cửa sổ này có bắt chuyện đó`. Nhờ vậy `hits ≤ runs` luôn đúng và `hits/runs` giữ nghĩa "tỉ lệ lần chạy bắt được". Không viết lại thân bài; mục "Góc người ngoài" chỉ được thêm nếu chưa có. Mọi phần nối thêm qua bộ kiểm riêng tư trước khi ghi.
- Trường máy (`hook`, `tension`, `sides`, `strength`, `stakes`, `hits`, `runs`) được máy cập nhật khi `status: raw`. User đã đổi `status` thì máy không đụng nữa.
- Máy không bao giờ đổi `status`, `links`, `threads` của file đã có. Chuyện mới có thể có `links`/`threads` rỗng.
- Góc kể (`angle`, `audience`, xương chuyện `spine_*` và `completeness`, dòng `**Góc kể:**` ngay dưới tiêu đề) chỉ được ghi khi chuyện chưa có `angle`, ở mọi `status`; gộp chuyện ở lần gom sau không đổi nó. Chỉ `momentry angle --force` viết lại (thay cả trường lẫn dòng trong thân; xương chuyện cũ bị thay hẳn). `completeness` không vào khoá xếp hạng (mục 5.2 bước 12); bộ đo có `--rank-by completeness` để đo riêng.
- `main_goal` của phiên lưu trong sổ, không lưu trong từng chuyện.
- Chuyện cũ chưa có trường mới (8 chuyện mẫu) vẫn đọc được: trường thiếu coi là rỗng, xếp cuối khi `list --rank`.
- Frontmatter chỉ dùng tập con YAML. Parser tự viết, không npm. Ngữ pháp:
  - Mỗi dòng `khoá: giá trị`. Khoá là `[a-z_]+`. Dòng trống và dòng bắt đầu bằng `#` bị bỏ.
  - Giá trị là một trong: số nguyên; chuỗi trong ngoặc kép theo luật chuỗi JSON (`JSON.parse`); chuỗi trần (không bắt đầu bằng `"`, `[`); danh sách một dòng `[...]`.
  - Danh sách: phần tử là chuỗi trong ngoặc kép (luật JSON) hoặc chuỗi trần không chứa `,`, `[`, `]`, `"`. Tách theo dấu phẩy nằm ngoài ngoặc kép.
  - Comment cuối dòng ` # ...` chỉ nhận ra khi nằm **ngoài** ngoặc kép, sau giá trị trần hoặc sau `]`.
  - `stringify` luôn đặt ngoặc kép (dạng JSON) cho chuỗi chứa `:`, `#`, `,`, `[`, `]`, `"`, khoảng trắng đầu hay cuối, hoặc trông như số. `hook`, `sides`, `source` luôn có ngoặc kép.
  - Chuỗi trần ở mức trên cùng được chứa dấu phẩy (ví dụ `source: chat Claude, V15 (fork OHS)` trong mẫu).
  - Test: file máy sinh đọc rồi ghi lại đúng từng byte; 8 chuyện kiểu mẫu đọc, ghi, đọc lại cho cùng dữ liệu; ca `sides` có dấu phẩy trong ngoặc kép; `hook` có `:` và `#`.

### 6.7 Riêng tư

**Nguồn chặn** (`privacy.sources`), sinh danh sách chặn tại máy mỗi lần chạy, giữ trong bộ nhớ, không ghi ra đĩa:

| Loại | Cấu hình | Lấy gì |
|---|---|---|
| `vault-titles` | `{ "type": "vault-titles", "path": "/mnt/c/vault" }` | Tên file `.md` (bỏ thư mục bắt đầu bằng `_` hoặc `.`) |
| `json-fields` | `{ "type": "json-fields", "path": ".../golden-set.json", "fields": ["query", "relevant_paths"] }` | Giá trị chuỗi ở các trường nêu tên, kể cả tên file trong đường dẫn |
| `lines` | `{ "type": "lines", "path": "~/.config/momentry/names.txt", "proper": true }` | Mỗi dòng một cụm; `proper: true` thì cho khớp cả từ đơn |

**Khớp:**

1. Chuẩn hoá cả hai phía: NFC, chữ thường, gộp khoảng trắng.
2. Mỗi cụm chặn sinh 3 dạng: nguyên dấu, bỏ dấu (bỏ dấu kết hợp, `đ` → `d`), Telex (dấu thanh đặt cuối âm tiết: `xét nghiệm` → `xets nghieemj`).
3. So theo ranh giới từ trên văn bản đã chuẩn hoá và trên bản bỏ dấu của văn bản.
4. Mặc định chỉ báo cụm từ 2 chữ trở lên. Từ đơn chỉ báo khi nguồn có `proper: true`. Cụm đúng 2 chữ chỉ báo khi nguồn có `proper: true` hoặc mọi chữ đều viết hoa (dạng tên người). Lý do: tiếng Việt mỗi chữ là một âm tiết, nên tên note 2 chữ như "Câu hỏi", "Cửa sổ" thường là từ chung. Lần chạy thật đầu tiên (2026-11-03) cho thấy luật cũ chặn nhầm 7/8 chuyện; luật mới vẫn giữ lần chặn đúng duy nhất (một tên note 5 chữ lọt vào chuyện).
5. Từ trong `.privacy-allow` không bao giờ bị báo.

**Kiểm những gì:** mọi trường văn bản của frontmatter và thân, **slug tên file**, chuyện do `add` tạo (`--title`, `--note`), và mọi phần nối thêm vào file cũ (dòng `lines`, mục "Góc người ngoài", góc kể và `audience` của bước 13). Góc kể bị chặn hay chưa kiểm được thì vào `quarantine/` dưới dạng bản vá, như phần nối thêm.

**Hành vi** (áp cho `harvest`, `rescore`, `add`):

| Tình huống | `harvest` / `add` | `check` |
|---|---|---|
| Qua | Ghi vào hộp, `privacy: checked` | Mã 0 |
| Vi phạm | Không ghi vào repo. Ghi nguyên chuyện vào `~/.cache/momentry/quarantine/<repo>/` (ngoài repo, `0700`) để user xem và tự quyết, không mất recall im lặng. Log id tạm, trường, loại khớp. Không log chính cụm từ | Mã 2. In tên file, trường, cụm bị che (chữ đầu và độ dài, ví dụ `x… (11)`) |
| Không có nguồn chặn, hoặc nguồn không đọc được | Mặc định: **không ghi vào repo**. Ghi chuyện vào `quarantine/<repo>/` với lý do `unchecked`, ghi số vào sổ (`privacyUnchecked`), log "bỏ qua kiểm riêng tư". Chỉ khi `privacy.allowUnchecked = true` (cấu hình người dùng): ghi vào hộp kèm `privacy: unchecked` | Mã 3, in "bỏ qua kiểm riêng tư: không có nguồn chặn". Không bao giờ là mã 0 |

Lệnh `quarantine` liệt kê chuyện đang chờ; `quarantine --release ID` chạy lại kiểm riêng tư (lúc đó đã có nguồn chặn) rồi chuyển vào hộp nếu qua. Đây là thay đổi do phản biện đề xuất, không phải user chốt.

`check --staged` dùng được làm git pre-commit hook (user tự cài). Vài tuần đầu user nên lướt các chuyện `captured_by: harvest` trước khi commit (DB 4).

---

## 7. Cấu trúc code

### 7.1 Cây thư mục

```text

  bin/momentry.mjs        vỏ CLI: kiểm Node rồi gọi lib/cli.mjs
  lib/cli.mjs                parse theo bảng lệnh, gọi lệnh, in văn bản hoặc phong bì --json, đặt mã thoát
  lib/commands.mjs           bảng lệnh duy nhất: cờ, mặc định, ví dụ, mã thoát; sinh --help, help --json, docs/cli-reference.md
  lib/cli-output.mjs         lỗi dạng lỗi / vì / sửa; phong bì {schema, ok, data, error, next}
  lib/doctor.mjs, checks.mjs engine kiểm và sửa dùng chung cho doctor, init, status
  lib/hosts.mjs, safe-edit.mjs cài/gỡ hook và /bip cho Claude Code, Codex; sửa JSON của host an toàn
  lib/paths.mjs, proc.mjs    đường dẫn theo OS; tìm và chạy lệnh ngoài (claude.cmd trên Windows)
  lib/install.mjs, update.mjs, uninstall.mjs, tar.mjs  bố cục bản cài, shim, tự cập nhật, gỡ, đọc/ghi tarball
  lib/version.mjs, config-cmd.mjs  nguồn phiên bản duy nhất; lệnh config
  scripts/                   package-release.mjs, prepare-release.mjs, gen-cli-reference.mjs, test-installer.*, test-agent-native.sh
  install.sh, install.ps1    installer một lệnh
  lib/config.mjs             loadConfig({cwd, env, flags}) -> Config; isObserved(repoRoot)
  lib/repo.mjs               gitRoot(cwd), repoName(root)
  lib/sources/claude.mjs     listTranscripts(repoRoot) -> File[] (quét tiền tố, xác nhận cwd); readEntries(path, {fromLine, toLine}) -> Entry[]
  lib/sources/codex.mjs      listTranscripts(repoRoot) -> File[]; readEntries(path, {fromLine, toLine}) -> Entry[]; patchPaths(patch) -> string[]
  lib/reduce.mjs             render(entries) -> {text, approxTokens}; chunk(entries, maxTokens, overlap) -> Chunk[] ({entries, owns: Set<L>})
  lib/hotspots.mjs           nonzeroExit, metricPair, gitReversal, metaWrite, bipMark (thuần, xét op/paths); detect(entries) -> Hotspot[] (id H<L>)
  lib/prompts.mjs            render(name, vars) -> string; đọc prompts/*.md, điền {chỗ trống}
  lib/llm.mjs                call({key, model, prompt, timeoutSec}) -> {result, usd, secs}; thật (claude -p cô lập, giết khi quá giờ, bắt is_error) hoặc giả (--fake-llm)
  lib/json.mjs               extractJson(text): cắt từ { đầu tới } cuối rồi parse
  lib/validate.mjs           validateHarvest, validateCluster, validateHookTension, validateStakes, validateOutsider (json, input) -> Error[]
  lib/harvest.mjs            harvest(chunk, hotspots, cfg) -> {stories, answers}; coverage(hotspots, answers) -> missing
  lib/cluster.mjs            cluster(stories, existing, cfg) -> Cluster[]; checkPartition(ids, clusters); resolveBoxTarget(cluster) -> id | null
  lib/score.mjs              hookTension(clusters) -> Map; stakes(clusters) -> {mainGoal, map}
  lib/outsider.mjs           outsider(reducedText, clusters) -> OutsiderItem[]
  lib/story.mjs              buildStory(cluster, members, scores, entriesByL) -> {data, body}; mergePatch(old, cluster, ...) -> patch
  lib/privacy.mjs            loadBlocklist(sources) -> Blocklist | null; variants(term); check(text, blocklist, allow) -> Violation[]; checkStory(story, slug)
  lib/quarantine.mjs         put(repo, story, reason); list(repo); release(repo, id, blocklist)
  lib/viet.mjs               nfc, stripDiacritics, toTelex, slugify
  lib/frontmatter.mjs        parse(md) -> {data, body}; stringify(data, body) (ngữ pháp mục 6.6)
  lib/box.mjs                readBox(dir) -> Story[]; writeNew(story); mergeInto(id, patch); storiesOfSession(sid); findStory(dir, id|mã); backfillCodes(dir)
  lib/story-code.mjs         mã chuyện M-XXXX: candidateCode(id, k), assignCodes(stories), normalizeCode(input)
  lib/ledger.mjs             load(), save(), lock(sid) / touch / unlock (wx + pid + mtime), needsHarvest(sid, stat) -> {fromLine} | null; recordSpend(sid, {step, usd}) chi phí ngoài cửa sổ gom
  lib/rank.mjs               rankKey(story); sortRanked(stories)
  lib/angle.mjs              bước 13: pickStories, excerpt, angleOne (xương chuyện + góc kể), anglePatch, spineOf
  lib/asks.mjs               bước 13: sessionAsks(entries) yêu cầu của chủ phiên; asksFor(asks, line) khối yêu cầu của một chuyện
  lib/project-profile.mjs    bước 13: findSources(root), ensureProfile(root, cfg) hồ sơ dự án trong <cache>/profiles/
  lib/pipeline.mjs           runSession(sid, opts) -> Report: nối bước 1-11; rescore(sid)
  lib/hook.mjs               handleHook(event, stdin, flags); printHookConfig('claude'|'codex')
  lib/log.mjs                ghi hook.log, không chép nội dung chuyện
  prompts/harvest.md         bước 4 (từ e4, bỏ phần người ngoài)
  prompts/harvest-fill.md    bước 5, chỉ các điểm nóng còn thiếu
  prompts/cluster.md         bước 6 (prompts-rank.md mục 1)
  prompts/hook-tension.md    bước 7 (mục 2)
  prompts/stakes.md          bước 8 (mục 3, biến thể si)
  prompts/outsider.md        bước 9 (mục 4)
  prompts/angle.md           bước 13 (xương chuyện, góc kể)
  prompts/profile.md         bước 13 (hồ sơ dự án)
  prompts/bip.md             mẫu lệnh /bip cho Claude và Codex
  test/*.test.mjs            gồm imports.test.mjs: quét mọi .mjs, cấm import không có tiền tố node: hoặc đường dẫn tương đối
  test/fixtures/             transcript giả, vault giả, kết quả LLM giả
  README.md                  giới thiệu, cài, bắt đầu nhanh, cập nhật, gỡ
```

Prompt là văn bản tiếng Việt trong `prompts/`, không nằm trong code. Chỗ điền dạng `{transcript}`, `{hotspots}`, `{stories}`. Sửa prompt không cần sửa code.

### 7.2 CLI

```text
momentry <lệnh> [cờ]
```

| Lệnh | Việc | Cờ chính |
|---|---|---|
| `harvest` | Chạy pipeline bước 1–11 cho một phiên hoặc một file | `--session ID`, `--transcript FILE`, `--from-line N`, `--to-line N`, `--runs N`, `--no-outsider`, `--dry-run`, `--save-prompts DIR`, `--fake-llm DIR`, `--save-llm DIR`, `--blind`, `--repo DIR` |
| `scan` | Quét bù: gom mọi phiên của repo chưa gom hết | `--repo DIR`, `--codex`, `--claude`, `--dry-run`, `--quiet-minutes N` |
| `hook <event>` | Gọi từ hook, tách nền rồi thoát 0 | `--codex` |
| `hooks --print` | In đoạn cấu hình hook và mẫu `/bip` | `--claude`, `--codex` |
| `add` | Ghi một chuyện tay (dùng cho `/bip`); qua kiểm riêng tư | `--title`, `--note`, `--by human`, `--session ID` |
| `rescore` | Chấm lại (bước 9 tuỳ chọn, 7, 8) mọi chuyện `status: raw` của một phiên; xoá `needsRescore` | `--session ID`, `--no-outsider`, `--fake-llm DIR` |
| `quarantine` | Liệt kê chuyện bị giữ ngoài repo; thả vào hộp nếu qua kiểm | `--release ID`, `--repo DIR` |
| `angle` | Bước 13 cho chuyện đã có trong hộp (mặc định top `angle.topN` của cả hộp, chưa có góc kể) | `--top N`, `--story ID` (id hoặc mã), `--force`, `--dry-run`, `--json` |
| `list` | Bảng mã, id, ngày, status, hook, tension, stakes, strength, hits | `--rank`, `--status S`, `--thread T`, `--session ID`, `--json` |
| `show <id\|mã>` | In đầy đủ một chuyện, kèm mã | `--json` |
| `mark <id\|mã> <use\|later\|drop>` | Đánh dấu một chuyện như nút trên giao diện | `--dry-run`, `--json` |
| `check` | Kiểm khuôn frontmatter, `id` (nếu có) khớp tên file, link không gãy, mã chuyện không trùng, riêng tư; `--fix` ghi mã vào file chưa có | `--box DIR`, `--staged`, `--fix` |
| `reduce` | In văn bản rút gọn và điểm nóng (gỡ lỗi, thí nghiệm) | `--transcript FILE`, `--to-line N`, `--out DIR` |
| `ledger` | Xem hoặc quên một phiên trong sổ | `--show`, `--forget ID` |
| `init` | Tạo `.momentry.json` và hộp, cài hook và `/bip` (khi được đồng ý), chạy doctor | `--repo DIR`, `--no-connect`, `--yes`, `--dry-run`, `--json` |
| `doctor` | Kiểm Node, git, claude, cấu hình, nguồn chặn, repo, hộp, cache, bản cài, hook; `--fix` sửa | `--fix`, `--json` |
| `status` | Tóm tắt nhanh và một lệnh nên chạy tiếp | `--json` |
| `connect` | Cài hoặc gỡ hook và `/bip` cho Claude Code, Codex | `[claude\|codex]`, `--remove`, `--yes`, `--dry-run` |
| `config` | `path`, `show`, `get`, `set`, `unset`, `default` | |
| `paths` | In mọi đường dẫn | `--json` |
| `version` | Phiên bản và commit | `--json` |
| `update` | Tự cập nhật, kiểm checksum, quay lui khi lỗi | `--check`, `--version vX.Y.Z`, `--force`, `--yes` |
| `uninstall` | Gỡ hook, `/bip`, shim, bản cài; giữ dữ liệu | `--purge`, `--yes`, `--dry-run` |

Cờ chung cho mọi lệnh: `--json`, `-y/--yes`, `--dry-run`, `-q/--quiet`, `-v/--verbose`, `--no-color`, `-c/--config FILE`, `-h/--help`. Tham chiếu đầy đủ sinh từ `lib/commands.mjs`: [cli-reference.md](cli-reference.md).

Cờ đặc biệt:

- `--dry-run`: không ghi hộp, không ghi sổ, không ghi khoá, không ghi `runs/` hay `quarantine/`: **không ghi file nào**. Không kèm `--fake-llm` thì dừng trước lời gọi model đầu tiên, in kế hoạch: cửa sổ dòng, số khúc, số Entry, token ước tính, số điểm nóng, chi phí ước tính. Muốn xem prompt đã dựng thì thêm `--save-prompts DIR` (chỉ nên trỏ ra ngoài repo).
- `--fake-llm DIR`: thay mọi lời gọi model bằng đọc `DIR/<key>.json`. Thiếu file thì mã 4. Bảng tên `key` (ghi cả vào `README.md` của công cụ):

  | Key | Lời gọi |
  |---|---|
  | `harvest-c<k>-r<n>` | harvest, khúc k, lần chạy n (từ 1) |
  | `harvest-fill-c<k>-r<n>-f<m>` | vòng gọi bù thứ m cho khúc k, lần chạy n |
  | `cluster-<a>` | gộp cụm, lần gọi a (2 nếu gọi lại vì phân hoạch sai) |
  | `outsider-<a>` | bước 9 |
  | `hook-tension-<a>` | bước 7 |
  | `stakes-<a>` | bước 8 |
  | `angle-<k>` | bước 13, chuyện thứ k trong danh sách được chọn (theo hạng). Thiếu file thì chuyện đó chưa có góc kể; trong `harvest` không đổi mã thoát, trong `angle` là mã 4 |
  | `profile-<n>` | bước 13, hồ sơ dự án thứ n của lần chạy (chỉ khi chưa có hoặc README/docs đã đổi). Thiếu file thì góc kể viết không có hồ sơ (hoặc dùng hồ sơ cũ); không đổi mã thoát |

  Lần gọi lại vì JSON hỏng hay sai khuôn dùng hậu tố `-retry` (ví dụ `harvest-c1-r1-retry`).
- **Dạng file** của `--fake-llm` và `--save-llm` là đúng đầu ra `claude -p --output-format json`: đọc `result` (chuỗi), `total_cost_usd`, `is_error`, `duration_ms`. Fixture phải có cả ca thành công và ca `is_error: true`.
- `--save-llm DIR`: chạy thật và lưu từng kết quả theo đúng tên trên, để phát lại bằng `--fake-llm`. Dữ liệu chứa nội dung phiên: chỉ lưu ngoài repo.
- `--blind`: bỏ qua chuyện đã có trong hộp ở bước 6 và không ghi gì; dùng khi đo recall.

**Mã thoát:**

| Mã | Nghĩa |
|---:|---|
| 0 | Xong (với `hook`: luôn 0) |
| 1 | Lỗi: `check` thấy vi phạm riêng tư hoặc lỗi khuôn, cấu hình hỏng, repo không được quan sát, doctor còn check quan trọng chưa đạt |
| 2 | Sai cú pháp lệnh hoặc cờ; thiếu `--yes` khi không có TTY |
| 3 | Kiểm riêng tư bị bỏ qua (không có nguồn chặn) |
| 4 | Model lỗi hoặc đầu ra sai sau khi đã gọi lại; thiếu file `--fake-llm` |
| 5 | Phiên đang bị khoá bởi tiến trình khác (đã đặt `pending`) |
| 10 | `update --check`: có bản mới |

Bảng mã thoát đổi ngày 2026-11-03 theo chuẩn chung (trước đó 1 là sai cú pháp, 2 là `check` thấy lỗi); xem CHANGELOG 0.1.0.

---

## 8. Kiểm thử

**Luật:** test không dùng dữ liệu thật. Transcript, vault, golden set và kết quả LLM trong `test/fixtures/` đều tự dựng, nội dung bịa. Không test nào gọi `claude`.

| Nhóm | Ca chính |
|---|---|
| `sources/claude` | Đọc transcript giả có user, assistant, tool_use, tool_result lỗi, dòng compact, dòng `<system-reminder>`; số dòng `L` và `ts` đúng; `fromLine`/`toLine`; `<command-name>/bip</command-name>` ra `bip: true`; `op`/`paths` đúng cho Bash, Edit, Write; thư mục con của repo được tìm thấy qua tiền tố, thư mục có tiền tố trùng mà `cwd` khác repo bị loại |
| `sources/codex` | Rollout giả có `session_meta`, message user/developer/assistant, `function_call`/`custom_tool_call` và output; lọc theo `cwd`; `apply_patch` ra `op: write` với `paths` tách từ `*** Update/Add/Delete File:`; không có exit code thì `exitCode: null` |
| `reduce` | Cắt độ dài đúng luật; kết quả lỗi giữ 3 dòng cuối; bỏ compact; chia khúc có chồng; điểm nóng ở phần chồng chỉ thuộc khúc đầu |
| `hotspots` | Mỗi hàm một bảng ca dương, ca âm (ví dụ `0,5 → 0,5` không tính); đủ từ nối `→ -> => lên xuống thành tới to`; gộp cửa sổ 5 dòng; id `H<L>`; cùng một ca `git reset` và ghi `.claude/` cho ra điểm nóng trên cả Entry nguồn Claude và Codex; `exitCode: null` không tạo điểm nóng |
| `llm`, `validate` | Fixture `is_error: true`, mã thoát ≠ 0, quá giờ (tiến trình giả treo bị giết), JSON hỏng, id lạ, `tension` ngoài danh sách, `stakes` = 5: gọi lại một lần, vẫn lỗi thì bước hỏng. Riêng câu trả lời điểm nóng của harvest có id hay verdict lạ thì không làm hỏng lời gọi: câu đó bị bỏ và điểm nóng vào vòng gọi bù như câu chưa trả lời, để chuyện hợp lệ của cửa sổ không mất theo |
| `harvest` | Đủ điểm nóng thì không gọi bù; thiếu thì gọi `harvest-fill` đúng các id thiếu; hết lượt bù thì `partial`; `runs = 3` mà một lần hỏng thì dùng 2 lần còn lại, `runs` ghi 2 |
| `cluster` | Phân hoạch sai thì gọi lại, vẫn sai thì mỗi chuyện một cụm; `hits` đếm theo lần chạy khác nhau, không theo khúc; cụm có hai id `box:` gộp vào id nhỏ nhất, file kia không đổi |
| `story` | `buildStory` lấy thân từ thành viên có `what_happened` dài nhất; `date` từ `ts` dòng đầu; `lines` hợp và sắp; gộp vào file cũ: `hits ≤ runs` sau nhiều cửa sổ |
| `privacy` | Vault giả có note tên bịa; chuyện chứa tên đó ở dạng nguyên, bỏ dấu, Telex đều bị chặn, kể cả khi tên chỉ nằm trong slug, trong `add --note`, hay trong phần nối vào file cũ; chuyện bị chặn nằm trong `quarantine/`, không trong hộp; từ đơn thường không bị báo; allowlist; không có nguồn thì không ghi vào hộp (trừ `allowUnchecked`) và `check` trả 3; `allowUnchecked` trong `.momentry.json` bị bỏ qua |
| `frontmatter`, `box` | Ngữ pháp mục 6.6: đọc ghi lại file máy sinh đúng từng byte; 8 chuyện kiểu mẫu (chép khuôn, nội dung bịa, không có `id`) đọc được và `check` sạch; `sides` có dấu phẩy trong ngoặc kép; `hook` có `:` và `#`; gộp chỉ nối danh sách; không đụng trường máy khi `status ≠ raw` |
| `ledger` | Chạy lại lần hai không ghi gì; khoá `wx` và `pending`; khoá của pid đã chết bị gỡ; khoá của pid còn sống nhưng chưa quá `staleSec` không bị gỡ; `failed` giữ `lastLine`; `partial` tăng `lastLine` và ghi `needsRescore`; file bị rút ngắn thì gom lại từ dòng 1; `mainGoals[]` nối thêm, không ghi đè |
| `hook` | `STORY_HARVEST=1` thoát ngay; stdin hỏng vẫn thoát 0, không in stdout; repo không quan sát thì không tách nền; tiến trình nền gọi bằng `process.execPath`; `hooks --print` có đường dẫn tuyệt đối tới node |
| `hosts`, `commands`, `paths`, `tar-config` | Cài/gỡ hook giữ hook của user, sao lưu, giữ quyền và thụt lề, không trùng lặp, nâng hook dạng cũ, từ chối JSON hỏng và file đổi giữa chừng; `bip.md` sửa tay không bị ghi đè; mọi lệnh trong bảng có handler, help đủ, docs khớp; đường dẫn từng OS; tarball từ chối `..`, link, mục ngoài danh sách; `config set` kiểm trước khi ghi |
| Phân phối (`scripts/test-installer.sh`, `.ps1`, `test-agent-native.sh`, chạy trong CI trên Linux, macOS, Windows) | Cài từ asset cục bộ, cài lại không đổi gì, `init --yes --json` ok, hook gọi qua shim, `doctor` ok, `update --check` thoát 10, cập nhật giữ cấu hình, archive bị sửa bị từ chối, `uninstall` gỡ sạch và giữ dữ liệu; vòng agent chỉ dùng `--json` hội tụ |
| `rank` | Thứ tự đúng khoá xếp; chuyện thiếu trường xếp cuối |
| `imports` | Không file `.mjs` nào import gói ngoài (chỉ `node:` hoặc đường dẫn tương đối); không có `package.json` |
| Pipeline đầu cuối | `harvest --transcript fixtures/claude-mini.jsonl --fake-llm fixtures/llm-ok/` vào hộp tạm: số file, frontmatter, sổ; chạy lại không ghi thêm. Thêm bộ `llm-missing-hotspots/`, `llm-bad-json/`, `llm-is-error/`, `llm-privacy-leak/`, `llm-two-windows/` (PreCompact rồi SessionEnd: cửa sổ hai gộp vào file cũ) |
| Dry run | `--dry-run` không tạo file nào ở đâu cả (hộp, sổ, khoá, `runs/`, `quarantine/`) |

Chạy: `node --test test/*.test.mjs` (shell bung glob; không dựa vào cách `node --test <thư mục>` khác nhau giữa các bản Node).

**Đo trên dữ liệu thật** (không phải test, không vào repo): chạy `harvest --blind --save-llm <ngoài repo>` trên phiên thật của user, chấm như [harness/judge.sh][h-judge]. Đây là cách làm DM.9, DM.10.

---

## 9. Việc

ID mới thay bảng ở BG 7. Thí nghiệm nhắc "DM.2/DM.3" và "DM.6/DM.7" theo ID cũ: DM.2/DM.3 cũ nay là DM.2–DM.5; DM.6/DM.7 cũ (biên tập, dựng bài) nay là DM.12.

| ID | Việc | Trạng thái | Phụ thuộc | Xong khi | Bằng chứng |
|---|---|---|---|---|---|
| DM.0 | Hộp chứa, khuôn, 8 chuyện mồi (bản tay, repo nguồn) | Xong | — | Hộp có README, khuôn, links, threads | [sample/][mau]; BG 3 |
| DM.E | Thí nghiệm harvest đợt 1–5, nhãn user, hook/tension, stakes | Xong | DM.0 | Có kết luận cho bất đồng 1–4 | [TN][tn] mục 6–6d |
| DM.1 | Khung `momentry`: `config`, `repo`, `frontmatter`, `box`, `list`, `check` (khuôn, link), `init` | Xong | — | `check` sạch trên bản chép 8 chuyện mẫu; test qua | `test/box`, `cli`, `config`, `frontmatter`, `repo`, `validate`; phát hành v0.1.0 |
| DM.2 | Bộ kiểm riêng tư: nguồn cấu hình, NFC, bỏ dấu, Telex, allowlist, kiểm slug và phần nối, `quarantine`, mã 3 khi bỏ qua | Xong | DM.1 | Test vault giả chặn đủ 3 dạng; không có nguồn thì không ghi vào hộp và `check` trả 3 | `test/privacy`, `viet`, `quarantine`; `quarantine --release all` ở v0.2.0 |
| DM.3 | Nguồn Claude và Codex (`op`, `paths`, `ts`, `bip`), `reduce`, `hotspots`, lệnh `reduce` | Xong | DM.1 | Trên phiên thí nghiệm tới L4405 ra cùng 28 điểm nóng như harness (chạy trên máy user); đọc được một rollout Codex thật: ra Entry có exit code (hoặc ghi rõ không lấy được), `apply_patch` ra `paths`, lệnh git ra `op: shell` | `test/sources`, `reduce-hotspots`; [chạy thật 2026-11-04](experiments/2026-11-04-dm-real-run/README.md): 28 điểm nóng (chưa so từng điểm với harness). Codex (mục 6): git ra `op: shell`, exit code lấy từ chữ đầu ra khi có, "Script failed" ra `isError`; `apply_patch` chỉ kiểm bằng fixture vì máy không có rollout dùng nó |
| DM.4 | `llm`, `prompts`, `harvest`, kiểm đủ và gọi bù, `--dry-run`, `--fake-llm`, `--save-llm` | Xong | DM.3 | Test pipeline với LLM giả qua; một lần thật trên phiên thí nghiệm đạt ≥ 6/7 đáp án, trả lời đủ 28/28 điểm nóng (sau gọi bù nếu cần) | `test/llm`, `prompts`, `pipeline`; [chạy thật 2026-11-04](experiments/2026-11-04-dm-real-run/README.md): 7/7 đáp án, 28/28 điểm nóng, 1,01 USD |
| DM.5 | `cluster`, `score` (hook/tension, stakes), `outsider`, ghi hộp, sổ, `rank`, `harvest` đầu cuối | Xong | DM.2, DM.4 | Chạy hai lần trên cùng phiên: lần hai không ghi gì; `list --rank` đưa đủ 8 chuyện `t` của phiên thí nghiệm vào nửa trên. Tiêu chí thứ hai **chỉ là kiểm hồi quy** (tái tạo kết quả cũ trên đúng phiên đã sinh giả thuyết tension và stakes), không chứng minh chất lượng xếp hạng; kiểm thật ở DM.10 | `test/steps`, `pipeline`, `ledger`; [chạy thật 2026-11-04](experiments/2026-11-04-dm-real-run/README.md): lần hai 0 mới, gộp 25; `list --rank` đưa 7/8 chuyện `t` vào nửa trên (chuyện rớt có tension `none`). User chấp nhận 7/8 (2026-11-04); chuyện rớt chuyển vào DM.10 |
| DM.6 | `hook`, `scan`, `hooks --print`, `add`, `rescore`, mẫu `/bip` | Code xong, chưa ghi lần chạy thật | DM.5 | User cài theo bản in; ép compact một phiên thử: chuyện xuất hiện trong hộp, phiên không chậm, `hook.log` sạch, không vòng lặp; giết một phiên giữa chừng thì `session_start` sau gom bù được | `test/hook`, `hosts`; `init`/`connect` cài hook tự động (thay `hooks --print`). Hook chạy thật với Claude Code trên Windows ([cài đặt](installation.md)); phép thử ép compact và giết phiên giữa chừng chưa ghi |
| DM.7 | Kiểm hook Codex: payload `pre_compact`; `session_start` có tồn tại và gọi lúc nào; duyệt tin cậy | Code xong, chưa ghi lần chạy thật | DM.6 | Một phiên Codex có compact được gom tự động; ghi rõ `session_start` dùng được hay chỉ còn `scan --codex` | Sửa khoá sự kiện PascalCase (`PreCompact`, `SessionEnd`, `SessionStart`); hook Codex chạy thật trên Linux và Windows, issue #1 đã đóng. Chưa ghi một phiên Codex có compact được gom tự động |
| DM.8 | Phép thử cất kín cho bước người ngoài (thí nghiệm 7) | **Chờ user** | DM.5 | User ghi trước 3–5 việc mình làm trơn tru trên một phiên chưa ai ghi; bước 9 trúng ≥ 2 | DB 6 mục 7; TN 8 mục 2 |
| DM.9 | Chạy toàn cơ chế trên 1–2 phiên khác lĩnh vực, có ít nhất một phiên Codex | Chưa | DM.5, DM.7 | Bảng recall, số chuyện, chi phí từng bước | TN 8 mục 3 |
| DM.10 | Kiểm lại stakes trên phiên mới, nhãn mới (user gắn `t`/`s`/`x` trước khi xem điểm) | **Chờ user** | DM.9 | AUC stakes và stakes × strength trên dữ liệu mới; quyết giữ, sửa (thêm "đe doạ nguyên tắc đã nêu") hay bỏ trục stakes | TN 6d cảnh báo; thêm: chuyện `t` có tension `none` rớt xuống nửa dưới ([chạy thật 2026-11-04](experiments/2026-11-04-dm-real-run/README.md)) |
| DM.11 | Dùng thật 1–2 tuần, đo (mục 10) | Chưa | DM.6 | Bảng đo mục 10; user nói cảm nhận về độ ồn | |
| DM.12 | Biên tập, gom mạch, tìm móc, dựng bài | Để sau | DM.11, hộp ≥ 30 chuyện | Một bài nháp từ một mạch user thấy đáng sửa để đăng | BG 6.6; TN 6b mục 5 |
| DM.13 | Gom nhiều repo, mạch xuyên repo | Để sau | DM.11 | Quyết cách gom; một mạch có chuyện từ 2 repo | BG 6.7 |

---

## 10. Đo lường

| Đo | Cách | Đã có số chưa |
|---|---|---|
| Recall trên chuyện user thấy đáng kể | Nhãn user `t`/`s`/`x` trên cụm, rồi đếm | Một phiên, nhãn một người: 8/8 ở 4/5 lần e4 (TN 6b). User gắn nhãn trên các cụm do chính máy dựng (thay cho đọc mù), nên recall chỉ tính trên những gì máy đưa ra và những gì user nhớ được |
| Tỉ lệ bịa | Nhãn `x` | 0 trên một phiên (TN 6b) |
| Chất lượng xếp hạng | Số `t` trong top k của `list --rank`; AUC của khoá xếp | Lạc quan, chưa kiểm trên phiên mới (TN 6d) |
| Độ phủ điểm nóng | Điểm có verdict / tổng; số lần gọi bù | Chưa (vòng bù chưa chạy) |
| Số chuyện mỗi phiên | Tách theo `captured_by`, `hit_by` | e4: 20–36 mỗi lần; e5: 7–38 (e5-2 chỉ 7 vì lờ phần (b)) (TN 4.1) |
| Độ ồn | Precision mỗi lần chạy; thời gian user lướt hộp | Precision 0,25–0,35 (TN 6b); thời gian lướt chưa đo |
| Riêng tư | Số vi phạm lọt vào repo (phải là 0); số chặn đúng, chặn nhầm; số chuyện nằm trong `quarantine/` và lý do | Chưa |
| Chi phí | USD và giây từng bước, ghi trong sổ | Mục 5.10, một phiên |
| Giá trị cuối | Số chuyện user đổi `picked`; số bài nháp ra từ hộp | Chưa |

---

## 11. Câu hỏi còn mở và điều chưa chứng minh

**Chưa chứng minh, đang dùng như giả định:**

1. **Stakes** chỉ đo trên chính dữ liệu đã gợi ra giả thuyết. Kiểm ở DM.10.
2. **Bước người ngoài xử lý được curse of knowledge**: mới có tín hiệu (gap 2,31 do Opus chấm, Opus có thể thiên vị văn phong của Sonnet; so sánh đổi cùng lúc model, cách gọi, câu dặn), chưa qua phép thử cất kín, lệch nhãn user ở 2 mục, và v2 đổi đầu vào (tiêu đề cụm, theo cửa sổ) so với lúc thử. Kiểm ở DM.8.
3. **Mọi con số** đến từ một phiên, một lĩnh vực, nhãn của một người, người chấm là LLM (TN 7).
4. **Harvest không có phần người ngoài** trong prompt (khác e4) giữ được chế độ rà kỹ: chưa thử.
5. **Vòng gọi bù** cho điểm nóng còn thiếu: chưa thử (TN 7).
6. **Codex:** pipeline chưa chạy trên transcript Codex; payload hook Codex, sự kiện `session_start` có dùng được không, cách lấy exit code và cách duyệt tin cậy hook chưa kiểm. Ánh xạ tên tool Codex (`shell`/`exec_command`, `apply_patch`) sang `op`/`paths` là suy đoán: sai thì `gitReversal`, `metaWrite`, `nonzeroExit` im lặng không bắt gì trên Codex.
7. **Gom theo cửa sổ** (PreCompact rồi SessionEnd trên cùng phiên) và gộp với chuyện cũ cùng phiên ở bước 6: chưa thử. Thí nghiệm luôn gom cả phiên một lần.
8. **Chia khúc** phiên dài hơn khoảng 150k token: chưa thử.
9. **`runs = 1`**: xếp hạng không có `hits`. Tension và stakes đo trên tóm tắt cụm gộp từ 5 lần chạy; chấm thẳng trên chuyện thô của một lần chạy chưa đo.
10. **Bộ kiểm riêng tư**: tỉ lệ báo nhầm chưa đo; Telex mới tính một vị trí dấu thanh; LLM diễn đạt lại câu thật (đảo từ, viết tắt) có thể lọt (DB, rủi ro phụ).
11. **Hook Stop như bảo hiểm khi transcript bị mất**: không làm; trường hợp transcript bị xoá trước khi gom chưa kiểm (TN 6).
12. **Đề xuất của phản biện, chưa chạy:** dựng thân file từ thành viên có `what_happened` dài nhất (mục 6.6), khoá theo pid (mục 6.3), giữ chuyện trong `quarantine/` (mục 6.7), chạy bước 9 trước bước 7–8 (mục 5.1).

**Câu hỏi mở:**

1. Có nên đưa danh sách chuyện cũ vào prompt harvest khi chạy thường không (bất đồng 5)? Hiện không đưa.
2. Stakes có cần mở rộng thành "đổi kết quả việc chính **hoặc** đe doạ nguyên tắc đã nêu" không (TN 6d mục 3)?
3. Gộp hai prompt chấm (bước 7 và 8) làm một lời gọi có giữ được chất lượng không?
4. Bước người ngoài 0,65 USD mỗi lần: chạy mỗi cửa sổ hay chỉ khi phiên kết thúc?
5. Phiên trong git worktree: hộp đặt ở worktree hay ở repo chính?
6. 20–36 file mỗi phiên dài (e4, TN 4.1) làm git ồn. Có cần chế độ giữ chuyện ngoài git tới khi user `picked` không?
7. Đã có `hook` do máy viết. Bước "tìm móc" ở DM.12 còn cần riêng không?

---

## 12. Đã bỏ và vì sao

| Ý cũ | Nguồn | Vì sao bỏ | Bằng chứng |
|---|---|---|---|
| Hook `Stop` mỗi lượt để chấm và ghi marker | V1 4.1, V1 21 | Điểm nóng tính lại được từ transcript lúc harvest; user chốt không đưa Stop lại khi giao viết PRD v2 (2026-11-03) | TN 6 bất đồng 1 (sau thí nghiệm 4); DB 7 chỉ là trạng thái trước thí nghiệm |
| Hook `UserPromptSubmit`, `PostToolUse` đếm số liệu trong phiên | V1 4.1 | Transcript trên đĩa có đủ; không cần nhịp nóng | DB 4; TN 6 |
| Detector regex ngôn ngữ (`self_surprise`, `user_correction`, `decision_tradeoff`, `emotion_burst`, "ghi lại") | V1 6.2; DB phụ lục T0 | Regex cụm tiếng Việt giòn; LLM đọc transcript làm việc này | DB 1 |
| Profile chấm, trọng số, combo, `keep_threshold` lúc ghi | V1 7 | Trái nguyên tắc ghi nhiều, lọc sau | DB 1; BG 2 |
| Persona panel 4 vai, 4 trục | V1 15.2 | Cả ba agent trong debate đồng ý bỏ. Persona panel **chưa từng được thử**; bước người ngoài (một lời gọi Sonnet riêng) thay vai trò đó, nhưng số gap 2,31 của nó không phải bằng chứng bác persona panel | DB 1 |
| Marker con trỏ JSONL và evidence bundle trong `~/.cis/momentry/` | V1 8–10 | Chuyện là file markdown đọc được, git có diff | DB 4 |
| Detector `leverage_ratio`, `fluent_repetition`, `unusual_combo`, `learning_chain`, lượt thói quen theo tuần | V1 6.2 | Không có bằng chứng; 4 hàm điểm nóng đã đủ neo | DB 1; TN 3 mục 3 |
| Bản tóm tắt compact trong đầu vào harvest | DB 2 (luật giữ dòng) | Không cần: e5 đạt 7/7 khi bỏ | TN 5 mục 2 |
| Chỉ dặn "ghi thừa còn hơn bỏ sót" | BG 6.2 | e1 trượt `lo-rieng-tu` và `pkill` cả 2 lần | TN 3 mục 1 |
| Câu chống tự lọc đứng một mình | DB 2 | Model chia hai cụm ngẫu nhiên; cụm ngắn trượt chuyện nhỏ | TN 3 mục 2 |
| Điểm nóng chỉ làm gợi ý (không bắt trả lời từng điểm) | Biến thể e4n (TN 4) | e4n 1/3 lần vào cụm dài, trượt `pkill` 2/3 | TN 5 mục 1 |
| Không có danh sách điểm nóng, chỉ giữ luật giữ dòng | DB 5.2, ý Người làm một mình | Phần (b) là thứ có tác dụng; bắt trả lời từng điểm cho 7/7 ổn định | TN 5 mục 1; TN 6 bất đồng 2 |
| Bước người ngoài trong cùng lời gọi harvest (Haiku) | DB 2 phần (c) | Gap 0,45, phần lớn là việc phổ biến | TN 4.2; TN 5 mục 4 |
| Lấy việc chính từ câu giao việc đầu phiên (`sg`) | TN 6d | Kém hơn tự suy (`si`); phiên dài trôi khỏi lời giao ban đầu | TN 6d mục 2 |
| Lọc cứng `stakes ≥ 2` | TN 6d | Mất 1–2 chuyện `t` | TN 6d mục 3 |
| Chấm 5 trục (Móc, Đau chung, Cung truyện, Bằng chứng, Mang về được) làm cách xếp hạng | BG 6.6 | Thay bằng tension, stakes, strength đã đo trên một phiên (stakes: lạc quan, chờ DM.10); DM.12 có thể dùng lại khi biên tập | TN 6c, 6d |
| Haiku cho trục stakes | TN 6d | AUC 0,83–0,85, cho nhiều chuyện bên lề stakes cao | TN 6d mục 5 |
| Một file `story.mjs` ở `scripts/story/`, cache `~/.cache/storytelling/` | BG 6.2, DB 4 | Đổi sang `` nhiều module, cache `~/.cache/momentry/` (mặc định, user có thể đổi) | Quyết định vị trí v2 |
| Cấu hình hook đặt trong `.claude/settings.json` và `.codex/hooks.json` của repo | BG 6.5 | Hook cài ở mức user (một lần cho mọi repo), chỉ chạy trong repo được quan sát | Quyết định v2 |
| Công cụ chỉ in cấu hình hook, user tự dán vào `~/.claude/settings.json`, `~/.codex/hooks.json` | PRD v2 mục 3.2, 6.4 | User đảo ngày 2026-11-03: dán tay dễ sai, dễ quên và hook ghi cứng đường dẫn Node chết im lặng khi nâng Node. Thay bằng `init`/`connect` tự cài khi được đồng ý, có sao lưu, `--dry-run`, chỉ đụng mục của mình và gỡ ngược được | Audit đóng gói 2026-11-03 (plans/reports/packaging-audit-261103-1557-cs-packaging-distribution.md) |
| Skill `storytelling` cho agent tự ghi làm phần chính (DM.1 cũ) | BG 6.1 | Agent tự ghi chỉ là phần thêm; động cơ là harvest | DB 1 |

[tn]: experiments/2026-11-03-harvest/README.md
[db]: history/debate-2026-11-03.md
[bg]: history/prd-handoff-obsidian-pkm.md
[v1]: history/design-v1-body-brain.md
[mau]: sample/README.md
[h-reduce]: experiments/2026-11-03-harvest/harness/reduce.mjs
[h-prompts]: experiments/2026-11-03-harvest/harness/prompts.mjs
[h-rank]: experiments/2026-11-03-harvest/harness/prompts-rank.md
[h-run]: experiments/2026-11-03-harvest/harness/run.sh
[h-judge]: experiments/2026-11-03-harvest/harness/judge.sh
