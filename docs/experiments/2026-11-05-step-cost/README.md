# Chi phí từng bước của pipeline (2026-11-05)

**Mục đích:** đo chi phí model của từng bước (harvest, cluster, outsider, hook-tension, stakes) trên nhiều phiên, để chọn đòn giảm chi phí thử trước ở Q.4 trong [plan story-quality](../../../plans/261104-story-quality/plan.md). Đồng thời là lần chạy đầu của [bộ đo](../../../scripts/eval/README.md) (Q.2).

**Dữ liệu thô** (đầu ra model, hộp nháp, nhãn) nằm trong `docs/_private/eval/`, không commit vì chứa nội dung phiên. Bản ghi này chỉ có số.

## 1. Thiết lập

- **Mã:** `e16ebda` (nhánh của agent, trên `main` `9ddfd14`). Cấu hình mặc định: `harvest.runs` 1, harvest `haiku`, chấm và người ngoài `sonnet`, `maxInputTokens` 150000. Claude Code 2.1.318.
- **Lệnh:** `node scripts/eval/run.mjs --manifest docs/_private/eval/manifest.json --capture`, mỗi phiên trong một repo git nháp, cache và cấu hình riêng. Máy không có cấu hình người dùng, nên không có nguồn chặn riêng tư; cấu hình nháp bật `allowUnchecked`.
- **Phiên:** 8 phiên, cửa sổ từ dòng 1. 7 phiên Claude Code, 1 phiên omp (Gemini, tiếng Anh). Phiên `2dfb5915` chụp hai lần để đo độ lệch giữa hai lần chạy. Không có phiên Codex dùng được (rollout duy nhất trên máy dài 15 dòng).

| Phiên | Host | Dự án | Cửa sổ | Entry | Điểm nóng |
|---|---|---|---|---|---|
| 2dfb5915 | claude | obsidian-pkm | 1–4000 | 772 | 9 |
| c4caee3c | claude | obsidian-hybrid-search | 1–4000 | 874 | 36 |
| 9514b261 | claude | forgent | 1–4000 | 614 | 14 |
| 6a207191 | claude | devops | 1–2412 | 636 | 39 |
| 0faf0bb2 | claude | fgOPC | 1–4000 | 1213 | 20 |
| f0bf048d | claude | AICoworker | 1–3520 | 1012 | 19 |
| ab9a1dd8 | claude | momentry | 1–4000 | 857 | 9 |
| cd4449ab | omp | mcp-skill-hub | 1–4000 | 2664 | 143 |

Mọi phiên vừa một khúc (dưới 150k token), nên **bước cluster không gọi model lần nào**: với `runs` 1, một khúc và hộp rỗng, pipeline để mỗi chuyện thô thành một cụm. Không phiên nào cần gọi bù harvest (`fill`).

## 2. Chi phí theo bước, tổng 9 lần chụp

| Bước | Gọi | Token vào | Token ra | USD | Phần USD | Giây model | Phần giây |
|---|---|---|---|---|---|---|---|
| harvest (haiku) | 9 | 1239.7k | 233.6k | 1,520 | 20% | 1006 | 67% |
| outsider (sonnet) | 10 | 1394.2k | 28.0k | 5,143 | **69%** | 251 | 17% |
| hook-tension (sonnet) | 9 | 74.0k | 21.6k | 0,441 | 6% | 147 | 10% |
| stakes (sonnet) | 9 | 71.7k | 11.5k | 0,331 | 4% | 88 | 6% |
| cluster | 0 | | | 0 | 0% | 0 | 0% |
| **Tổng** | 37 | 2779.6k | 294.6k | **7,435** | 100% | 1492 | 100% |

Trung bình 0,83 USD một lần chụp (0,50–1,12). Outsider có 10 lần gọi vì một phiên (`c4caee3c`) gọi lại một lần do đầu ra sai khuôn; lần gọi lại đọc từ cache nên chỉ tốn 0,05 USD.

## 3. Theo phiên

