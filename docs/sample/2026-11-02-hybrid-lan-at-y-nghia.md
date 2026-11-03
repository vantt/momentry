---
date: 2026-11-02
status: raw
signals: [nguyên nhân bất ngờ]
source: chat Claude, V15b/V15c (fork OHS)
links: [2026-11-02-do-tim-kiem-tieng-viet, 2026-11-02-tu-dien-lam-te-hon]
threads: [obsidian-hieu-tieng-viet]
---

# Tìm lai (từ khoá và nghĩa) lại chôn mất kết quả theo nghĩa

**Bối cảnh:** Tìm lai trộn nhiều nhánh xếp hạng (từ khoá, vector, các nhánh tiếng Việt) bằng RRF, kỳ vọng tốt hơn từng nhánh.
**Chuyện gì xảy ra:** Với câu hỏi kiểu ý, nhánh vector xếp đáp án hạng 7, kết quả lai đẩy xuống 41: các nhánh từ khoá (tách từ, bỏ dấu) cùng bỏ phiếu cho note sai, át một phiếu của nhánh nghĩa.
**Bài học:** Trộn nhiều nhánh gần giống nhau là cho một phe nhiều phiếu; câu hỏi theo ý cần chế độ semantic.
**Artefact:** sơ đồ các nhánh bỏ phiếu (tự vẽ, không cần dữ liệu thật).
