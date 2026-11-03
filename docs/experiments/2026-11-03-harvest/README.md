# Thí nghiệm harvest 1–5 (2026-11-03)

**Mục đích:** chạy thí nghiệm 1–5 trong [debate-2026-11-03.md](../../history/debate-2026-11-03.md) mục 6, và thử bước người ngoài bằng Sonnet. Trả lời các câu: LLM có tự lọc bỏ chuyện nhỏ không; bước người ngoài giúp được gì; điểm nóng kèm phần (b) có bắt thêm chuyện không (và từ đó: có cần hook Stop không); bản tóm tắt compact có cần không.

Đợt 1 ở mục 1–3. Đợt 2 ở mục 4–5. Kết luận ở mục 6.

**Harness:** [harness/](harness/) (`reduce.mjs`, `prompts.mjs`, `run.sh`, `judge.sh`). Kết quả thô nằm ngoài repo vì chứa nội dung phiên.

## 1. Thiết lập

- **Phiên:** `claude:95ca719b` (repo `obsidian-pkm-automation`), dòng 1–4405, tức ngay trước lúc user hỏi về cơ chế tự quan sát. Model không thấy chuyện nào đã ghi. Hộp rỗng, không đưa tiêu đề chuyện có sẵn.
- **Đáp án:** 7 chuyện mẫu. `hop-chua-sinh-ra-giua-chat` nằm ngoài cửa sổ nên không tính.
- **Rút gọn:** giữ lời user, lời agent, lệnh (≤300 ký tự), 2 dòng đầu của kết quả tool, 3 dòng cuối khi exit ≠ 0, và bản tóm tắt compact (thí nghiệm 5 mới bỏ nó). Bỏ thinking. Kết quả: 1018 mục, khoảng 157k token input.
- **Điểm nóng:** 4 hàm thuần (exit ≠ 0, cặp số trước/sau, git đảo hướng, ghi file cấu hình agent), gộp trong cửa sổ 5 dòng, ra 28 điểm.
- **Harvest:** `claude -p --model haiku`, cô lập (không hook, không MCP, không tool, không session). Mỗi biến thể chạy 2 lần.
- **Chấm:** `claude -p --model sonnet` so từng lần chạy với đáp án: `full` / `partial` / `miss`. Chuyện ngoài đáp án phân loại `new` / `weak` / `dup` / `dubious`. Đã kiểm tay một phần (tiêu đề chuyện ứng với điểm nóng của e4).

| Biến thể | Prompt |
|---|---|
| e1 | Bản B: 6 tín hiệu, khuôn, riêng tư, "ghi thừa còn hơn bỏ sót" |
| e2 | e1 + câu chống tự lọc ("chuyện nhỏ, vui, hỏng: vẫn ghi", rà lại một lượt) |
| e3a | e2 + một câu hỏi người ngoài |
| e3b | e2 + bước người ngoài có cấu trúc (≥3 việc, cách làm phổ biến, khoảng cách) |
| e4 | e3b + danh sách 28 điểm nóng, bắt buộc trả lời từng điểm (phần b) |

## 2. Kết quả

`●` full, `◐` partial, `·` miss.

