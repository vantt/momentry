# Bản đồ thuật toán: momentry chọn chất liệu và chọn chuyện thế nào

Ngày 2026-11-05. Chỉ đọc, không đo. **Ảnh chụp ở tag `v0.3.0`** (trước E20); đường dẫn `file:dòng` đúng với `git show v0.3.0:<file>`. Từ đó `lib/hotspots.mjs`, `lib/rank.mjs`, `lib/pipeline.mjs`, `lib/validate.mjs`, `lib/llm.mjs`, `lib/reduce.mjs`, `lib/sources/claude.mjs` và `prompts/harvest*.md` đã đổi ([story-material](../261105-story-material/plan.md)), nên số dòng ở các file đó trên `main` lệch; đọc code hiện tại trước khi trích lại. Bộ dò hiện hành nằm ở [PRD 5.3](../../docs/prd.md) và [material-signals](../../docs/experiments/2026-11-05-material-signals/README.md). Đọc kèm [phản hồi chọn chuyện](researcher-261105-story-picking-feedback.md).

## 1. Pipeline, bước 1–11 (và 12 lúc `list`)

Thứ tự ở `docs/prd.md:84-105`: 1→6→**9→7→8**→10→11, để chuyện do bước người ngoài tạo cũng được chấm (`docs/prd.md:103`). Keo dán là `runWindow` (`lib/pipeline.mjs:247-360`).

| # | Bước | LLM? (model mặc định, prompt) | Code | Giữ gì, bỏ gì |
|---|---|---|---|---|
| 1 | Đọc nguồn, chuẩn hoá thành `Entry{L,ts,kind,op,paths,text,bip,exitCode}` | không | `lib/sources/claude.mjs:131-168` (codex, pi, agy tương tự) | Bỏ dòng `isCompactSummary` (`:138`), dòng user bắt đầu bằng `<command-`/`<local-command`/`<system-reminder` (`:33,155`), khối thinking (chỉ giữ `text` và `tool_use`, `:158-163`). `/bip` được gắn cờ **trước** khi bỏ (`:150-153`). Tool chia `shell` (Bash), `write` (Edit/Write/MultiEdit/NotebookEdit), `other` (`:170-176`) |
| 2 | Reduce | không | `lib/reduce.mjs:28-48` | Mỗi entry một dòng: `[Lnnn] USER ≤2500 ký tự / AGENT ≤2000 / TOOL một dòng ≤300 / RESULT 2 dòng đầu ≤250`, hoặc **3 dòng cuối ≤500 khi exit≠0**. Chỗ cắt ghi `…[+n]`. Ước token = ký tự/3,2 (`:13-21`) |
| 2b | Chunk | không | `lib/reduce.mjs:56-79`; trần `harvest.maxInputTokens` = 150k (`lib/config.mjs:22`) | Cắt theo ranh entry, gối 20 entry. Entry trong vùng gối thuộc chunk đầu chứa nó |
| 3 | Điểm nóng | không (5 bộ dò thuần) | `lib/hotspots.mjs:59-88` | Xem §2 |
| 4 | Harvest, `harvest.runs` lần mỗi chunk (mặc định 1) | **có**, haiku (`lib/config.mjs:22`), `prompts/harvest.md` | `lib/harvest.mjs:76-93`, gọi ở `lib/pipeline.mjs:272-291` | Vào là cả chunk đã reduce cộng các điểm nóng chunk đó sở hữu (`lib/pipeline.mjs:275`). Ra là `stories[]` cộng verdict `hotspots[]` cho từng điểm nóng. Prompt dặn **không tự lọc**, ghi thừa còn hơn sót (`prompts/harvest.md:18,23`) |
| 5 | Kiểm phủ và điền bù | script, cộng haiku `prompts/harvest-fill.md` | `lib/harvest.mjs:94-117` | Với điểm nóng chưa có verdict hợp lệ, hỏi lại đúng các id đó, tối đa `fillRetries` lần (mặc định 1). Còn thiếu thì ghi lại và cửa sổ thành `partial`; không bỏ gì |
| 6 | Cluster (khử trùng) | **có**, sonnet (`rank.model`), `prompts/cluster.md`, phân hoạch có script kiểm | `lib/cluster.mjs:49-90` | **Bỏ qua (không gọi LLM) khi runs≤1, chỉ 1 chunk và phiên chưa có chuyện `box:`** (`:54`): mỗi chuyện thô thành một cụm. Ngược lại LLM phân hoạch chuyện thô cộng chuyện `box:` của **cùng phiên**. Phân hoạch sai hai lần thì lùi về trùng dòng (`:99-116`) |
| 9 | Người ngoài | **có**, sonnet, `prompts/outsider.md`, mỗi chunk một lần | `lib/outsider.mjs:25-43`, `lib/pipeline.mjs:313-323` | Đọc lại cả chunk cộng tiêu đề các cụm. Trả 3–8 "việc làm trơn tru mà người ngoài sẽ hỏi". Mục khớp một cụm thì thêm mục "Góc người ngoài" và `hit_by: outsider`; mục không khớp thành cụm mới `O<k>` (`:51-69`) |
| 7 | Hook và tension | **có**, sonnet, `prompts/hook-tension.md` | `lib/score.mjs:33-47` | Chỉ chạy trên cụm **mới** (thành viên mới hoặc mục người ngoài, `lib/pipeline.mjs:324-327`). Vào là tiêu đề cộng tóm tắt, xáo trộn, id đổi thành M<k>, ẩn `hits` (`lib/score.mjs:12-17`) |
| 8 | Stakes | **có**, sonnet, `prompts/stakes.md` (biến thể `si`) | `lib/score.mjs:55-66` | Chạy trên **mọi** cụm của phiên, cũ lẫn mới (`lib/pipeline.mjs:329`). Model suy `main_goal` trước, rồi chấm stakes 0–3 theo nó |
| 10 | Cổng riêng tư | không | `lib/pipeline.mjs:103-186`, `lib/privacy.mjs` | Kiểm blocklist từng trường, slug và bản vá merge. Vi phạm, hoặc không có blocklist, thì chuyện vào cách ly ngoài repo. Bước này không sửa nội dung chuyện |
| 11 | Dựng file chuyện hoặc merge | không | `lib/story.mjs:59-107`, `lib/pipeline.mjs:192-213` | Cụm không có thành viên `box:` thì ghi file mới. Cụm có thành viên `box:` thì merge vào id nhỏ nhất (`lib/cluster.mjs:135-138`) |
| 12 | Xếp hạng | không | `lib/rank.mjs` (+ UI `personalize`) | Xem §3 |

