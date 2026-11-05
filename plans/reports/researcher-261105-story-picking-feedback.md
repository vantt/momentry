# Phản hồi chọn chuyện từ một lần nhìn lại thật

Ngày 2026-11-05. Đối tượng: momentry v0.3.0 (`lib/` và `prompts/` ở tag `v0.3.0` trùng commit `1b64da6`). Nguồn dữ liệu: **4 phiên Claude thật của một dự án khác (một plan tài liệu chạy nhiều tuần)**, cùng một lần nhìn lại (retrospective) làm bằng tay trên chính plan đó. Báo cáo này đã lược hết nội dung transcript, tiêu đề chuyện, lời người dùng, id phiên, đường dẫn và tên người; chỉ giữ số liệu và mô tả loại khoảnh khắc. Dữ liệu thô nằm ngoài repo.

Đọc kèm:
- [bản đồ thuật toán chọn](researcher-261105-pick-algorithm-map.md) (có file:dòng)
- [thực hành chọn chuyện bên ngoài](researcher-261105-story-selection-practice.md)
- [phương pháp nhìn lại](researcher-261105-retrospective-method.md) (đầu vào cho M.4)
- số đo chính thức: [material-signals](../../docs/experiments/2026-11-05-material-signals/README.md). Báo cáo này không chép lại các con số đó.
- plan xử lý: [story-material](../261105-story-material/plan.md)

## 1. momentry và nhìn lại bằng tay là hai tầng

| | momentry | Nhìn lại bằng tay |
|---|---|---|
| Đơn vị | Khoảnh khắc trong **một phiên** | **Cung truyện** xuyên nhiều tuần, nhiều phiên, nhiều commit |
| Hướng | Từ dưới lên: quét mọi dòng, ghi hết rồi lọc | Từ trên xuống: mạch có sẵn, đi tìm bằng chứng |
| Nguồn | Transcript. Không đọc git | Git, quyết định, báo cáo. Không đọc transcript |
| Bằng chứng | Con trỏ dòng `sid#Ln` | Commit, file, ngày |
| Kiểm chứng | Không có | Hai vòng kiểm từng claim |
| Chi phí | Khoảng 0,83 USD một phiên (đo ở [step-cost](../../docs/experiments/2026-11-05-step-cost/README.md)); phiên rất dài ước tính khoảng 18 USD, chưa đo | Khoảng 31 phút, khoảng 1,78M token subagent |

Kết luận: momentry giỏi đúng thứ cách làm tay thiếu (tìm ứng viên từ dưới lên, ép trả lời từng điểm nóng, lượt người ngoài, nhãn tension tiếng Việt). Nó thiếu đúng thứ cách làm tay có (cung xuyên phiên, nguồn git, kiểm chứng). Nhìn lại là loại chuyện đáng tiền nhất mà momentry chưa làm được.

## 2. `reduce` (0 USD) trên 4 phiên: trúng và trượt

Đối chiếu 15 khoảnh khắc thuộc giai đoạn 4 phiên phủ. Đây là phép đo lớp gợi ý tất định, chưa phải xếp hạng cuối. `reduce` không gọi LLM (`lib/cli.mjs`, `lib/pipeline.mjs`: `readEntries` → `render` → `detect`).

Bốn phiên: một phiên điều tra (vài trăm entry), hai phiên Lead (khoảng 1,7 nghìn và 21,4 nghìn entry; phiên dài nhất khoảng 2,63M token sau reduce, 18 cửa sổ harvest, 439 điểm nóng), một phiên agent triển khai (khoảng 0,9 nghìn entry).

