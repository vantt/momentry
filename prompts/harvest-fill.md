<!-- Bước 5 (PRD 5.5), gọi bù cho các điểm nóng lần trước chưa trả lời. Viết mới (chưa thử), giữ BASE + ANTI_FILTER + HOTSPOT + FORMAT của harvest.md, chỉ đổi đoạn giao việc. Chỗ điền: {transcript} {hotspots} -->
Dưới đây là transcript đã rút gọn của một phiên làm việc giữa user và coding agent (Claude Code). Mỗi dòng có nhãn [Lnnn] là số dòng trong transcript gốc.

<transcript>
{transcript}
</transcript>

Một lượt trước đã nhặt chuyện từ phiên này nhưng chưa trả lời các điểm nóng liệt kê ở cuối. Nhiệm vụ của lượt này chỉ là xem kỹ quanh từng điểm nóng đó: điểm nào thành chuyện hoặc góp vào chuyện thì ghi chuyện ấy, kể cả khi lượt trước có thể đã ghi (trùng sẽ được gộp ở bước sau).

Tín hiệu gợi ý (để nhận ra, không phải ngưỡng):
{signals}
Không khớp tín hiệu nào mà thấy hay, thấy lạ: vẫn ghi, signals: ["khác"].
Nguyên tắc: ghi thừa còn hơn bỏ sót.

Riêng tư: chỉ ghi cơ chế, con số, tên công cụ. Không ghi tên note, đường dẫn trong vault, câu hỏi thật của golden set, nội dung vault, tên người.

Mỗi chuyện: title (một dòng như tiêu đề bài), signals, lines (các [Lnnn] làm bằng chứng), context (1-2 câu), what_happened (3-5 câu, có con số), lesson (một câu người khác dùng được), artefact (thứ chụp hay dán được, phải che gì).
Quan trọng: KHÔNG tự lọc. Chuyện nhỏ, vui, hỏng rồi sửa xong là quên, sự cố vặt của agent, lỗi quy trình, việc lặt vặt mà có điều bất ngờ: vẫn ghi thành chuyện riêng. Việc chấm và bỏ làm ở bước sau, không phải ở đây.
Điểm nóng do script tính. Với TỪNG điểm nóng, trả trong "hotspots": id, verdict ("story" nếu thành chuyện hoặc góp vào chuyện, "skip" nếu không), story_title hoặc reason (vì sao không đáng, một câu). Không được bỏ qua điểm nóng nào.
Nhãn điểm nóng:
- exit N, exit error: lệnh hoặc tool trả lỗi.
- bị chặn: hook, quyền hoặc sandbox chặn lệnh; ít khi là chuyện.
- số a→b: cặp số trước/sau.
- git …: git đảo hướng (reset, revert, rebase -i hoặc --abort, checkout --, commit --amend, push -f).
- ghi meta X: ghi file cấu hình agent.
- ghi bài học X, ghi quyết định X, ghi nhật ký X, ghi changelog X: agent ghi vào memory, bản ghi quyết định, nhật ký, CHANGELOG; thường là bước ngoặt đã tự dán nhãn.
- chủ chọn: chủ dự án trả lời một lựa chọn.
- chủ phản đối hoặc thúc: chủ dự án chê, cãi hoặc giục.
- chủ ngắt, chủ từ chối tool: chủ dự án dừng agent hoặc từ chối một lệnh.
- chủ trả lời ngắn sau chạy dài: câu ngắn sau một đoạn agent tự chạy dài; thường chỉ là "tiếp tục".
<hotspots>
{hotspots}
</hotspots>
Chỉ trả về một JSON object, không có chữ nào khác, dạng:
{"stories":[{"title":"","signals":[],"lines":[],"context":"","what_happened":"","lesson":"","artefact":""}],"hotspots":[{"id":"H1","verdict":"story|skip","story_title":"","reason":""}]}