Mỗi lời gọi model chạy cô lập: `claude -p --model M --setting-sources "" --tools "" --strict-mcp-config --no-session-persistence --output-format json` (`lib/llm.mjs:32-33`), kèm `STORY_HARVEST=1` (`:107`). JSON hỏng thì thử lại một lần (`docs/prd.md:171-177`).

**Kích hoạt.** Hook Claude/Codex ở PreCompact, SessionEnd, SessionStart (`lib/hook.mjs:13,77-78`) chạy nền `scan --auto`. `scan` bỏ file sửa dưới 30 phút (trừ phiên đang gọi), xử lý tối đa 3 phiên một lần, dừng ở ngân sách ngày 3 USD (`lib/config.mjs:25,28`; `lib/pipeline.mjs:506-567`). Mỗi phiên được đọc tăng dần từ `lastLine+1` của ledger đến cuối (`lib/ledger.mjs:127-133`).

## 2. Chọn chất liệu

**Reduce.** Cửa sổ là "mọi dòng sau `lastLine`", không phải vùng quanh điểm nóng. Không lọc ngữ nghĩa trước LLM: mọi thứ trừ thinking, compact summary, dòng hệ thống/lệnh đều tới harvest, cắt theo từng dòng.

**Điểm nóng** (`lib/hotspots.mjs`, tại `v0.3.0`). Không có trọng số, không có ngưỡng điểm. Mỗi bộ dò nhìn một entry:

