---
date: 2026-11-02
status: raw
signals: [nguyên nhân bất ngờ]
source: chat Claude, V15, PR vantt/obsidian-hybrid-search#4
links: [2026-11-02-do-tim-kiem-tieng-viet]
threads: [obsidian-hieu-tieng-viet]
---

# Một kiểu viết Unicode làm điểm tìm kiếm tụt 8 lần

**Bối cảnh:** Chữ "ệ" viết được hai kiểu trong máy: một ký tự (NFC) hoặc chữ "e" cộng dấu (NFD). Mắt người không phân biệt được.
**Chuyện gì xảy ra:** Lần đo đầu ra nDCG 0,075, thấp vô lý. Gốc: bộ máy tìm kiếm lưu đường dẫn kiểu NFD, golden set viết tay kiểu NFC, phép so sánh chuỗi không bao giờ khớp. Chuẩn hoá về một kiểu thì điểm về 0,6.
**Bài học:** Số đo tệ bất thường thì nghi thước đo trước khi nghi thứ được đo; với tiếng Việt, nghi Unicode đầu tiên.
**Artefact:** hai chuỗi trông giống hệt nhau mà khác byte (tự dựng ví dụ, không dùng tên note thật).
