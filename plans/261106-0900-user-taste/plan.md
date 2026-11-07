---
title: "Đề xuất chuyện hợp gu người dùng (E21)"
description: "Ghi phán quyết ngầm của người dùng, đo trên máy, học gu minh bạch để đầu bảng là chuyện họ sẽ chọn."
status: pending
priority: P1
branch: ""
tags: [quality, ranking, personalization]
blockedBy: []
blocks: []
created: 2026-11-06
---

# Đề xuất chuyện hợp gu người dùng (E21)

Board: [board.md](../board.md). Xếp hạng mặc định và bộ đề của đội nằm ở [story-quality](../261104-story-quality/plan.md) (E17). Plan này lo phần **mỗi người dùng một gu**.

## Mục tiêu

Năm chuyện đầu bảng là chuyện chính người dùng đó sẽ chọn dùng. Người dùng không phải soạn bộ đề: mọi phán quyết lấy từ việc họ làm hằng ngày.

**Thước đo chính:** tỉ lệ dùng của top 5 (trong các chuyện top 5 đã được quyết, bao nhiêu chuyện được Use, viết nháp hay đăng). `lib/metrics.mjs` đã đếm số này, nhưng chưa hiện ra và chưa dùng để xếp hạng.

## Ràng buộc

- **Mọi thứ nằm trên máy người dùng.** Không gửi gì đi. Khớp quyết định ngày 2026-11-05: đội không dùng dữ liệu người dùng; nhãn chia sẻ là E19, vẫn backlog.
- File gu chỉ chứa đặc trưng (tension, stakes, signals, độ đầy đủ…), không chứa tiêu đề hay nội dung chuyện.
- **Không giấu chuyện.** Gu chỉ đổi thứ tự, không lọc. Chừa một chỗ trong top 5 cho chuyện xếp theo mặc định, để gu không tự khoá mình trong một kiểu chuyện.
- **Minh bạch:** mỗi chuyện nói được vì sao lên đầu ("bạn hay dùng chuyện số trước/số sau"). Có công tắc tắt (`rank.personal`).
- **Không tệ hơn mặc định:** nếu gu học được xếp tệ hơn mặc định trên phán quyết cũ của chính người dùng thì tự quay về mặc định.

## Ngoài phạm vi

Gửi nhãn về máy chủ (E19). Đo thời gian đọc hay theo dõi hành vi ngoài các nút đã có. Học gu bằng model nặng hay embedding.

## Việc