| Loại | Luật | Dòng |
|---|---|---|
| `nonzeroExit` | `kind:result` có exitCode nguyên ≠0, hoặc `isError` | `:15-20` |
| `metricPair` | text user/assistant khớp `NUM (→\|->\|=>\|lên\|xuống\|thành\|tới\|to) NUM`, hai số khác nhau | `:22-31` |
| `gitReversal` | shell op khớp `git reset/revert/rebase/restore/checkout --/commit --amend/push -f`, hoặc `squash` | `:33-40` |
| `metaWrite` | write op vào `.claude/ .codex/ .agents/ AGENTS.md CLAUDE.md skills/ hooks/ settings*.json` | `:42-49` |
| `bip` | dòng user có cờ `bip:true` | `:52-54` |

- Điểm trúng **cùng loại** trong 5 dòng được gộp thành một điểm nóng `L..Lend` (`:59-79`).
- Id toàn cục `H<L>` (`:76`), thêm hậu tố chữ khi hai loại chung dòng (`:81-86`).
- Prompt thấy `H<L> [Lx-Ly] signals`, tối đa 4 nhãn, **không có text transcript** (`:91-93`).
- PRD gọi điểm nóng là "neo chú ý, không phải bộ lọc" (`docs/prd.md:73`). Thí nghiệm thấy model gán 25–28 trên 28 điểm nóng là `story` (`docs/experiments/2026-11-03-harvest/README.md:49`).

**Ngữ cảnh quanh điểm nóng.** Không cắt cửa sổ cục bộ. Model thấy **cả chunk** (đến khoảng 150k token) và chỉ nhận id cùng khoảng dòng làm con trỏ (`lib/harvest.mjs:78,85`). Lượt người ngoài cũng đọc cả chunk (`lib/pipeline.mjs:317`).

**Bằng chứng gắn vào chuyện** (`lib/story.mjs:59-80`):
- `lines`: hợp các tham chiếu dòng thành viên dạng `<sid>#L<n>`, lấy từ danh sách `lines` model trả (`lib/harvest.mjs:37-44`).
- `date`: timestamp của dòng nhỏ nhất (`:63-64`).
- `signals`, `hit_by` (hotspot / harvest / outsider / bip, `:33-42`), `source` = `chat Claude, <sid>`.
- `repo` (chỉ tên) và `artefact`, văn tự do model viết ("chụp gì, che gì").
- Thân lấy từ thành viên có `what_happened` **dài nhất** (`:60`).
- **Không có SHA commit, không có đường dẫn file, không có trích nguyên văn.** Luật riêng tư chỉ cho cơ chế, số và tên công cụ (`prompts/harvest.md:20`). Bằng chứng nguyên văn chỉ có là con trỏ dòng vào transcript.

## 3. Chọn chuyện, chấm điểm, xếp hạng

**Chiều chấm.** Tất cả từ sonnet, đọc trên tóm tắt, không đọc transcript.

| Trường | Miền | Nguồn |
|---|---|---|
| `hook` | một câu <15 từ | `prompts/hook-tension.md:13` |
| `tension` | một trong `nho_ma_to, giup_ma_hai, tuong_ma_hoa_ra, hop_ma_tan, cam_ma_van_lot, it_ma_nhieu, khac, none`, cộng `side_a`/`side_b` | `prompts/hook-tension.md:4-11` |
| `strength` | 0–3 ("0 = không giằng xé; 3 = người đọc không dứt ra được") | cùng file, `:13` |
| `stakes` | 0–3: chuyện có đổi kết quả của `main_goal` suy ra không? Chấm độc lập với độ hấp dẫn | `prompts/stakes.md:3-9` |
| `hits` | số lần harvest riêng biệt trong các thành viên cụm; luôn 1 khi runs=1 | `lib/cluster.mjs:141-145`, chặn ở `runs` (`lib/story.mjs:73`) |

**Công thức xếp hạng** (`lib/rank.mjs:10-30`, tại `v0.3.0`). Khoá sắp tăng dần, **không có ngưỡng**:

`[tension≠none ? 0 : 1 (thiếu=2), −(stakes×strength) (thiếu=+∞), −hits, −date]`, hoà thì theo id.

Nên mọi chuyện có nhãn tension đều xếp trên mọi chuyện `none`, bất kể stakes. (Khoá hiện hành khác; xem [ranking](../../docs/experiments/2026-11-05-ranking/README.md) và `lib/rank.mjs` trên `main`.)

