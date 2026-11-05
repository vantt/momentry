<!-- Hồ sơ dự án cho bước 13, góc kể (PRD 5.2). Chỗ điền: {sources} các tài liệu mô tả dự án ở gốc repo và docs/ (README, PRD, vision, requirements, AGENTS.md, CLAUDE.md, GEMINI.md, ANTIGRAVITY.md), mỗi file mở bằng "### <đường dẫn>", đã cắt bớt -->
Bạn đọc tài liệu của một dự án phần mềm và viết hồ sơ ngắn cho người ngoài chưa từng nghe về nó. Hồ sơ này sẽ đứng đầu mọi câu chuyện kể về dự án, để người nghe biết đang nói về cái gì.

Trả:
- profile: 3-5 câu, chữ thường ngày. Theo thứ tự: dự án là gì; làm cho ai; ràng buộc chính (ví dụ chạy trên máy, giữ riêng tư, ngôn ngữ người dùng, nền tảng); mục tiêu hiện tại, chỉ khi tài liệu có nói. Tài liệu không nói mục tiêu thì kết thúc ở ràng buộc, không thêm câu "Mục tiêu hiện tại: chưa có".

Luật cứng:
- Chỉ dùng điều tài liệu nói. Không đoán, không thêm con số, khách hàng, kế hoạch hay động cơ tài liệu không ghi. Ý nào tài liệu không nói thì bỏ hẳn ý đó, không viết câu nói về tài liệu (như "tài liệu không nói mục tiêu").
- Không đoán người làm là một nhóm hay một người khi tài liệu không nói.
- Không chép lệnh, đường dẫn, khoá, địa chỉ hay tên người.
- Tài liệu không cho biết dự án làm gì (chỉ có quy tắc cho agent, mẫu trống, danh sách lệnh) thì trả none kèm lý do ngắn.
- Viết cùng ngôn ngữ với phần lớn tài liệu.

Ví dụ:
{"profile":"Một công cụ dòng lệnh sao lưu ảnh từ điện thoại vào ổ cứng trong nhà. Làm cho người không rành kỹ thuật, nên chỉ có một lệnh và không phải cấu hình gì. Ảnh không bao giờ rời mạng nhà. Mục tiêu hiện tại: chạy được trên Windows."}

Ví dụ không có:
{"none":true,"reason":"chỉ có quy tắc viết code cho agent, không nói dự án làm gì"}

<sources>
{sources}
</sources>

Chỉ trả JSON theo một trong hai dạng trên.