| ID | Việc | Ai | Trạng thái |
|---|---|---|---|
| T.0 | **Luật chọn thành bảng, tra lúc chạy.** Một file luật trong source (`rules/rank.json`): danh sách **tầng** (điều kiện xếp nhóm, theo thứ tự) và danh sách **điều chỉnh điểm** (đặc trưng, phép so, giá trị, cộng/trừ), mỗi luật có `id`, lý do, link bằng chứng. Điều kiện chỉ dùng từ vựng đặc trưng cố định (không có biểu thức tự do). Kiểm khuôn lúc nạp; luật sai thì báo lỗi và dùng bảng mặc định. Bảng mặc định cho ra **đúng** thứ tự hiện nay (test so với khoá cũ trên bộ đề và chuyện mẫu). Cùng cách: từ vựng điểm nóng (`rules/hotspots.json`, theo ngôn ngữ) và danh sách tín hiệu/tension dùng chung cho prompt và validate. Người dùng chỉ chỉnh trọng số và bật/tắt luật, chưa thêm điều kiện mới. Cổng chất lượng: đổi luật phải kèm số đo trên bộ đề (`scripts/eval`) không tụt | Agent | ✅ 2026-11-06 (bảng xếp hạng, từ vựng tension/tín hiệu): `rules/rank.json` + `lib/rank.mjs` (kiểm khuôn, bảng có sẵn khi hỏng, `rank.weights.<id>`/`rank.disabled`, `explain` → `list --rank --json` `why`); thứ tự trùng khoá cũ trên 8 chuyện mẫu và 3000 bộ ngẫu nhiên, bộ đo chạy lại 8 phiên ra kết quả giống hệt; `rules/story-vocab.json` điền `{tensions}` `{signals}` vào prompt, đúng từng byte. Điểm nóng: `rules/hotspots.json` (vi/en, kiểm lúc nạp, bảng mặc định `lib/hotspots-default.mjs` khi hỏng), điểm nóng trùng bản cũ trên fixture và 8 phiên bộ đề. |
| T.1 | **Ghi phán quyết đủ.** Lúc người dùng quyết, chụp đặc trưng của chuyện vào `<cache>/taste.json`: Use, Later, Drop (đã có hạng), chuyển sang drafted và published (dương tính mạnh), sửa tiêu đề hay góc kể (model hiểu sai), nút "kể được / không ra chuyện / bịa / hiểu được" đưa vào web UI chính, quick note (chuyện momentry bỏ sót). Đặc trưng: tension, stakes, strength, hits, signals, outsider, completeness, có góc kể, audience (nhóm thô), host, độ dài phiên | Agent | ✅ 2026-11-06: `lib/taste.mjs` ghi `<cache>/taste.json` (bản 1, 0600, tối đa 2000 sự kiện, ghi lỗi không chặn việc người dùng làm); sự kiện use/later/drop/open, drafted/published, edit (tiêu đề, phần thân), verdict và understood (nút kiểm góc kể trên trang chuyện của web UI), missed (quick note, `add --by human`, thả từ quarantine). Đặc trưng lấy từ `FEATURES` của `lib/rank.mjs`, chữ lạ thành `other`, kèm tầng xếp hạng; test cho chuyện chứa từ lạ rồi tìm trong file: không lọt chữ nào (`test/taste.test.mjs`). Chưa ghi: audience, độ dài phiên (audience là chữ tự do; độ dài phiên không có trong frontmatter); hook và góc kể chưa có chỗ sửa trên giao diện nên chưa có `edit` cho hai trường này. PRD 6.8 |
| T.2 | **Cho người dùng thấy.** Trang Health có một dòng "top 5 bạn dùng X/Y" và "chuyện bạn dùng nằm hạng trung bình N". `momentry taste` in cùng số, cùng các đặc trưng bạn hay chọn hay bỏ | Agent | ✅ 2026-11-06: khung "Your picks" trên Health (từ 10 quyết định top 5, dưới đó nói còn thiếu bao nhiêu); `momentry taste` (`--repo`, `--json`) in hai số, bảng giằng xé và tín hiệu dùng / bỏ, stakes trung bình, số chuyện bỏ sót, số lần sửa; test ngưỡng, loại riêng tư, đầu ra chữ và JSON |
| T.3 | **Gu khởi đầu (chưa có phán quyết nào).** Lúc setup, cho người dùng chọn 3 trong 8 chuyện mẫu mà họ muốn đọc (`docs/sample/`), cộng một ô chữ tuỳ chọn "bạn thích kể chuyện kiểu gì". Đây là gu ban đầu, nhẹ dần khi có phán quyết thật | Agent | ⬜ |
| T.4 | **Học gu.** Mô hình nhỏ, giải thích được: trọng số trên từng đặc trưng (hồi quy logistic có tiên nghiệm là khoá xếp hạng mặc định), cộng thêm vào điểm xếp hạng. Bật sau khi đủ phán quyết (gợi ý: ≥ 20, có ≥ 5 dùng và ≥ 5 bỏ). Giữ một chỗ khám phá trong top 5. Tự quay về mặc định nếu thua trên phán quyết để dành. 0 USD, không gọi model | Agent | ✅ 2026-11-07: `lib/taste-rank.mjs`. Hồi quy logistic, thứ tự mặc định là phần bù cố định (−ln hạng), tiên nghiệm L2 kéo trọng số về 0 (λ 1); đặc trưng: tension, tín hiệu, outsider_only, có góc kể, stakes/strength/hits/completeness chuẩn hoá, thiếu thì trung tính. Phán quyết: quyết định cuối của mỗi chuyện, use/drafted/published là dùng, drop là bỏ, later/open và sự kiện khác không học; học trên mọi dự án, kể cả riêng tư (không rời máy). Bật từ 20 phán quyết có 5 dùng và 5 bỏ; giữ lại 20% dùng và 20% bỏ mới nhất, gu xếp cặp kém hơn mặc định thì về mặc định. Chỗ khám phá: hạng 5 là chuyện đầu bảng mặc định chưa nằm trong top 4 của gu. Áp vào `list --rank` (`why.taste` có dòng lý do) và tường chuyện web (thẻ "Your kind" kèm lý do; bỏ cách đẩy theo Use/Drop cũ không có kiểm); bước góc kể và pipeline giữ thứ tự mặc định (chọn chuyện để tốn tiền model và để bộ đo tái lập). Sự kiện ghi thêm `base` (hạng mặc định), để gu không học trên thứ tự do chính nó xếp. `momentry taste` nói đang bật hay không, thiếu gì, kết quả kiểm và trọng số lớn nhất. Công tắc `rank.personal` (chỉ cấu hình người dùng) **mặc định tắt** vì T.5 chưa đạt; tắt thì đúng thứ tự mặc định. Test: `test/taste-rank.test.mjs` |
| T.5 | **Đo trước khi bật.** Chạy T.4 trên bộ đề E17 bằng cách coi nhãn `t` là "dùng": học trên 7 phiên, chấm phiên còn lại, xoay vòng cả 8. So với mặc định: `t` nửa trên (hiện 25/33), p@5 (hiện 0,88). Rồi anh dùng thật 2 tuần, xem tỉ lệ dùng top 5 | Agent; anh dùng thật | 🟡 2026-11-07, phần bộ đề: **chưa đạt** ([số đo](../../docs/experiments/2026-11-07-taste-learning/README.md), `scripts/eval/taste-loso.mjs`). Chạy lại ra đúng mốc (25/33, p@5 0,88). Xoay 8 phiên: `t` nửa trên 25/33 → 25/33, p@5 0,88 → 0,88, hạng `t` 4,95 → 4,92; không phiên nào tụt, nhưng tổng không tăng. 6/8 lượt tự quay về mặc định. Bỏ chỗ khám phá thì 27/33 nhưng p@5 0,85; bỏ bước kiểm thì một phiên mất 4 chuyện `t`. Bản chụp chưa có bước góc kể nên `completeness`, `has_angle` thiếu ở cả 198 chuyện. Vì vậy `rank.personal` mặc định tắt. Anh quyết 2026-11-07: giữ cả chỗ khám phá và bước tự quay về mặc định; anh bật `rank.personal` trên máy mình từ 2026-11-07 để dùng thật 2 tuần (tới 2026-11-21), gu chỉ chạy khi đủ 20 phán quyết |
| T.6 | **Gu bằng lời vào prompt** (có phí, làm sau T.5 nếu cần). Từ phán quyết, viết 2–3 câu "gu của bạn" (người dùng sửa được), đưa vào bước chấm stakes và góc kể để model chấm theo gu, không chỉ xếp lại | Agent | ⬜ |
| T.7 | **Kiểm khi lên bản mới.** Trước khi cập nhật, chạy lại xếp hạng của bản mới trên phán quyết cũ; tụt rõ thì báo | Agent | ⬜ |