**Sao ở UI** là `stakes×strength`: ≥6 được 3 sao, ≥2 được 2, còn lại 1 (`lib/ui-api.mjs:143-149`).

**Cụm và khử trùng.**
- Chuyện thô thành cụm theo một trong ba cách: LLM phân hoạch, lùi về trùng dòng, hoặc mỗi chuyện một cụm.
- Khử trùng giữa các cửa sổ cùng phiên: đưa các chuyện `box:` hiện có của phiên vào prompt cluster (`lib/cluster.mjs:56-64`).
- Cụm chứa từ hai id `box:` trở lên thì merge vào id nhỏ nhất và ghi sự kiện `cluster.duplicate-box`; không xoá gì (`lib/pipeline.mjs:198-200`).
- Merge chỉ nối thêm (`sessions`, `signals`, `hit_by`, `lines`) và cộng `runs`/`hits`.
- Trường máy chấm chỉ được chấm lại **khi còn `status: raw`** (`lib/box.mjs:11-13`; `docs/prd.md:467`).

**Lượt người ngoài.** Một lời gọi sonnet riêng (qua "lời nguyền của người biết", `prompts/outsider.md:13-15`).
- Trong thí nghiệm, 13/16 mục khớp chuyện đã chọn, nên tác dụng chính là **đóng khung lại** chuyện, ít khi tìm chuyện mới (`docs/experiments/2026-11-03-harvest/README.md:93`).
- **Không** vào khoá xếp hạng trực tiếp. Chỉ thêm `hit_by: outsider` và mục "Góc người ngoài"; cụm `O<k>` mới được bước 7–8 chấm như mọi cụm.

**Đánh dấu của người dùng (Use / Later / Drop).**
- Use → `status: picked`, Drop → `status: dropped`, Later → chỉ ghi ở trạng thái UI cục bộ (`lib/ui-api.mjs:318-336`).
- Phản hồi chỉ là **sắp lại cục bộ ở UI** (`personalize`, `lib/ui-api.mjs:180-206`). Khi có ít nhất 3 chuyện đã Use/Drop (`MIN_LABELS`, `:177`):
  - đếm `signals` và `tension` của chuyện Use (+) và Drop (−);
  - mỗi chuyện còn raw tính `pref` = tổng `sign(plus−minus)` trên các khoá, kẹp ±2;
  - sắp lại theo `index − 1.5×pref`, nên một chuyện nhích tối đa khoảng 3 hạng.
- Chỉ ảnh hưởng bức tường web UI. `momentry list --rank` dùng `sortRanked` không có nó (`lib/cli.mjs:209`).
- Đánh dấu không bao giờ chạy lại chấm điểm, không đổi prompt, không ảnh hưởng harvest.
- Mỗi quyết định được ghi cùng hạng chuyện đó có trên tường lúc ấy, để đo Use rate top-5 (`lib/metrics.mjs:108-146`).
- Gửi nhãn lên máy chủ chung là việc backlog, **chưa làm** (`plans/261105-shared-labels/plan.md:4,17`).

## 4. Đơn vị phân tích

- **Gói trong một cửa sổ phiên.** Bước 1–11 chạy theo (phiên, cửa sổ dòng) (`docs/prd.md:105`). Một phiên ra nhiều cửa sổ (PreCompact rồi SessionEnd). Cửa sổ dài được cắt chunk.
- **Giữa các cửa sổ cùng phiên:** merge qua thành viên `box:` ở bước 6 (`lib/pipeline.mjs:310`; `storiesOfSession` khớp `data.sessions` chứa sid, `lib/box.mjs:148-150`). `main_goal` suy lại mỗi cửa sổ và nối vào `mainGoals[]` của ledger (`lib/ledger.mjs:152-153`). Stakes của chuyện raw cũ bị cửa sổ mới nhất ghi đè (`docs/prd.md:195`).
- **Giữa phiên, ngày, commit, plan: không có gì.**
  - Prompt cluster nói đầu vào "CÙNG một phiên" (`prompts/cluster.md:2`); stakes cũng "từ CÙNG một phiên", tương đối với mục tiêu riêng của phiên (`prompts/stakes.md:2`).
  - Không code nào nối chuyện qua phiên. `sessions[]` chỉ là danh sách để merge nối thêm.
  - `links` và `threads` máy không bao giờ điền. Khởi đầu rỗng (`lib/story.mjs:74`), máy không sửa (`docs/prd.md:468`). Chế độ "series" ở UI chỉ nhóm theo `threads` viết tay (`lib/ui-api.mjs:351+`).
  - Git không bao giờ được đọc: không nạp commit hay plan. Tín hiệu chỉ đến từ lệnh tool trong transcript như `git reset`.
