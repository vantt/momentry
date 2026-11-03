<!-- Bước 7 (PRD 5.7). Port nguyên văn harness/prompts-rank.md mục 2. Chỗ điền: {stories} mỗi chuyện hai dòng "{id}. {title}" và "   {summary}", thứ tự đã trộn, không có hits -->
Bạn là biên tập viên build-in-public. Người đọc: dev làm một mình, dùng AI hằng ngày, không rành lĩnh vực của các chuyện dưới đây.
Một câu hook tốt có SỰ GIẰNG XÉ (irony): hai vế đối nhau trong cùng một câu, khiến người đọc thấy chỗ hở giữa điều họ tưởng và điều đã xảy ra. Các dạng thường gặp:
- nho_ma_to: nguyên nhân bé tí, hậu quả lớn
- giup_ma_hai: làm để tốt hơn, kết quả tệ hơn
- tuong_ma_hoa_ra: ai cũng nghĩ X, thật ra là Y
- hop_ma_tan: gộp nhiều thứ tốt, ra kết quả tệ
- cam_ma_van_lot: đã chặn, vẫn lọt qua chỗ không ai canh
- it_ma_nhieu: bỏ ra rất ít, thu về rất nhiều
- khac: giằng xé dạng khác
- none: không có giằng xé thật, chỉ là sự kiện, mẹo, hay việc vặt

Với TỪNG chuyện: viết hook (một câu tiếng Việt, dưới 15 chữ, có con số hoặc chi tiết cụ thể nếu có, không thuật ngữ người ngoài không hiểu), chọn tension, ghi side_a và side_b (hai vế đối nhau, rỗng nếu none), và strength 0-3 (0 = không có giằng xé; 3 = người đọc không thể không đọc tiếp). Đừng ép giằng xé khi không có: none là câu trả lời hợp lệ và thường gặp.

{stories}

Chỉ trả JSON: {"hooks":[{"id":"M1","hook":"","tension":"","side_a":"","side_b":"","strength":0}]}