| Lần chạy | do-tim | hybrid | lo-rieng | mot-ky | pkill | tu-dien | may-soan | Full | Partial | Ngoài đáp án (new / weak / dup) | Số chuyện | Output token | USD |
|---|---|---|---|---|---|---|---|---:|---:|---|---:|---:|---:|
| e1-1 | ◐ | ● | · | ◐ | · | ● | ● | 3 | 2 | 2 / 0 / 1 | 7 | 3.2k | 0,165 |
| e1-2 | ◐ | ● | · | ● | · | ● | ● | 4 | 1 | 1 / 2 / 0 | 7 | 2.9k | 0,164 |
| e2-1 | ◐ | ● | ● | ● | ● | ● | ◐ | 5 | 2 | 9 / 13 / 0 | 29 | 23.2k | 0,215 |
| e2-2 | ◐ | ● | · | ● | ● | ● | ◐ | 4 | 2 | 10 / 14 / 4 | 34 | 30.4k | 0,233 |
| e3a-1 | ● | ● | ● | ● | · | ◐ | ● | 5 | 1 | 2 / 2 / 0 | 10 | 4.6k | 0,168 |
| e3a-2 | ● | · | ◐ | ● | · | ● | ◐ | 3 | 2 | 3 / 3 / 0 | 11 | 5.1k | 0,170 |
| e3b-1 | ◐ | ◐ | ● | ● | · | ● | ● | 4 | 2 | 2 / 3 / 0 | 9 | 4.5k | 0,168 |
| e3b-2 | ● | ● | ● | ● | ● | ● | ◐ | 6 | 1 | 6 / 22 / 1 | 36 | 30.9k | 0,234 |
| e4-1 | ● | ● | ● | ● | ● | ● | ◐ | 6 | 1 | 9 / 10 / 1 | 27 | 26.2k | 0,223 |
| e4-2 | ● | ● | ● | ● | ● | ● | ● | 7 | 0 | 11 / 13 / 1 | 32 | 35.2k | 0,246 |

Thời gian mỗi lần: 23–33 giây khi output ngắn, 116–167 giây khi output dài.

## 3. Đọc kết quả

1. **LLM tự lọc là có thật.** e1 (prompt bản B) trượt `lo-rieng-tu` và `pkill` cả 2 lần. Đó đúng là các chuyện mà phiên gốc chỉ ghi sau khi user nhắc. Thêm "ghi thừa còn hơn bỏ sót" là chưa đủ.
2. **Câu chống tự lọc chỉ có tác dụng khi model chịu chạy dài.** Từ e2 trở đi, số chuyện chia hai cụm rõ rệt: hoặc 9–11 chuyện (giống e1), hoặc 27–36 chuyện. `pkill` chỉ được bắt ở cụm dài. Với cùng một prompt, cụm nào xảy ra là ngẫu nhiên, nên câu chống tự lọc một mình không tin được.
3. **Điểm nóng kèm (b) là thứ ổn định nhất.** e4 bắt `pkill` và `lo-rieng-tu` 2/2, đạt 6–7 full trên 7. Model gán `story` cho 25–28 trên 28 điểm nóng và gần như không `skip`. Nghĩa là danh sách điểm nóng hoạt động như **neo sự chú ý**, không phải như bộ lọc. `H14` (exit 144) thành "pkill -f giết luôn shell đang chạy", `H22` (git reset) thành chuyện gộp 6 commit để gỡ dữ liệu lộ.
4. **Bước người ngoài (c) yếu.** Phần lớn mục là việc phổ biến ("chạy test trước commit", "đẩy thẳng main repo của mình"). Haiku chưa đo được khoảng cách thật. Vài mục có giá trị: bảng duyệt markdown ✓/✗ do script áp lại, nhiều phiên AI cùng một máy, dữ liệu riêng ngoài repo. Không thấy khác biệt rõ giữa dạng một câu (e3a) và dạng có cấu trúc (e3b). Curse of knowledge vẫn chưa phân xử được: cần thí nghiệm 7 (phép thử cất kín).
5. **Đáp án không đủ.** e4 tìm ra khoảng 10 chuyện `new` có vẻ đáng kể mà người không ghi. Ví dụ: tên file có ký tự vô hình U+200A làm script tra đáp án lỗi ba lần; vault có 129 chữ đặt dấu kiểu cũ trên 2.166 chữ kiểu mới; reindex mất 29 giây khi chữ ký gói không đổi, 691 giây khi đổi; từ điển khởi đầu lỡ chứa đáp án của bộ đo. Recall tính trên 7 chuyện chỉ là cận dưới. Thí nghiệm 6 (user đọc mù) cần làm để có đáp án đủ.
6. **Đổi lại là độ ồn.** Lần chạy dài cho 10–22 chuyện `weak`. Đúng với nguyên tắc "ghi nhiều, lọc sau", nhưng người lướt hộp sẽ tốn công. Chưa có lần nào bị chấm `dubious`.
7. **Chi phí:** khoảng 0,16–0,25 USD mỗi lần harvest trên khoảng 157k token input bằng Haiku. Với một phiên cỡ này mỗi ngày thì chấp nhận được.

