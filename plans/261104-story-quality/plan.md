---
title: "Chất lượng chọn chuyện và chi phí mỗi phiên (E17)"
description: "Bộ test gán nhãn, harness chạy lại, đo chi phí từng bước, chỉnh xếp hạng, thí nghiệm e5."
status: in-progress
priority: P1
branch: website-v2
tags: [quality, cost]
blockedBy: []
blocks: [261104-rust-port]
created: 2026-11-04
---

# Chất lượng chọn chuyện và chi phí mỗi phiên (E17)

Mã S0.x, S1.x, S2.x là bước trong [sales plan](../261104-sales/plan.md); Q.x, R.x, U.x là bước của các plan [story-quality](../261104-story-quality/plan.md), [rust-port](../261104-rust-port/plan.md), [ui-ux](../261104-ui-ux/plan.md). Board: [board.md](../board.md).

**Số đo trên nhãn đã duyệt (2026-11-05):** mặc định mới 0,26 USD/phiên, recall 96%, p@5 0,88, `t` nửa trên 25/33, DM.5 đạt 3/8 phiên ([bản ghi](../../docs/experiments/2026-11-05-cost-cuts/README.md#chấm-lại-trên-nhãn-đã-duyệt-2026-11-05-tối)). Phiên yếu nhất: `2dfb5915` (harvest không ổn định, 3/6 `t`), `c4caee3c` (p@5 0,4).

**Quyết định 2026-11-05:** chất lượng được nâng bằng dữ liệu của chính đội (bộ test tự gán nhãn, số đo trên máy của đội). Không dùng dữ liệu người dùng; nhãn chia sẻ là plan riêng [shared-labels](../261105-shared-labels/plan.md) (E19), backlog.

## Mục tiêu

Người mua trả tiền cho danh sách chuyện xếp hạng. Plan này làm cho danh sách đó **đáng tin và rẻ**, có số đo chứng minh:
- **Chất lượng:** chuyện người dùng coi là đáng kể nằm ở nửa trên danh sách (DM.5: 8/8), trên nhiều phiên, nhiều domain, nhiều host, không chỉ một phiên mẫu.
- **Chi phí:** giảm USD mỗi phiên (hiện ~1 USD) mà không tụt chất lượng.
- **Lưới đỡ:** một bộ test chạy lại bằng một lệnh, không tốn tiền model, để mọi thay đổi sau (chỉnh xếp hạng, port Rust, model nhúng) đều đo được là tốt lên hay tệ đi.

Lý do: người mua trả tiền cho danh sách chuyện xếp hạng; chuyện hay bị chôn thì mất khách, chi phí ~1 USD/phiên thì mất khách. Hiện chỉ có 1 phiên gán nhãn (`95ca719b`, 7 đáp án, 8 nhãn `t`) và DM.5 chưa đạt (7/8). Chồng với E4 (DM.8–DM.10): bộ test ở đây là chỗ chạy DM.9 và DM.10.

| ID | Việc | Ai | Trạng thái |
|---|---|---|---|
| Q.1 | Bộ test chất lượng: 5–10 phiên gán nhãn, nhiều domain và host (ít nhất 2 Codex, 1 phiên tiếng Anh), mỗi phiên có đáp án "chuyện đáng kể" và nhãn `t`. Nhãn nằm trong `docs/_private/` | Anh gán nhãn; agent chọn phiên và soạn file nhãn nháp | ✅ 2026-11-05: 8 phiên anh đã duyệt (7 Claude, 1 omp tiếng Anh), 79 đáp án, 33 `t`, trong `docs/_private/eval/labels/`; duyệt bằng `scripts/eval/review.mjs`. Còn thiếu: ≥2 phiên Codex (máy chưa có) |
| Q.2 | Harness đo: lưu đầu ra model bằng `--save-llm`, chạy lại bằng `--fake-llm` để đổi thuật toán xếp hạng mà không tốn tiền. Chỉ số: recall đáp án, precision@5/@10, hạng trung bình của nhãn `t`, độ lệch giữa 2 lần chạy, USD và giây mỗi phiên | Agent | ✅ 2026-11-05: `scripts/eval/` ([README](../../scripts/eval/README.md)) |
| Q.3 | Đo chi phí từng bước (harvest, cluster, outsider, hook-tension, stakes) từ `stats`; ghi bảng vào `docs/experiments/`. Ước đoán: outsider (sonnet đọc nguyên khúc ~150k token) và harvest chiếm phần lớn | Agent | ✅ 2026-11-05: outsider 69%, harvest 20%, chấm 10%, cluster 0%; 0,83 USD/phiên ([bản ghi](../../docs/experiments/2026-11-05-step-cost/README.md)) |
| Q.4 | Thử các đòn giảm chi phí trên bộ test, giữ đòn nào không làm tụt chỉ số: outsider chạy haiku hoặc chỉ đọc quanh điểm nóng; rút gọn input mạnh hơn (`reduce`); bỏ phiên ngắn; gộp stakes và hook-tension làm một lần gọi. Thay S2.3 | Agent | ✅ 2026-11-05: 0,83 → 0,26 USD/phiên (outsider haiku, tắt cache prompt, ước tính dry-run mới); cùng xếp hạng mới: recall 94%, p@5 0,83, p@10 0,69, hạng-t 5,16, `t` nửa trên 25/30 ([bản ghi](../../docs/experiments/2026-11-05-cost-cuts/README.md)) |
| Q.5 | Chỉnh xếp hạng: trọng số tension, stakes, hits, outsider; sửa ca dòng 18 (tension `none`, stakes 2 bị hạng 26). Mục tiêu DM.5: 8/8 nhãn `t` nửa trên | Agent | ✅ 2026-11-05: `t` nửa trên 21/30 → 23/30; DM.5 3/8 phiên, trần 5/8 vì recall ([bản ghi](../../docs/experiments/2026-11-05-ranking/README.md)) |
| Q.6 | Thí nghiệm e5 (`Xenova/multilingual-e5-small` của `vantt/obsidian-hybrid-search`): thay LLM ở bước cluster và gộp vào chuyện cũ bằng độ tương đồng embedding, LLM chỉ xử ca lưng chừng. Đo trên bộ test: chất lượng gộp, USD tiết kiệm, thời gian | Agent | ⏸️ không làm vì chi phí: Q.3 đo cluster tốn 0 USD |
| Q.7 | Quyết đưa e5 vào bản bán hay không, dựa trên Q.3 và Q.6 | Anh | ⬜ |

**Đánh giá ban đầu về e5 (2026-11-04), chờ Q.3 và Q.6 xác nhận:**
- **Rẻ được ít.** e5 chỉ thay được bước cluster và gộp, vốn có input nhỏ (tiêu đề và tóm tắt). Phần đắt là đọc nguyên transcript (harvest, outsider), và embedding không làm được việc hiểu "chuyện nào đáng kể". Nên Q.4 nhiều khả năng tiết kiệm hơn e5.
- **Giá phải trả cho đóng gói.** Bản Node hiện không có dependency; e5 trên Node cần `@huggingface/transformers` và `onnxruntime-node` (native, mỗi OS và CPU một bản), thêm một chỗ có thể hỏng trên Windows. Với Rust (E18) thì hết vấn đề này: Rust tự nhúng model và chạy bên trong binary, không cần runtime ngoài. Cách làm: `candle` (thuần Rust, có sẵn kiến trúc BERT mà e5-small dùng) cùng crate `tokenizers`, và nhúng trọng số bằng `include_bytes!`. Phương án khác là `ort` link tĩnh onnxruntime. Phải chọn: nhúng sẵn thì binary nặng thêm ~117 MB (bản ONNX lượng tử hoá đang tải), không nhúng thì tải lần đầu và lưu cache. Điều kiện: chỉ đáng làm nếu có model đủ nhỏ để nhúng (ngưỡng ở R.7).
- **Chỗ e5 có ích thật:** gộp chuyện trùng giữa các phiên khi hộp lớn (E7 multi-repo, E15 hosted), tìm chuyện liên quan để nối thread (E6). Khi đó có thể tải model theo yêu cầu thay vì đóng sẵn.
- **Đề xuất:** chưa đưa vào bản bán đầu tiên; làm Q.3 trước, Q.6 chỉ đáng làm nếu cluster chiếm phần chi phí đáng kể. Nếu E18 chạy, làm Q.6 thẳng trên bản Rust, không làm trên Node.

**Xong E17 khi:** bộ test chạy lại được bằng một lệnh, DM.5 đạt trên phiên gốc và không tụt trên các phiên khác, chi phí mỗi phiên giảm có số đo.
