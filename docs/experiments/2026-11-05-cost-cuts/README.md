# Giảm chi phí mỗi phiên (2026-11-05)

**Mục đích:** giảm USD mỗi phiên mà không làm tệ chất lượng xếp hạng, theo các đòn đề xuất ở [chi phí từng bước](../2026-11-05-step-cost/README.md) (Q.4 trong [plan story-quality](../../../plans/261104-story-quality/plan.md)). Mỗi đòn đo bằng [bộ đo](../../../scripts/eval/README.md) trên lần chụp thật.

**Dữ liệu thô** (đầu ra model, hộp nháp) nằm trong `docs/_private/eval/<biến thể>/`, không commit. Bản ghi này chỉ có số.

## Kết quả

| | Mốc (cấu hình cũ) | Mặc định mới | Đổi |
|---|---|---|---|
| USD mỗi phiên | 0,826 | **0,258** | −69% |
| Giây mỗi phiên (thật) | 170 | 171 | như cũ |
| Recall | 92% | 94% | +2 điểm |
| p@5 | 0,63 | 0,83 | +0,20 |
| p@10 | 0,62 | 0,66 | +0,04 |
| Hạng `t` trung bình | 6,41 | 5,45 | tốt hơn 0,96 |
| `t` ở nửa trên | 21/30 | 25/30 | +4 |

Giữ hai đổi, thành mặc định: **người ngoài chạy `haiku`** (`outsider.model`) và **tắt cache prompt** (`llm.promptCache: off`). Sửa ước tính của `dry-run`. Không giữ đổi nào cho phần nghĩ của harvest: không có nút nào giới hạn được nó mà giữ được recall.

Đã tiêu 9,17 USD cho cả việc này (mức trần 10 USD).

## 1. Thiết lập