## 4. Đợt 2: tách tác dụng của (b), bỏ compact, người ngoài bằng Sonnet

Cùng thiết lập với đợt 1. Thêm các biến thể sau:

| Biến thể | Prompt | Model | Số lần |
|---|---|---|---:|
| e4 (chạy thêm) | Như đợt 1 | Haiku | +3 (tổng 5) |
| e4n | e3b + danh sách điểm nóng chỉ làm **gợi ý**, không bắt trả lời từng điểm | Haiku | 3 |
| e5 | e4 nhưng **bỏ bản tóm tắt compact** khỏi input | Haiku | 3 |
| out | Lần gọi **riêng** chỉ làm bước người ngoài: transcript rút gọn + danh sách chuyện của e4-2. Dặn bỏ qua việc dev bình thường đã làm, so với cách làm thật ngoài đời | Sonnet | 2 |

### 4.1 Harvest

| Lần chạy | do-tim | hybrid | lo-rieng | mot-ky | pkill | tu-dien | may-soan | Full | Số chuyện | Điểm nóng trả "story" |
|---|---|---|---|---|---|---|---|---:|---:|---|
| e4-1 | ● | ● | ● | ● | ● | ● | ◐ | 6 | 27 | 28/28 |
| e4-2 | ● | ● | ● | ● | ● | ● | ● | 7 | 32 | 25/28 |
| e4-3 | ● | ● | ● | ● | ● | ● | ● | 7 | 27 | 26/28 |
| e4-4 | ● | ● | ● | ● | ● | ● | ● | 7 | 36 | 26/28 |
| e4-5 | ● | ● | ● | ● | ● | ● | ● | 7 | 20 | 26/28 |
| e4n-1 | ● | ● | ● | ● | ● | ● | ◐ | 6 | 30 | – |
| e4n-2 | ● | · | · | ● | · | ● | ● | 4 | 10 | – |
| e4n-3 | ● | ● | ● | ● | · | ● | ◐ | 5 | 13 | – |
| e5-1 | ● | ● | ● | ● | ● | ● | ● | 7 | 38 | 28/28 |
| e5-2 | ● | ◐ | · | ● | · | ● | ● | 4 | 7 | **8/28** |
| e5-3 | ● | ● | ● | ● | ● | ● | ● | 7 | 25 | 28/28 |

### 4.2 Người ngoài: Haiku trong cùng lần gọi so với Sonnet gọi riêng

Gộp 38 mục người ngoài (22 mục từ Haiku e4-1..5, 16 mục từ Sonnet out-1..2), trộn thứ tự, ẩn nguồn. Opus chấm `gap` 0–3 (0 = dev bình thường đã làm vậy; 3 = người đọc "wow") và `concrete` (đủ cụ thể để kể không).

| Nguồn | Số mục | Gap trung bình | Phân bố gap 0/1/2/3 | Concrete |
|---|---:|---:|---|---:|
| Haiku, trong lần harvest | 22 | 0,45 | 13 / 8 / 1 / 0 | 3 |
| Sonnet, gọi riêng | 16 | **2,31** | 0 / 1 / 9 / 6 | 16 |

Các mục Sonnet được chấm 3: nhiều phiên Claude cùng máy phối hợp qua tin nhắn (báo version, sha256, biến môi trường); đánh dấu câu mù và cảnh báo khi từ điển đã chứa sẵn đáp án; bảng duyệt markdown ✓/✗ chỉ đánh dấu ngoại lệ; nghi thước đo trước khi nghi sản phẩm khi số thấp bất thường; dựng golden set từ dữ liệu thật của mình; chọn đáp án chỉ bằng grep, cấm dùng chính công cụ đang được chấm.