| Phiên | Bước | Gọi | Token vào | Token ra | USD | Phần | Giây model |
|---|---|---|---|---|---|---|---|
| 0faf0bb2#1 | harvest | 1 | 189.0k | 24.1k | 0,247 | 22% | 113 |
| | outsider | 1 | 188.3k | 2.7k | 0,772 | 69% | 27 |
| | hook-tension | 1 | 9.4k | 3.0k | 0,060 | 5% | 21 |
| | stakes | 1 | 9.2k | 1.5k | 0,044 | 4% | 12 |
| | **tổng** | 4 | 395.9k | 31.3k | **1,123** | | 172 |
| 2dfb5915#1 | harvest | 1 | 144.2k | 4.0k | 0,154 | 19% | 21 |
| | outsider | 1 | 142.9k | 3.3k | 0,602 | 73% | 31 |
| | hook-tension | 1 | 7.6k | 1.6k | 0,038 | 5% | 12 |
| | stakes | 1 | 7.3k | 1.0k | 0,031 | 4% | 7 |
| | **tổng** | 4 | 302.0k | 9.8k | **0,825** | | 72 |
| 2dfb5915#2 | harvest | 1 | 144.2k | 29.8k | 0,216 | 24% | 133 |
| | outsider | 1 | 143.6k | 2.9k | 0,595 | 65% | 26 |
| | hook-tension | 1 | 9.5k | 3.0k | 0,060 | 7% | 21 |
| | stakes | 1 | 9.2k | 1.5k | 0,044 | 5% | 13 |
| | **tổng** | 4 | 306.5k | 37.2k | **0,915** | | 192 |
| 6a207191#1 | harvest | 1 | 89.8k | 36.3k | 0,036 | 7% | 153 |
| | outsider | 1 | 87.7k | 3.1k | 0,374 | 75% | 27 |
| | hook-tension | 1 | 8.8k | 2.6k | 0,054 | 11% | 20 |
| | stakes | 1 | 8.5k | 1.2k | 0,039 | 8% | 9 |
| | **tổng** | 4 | 194.8k | 43.3k | **0,502** | | 209 |
| 9514b261#1 | harvest | 1 | 112.4k | 20.1k | 0,160 | 23% | 93 |
| | outsider | 1 | 111.2k | 2.9k | 0,466 | 67% | 26 |
| | hook-tension | 1 | 7.1k | 1.8k | 0,039 | 6% | 12 |
| | stakes | 1 | 6.9k | 1.0k | 0,030 | 4% | 8 |
| | **tổng** | 4 | 237.6k | 25.9k | **0,695** | | 138 |
| ab9a1dd8#1 | harvest | 1 | 96.7k | 32.0k | 0,035 | 7% | 135 |
| | outsider | 1 | 95.9k | 2.5k | 0,400 | 76% | 22 |
| | hook-tension | 1 | 8.3k | 2.9k | 0,054 | 10% | 19 |
| | stakes | 1 | 8.1k | 1.7k | 0,041 | 8% | 12 |
| | **tổng** | 4 | 208.9k | 39.0k | **0,530** | | 187 |
| c4caee3c#1 | harvest | 1 | 167.2k | 39.5k | 0,263 | 24% | 162 |
| | outsider | 2 | 332.4k | 6.0k | 0,734 | 67% | 52 |
| | hook-tension | 1 | 9.1k | 3.2k | 0,060 | 5% | 20 |
| | stakes | 1 | 8.8k | 1.7k | 0,044 | 4% | 11 |
| | **tổng** | 5 | 517.6k | 50.3k | **1,101** | | 245 |
| cd4449ab#1 | harvest | 1 | 153.7k | 43.1k | 0,259 | 27% | 174 |
| | outsider | 1 | 151.1k | 2.0k | 0,616 | 64% | 18 |
| | hook-tension | 1 | 8.0k | 2.4k | 0,048 | 5% | 15 |
| | stakes | 1 | 7.7k | 1.3k | 0,036 | 4% | 11 |
| | **tổng** | 4 | 320.5k | 48.7k | **0,959** | | 218 |
| f0bf048d#1 | harvest | 1 | 142.6k | 4.6k | 0,151 | 19% | 21 |
| | outsider | 1 | 141.0k | 2.8k | 0,584 | 74% | 24 |
| | hook-tension | 1 | 6.2k | 1.1k | 0,028 | 4% | 8 |
| | stakes | 1 | 5.9k | 0.7k | 0,023 | 3% | 6 |
| | **tổng** | 4 | 295.7k | 9.2k | **0,786** | | 59 |

Token vào = `input_tokens + cache_creation_input_tokens + cache_read_input_tokens` của `claude -p`; USD = `total_cost_usd`.

## 4. So với ước tính của `dry-run`