- **Mã:** nhánh của agent trên `main` `4630821`. Claude Code 2.1.318; model `claude-haiku-5-5`, `claude-sonnet-5-5`; giá theo `total_cost_usd` (`costBasis: list`).
- **Phiên, cửa sổ, nhãn:** đúng 8 phiên và nhãn nháp của [mốc](../2026-11-05-step-cost/README.md#1-thiết-lập) (60 đáp án, 30 nhãn `t`, chưa duyệt). Mốc là 9 lần chụp ở đó.
- **Ngưỡng giữ một đổi** (đặt trước khi đo): recall trung bình không giảm; `t` ở nửa trên không giảm quá 1/30; p@5, p@10 không giảm quá 0,05; hạng `t` trung bình không tăng quá 1. Nhãn còn là nháp, nên chênh nhỏ hơn độ lệch giữa hai lần chạy (mục 4) không được coi là thật.
- **Chụp lại phần bước bị đổi:** với biến thể chỉ đổi người ngoài, lời gọi harvest dùng lại đúng đầu ra của lần chụp 1 ở mốc (cùng model, cùng prompt, so bằng sha256), các bước sau gọi model thật. Nhờ vậy độ lệch của harvest không lẫn vào so sánh. Biến thể đổi harvest hay đổi cả cấu hình thì chụp mới hoàn toàn.
- Thời gian là thời gian thật của một phiên, chạy 4 phiên song song.

## 2. Biến thể

| Biến thể | Phiên | Harvest | USD/phiên | Giây/phiên | Phần USD harvest / người ngoài / hook-tension / stakes | Recall | p@5 | p@10 | Hạng `t` | `t` nửa trên | Quyết định |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Mốc: người ngoài `sonnet`, cache 1 giờ | 8 (9 lần) | mới | 0,826 | 170 | 20 / 69 / 6 / 4% | 92% | 0,63 | 0,62 | 6,41 | 21/30 | |
| 1a. người ngoài `haiku`, cả cửa sổ, tắt cache | 8 | dùng lại | 0,065 cho bước người ngoài (mốc 0,571) | | | 92% | 0,70 | 0,61 | 5,03 | 25/30 | **giữ** |
| 1b. người ngoài `sonnet`, chỉ quanh điểm nóng và chuyện đã nhặt, tắt cache | 3 | dùng lại | 0,222 cho bước người ngoài | | | 83% (mốc cùng 3 phiên 92%) | 0,73 (0,67) | 0,67 (0,69) | 3,97 (5,9) | 10/12 (8/12) | bỏ |
| 3a. `MAX_THINKING_TOKENS=4000` | 8 | mới | 0,257 | 173 | 43 / 28 / 17 / 12% | 92% | 0,67 | 0,61 | 6,72 | 25/30 | bỏ (biến không có tác dụng) |
| 3b. `MAX_THINKING_TOKENS=0` | 3 | mới | 0,293 | 174 | 47 / 27 / 16 / 11% | 87% (mốc cùng 3 phiên 82%) | 0,33 (0,47) | 0,47 (0,47) | 10,75 (8,1) | 10/12 (6/12) | bỏ (biến không có tác dụng) |
| 3c. `--effort low` cho harvest | 8 | mới | 0,207 | 104 | 40 / 31 / 17 / 12% | **72%** | 0,72 | 0,59 | 4,67 | 24/30 | bỏ (recall −20 điểm) |
| **Mặc định mới** (1a + 2) | 8 | mới | **0,258** | 171 | 46 / 25 / 17 / 12% | 94% | 0,83 | 0,66 | 5,45 | 25/30 | |

Biến thể 3a, 3b, 3c chạy trên nền 1a + 2 (người ngoài `haiku`, tắt cache).

### Mặc định mới theo phiên

| Phiên | Chuyện | Recall | p@5 | p@10 | Hạng `t` | `t` nửa trên | USD | Giây | Mốc USD |
|---|---|---|---|---|---|---|---|---|---|
| 0faf0bb2 | 31 | 100% | 1,00 | 0,70 | 3,0 | 4/4 | 0,376 | 209 | 1,123 |
| 2dfb5915 | 10 | 63% | 0,80 | 0,60 | 6,0 | 1/4 | 0,201 | 56 | 0,825 |
| 6a207191 | 19 | 100% | 0,80 | 0,70 | 8,0 | 4/5 | 0,101 | 170 | 0,502 |
| 9514b261 | 18 | 86% | 0,80 | 0,70 | 3,5 | 4/4 | 0,231 | 138 | 0,695 |
| ab9a1dd8 | 27 | 100% | 0,80 | 0,90 | 6,3 | 3/3 | 0,108 | 147 | 0,530 |
| c4caee3c | 34 | 100% | 0,40 | 0,30 | 7,0 | 4/4 | 0,374 | 225 | 1,101 |
| cd4449ab | 31 | 100% | 1,00 | 0,70 | 1,5 | 2/2 | 0,361 | 245 | 0,959 |
| f0bf048d | 28 | 100% | 1,00 | 0,70 | 8,3 | 3/4 | 0,308 | 178 | 0,786 |

`2dfb5915` lần này harvest không nghĩ (10 chuyện, 23 giây), nên recall thấp; xem độ lệch ở mục 4.

## 3. Từng đòn

### 1. Người ngoài rẻ hơn

- **1a (`haiku`, cả cửa sổ):** bước người ngoài từ 0,571 xuống 0,065 USD mỗi phiên (−89%). Theo phiên: 0,011 với prompt dưới 100k token (`6a207191`, `ab9a1dd8`), 0,066–0,101 với prompt trên 100k. Chất lượng không giảm theo mọi ngưỡng; `t` ở nửa trên tăng 21 → 25/30. Một phiên giảm recall (`f0bf048d` 88% → 63%), các phiên khác bằng hoặc tăng.
- **1b (`sonnet`, chỉ quanh điểm nóng và dòng của chuyện đã nhặt, 8 entry mỗi bên):** đầu vào chỉ còn 54–98% cửa sổ (trung bình 75%; 8 entry mỗi bên đã phủ gần hết vì chuyện và điểm nóng dày); 3 entry mỗi bên vẫn còn 32–87%. Trên 3 phiên thử: recall giảm 92% → 83% (`f0bf048d` 88% → 63%), đắt gấp 3,4 lần 1a. Bỏ sau khi thử 3 phiên. Ý tưởng cũng ngược với việc của bước người ngoài: tìm chỗ trơn tru mà không ai để ý, thường không nằm quanh điểm nóng.

### 2. Bỏ phí ghi cache thừa

- `claude -p` mặc định ghi cache 1 giờ (với gói thuê bao); không lời gọi nào đọc lại. Đo một prompt ~20k token: ghi cache 1 giờ tính gấp 2 giá input, cache 5 phút gấp 1,25, `DISABLE_PROMPT_CACHING=1` gấp 1.
- Sau khi tắt (`llm.promptCache: off`, mặc định): ở mọi lời gọi thật của các biến thể, `cache_creation_input_tokens` = 0 và `cache_read_input_tokens` = 0; toàn bộ prompt tính là `input_tokens`. Hook-tension từ 0,049 xuống 0,045 USD mỗi phiên, stakes 0,037 xuống 0,030 (phần còn lại do output thay đổi).
- Đánh đổi: lời gọi lại (`-retry`, ~1/10 lời gọi người ngoài) không còn đọc được prompt từ cache. Ở mốc, một lần gọi lại sonnet tốn 0,05 thay vì 0,68 USD; với `haiku` không cache, một lần gọi lại tốn 0,076 USD. Kỳ vọng mỗi lời gọi: không cache 1 + 0,1 × 1 = 1,1 lần giá input, cache 5 phút 1,25 + 0,1 × 0,1 = 1,26 lần.
- **Dùng chung cache giữa harvest và người ngoài: không làm được qua `claude -p`.** Hai prompt vốn đã có chung phần đầu (cùng câu mở và transcript). Thử gửi tin nhắn thành hai khối (transcript, rồi yêu cầu riêng) bằng `--input-format stream-json`, cache 5 phút: lần gọi thứ hai vẫn ghi lại toàn bộ (18 687 token ghi, chỉ 2 864 token prompt hệ thống được đọc). Cache chỉ trúng ở cuối tin nhắn.

### 3. Phần nghĩ của harvest

`claude-haiku-5-5` tự quyết có nghĩ hay không. Thử trên prompt harvest thật của `2dfb5915` L1–L2400 (~89k token), mỗi dòng một lần chạy:

| Cài đặt | Token nghĩ | Chuyện | Giây |
|---|---|---|---|
| mặc định (5 lần) | 0, 0, 3 324, 6 635, 13 672 | 11, ?, 14, 25, 27 | 24–111 |
| `MAX_THINKING_TOKENS=0` (4 lần) | 0, 10 652, 13 570, 18 119 | 9, 18, 27, 33 | 22–128 |
| `MAX_THINKING_TOKENS=4000` (1 lần) | 7 812 | 22 | 80 |
| `--thinking disabled` (3 lần) | 0, 10 276, 12 205 | 13, 25, 20 | 27–96 |
| `--effort medium` (3 lần) | 3 870, 7 071, 10 190 | 16, 32, 23 | 56–97 |
| `--effort low` (4 lần) | 0, 0, 0, 0 | 11, 12, 8, 6 | 19–33 |

(`?`: đầu ra không phải JSON.)

- `MAX_THINKING_TOKENS` và `--thinking disabled` không có tác dụng với model này (Claude Code có thông báo "Thinking can't be turned off" cho một số model). Trên 8 phiên với `MAX_THINKING_TOKENS=4000`, token nghĩ của harvest là 0–41 022, giây 30–231: không giới hạn được, không ổn định hơn.
- `--effort low` là nút duy nhất tắt được phần nghĩ: harvest nhanh hơn ~2 lần, rẻ hơn 24%, nhưng ít chuyện hơn và **recall giảm 92% → 72%** trên 8 phiên. Bỏ.
- `--effort medium` vẫn nghĩ 3,9k–10,2k token và 16–32 chuyện: không ổn định hơn mặc định. Bỏ sau khi thử 3 lần, không chạy 8 phiên.
- Không giữ khoá cấu hình nào cho phần này.

### 4. Ước tính của `dry-run`

Ước tính cũ giả định giá cố định (harvest 1 USD/M token, người ngoài 3 USD/M) trên `approxTokens`, thấp khoảng 1,5 lần. Ước tính mới (`estimateUsd` trong `lib/pipeline.mjs`, giá ở `PRICES` trong `lib/llm.mjs`) tính từng lời gọi theo từng khúc:

- token thật = `approxTokens` × 1,64 + 3 500 (prompt hệ thống và khuôn); output harvest = 0,2 × token vào; người ngoài 3k output; chấm 2 lời gọi (7,5k vào; 2,5k và 1,5k ra); gộp cụm một lời gọi khi có hơn một khúc hoặc một lần chạy.
- Giá đo được (USD/M token, vào / ra): `haiku` 0,1 / 0,5 khi prompt ≤ 100k token, gấp 5 (0,5 / 2,5) khi prompt vượt 100k (bước nhảy nằm giữa 97 690 và 101 844 token); `sonnet` 2 / 10 (không thấy bậc tới 188k); `opus` 4 / 20; ghi cache 1 giờ gấp 2, 5 phút gấp 1,25.

| Cấu hình | Lần chụp | Thật / ước, trung bình | Thấp nhất | Cao nhất |
|---|---|---|---|---|
| cũ (người ngoài `sonnet`, cache 1 giờ), ước tính cũ | 9 | 1,50 | 1,17 | 1,81 |
| cũ, ước tính mới | 9 | 0,95 | 0,85 | 1,05 |
| mặc định mới, ước tính mới | 8 | 1,02 | 0,65 | 1,16 |

Ca 0,65 là lần harvest không nghĩ. Số đo đi vào `test/estimate.test.mjs`. Hệ số 2 của `--budget` trong `scripts/eval/run.mjs` (ngoài phạm vi việc này) giờ có thể hạ về khoảng 1,3.

## 4. Độ lệch giữa các lần chạy

Harvest vẫn lệch giữa các lần chạy vì model tự quyết có nghĩ hay không. Cùng cửa sổ, cùng prompt harvest, cấu hình người ngoài `haiku` và tắt cache (3a và 3b đặt `MAX_THINKING_TOKENS` nhưng biến này không có tác dụng):

| Phiên | Lần | Token nghĩ | Giây harvest | Chuyện | Recall | `t` nửa trên |
|---|---|---|---|---|---|---|
| 2dfb5915 | mặc định mới | 0 | 23 | 10 | 63% | 1/4 |
| | 3a | 19 313 | 123 | 33 | 100% | 3/4 |
| | 3b | 20 393 | 136 | 31 | 100% | 2/4 |
| 9514b261 | mặc định mới | 12 680 | 86 | 18 | 86% | 4/4 |
| | 3a | 13 730 | 107 | 24 | 86% | 4/4 |
| | 3b | 17 318 | 111 | 21 | 86% | 4/4 |
| c4caee3c | mặc định mới | 27 859 | 169 | 34 | 100% | 4/4 |
| | 3a | 0 | 30 | 18 | 75% | 4/4 |
| | 3b | 13 728 | 112 | 27 | 75% | 4/4 |

Mốc có cùng hiện tượng (`2dfb5915` #1 không nghĩ 14 chuyện, #2 nghĩ 31 chuyện). Lần harvest không nghĩ ra ít chuyện hơn và có thể mất đáp án; đây là phần lệch lớn nhất còn lại.

## 5. Điều đáng làm tiếp

1. **Giá `haiku` gấp 5 khi prompt vượt 100k token.** Harvest và người ngoài của phiên dưới ~58k `approxTokens` rẻ hơn 5 lần (vd. `ab9a1dd8`: harvest 0,019 USD so với 0,10–0,20 ở phiên trên 100k). Hạ `harvest.maxInputTokens` về ~55000 sẽ đưa mọi lời gọi xuống dưới bậc, nhưng chia phiên thành nhiều khúc: thêm lời gọi gộp cụm bằng `sonnet` và có thể đổi chất lượng. Chưa đo.
2. **Chấm (hook-tension + stakes) giờ là 29% USD** (0,075 USD mỗi phiên, `sonnet`). Gộp hai lời gọi, hoặc thử `haiku`, là đòn tiếp theo.
3. **Độ lệch của harvest** (mục 4): hai lần harvest rồi gộp, hoặc nhắc trong prompt, thay cho nút cấu hình không có tác dụng.

## 6. Giới hạn

- Một lần chụp mỗi biến thể mỗi phiên; chênh chất lượng nhỏ nằm trong độ lệch giữa các lần chạy (mục 4). Nhãn là bản nháp, khớp bằng từ khoá.
- 1a và 1b dùng lại harvest của mốc, nên USD cả phiên của hai biến thể này không so được trực tiếp; chỉ so bước người ngoài.
- Bậc giá 100k của `haiku` và giá `opus` đo bằng vài lời gọi thử, không phải bảng giá công bố.
- Một máy, một ngày, gói thuê bao (cache mặc định 1 giờ); với API key Claude Code mặc định cache 5 phút, nên phần tiết kiệm của việc tắt cache nhỏ hơn.