13 trên 16 mục Sonnet trùng một chuyện đã nhặt (`already_picked`). Nghĩa là bước này **ít tìm ra sự kiện mới**. Giá trị chính của nó là **đổi góc kể**: từ "chuyện gì xảy ra" sang "cách làm mà người khác muốn học". 3 mục còn lại là việc mới: giữ golden set trong vault, chạy đo trên bản sao chỉ gồm `.md`, thử tay MCP server sau mỗi lần nâng bản.

### 4.3 Chi phí

- Harvest Haiku: 0,08–0,30 USD mỗi lần. Rẻ hơn khi trúng prompt cache, khoảng 0,09 USD.
- Bước người ngoài Sonnet: khoảng 0,65 USD mỗi lần, vì đọc lại toàn bộ transcript.
- Tổng hai đợt, gồm cả các lần chấm: 5,82 USD.

## 5. Đọc kết quả đợt 2

1. **Phần (b) chính là thứ có tác dụng, không phải bản thân danh sách điểm nóng.** e4 5/5 lần chạy đều vào cụm dài, đạt 6–7 full, bắt `pkill` 5/5. e4n chỉ đưa danh sách làm gợi ý: 1/3 lần vào cụm dài, và hai lần ngắn trượt `pkill`, một lần trượt cả `lo-rieng-tu`. Việc bắt trả lời từng điểm đẩy model sang chế độ rà kỹ.
2. **Bản tóm tắt compact không cần thiết.** e5 bỏ compact mà vẫn đạt 7/7 ở cả 2 lần tuân thủ. Phần rút gọn tự đứng được.
3. **Model có thể lờ phần (b).** e5-2 chỉ trả lời 8/28 điểm nóng, rồi rơi về cụm ngắn và trượt `pkill` lẫn `lo-rieng-tu`. Cách sửa là một **kiểm tra cơ học**: script đếm số điểm nóng được trả lời, thiếu thì gọi lại (hoặc gọi riêng cho các điểm còn thiếu). Kiểm tra này rẻ và cho kết quả cố định.
4. **Bước người ngoài phải là lần gọi riêng bằng model mạnh hơn.** Haiku gộp chung cho ra việc phổ biến (gap 0,45). Sonnet gọi riêng, với câu dặn "bỏ qua việc dev bình thường đã làm", đạt gap 2,31. Đây là bằng chứng đầu tiên cho thấy curse of knowledge xử lý được bằng máy. Nhưng chưa phải phép thử cất kín (thí nghiệm 7).

## 6. Kết luận cho các bất đồng

- **Bất đồng 1 (hook Stop): không cần.** Cả 28 điểm nóng tính được từ transcript lúc harvest, không phụ thuộc bản tóm tắt compact. Stop chỉ còn giá trị bảo hiểm khi transcript bị mất. Chưa kiểm trường hợp này, và nó không phải đường chính.
- **Bất đồng 2 (điểm nóng có bắt buộc trả lời không): có, kèm kiểm tra đủ số.** Đây là khác biệt giữa 7/7 ổn định và 4–5/7 ngẫu nhiên.
- **Bất đồng 3 (dạng bước người ngoài): lần gọi riêng, model mạnh hơn.** Giữ ý của Biên tập viên (output riêng). Câu hỏi ngắn trong cùng lần gọi không đủ.
- **Bất đồng 4 (rủi ro số một):** LLM tự lọc đã xác nhận và đã có cách vá. Với điểm mù chuyên gia, Sonnet gọi riêng cho tín hiệu tốt, nhưng chưa qua phép thử cất kín.
- **Bất đồng 5 (danh sách chuyện cũ trong prompt):** chưa thử.

**Cơ chế phát hiện đề xuất sau hai đợt:**