| Loại khoảnh khắc | Kết quả `reduce` |
|---|---|
| Chuỗi nguyên nhân nằm trong git, trước phiên cũ nhất còn lại (12 mắt) | Ngoài tầm theo cấu trúc: không đọc git, transcript cũ đã mất |
| Số liệu diff của một lần cutover | Ngoài tầm (chỉ có trong git); đêm đó thì trúng nhờ một lần ghi memory |
| Máy hết bộ nhớ trong worker | Trượt: xảy ra ở lần chạy worker, không nằm trong transcript top-level |
| Bảng "chưa đạt" của một lần thử nghiệm | Trượt: không có từ nối mũi tên |
| Dừng vì hết quota | Trượt |
| Người dùng chê "tốn công, làm đã lâu" | Ngẫu nhiên: điểm nóng là hook chặn câu hỏi của agent, không phải câu người dùng |
| Người dùng chọn hướng, hai lần (gói review bị bỏ; đồng ý một phương án) | Trượt cả hai |
| Số lần làm lại theo vòng sau đó | Trúng (cặp số) |
| Hai agent tranh ổ đĩa | Trượt (tin nhắn từ phiên khác) |
| Merge nhầm phần dở vào nhánh plan | Trúng (ghi memory) |
| Người dùng giục vì quá lâu | Trúng gián tiếp: câu người dùng không có điểm nóng, lần ghi memory 43 dòng sau thì có |
| Doer sửa chính thước đo | Trượt: bài học ghi qua heredoc, `metaWrite` chỉ thấy Edit/Write |
| Số lỗi giảm nhờ máy quét độc lập | Trúng (cặp số) |
| Bằng chứng nặng hàng GB | Ngẫu nhiên: trúng vì khoảng số, nhưng đúng chủ đề |
| Gỡ một khoá ghi | Trúng (cặp số) |
| Chính bài nhìn lại | Trúng nhưng vòng tròn (tự trích số của mình); lộ lỗi parse số có dấu cách ngăn nghìn |

**6 trúng thật, 3 trúng nhờ may, 6 trượt.** Ba lời người dùng mạnh nhất không có điểm nóng nào: lời phản đối ngắn không phải loại tín hiệu của bộ dò lúc đó, và `/bip` chưa ai dùng.

Nhiễu trên phiên Lead dài nhất (số liệu trước E20): khoảng 117/182 cặp số là khoảng ("dòng X tới Y"); khoảng 70 lệnh git "đảo ngược" là thao tác thường ngày (`checkout --detach`, rebase trước khi push, `checkout --` file sinh ra); khoảng 43 lệnh "thất bại" là hook chặn hoặc lỗi công cụ. Ước tính khoảng 70–80% điểm nóng của phiên này sẽ bị harvest cho `skip`; đó là chi phí, không phải tín hiệu.

Tín hiệu chuẩn nhất: **ghi memory, 10/10 lần có ý nghĩa**, nhưng ghi qua shell thì không thấy.

Giới hạn cấu trúc thấy được (cái nào đã có hướng xử lý nằm ở [plan](../261105-story-material/plan.md)):
1. Một phiên một cửa sổ: không nối được cung nhiều tuần (M.4).
2. Không đọc git: số dòng đổi, số file, tag nằm ngoài tầm (M.2).
3. Retention: transcript cũ hơn một mốc đã bị xoá khỏi máy, nên giai đoạn đầu không có nguồn nào.
4. Chỉ transcript top-level: bỏ qua subagent (hơn nghìn file), phiên trong worktree liên kết, và lần chạy worker nơi nhiều chuyện xảy ra (M.3).
5. Phiên mở nhiều tuần chỉ được harvest ở khoảng nghỉ (`scan` bỏ file sửa trong 30 phút).
6. Chi phí phiên dài, ước tính, chưa đo.
7. Tiếng Việt: "X trên Y", "X/Y", phần trăm, "giảm còn", số có dấu cách ngăn nghìn chưa được hiểu; lời phản đối của người dùng chưa có bộ dò (M.1 xử lý phần này).
8. Bash ghi file qua heredoc tránh được `metaWrite` (M.1 xử lý bằng `lessonWrite`).