- **Hoãn rõ ràng:**
  - luồng đa repo (`docs/prd.md:61`, DM.13 `:687`);
  - `threads.md` tự động (`docs/prd.md:62`);
  - lượt quét "thói quen" hàng tuần xuyên phiên (T3), bỏ vì "một phiên không thấy được thói quen" và chưa có dữ liệu (`docs/history/debate-2026-11-03.md:134,476`);
  - bộ dò `learning_chain` xuyên phiên của v1 (`docs/history/design-v1-body-brain.md:214`; bỏ ở `docs/prd.md:746`);
  - khử trùng xuyên phiên bằng embedding (e5), được nêu là chỗ embedding thật sự giúp, chưa làm (`plans/261104-story-quality/plan.md:41`).

## 5. Điểm yếu dự án tự ghi

1. **Mọi số đến từ một phiên, một miền, một người gán nhãn**, và xếp hạng được chỉnh trên chính dữ liệu gợi ra nó. AUC stakes 0,93–0,94 là "chắc chắn lạc quan" (`docs/prd.md:216-218`; `docs/experiments/2026-11-03-harvest/README.md:240`). Kiểm lại trên dữ liệu mới (DM.10) chờ người dùng (`docs/prd.md:684`).
2. **Cổng tension chôn chuyện hay.** Một chuyện có nhãn `t`, tension `none`, stakes 2 xếp 26/38 (`docs/experiments/2026-11-04-dm-real-run/README.md:49,62`). Việc Q.5 của plan story-quality nhắm vào đây (`plans/261104-story-quality/plan.md:34`).
3. **Stakes bỏ sót tầm quan trọng ở mức nguyên tắc.** Chuyện "squash 6 commit để xoá dữ liệu rò" được stakes 1. Đề xuất mở stakes thành "đổi kết quả chính **hoặc** đe doạ nguyên tắc đã nêu", chưa kiểm (`docs/experiments/2026-11-03-harvest/README.md:232-236`; `docs/prd.md:727`).
4. **Phát hiện tốt, kể yếu.** 4/8 chuyện `t` bị chê thiếu hook hoặc nhạt (`docs/experiments/2026-11-03-harvest/README.md:162`). Hook viết từ bản tóm tắt đã gộp, có thể đã nghiêng về tension (`:205`).
5. **Nhiễu.** Precision mỗi lần chạy 0,25–0,35, 20–36 file mỗi phiên dài (`docs/prd.md:700,699`). Nhiễu git là câu hỏi mở 6 (`:731`).
6. **LLM tự lọc và lệch giữa các lần chạy.** Harvest rơi vào chế độ "ngắn" hoặc "dài". Trả lời điểm nóng từng cái làm ổn định hơn, nhưng model vẫn có thể bỏ qua (một lần chạy chỉ trả lời 8/28) (`docs/experiments/2026-11-03-harvest/README.md:48,103-105`). Harvest "suy nghĩ" ở 6/9 lần chạy: cùng một phiên ra 14 hoặc 31 chuyện và p@5 tụt 0,20 (`docs/experiments/2026-11-05-step-cost/README.md:112,134`).
7. **Phần v2 chưa kiểm** (`docs/prd.md:709-722`): bỏ người ngoài khỏi prompt harvest; vòng điền bù; chunking; re-harvest theo cửa sổ với merge box; cấu hình runs=1 nói chung; ánh xạ tool Codex (`apply_patch` chưa từng thấy trong dữ liệu thật, `docs/experiments/2026-11-04-dm-real-run/README.md:83`).
8. **Giá trị lượt người ngoài chưa chứng minh.** Opus chấm và có thể ưa văn phong Sonnet. Nhãn người dùng bất đồng ở 2 mục. Thử mù DM.8 đang chờ (`docs/prd.md:712`; `docs/experiments/2026-11-03-harvest/README.md:157-161`).
9. **Chi phí.** Người ngoài chiếm 69% chi tiêu vì đọc lại cả cửa sổ bằng sonnet. 91% token đầu vào bị tính như cache write 1 giờ không bao giờ được đọc. Dry-run đánh giá thấp chi phí khoảng 1,5 lần (`docs/experiments/2026-11-05-step-cost/README.md:110-111,106`). Các lựa chọn cắt chi phí Q.4 (người ngoài dùng haiku, gộp vào harvest, chỉ đọc quanh điểm nóng) đã liệt kê, chưa làm (`:142-149`).
10. **Mã thoát Codex** chỉ có khi output tự in ra, nên `nonzeroExit` thường mù trên Codex (`docs/experiments/2026-11-04-dm-real-run/README.md:82`).

