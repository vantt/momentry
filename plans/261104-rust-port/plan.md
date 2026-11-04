---
title: "Chuyển momentry sang Rust (E18)"
description: "Port lõi, CLI và tiến trình web sang một binary Rust; giữ định dạng dữ liệu; model nhúng nếu đủ nhỏ."
status: todo
priority: P2
branch: website-v2
tags: [rust, packaging]
blockedBy: [261104-story-quality]
blocks: []
created: 2026-11-04
---

# Chuyển momentry sang Rust (E18)

Mã S0.x, S1.x, S2.x là bước trong [sales plan](../261104-sales/plan.md); Q.x, R.x, U.x là bước của các plan [story-quality](../261104-story-quality/plan.md), [rust-port](../261104-rust-port/plan.md), [ui-ux](../261104-ui-ux/plan.md). Board: [board.md](../board.md).

## Mục tiêu

Đưa momentry thành **một binary Rust duy nhất**, cho đúng những thứ bản Node không làm tốt:
- Không cần cài Node: người không kỹ thuật cài được (A2 trở đi).
- Mã đóng thật: khó đọc, kiểm license chắc hơn.
- Một tiến trình phục vụ cả CLI lẫn giao diện web của E16, giao diện nhúng trong binary.
- Chạy được model embedding nhúng nếu có model đủ nhỏ.

Điều kiện: kết quả trên bộ test của E17 không tụt so với bản Node, và máy đã cài nâng cấp không mất dữ liệu. Thời điểm đề xuất: sau tín hiệu bán đầu tiên.

Lý do: sản phẩm sẽ cần UI (S4.1: moment thành thẻ, bấm ra nháp) cho người không dùng terminal (A2, A3). Rust cho một binary không cần Node, mã khó đọc hơn JS (thay S0.19, kiểm license chắc hơn S1.3), chạy e5 gọn (Q.6), và phục vụ giao diện web của E16 từ cùng một binary.

Quy mô hiện tại: ~6.200 dòng JS trong `lib/` và `bin/` (4 bộ đọc nguồn, pipeline, privacy, hook cho 5 host, install/update/uninstall), ~3.300 dòng test.

| ID | Việc | Ai | Trạng thái |
|---|---|---|---|
| R.1 | Chốt thời điểm (xem đề xuất dưới) | Anh | ⬜ |
| R.2 | Kiến trúc: crate lõi (đọc nguồn, rút gọn, điểm nóng, privacy, hộp, sổ, gọi `claude -p`), crate CLI kiêm tiến trình web phục vụ UI. Giữ định dạng hộp, sổ, config để máy đã cài nâng cấp không mất dữ liệu | Agent | ⬜ |
| R.3 | Hợp đồng: dùng chính test và fixture JS hiện có (`test/fixtures`, `--fake-llm`) làm test hợp đồng; bản Rust phải ra cùng kết quả trên cùng đầu vào trước khi thay bản Node | Agent | ⬜ |
| R.4 | Port theo lớp: đọc nguồn và privacy (lưới tiếng Việt, Telex) → pipeline → hook và install cho 5 host, Windows (Git Bash, PowerShell, `cmd`) → update từ R2 | Agent | ⬜ |
| R.5 | Đóng gói: build chéo Linux, macOS (x64, arm64), Windows; ký binary (gộp E9) | Agent | ⬜ |
| R.7 | Model nhúng: chạy e5 bên trong binary bằng `candle` và `tokenizers` (hoặc `ort` link tĩnh), không cần runtime ngoài. Đo kích thước binary, thời gian nạp model, tốc độ embed trên CPU yếu (Windows laptop). **Chỉ làm nếu có model nhỏ nhúng được** (user, 2026-11-04): ngưỡng đề xuất là binary nặng thêm ≤ ~50 MB, và chất lượng gộp trên bộ test Q.1 không thua e5-small. Bản e5-small ONNX lượng tử hoá ~117 MB, phần lớn là ma trận embedding của bộ từ vựng 250k token, nên có chỗ để thu nhỏ: cắt bộ từ vựng chỉ giữ token tiếng Việt và tiếng Anh, lượng tử hoá int8 hoặc int4, hoặc chưng cất thành static embedding (kiểu model2vec, nhỏ và rất nhanh trên CPU). Không đạt ngưỡng thì bỏ R.7, giữ LLM ở bước cluster. Cũng chỉ làm khi Q.6 cho thấy embedding có ích | Agent | ⬜ sau Q.6 |
| R.6 | UI: dùng lại giao diện tĩnh của E16, nhúng trong binary, phục vụ bằng một tiến trình web (vd `axum`). Không Tauri (quyết định "một tiến trình web duy nhất") | Agent | ⬜ |

**Đề xuất thời điểm (2026-11-04):** không port trước lần bán đầu. Dev A1 đã có Node, bản Node bán được ngay; port bây giờ đẩy lùi đồng đầu tiên vài tuần trong khi chưa biết audience có trả tiền không. Port khi có tín hiệu đi tiếp của giai đoạn 1, trước giai đoạn 3–4 (A2 cần UI, không có Node). Ngoại lệ: nếu S0.19 hoặc S1.3 cho thấy mã JS bị soi và chia sẻ dễ quá, hoặc Q.6 cho thấy e5 tiết kiệm nhiều, thì kéo E18 lên sớm. E17 (bộ test, harness) nên xong trước E18, vì nó là lưới đỡ để biết bản Rust không làm tụt chất lượng.