**`reduce` tìm thêm được 4 chất liệu mà cách làm tay bỏ sót:** một quyết định của người dùng mở khoá việc đổ code lên main (đi sau một câu phàn nàn), một nguyên nhân gốc nhỏ làm số lỗ hổng định danh giảm hơn 10 lần, tỉ lệ làm lại theo vòng cho thấy phán đoán ngữ nghĩa không hội tụ bằng sinh lại, và nửa tích cực của bài học "tác giả không sửa công cụ nghiệm thu" (máy quét độc lập cắt lỗi hơn 10 lần). Hai khoảnh khắc người dùng bực trùng đúng lúc hook chặn câu hỏi của agent: một chuyện quy trình nhỏ.

## 3. Ý tưởng cải tiến

Mã ý tưởng M1–M6 và S1–S6 là của báo cáo này; cột "Plan" chỉ chỗ chúng đi tiếp (mã M.n trong plan là mã khác).

| Ý | Nội dung | Plan |
|---|---|---|
| M1 | Bộ dò giọng người dùng: câu ngắn sau lượt agent chạy dài, trả lời lựa chọn, từ vựng phản đối hoặc giục, lệnh bị từ chối, interrupt | M.1 xong (`ownerVoice`) |
| M2 | Bộ dò ghi bài học hoặc quyết định, gồm đường shell/heredoc (memory, ADR, mục lịch sử quyết định, CHANGELOG) | M.1 xong (`lessonWrite`) |
| M3 | Lọc nhiễu `metricPair` (khoảng, số Việt), `gitReversal` (detach, rebase thường, dọn dẹp), tách `nonzeroExit` do hook/quyền | M.1 xong (`blocked` và các bộ lọc) |
| M4 | Git là nguồn thứ hai trong khung giờ phiên, kèm SHA làm bằng chứng (hỏi: luật privacy có cho SHA vào hộp công khai không, hay chỉ hộp riêng tư) | M.2 |
| M5 | Đọc transcript subagent và worker, ít nhất ở mức tóm tắt kết quả | M.3 |
| M6 | Phiên rất dài: chỉ đọc vùng quanh điểm nóng; lượt người ngoài dùng haiku | E17, mục Q.4 ([story-quality](../261104-story-quality/plan.md)) |
| S1 | Tầng cung truyện / chế độ nhìn lại: nối chuyện qua file, mã quyết định, tên plan, độ gần thời gian (có thể thêm embedding) + commit từ M4. Đầu ra: timeline, chuỗi nhân quả, bảng số, các cung xếp hạng | M.4 (cần chủ dự án chọn khung) |
| S2 | Thay cổng tension theo thứ tự từ điển bằng cổng "so what" cộng điểm cộng dồn; mở stakes thành "đổi kết quả hoặc đụng một nguyên tắc đã nêu" | một phần ở M.5 (bản nhỏ); bản đầy đủ thuộc E17 |
| S3 | Kiểm Và–Nhưng–Vì vậy cho câu hook | chưa có việc |
| S4 | Lấy top-k theo nhóm (thất bại, quyết định, số, quy trình) | chưa có việc |
| S5 | Đánh dấu của người dùng phải đổi thứ hạng thật; bộ nhãn đóng băng 30–50 chuyện xếp từng cặp để đo Use rate top-5 | liên quan [shared-labels](../261105-shared-labels/plan.md) |
| S6 | Skill viết nháp mang theo vòng kiểm chứng: bảng sự kiện đánh số, mã claim `[F12]`, số tính bằng script, "ít nhất N" khi dữ liệu thiếu, kiểm thứ tự theo timestamp, ghi người làm, sổ claim bỏ, người kiểm độc lập chỉ thấy claim và bằng chứng | gộp vào M.4 (xem [phương pháp nhìn lại](researcher-261105-retrospective-method.md)) |

Lý do cho S6: ở lần nhìn lại bằng tay, vòng kiểm vòng 1 duyệt 102 claim, 22 claim không đạt (13 sai, 2 không nguồn, 7 nói quá), dù mọi con số lớn đều đúng. Lỗi nằm ở mắt nối câu chuyện.