| Phiên | Token ước (`approxTokens`) | Token harvest thật | Thật / ước | USD ước | USD thật | Thật / ước | Giây (thật) |
|---|---|---|---|---|---|---|---|
| 0faf0bb2#1 | 112.2k | 189.0k | 1,68 | 0,66 | 1,123 | 1,70 | 177 |
| 2dfb5915#1 | 91.4k | 144.2k | 1,58 | 0,58 | 0,825 | 1,42 | 76 |
| 2dfb5915#2 | 91.4k | 144.2k | 1,58 | 0,58 | 0,915 | 1,58 | 196 |
| 6a207191#1 | 53.8k | 89.8k | 1,67 | 0,43 | 0,502 | 1,17 | 213 |
| 9514b261#1 | 64.0k | 112.4k | 1,75 | 0,47 | 0,695 | 1,48 | 143 |
| ab9a1dd8#1 | 56.5k | 96.7k | 1,71 | 0,44 | 0,530 | 1,21 | 192 |
| c4caee3c#1 | 99.6k | 167.2k | 1,68 | 0,61 | 1,101 | 1,81 | 250 |
| cd4449ab#1 | 92.3k | 153.7k | 1,66 | 0,58 | 0,959 | 1,65 | 223 |
| f0bf048d#1 | 82.0k | 142.6k | 1,74 | 0,54 | 0,786 | 1,46 | 64 |

- `approxTokens` đếm thấp khoảng 1,66 lần (1,58–1,75), ổn định giữa các phiên, kể cả phiên tiếng Anh. Token thật gồm cả prompt hệ thống và khuôn prompt (~3k), nhưng phần lớn chênh là do ước tính chữ/token.
- USD thật gấp 1,17–1,81 lần ước tính, trung bình 1,5. Ước tính giả định outsider 3 USD/M token và harvest 1 USD/M; thật ra outsider tốn ~4,2 USD/M token vào (sonnet, kể cả phí ghi cache), gần gấp đôi kỳ vọng tính theo token thật.

## 5. Điều đáng chú ý

1. **Outsider chiếm 69% tiền.** Bước này đọc lại nguyên cửa sổ đã rút gọn (cùng lượng token với harvest) nhưng bằng sonnet, nên mỗi token vào đắt hơn harvest khoảng 4 lần. Output của nó nhỏ (2–3k token).
2. **91% token vào bị tính là ghi cache 1 giờ**, nhưng không lần gọi nào đọc lại (trừ lần gọi lại của outsider ở `c4caee3c`, tốn 0,05 USD thay vì 0,68). Mỗi prompt chỉ dùng một lần, nên phí ghi cache là phí thừa. Harvest và outsider gửi cùng một transcript, nhưng khác model và khác phần đầu prompt nên không dùng chung cache được.
3. **Harvest có lúc "nghĩ", có lúc không.** 6/9 lần harvest có 12k–28k thinking token, chạy 93–174 giây; 3/9 lần không nghĩ, chạy ~21 giây, ra ít chuyện hơn. Hai lần chụp cùng phiên `2dfb5915`: không nghĩ ra 14 chuyện, có nghĩ ra 31 chuyện. Harvest chiếm 67% thời gian model, gần hết là phần nghĩ và viết.
4. **Hai lần harvest dưới 100k token vào có giá mỗi token thấp hơn khoảng 5 lần** (`6a207191`, `ab9a1dd8`: 0,035 USD cho ~90k vào và ~34k ra; các lần trên 100k: 0,15–0,26 USD). Chỉ hai điểm dữ liệu; chưa rõ là bậc giá theo độ dài ngữ cảnh hay lý do khác. Cần kiểm trước khi dựa vào.
5. **Cluster không tốn gì** ở cấu hình mặc định, vì mọi phiên chỉ có một khúc và một lần chạy. Bước này chỉ gọi model khi `runs` > 1, khi phiên dài hơn một khúc, hoặc khi gom lại phiên đã có chuyện trong hộp.
6. **Chấm (hook-tension + stakes) chỉ 10%**, input nhỏ (6–9k token mỗi lần).

## 6. Chất lượng (nhãn nháp, chưa duyệt)