```text
rút gọn (script) + điểm nóng (script)
  -> harvest (Haiku): tín hiệu + chống tự lọc + trả lời TỪNG điểm nóng
  -> kiểm đủ số điểm nóng (script); thiếu thì gọi bù
  -> người ngoài (Sonnet, lần gọi riêng): đọc rút gọn + danh sách chuyện, ra góc kể "cách làm người khác muốn học"
  -> hộp chuyện (ghi nhiều), người lọc sau
```

Chi phí ước tính cho một phiên cỡ này: khoảng 0,9 USD (Haiku 0,1–0,3 cộng Sonnet 0,65).

## 6b. Đợt 3: nhãn của user (thay cho đọc mù)

**Cách làm:** gộp 142 chuyện của 5 lần e4 thành 38 cụm, mỗi cụm là một sự kiện (Sonnet gộp, phủ đủ 142/142). User gắn nhãn `t` (đáng kể) / `s` (nhạt) / `x` (sai), và ghi những chuyện có trong phiên mà bảng thiếu. Bảng và nhãn nằm ngoài git (`_private/`).

**Nhãn:** 8 `t`, 30 `s`, 0 `x`. Phần thiếu: trống.

| Chỉ số | Kết quả |
|---|---|
| Recall trên 8 chuyện `t` | 8/8 ở 4 lần e4, 7/8 ở e4-5 |
| Precision mỗi lần chạy (số chuyện rơi vào cụm `t` / tổng số chuyện) | 0,25–0,35 |
| Tỉ lệ bịa (`x`) | 0 |
| Chuyện user nhớ mà máy không bắt (phần thiếu) | 0 |

**Đồng thuận giữa các lần chạy là tín hiệu xếp hạng mạnh.** Cả 8 chuyện `t` đều được ít nhất 4/5 lần chạy bắt:

| Giữ cụm được bắt ở ít nhất | Số cụm | Trong đó `t` |
|---|---:|---:|
| 5/5 | 17 | 7 |
| 4/5 | 22 | **8** |
| 3/5 | 25 | 8 |
| 1/5 | 38 | 8 |

Chuyện chỉ 1–3 lần chạy bắt được đều là `s`. Nghĩa là chạy harvest vài lần rồi đếm số lần trùng là một cách rẻ, cho kết quả cố định, để **xếp hạng ở bước lọc**. Không lọc ở bước ghi. Đổi lại, chi phí harvest nhân theo số lần chạy.

**Những điều đáng chú ý:**

1. **Máy không bỏ sót chuyện nào mà user nhớ,** và không bịa. Phát hiện ở mức sự kiện coi như đủ cho phiên này.
2. **`pkill` (có trong mẫu ghi tay) bị đánh `s`.** Chuyện "vui nhỏ" lúc ghi được coi là đáng giữ, nhưng khi chọn thì user bỏ. Điều này khớp nguyên tắc "ghi nhiều, lọc sau": nhãn lúc ghi và nhãn lúc chọn là hai việc khác nhau.
3. **Hai chuyện `t` mới ngoài mẫu:** mở rộng bộ câu đo từ 61 lên 163 câu vì mỗi hạng mục quá ít câu; máy đề xuất 179 viết tắt, lọc còn 11, người nhận 10. Cả hai thuộc mạch "người duyệt, máy soạn".
4. **Bước người ngoài và nhãn user lệch nhau.** Hai mục Sonnet được Opus chấm gap 3 bị user đánh `s`: nhiều phiên Claude phối hợp qua tin nhắn, và chọn đáp án không dùng chính công cụ đang chấm. Có hai cách giải thích, chưa phân biệt được:
   - bước người ngoài đánh giá sai, hoặc
   - đây chính là curse of knowledge của user.

   Chỉ khán giả thật hoặc phép thử cất kín (thí nghiệm 7) mới trả lời được.