## Tiêu chí xong

- T.5 trên bộ đề: gu học được không thua mặc định ở phiên nào quá 1 chuyện `t`, và tổng `t` nửa trên tăng.
- Sau 2 tuần dùng thật: tỉ lệ dùng top 5 cao hơn 2 tuần trước khi bật.
- Mỗi chuyện đầu bảng có một dòng lý do. Tắt `rank.personal` thì về đúng thứ tự mặc định.

## Rủi ro

- **Ít phán quyết:** người dùng mới chỉ có vài chục quyết định, học dễ lệch. Giảm bằng tiên nghiệm mặc định, ngưỡng bật và tự quay về.
- **Gu tự khoá:** chỉ thấy kiểu chuyện đã từng chọn. Giảm bằng chỗ khám phá trong top 5.
- **Bộ đề E17 là gu của anh.** T.5 chỉ chứng minh cơ chế học được một người, chưa chứng minh với người khác.

## Câu hỏi còn mở

1. ~~Gu tính chung cho mọi dự án hay riêng từng dự án?~~ **Anh quyết 2026-11-06: học xuyên mọi dự án của người dùng** (càng dùng càng ra chuyện hay, ở mọi repo). Gu chung là gốc; mỗi dự án chỉ lệch thêm khi đủ phán quyết riêng. `taste.json` đã ở cache chung của máy, mỗi sự kiện có `project`, nên T.4 học trên toàn bộ sự kiện (trừ dự án riêng tư nếu sau này chia sẻ số).
2. ~~Có chừa chỗ khám phá trong top 5 không?~~ **Anh quyết 2026-11-07: giữ** (cùng bước tự quay về mặc định). Trên bộ đề, chỗ này làm `t` nửa trên 27/33 → 25/33 nhưng giữ p@5 0,88 (bỏ thì 0,85).