Chạy lại cả 9 lần chụp bằng `--fake-llm` (0 USD) với nhãn agent soạn nháp ngày 2026-11-05 (60 đáp án, 30 nhãn `t`), chưa được user duyệt. Số dưới đây là mốc ban đầu cho Q.4 và Q.5, chưa phải kết luận về chất lượng. Định nghĩa chỉ số và cách khớp: [scripts/eval/README.md](../../../scripts/eval/README.md#chỉ-số).

| Phiên | Chuyện | Recall | p@5 | p@10 | Hạng `t` trung bình | `t` ở nửa trên |
|---|---|---|---|---|---|---|
| 0faf0bb2#1 | 27 | 100% | 0,80 | 0,90 | 6,5 | 4/4 |
| 2dfb5915#1 | 14 | 88% | 0,60 | 0,60 | 9,3 | 1/4 |
| 2dfb5915#2 | 31 | 88% | 0,40 | 0,50 | 12,0 | 2/4 |
| 6a207191#1 | 21 | 100% | 0,80 | 0,60 | 10,0 | 3/5 |
| 9514b261#1 | 17 | 71% | 0,40 | 0,60 | 5,3 | 2/4 |
| ab9a1dd8#1 | 26 | 100% | 0,60 | 0,80 | 7,3 | 3/3 |
| c4caee3c#1 | 28 | 88% | 0,40 | 0,20 | 9,8 | 3/4 |
| cd4449ab#1 | 24 | 100% | 0,80 | 0,70 | 1,0 | 2/2 |
| f0bf048d#1 | 9 | 88% | 0,60 | 0,56 | 2,0 | 3/4 |
| **Trung bình (lần 1 mỗi phiên)** | | **92%** | **0,63** | **0,62** | **6,4** | **21/30** |

- **Độ lệch giữa hai lần chạy** (`2dfb5915`, #1 → #2): +17 chuyện, +0,09 USD, recall như nhau, p@5 −0,20, hạng `t` +2,7; 75% nhãn có cùng trạng thái tìm thấy, 75% nhãn `t` có cùng trạng thái nửa trên.
- **Chạy lại tất định:** cả 9 lần chạy lại ra đúng danh sách của lần chụp.
- DM.5 (mọi nhãn `t` ở nửa trên) chỉ đạt ở 3/8 phiên.

## 7. Đề xuất cho Q.4

Theo thứ tự đáng thử, mỗi đòn đo bằng bộ đo trên chính các lần chụp này (chụp lại phần bước bị đổi, giữ nguyên phần còn lại):

1. **Outsider rẻ hơn (tiết kiệm lớn nhất, ~50–60%).** Ba cách, thử theo thứ tự:
   - Chạy outsider bằng haiku: theo giá mỗi token đo được, bước này từ ~0,51 xuống ~0,13 USD mỗi phiên, tức tổng từ ~0,83 xuống ~0,45 USD. Rủi ro: góc người ngoài kém hơn; đo bằng số nhãn `t` có `hit_by: outsider` và hạng `t`.
   - Gộp outsider vào lời gọi harvest (cùng input, thêm một phần đầu ra): bỏ hẳn ~140k token vào thứ hai, tiết kiệm ~0,5 USD mỗi phiên, nhưng harvest dài và chậm hơn.
   - Outsider chỉ đọc quanh điểm nóng và chuyện đã chọn thay vì nguyên cửa sổ: giảm token vào tỉ lệ với phần cắt bỏ.
2. **Bỏ phí ghi cache thừa.** 91% token vào bị tính giá ghi cache 1 giờ mà không được đọc lại. Kiểm xem `claude -p` có cho tắt cache hoặc dùng TTL 5 phút không; nếu outsider chuyển sang haiku, đặt transcript ở đầu prompt của cả hai bước để outsider đọc từ cache của harvest (giá đọc cache thấp hơn nhiều so với ghi).
3. **Kiểm soát phần nghĩ của harvest.** Không giảm nhiều tiền (harvest 20%) nhưng quyết định thời gian (67% giây model) và độ lệch giữa hai lần chạy (14 so với 31 chuyện). Thử giới hạn thinking token cho harvest, đo recall và độ lệch.
4. **Sửa ước tính của `dry-run`:** nhân `approxTokens` với ~1,66 và dùng giá mỗi token đo được, để ước tính khớp thật trong khoảng ±20%. Việc nhỏ, giúp ngân sách ngày (`budget.dailyUsd`) chặn đúng.
5. **Gộp hook-tension và stakes:** tối đa ~5% (một prompt nhỏ ~7k token), làm sau cùng.
6. **Không làm Q.6 vì chi phí:** cluster tốn 0 USD ở cấu hình mặc định; e5 chỉ còn lý do chất lượng gộp chuyện, không phải tiền.

## 8. Giới hạn

- Một lần chụp mỗi phiên (trừ `2dfb5915`), một máy, một ngày; giá của `total_cost_usd` theo `costBasis: list` của Claude Code.
- Nhãn là bản nháp của agent, chưa duyệt; khớp chuyện với nhãn bằng từ khoá nên có thể khớp lỏng (recall cao) hoặc trượt khi tiêu đề máy dùng chữ khác.
- Không có phiên Codex.