5. **Lỗi nằm ở cách kể, không ở việc phát hiện.** 4 trên 8 chuyện `t` có ghi chú kiểu "vấn đề nên kể nhưng tóm tắt không có hook, không hấp dẫn". Máy nhận đúng moment nhưng kể nhạt. Đây là việc của bước dựng bài (DM.6/DM.7), cần một bước tìm "móc" riêng.

## 6c. Đợt 4: câu hook và sự giằng xé (tension) làm tín hiệu lọc

**Giả thuyết (user, 2026-11-03):** một moment chỉ thật sự đáng giá khi viết được một câu hook làm người đọc phải đọc tiếp. Sức hút của câu đó đến từ sự giằng xé: hai vế đối nhau trong cùng một câu. Ví dụ "một ký tự Unicode làm điểm sụt" (nhỏ mà to), "thêm từ điển làm tìm kiếm tệ hơn" (giúp mà hại). Nghề kể chuyện gọi đây là irony trong logline, và nó tạo ra curiosity gap.

**Cách làm:**
- Đưa 38 cụm (chỉ tiêu đề và tóm tắt, ẩn nhãn và số lần bắt, trộn thứ tự) cho model.
- Mỗi cụm phải có: một câu hook dưới 15 chữ; `tension` thuộc một trong các dạng nho_ma_to, giup_ma_hai, tuong_ma_hoa_ra, hop_ma_tan, cam_ma_van_lot, it_ma_nhieu, khac, none; hai vế đối nhau; `strength` 0–3.
- Prompt dặn rõ `none` là câu trả lời hợp lệ, không được ép giằng xé.
- Chạy Sonnet 2 lần, Haiku 2 lần.

| Lần chạy | Strength TB của `t` | Strength TB của `s` | AUC tách `t`/`s` | `t` trong top 8 | `none`: số `t` / số `s` | USD |
|---|---:|---:|---:|---:|---|---:|
| Sonnet 1 | 2,63 | 1,40 | 0,83 | 5 | 0 / 12 | 0,08 |
| Sonnet 2 | 2,50 | 1,30 | 0,85 | 6 | 0 / 12 | 0,08 |
| Haiku 1 | 2,25 | 1,27 | 0,75 | 6 | 0 / 11 | 0,01 |
| Haiku 2 | 2,63 | 1,53 | 0,79 | 5 | 0 / 8 | 0,01 |

**Kết hợp với đồng thuận giữa các lần chạy (mục 6b):**

| Bộ lọc | Số cụm còn lại | Trong đó `t` |
|---|---:|---:|
| Không lọc | 38 | 8 |
| Bắt ≥ 4/5 lần | 22 | 8 |
| `tension ≠ none` (Sonnet) | 26 | 8 |
| **Bắt ≥ 4/5 lần và `tension ≠ none`** | **16–17 (Sonnet), 18–20 (Haiku)** | **8** |

**Đọc kết quả:**

1. **Giả thuyết đúng một nửa quan trọng:** mọi chuyện `t` đều viết được hook có giằng xé, ở cả 4 lần chạy, không lần nào bị `none`. Không viết được hook là tín hiệu loại an toàn: bỏ được 8–12 chuyện `s` mà không mất chuyện `t` nào.
2. **Có giằng xé chưa đủ.** Khoảng 14–19 chuyện `s` vẫn được chấm strength 2–3. Ví dụ: hai tên file khác nhau một ký tự vô hình; bảng duyệt tưởng chỉ mình xem mà cả LAN mở được; 496 note có alias nhưng chỉ 8 cái là tên khác thật.
   - Khác biệt dễ thấy: chuyện `t` đều nằm trên **mạch chính** của phiên (đo và sửa chất lượng tìm tiếng Việt, vòng người duyệt máy soạn). Chuyện `s` có giằng xé thì là **sự cố bên lề**.
   - Giả thuyết tiếp theo: cần thêm trục **stakes** (chuyện này có làm đổi kết quả của việc chính không). Chưa kiểm.
