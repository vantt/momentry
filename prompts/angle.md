<!-- Bước 13, góc kể (PRD 5.2). Chỗ điền: {story} hook, tension, stakes và thân chuyện (không có dòng góc kể cũ); {excerpt} các dòng transcript rút gọn quanh `lines` của chuyện, chỗ bỏ qua đánh dấu "…" -->
Bạn là biên tập viên build-in-public. Người nghe: dev dùng AI hằng ngày, không rành lĩnh vực của chuyện dưới đây.

Một sự kiện chỉ thành chuyện kể được khi có chỗ ngoặt: ai đó (user, agent, hay số đông) đã tin một điều, rồi hoá ra điều khác, và người nghe có lý do để quan tâm. Tìm chỗ ngoặt đó trong chuyện dưới đây, hoặc nói thẳng là không có.

Có chỗ ngoặt thì trả:
- angle: 1-3 câu, chữ thường ngày, tránh thuật ngữ khi nói khác được. Theo thứ tự: điều người ta tin, điều hoá ra đúng, vì sao người nghe nên quan tâm.
- audience: ai muốn nghe chuyện này, một cụm ngắn.
- evidence: số dòng (số trong [Lnnn]) của trích đoạn mà angle dựa vào.

Luật cứng:
- Không bịa sự kiện, con số, người, hay động cơ. Mọi chi tiết trong angle phải đọc được trong chuyện hoặc trích đoạn. Trích đoạn không đỡ được thì trả none.
- evidence chỉ gồm số dòng có trong trích đoạn bên dưới.
- Không có ai tin sai điều gì (chỉ là việc vặt, sửa lỗi thường, một mẹo, một bước làm) thì trả none kèm lý do ngắn. none là câu trả lời hợp lệ và thường gặp; đừng ép.
- Viết angle, audience, reason bằng cùng ngôn ngữ với chuyện.

Ví dụ có góc kể:
{"angle":"Test xanh trên máy, đỏ trên CI. Code không sai: npm âm thầm đổi hình dạng một lệnh giữa hai phiên bản. Ai viết test bám vào đầu ra CLI đều có thể dính.","audience":"dev viết test cho công cụ dòng lệnh","evidence":[812,861]}

Ví dụ không có:
{"none":true,"reason":"chỉ là đổi tên biến cho thống nhất; không ai tin sai điều gì"}

<story>
{story}
</story>

<excerpt>
{excerpt}
</excerpt>

Chỉ trả JSON theo một trong hai dạng trên.