Chiều ngược lại, momentry dạy cách làm tay: thêm bước tìm ứng viên từ dưới lên (chạy `reduce` lên transcript cộng memory và ghi quyết định), coi giọng người dùng là nguồn hạng nhất, cho một lượt người ngoài đọc bản nháp.

## 4. Đo có trả phí trên cùng dữ liệu

Hai lần chạy, tổng khoảng 6 USD. Số của lần so nhánh với `main` đã nằm ở [material-signals, mục "Đo có trả phí"](../../docs/experiments/2026-11-05-material-signals/README.md#đo-có-trả-phí). Dưới đây chỉ là phát hiện chưa nằm ở đó.

**Mốc `main` (trước E20), 8 cửa sổ phủ cả 15 khoảnh khắc:** 3,08 USD (đoán trước 3,20), 224 chuyện, recall theo harness 97%, p@5 0,65, p@10 0,59, 28/32 nhãn `t` ở nửa trên. Nhãn nháp 75 dòng do agent viết trước khi xem đầu ra.

- **Bước LLM bù được phần lớn chỗ `reduce` trượt về recall, không bù được về xếp hạng.** Mọi khoảnh khắc `reduce` trượt hoặc trúng ngẫu nhiên đều xuất hiện thành một chuyện harvest; 147/224 chuyện không mang điểm nóng nào. Chỗ yếu là hạng: nhiều khoảnh khắc giọng người dùng thành chuyện strength 1 ở nửa dưới.
- **Matcher của harness quá dễ dãi.** Nhãn khớp khi chia sẻ 2 từ khoá hoặc một từ khoá nằm trong khoảng dòng của nhãn; kiểm tay các nhãn `t` thấy cả khớp thổi phồng (từ khoá chung chung, nhãn khớp nhầm chuyện) lẫn khớp bị hụt (từ khoá bị harvest viết lại). Đếm tay: khoảng 27/32 nhãn `t` được tìm lại đủ, 3 một phần, 2 trượt. Nhãn cần người thứ hai soát trước khi dùng làm cổng hồi quy.
- **Chuyện của người dùng bị chấm thấp.** Chuyện mạnh nhất kiểu "con số đảo chiều" đạt strength 3; chuyện giọng người dùng và nhịp làm việc nhận strength 1–2 và rơi xuống nửa dưới.
- **27 chuyện chỉ do lượt người ngoài sinh ra** là các mục chung chung kiểu "agent làm việc thế nào", nằm cuối mọi danh sách: tốn thời gian đọc, ít hại xếp hạng.
- Chi phí mỗi cửa sổ bám sát số token sau reduce (khoảng 0,29–0,32 USD cho 100k token).

**Nhãn v2** (88 dòng, 31 `t`): sửa chủ yếu do từ khoá quá chung (một nhãn khớp 5 chuyện không liên quan), nhãn bị paraphrase mất từ khoá, tách hai dòng, thêm 14 dòng đã kiểm lại trong transcript. Mỗi thay đổi có một dòng lý do trong dữ liệu riêng tư. Còn một nhãn quá chặt cho chuyện ngắn; chưa chỉnh để hai bên cùng chấm một bộ nhãn.

**So nhánh với mốc (7 cửa sổ):** điểm nóng 189 → 167, chuyện nêu tên quyết định của người dùng 14 → 24. Đếm tay `t`: mốc 25 đủ / 5 một phần / 0 trượt; nhánh 22 / 6 / 2. Hai lần trượt của nhánh không gắn với điểm nóng và nằm trong độ lệch giữa hai lần chạy. Chỉ hướng "nêu tên quyết định nhiều hơn" đáng tin; các dịch chuyển hạng lẫn lộn và nằm trong nhiễu của một lần chụp mỗi bên. Một cửa sổ hỏng ở nhánh vì id điểm nóng lạ làm hỏng cả lời gọi (nguyên nhân có từ trước, nhánh làm nó lộ ra); đã sửa ở M.1c.

### 4.1 Vì sao chuyện quyết định của người dùng xếp thấp ở cả hai bên

`rankKey` (`lib/rank.mjs`): chuyện có tension `none` luôn nằm dưới mọi chuyện có tension, bất kể stakes. Trên 7 cửa sổ, 36–38% chuyện nêu tên người dùng bị chấm `none`, so với 21–27% các chuyện khác. Ở nhánh, stakes của chuyện người dùng đã bắt kịp phần còn lại; phần chênh còn lại nằm ở strength và tension, tức `prompts/hook-tension.md`.

Hai chỗ trong prompt gây ra: dòng định nghĩa `none` ("chỉ là sự kiện, mẹo, hay việc vặt") cùng câu "none là câu trả lời hợp lệ và thường gặp"; các loại tension có `it_ma_nhieu` (bỏ ít thu nhiều) nhưng không có chiều ngược lại (bỏ nhiều thu ít), mà đó đúng là lời phàn nàn thường gặp của người dùng. Ở `prompts/stakes.md`, mức 0 gồm "sự cố bên lề (công cụ, môi trường, quy trình)", cộng với `main_goal` chỉ nói về kết quả, nên phản đối về nhịp và chi phí bị coi là "quy trình" và nhận 0–1.

Đề xuất nhỏ nhất (chưa làm; đây là M.5 và M.6 của plan):
1. `lib/rank.mjs`, một dòng: tension `none` chỉ hạ chuyện khi stakes < 2. Kiểm bằng replay 0 USD. Mô phỏng trên danh sách đã chụp với tổng `2·stakes + strength`: một chuyện chọn hướng của người dùng #27 → #11; chuyện về số lần làm lại #31 → #20 (mốc), #25 → #21 (nhánh); các chuyện đứng đầu không đổi. Với tổng `stakes + strength` thường, cải thiện nhỏ hơn (#27 → #20). Phải chạy lại trên cả hai bộ eval trước khi đổi.
2. `hook-tension.md`, một dòng: khi người dùng chê, giục hoặc chọn đổi hướng, giằng xé là giữa công bỏ ra và kết quả, hoặc giữa điều agent làm và điều người dùng cần; chọn `khac` hoặc `giup_ma_hai`, không phải `none`. Một loại mới `nhieu_ma_it` sạch hơn nhưng cần sửa `TENSIONS` trong `lib/box.mjs`.
3. `stakes.md`, một dòng: lời phản đối, giục hoặc quyết định của người dùng làm đổi phạm vi, cách làm hay nhịp của việc chính là ít nhất 2; chọn hướng mới là 3.

Phương án 1 một mình sửa các chuyện bị chôn; phương án 2 và 3 cần cho phản đối về nhịp. Hai dòng prompt cần một lần chụp có trả phí (khoảng 0,4 USD cho hook-tension cộng stakes trên 8 cửa sổ nếu chạy trên cụm đã cache).

## 5. Việc đã làm và việc còn mở

- Đã làm: M1–M3 thành bộ dò, sửa id điểm nóng lạ làm mất cửa sổ ([plan](../261105-story-material/plan.md), M.1, M.1b, M.1c).
- Còn mở: M.2 (git), M.3 (transcript worker), M.4 (cung nhiều phiên, S1 và S6), M.5 (rank, E17), M.6 (prompt).

Câu hỏi còn mở:
- Một lần chụp thứ hai mỗi bên (khoảng 3 USD mỗi bên) là cách duy nhất tách tác động của code khỏi nhiễu cho các dịch chuyển hạng.
- Luật privacy có cho ghi SHA hoặc đường dẫn file vào hộp công khai không (M4 cần quyết).
- Chủ dự án có muốn bộ nhãn được soát lần nữa trước khi dùng làm cổng hồi quy không.