3. **Hook do máy viết sửa được lỗi "tóm tắt không hấp dẫn".** Ví dụ với các chuyện `t` (Sonnet):
   - "Điểm 0,075 tưởng tìm kiếm hỏng, thật ra hai đường dẫn khác mã hoá"
   - "Note đúng đứng hạng 7, trộn thêm tìm chữ thì tụt xuống 41"
   - "Từ điển đồng nghĩa lên 0→0,405, viết tắt tụt 0,667→0,307"
   - "Sửa ở commit sau không đủ: câu thật vẫn nằm trong lịch sử git"
4. **Rẻ:** Sonnet khoảng 0,08 USD, Haiku khoảng 0,01 USD cho 38 chuyện, vì chỉ đọc tóm tắt chứ không đọc transcript. Haiku tách kém hơn (AUC 0,75–0,79) nhưng vẫn giữ đủ 8 `t` khi kết hợp với đồng thuận.

**Đưa vào cơ chế:** harvest ghi thêm `hook`, `tension`, `sides` cho mỗi chuyện, nhưng vẫn ghi mọi chuyện. Ở bước lọc, xếp theo: `tension ≠ none` → số lần bắt → `strength`. Trục stakes để thử sau.

**Giới hạn riêng của đợt này:** nhãn chỉ từ một người, một phiên. Hook được viết từ tóm tắt đã gộp, mà bản thân tóm tắt có thể đã được viết sẵn theo hướng có giằng xé.

## 6d. Đợt 5: stakes (mạch chính hay bên lề)

**Giả thuyết (sinh ra từ mục 6c):** chuyện `t` nằm trên mạch chính của phiên, còn chuyện `s` có giằng xé thường là sự cố bên lề. Cần một trục stakes: chuyện này có làm đổi kết quả của việc chính không, thang 0–3, chấm độc lập với độ hay hay độ lạ.

**Hai cách xác định việc chính:**
- `si`: model tự suy ra việc chính từ danh sách 38 chuyện.
- `sg`: lấy câu giao việc đầu phiên của user. Cách này cơ học: dòng "Nhiệm vụ:" trong tin nhắn đầu tiên.

Cùng 38 cụm, cùng thứ tự trộn, ẩn nhãn. Sonnet chạy 2 lần mỗi cách, Haiku 1 lần mỗi cách. Mỗi lần khoảng 0,05 USD (Sonnet), gần 0 (Haiku).

| Lần chạy | Stakes TB của `t` | Stakes TB của `s` | AUC stakes | AUC stakes × strength (tension Sonnet 1) | Còn lại khi lọc `≥4/5 lần`, `tension ≠ none`, `stakes ≥ 2` |
|---|---:|---:|---:|---:|---|
| si Sonnet 1 | 2,13 | 0,63 | **0,94** | **0,98** | 7 cụm, 7 `t` |
| si Sonnet 2 | 2,25 | 0,67 | 0,93 | 0,96 | 7 cụm, 7 `t` |
| si Haiku | 2,25 | 1,20 | 0,83 | 0,91 | 10 cụm, 7 `t` |
| sg Sonnet 1 | 2,13 | 0,57 | 0,92 | 0,95 | 6 cụm, 6 `t` |
| sg Sonnet 2 | 2,00 | 0,57 | 0,85 | 0,87 | 7 cụm, 6 `t` |
| sg Haiku | 2,13 | 0,97 | 0,85 | 0,93 | 8 cụm, 7 `t` |

Việc chính model tự suy ra (si Sonnet): "xây dựng và hiệu chỉnh bộ câu đo chất lượng tìm kiếm cho OHS trên vault tiếng Việt, cùng gói tiếng Việt, từ điển…". Câu này sát với mạch thật hơn câu giao việc đầu phiên, vì phiên đã mở rộng từ "dựng golden set" sang "sửa tìm kiếm".

**Đọc kết quả:**

