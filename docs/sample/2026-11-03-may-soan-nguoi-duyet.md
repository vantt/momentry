---
date: 2026-11-03
status: raw
signals: [người duyệt thứ máy soạn, artefact nhìn được, ràng buộc định hình thiết kế]
source: chat Claude, E12.9.4, ohs.mjs golden propose/apply
links: [2026-11-02-do-tim-kiem-tieng-viet, 2026-11-03-hop-chua-sinh-ra-giua-chat, 2026-11-02-lo-rieng-tu-trong-commit]
threads: [obsidian-hieu-tieng-viet, nguoi-va-may]
---

# Máy soạn 51 câu hỏi kiểm tra, người duyệt một lượt

**Bối cảnh:** Golden set phải viết từ dữ liệu riêng, không được đưa lên repo hay cho dịch vụ ngoài, và không được dùng chính công cụ tìm kiếm đang đo để chọn đáp án.
**Chuyện gì xảy ra:** Agent soạn ứng viên theo 9 hạng mục (theo ý, đồng nghĩa, viết tắt, dấu một phần...), xếp câu tin thấp lên đầu, xuất bảng duyệt có cột ✓/✗. Người chỉ đánh dấu chỗ muốn sửa, còn lại coi là đồng ý; công cụ kiểm câu "mù" không bị lộ qua từ điển rồi gộp. Hai đợt: 112 rồi 163 câu.
**Bài học:** Máy làm phần nặng, người giữ phần phán đoán; bảng duyệt tốt là bảng đẩy câu đáng ngờ lên đầu.
**Artefact:** ảnh bảng duyệt, phải che cột query, relevant, partial, lý do.
