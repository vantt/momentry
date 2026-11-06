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
| T.4 | **Học gu.** Mô hình nhỏ, giải thích được: trọng số trên từng đặc trưng (hồi quy logistic có tiên nghiệm là khoá xếp hạng mặc định), cộng thêm vào điểm xếp hạng. Bật sau khi đủ phán quyết (gợi ý: ≥ 20, có ≥ 5 dùng và ≥ 5 bỏ). Giữ một chỗ khám phá trong top 5. Tự quay về mặc định nếu thua trên phán quyết để dành. 0 USD, không gọi model | Agent | ⬜ |
| T.5 | **Đo trước khi bật.** Chạy T.4 trên bộ đề E17 bằng cách coi nhãn `t` là "dùng": học trên 7 phiên, chấm phiên còn lại, xoay vòng cả 8. So với mặc định: `t` nửa trên (hiện 25/33), p@5 (hiện 0,88). Rồi anh dùng thật 2 tuần, xem tỉ lệ dùng top 5 | Agent; anh dùng thật | ⬜ |
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
2. Có chừa chỗ khám phá trong top 5 không? Đề xuất: có, một chỗ.