1. **Stakes là tín hiệu mạnh nhất tới giờ.** Riêng nó đạt AUC 0,92–0,94 với Sonnet. Nhân với độ mạnh giằng xé thì đạt 0,95–0,98: gần như xếp đúng toàn bộ chuyện `t` lên trên chuyện `s`.
2. **Tự suy việc chính (`si`) tốt hơn và ổn định hơn lấy câu đầu phiên (`sg`).** Phiên dài thường trôi khỏi lời giao việc ban đầu.
3. **Không dùng stakes làm ngưỡng cứng.** Lọc `stakes ≥ 2` thì 6–7 cụm còn lại đều là `t` (precision 100%), nhưng mất 1–2 chuyện `t`:
   - Gộp 6 commit để gỡ câu thật khỏi lịch sử git (stakes 1).
   - Máy đề xuất 179 viết tắt, người nhận 10 (stakes 1–2).

   Chuyện đầu không đổi kết quả việc chính, nhưng chạm vào **một nguyên tắc user đặt ra** (riêng tư). Có thể stakes cần mở rộng thành "đổi kết quả việc chính **hoặc** đe doạ một nguyên tắc / ràng buộc đã nêu". Chưa kiểm.
4. **Nên dùng stakes để xếp hạng, không dùng để lọc:** `tension ≠ none` → `stakes × strength` → số lần bắt.
5. **Haiku kém rõ rệt ở trục này** (AUC 0,83–0,85), vì cho nhiều chuyện bên lề stakes cao. Trục stakes nên dùng Sonnet. Chi phí vẫn chỉ khoảng 0,05 USD, vì chỉ đọc tóm tắt.

**Cảnh báo quan trọng:** giả thuyết stakes được đặt **sau khi** đã xem nhãn của chính bộ dữ liệu này. Kết quả là đánh giá trên cùng dữ liệu đã gợi ra giả thuyết, nên chắc chắn lạc quan. Phải kiểm lại trên một phiên khác, có nhãn mới, trước khi tin con số AUC 0,9+.

**Cơ chế phát hiện cập nhật:**

```text
rút gọn + điểm nóng (script)
  -> harvest (Haiku, có thể chạy vài lần): tín hiệu + chống tự lọc + trả lời TỪNG điểm nóng
  -> kiểm đủ số điểm nóng (script), thiếu thì gọi bù
  -> gộp cụm (Sonnet, đọc tóm tắt): mỗi sự kiện một cụm, đếm số lần bắt
  -> chấm cụm (Sonnet, đọc tóm tắt): hook, tension, strength, main_goal tự suy, stakes
  -> người ngoài (Sonnet, gọi riêng): góc "cách làm người khác muốn học"
  -> hộp chuyện: ghi hết; xếp theo tension ≠ none, stakes × strength, số lần bắt
```

## 7. Giới hạn

- Một phiên, một lĩnh vực.
- Người chấm là LLM. Chấm harvest dùng Sonnet; chấm người ngoài dùng Opus, có thể thiên vị văn phong chi tiết của Sonnet.
- Đáp án chỉ 7 chuyện, nên recall là cận dưới.
- Bước người ngoài dùng danh sách chuyện của một lần e4 cố định (e4-2).
- Chưa thử Sonnet cho harvest, và chưa thử phần (b) kèm vòng gọi bù.

## 8. Bước tiếp đề xuất

1. ~~Thí nghiệm 6~~: đã làm bằng cách gắn nhãn (mục 6b).
2. Thí nghiệm 7 (phép thử cất kín) cho bước người ngoài Sonnet: user ghi trước 3–5 việc mình làm trơn tru trên một phiên chưa ai ghi.
3. Chạy toàn bộ cơ chế đề xuất trên 1–2 phiên khác lĩnh vực, ví dụ phiên Codex.
4. Bắt đầu DM.2/DM.3 với cơ chế này: `story.mjs` gồm rút gọn, điểm nóng, harvest, kiểm đủ số và bước người ngoài.