## 6. Số đã đo (tại `v0.3.0`)

| Chỉ số | Giá trị | Nguồn |
|---|---|---|
| Recall so với 7 chuyện mẫu (prompt e4, haiku) | 6–7/7 đủ ở cả 5 lần chạy | `docs/experiments/2026-11-03-harvest/README.md:70-74` |
| Recall trên 8 nhãn `t` của người dùng | 8/8 ở 4/5 lần, 7/8 ở 1 lần; 0 bịa | cùng file, `:136-139` |
| AUC tension (`t` vs `s`) | sonnet 0,83–0,85, haiku 0,75–0,79 | cùng file, `:176-179` |
| AUC stakes / stakes×strength | si-sonnet 0,93–0,94 / 0,96–0,98 (lạc quan) | cùng file, `:219-220` |
| Một lần chạy pipeline thật | 7/7 trả lời, 28/28 điểm nóng, 38 chuyện, 7/8 `t` ở nửa trên, 1,01 USD, 246 giây | `docs/experiments/2026-11-04-dm-real-run/README.md:24-49` |
| Eval 8 phiên (nhãn nháp của agent, chưa người dùng soát) | recall 92%, p@5 0,63, p@10 0,62, hạng `t` trung bình 6,4, 21/30 `t` ở nửa trên; "mọi `t` ở nửa trên" đạt ở 3/8 phiên | `docs/experiments/2026-11-05-step-cost/README.md:121-136` |
| Chi phí mỗi phiên (8 phiên, 9 lần chụp) | trung bình 0,83 USD (0,50–1,12). Chia: harvest 20%, người ngoài 69%, hook-tension 6%, stakes 4%, cluster 0 (không bao giờ gọi ở cấu hình mặc định) | cùng file, `:28-37` |
| Use rate top-5 | Mới có công cụ đo: đếm quyết định mới nhất của chuyện hạng 1–5, hiện tỉ lệ khi có ≥10 quyết định (`lib/metrics.mjs:20,127-146`). **Không có giá trị nào được ghi trong repo** | `plans/reports/fullstack-developer-261105-u8-measurement.md:14-20` |

**Eval harness** (`scripts/eval/README.md`): chụp output model một lần rồi phát lại bằng `--fake-llm` ở 0 USD; ghép chuyện với nhãn tất định (theo slug, theo từ khoá ≥min, hoặc khoảng dòng cộng một từ khoá), không LLM nào chấm khớp (`:83-91`); chỉ số là recall, p@5, p@10, hạng `t` trung bình, `t` ở nửa trên và độ lệch giữa hai lần chụp (`:97-104`).

## Câu hỏi còn mở

- Chưa có Use rate top-5 thật; nhãn 8 phiên là bản nháp người dùng chưa soát, nên chưa có chân lý cho chất lượng xếp hạng ngoài một phiên của chính dự án.
- Chưa rõ `personalize` ở UI đã từng được đo chưa: harness xếp hạng chỉ bằng `sortRanked`, không có `personalize` (`scripts/eval/README.md:95`).
