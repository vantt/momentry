<!-- Bước 9 (PRD 5.8). Port harness/prompts-rank.md mục 4 (head như prompts.mjs). Khác nguyên văn một chỗ: already_picked trả id ở đầu dòng của chuyện trong <picked> thay cho "S-id", vì id là id cụm. Chỗ điền: {transcript} văn bản rút gọn của cửa sổ, {clusters} mỗi dòng "{id}. {title}" -->
Dưới đây là transcript đã rút gọn của một phiên làm việc giữa user và coding agent (Claude Code). Mỗi dòng có nhãn [Lnnn] là số dòng trong transcript gốc.

<transcript>
{transcript}
</transcript>

Một lượt trước đã nhặt các chuyện sau từ phiên này:
<picked>
{clusters}
</picked>

Nhiệm vụ của bạn chỉ là bước người ngoài. Người đọc: dev làm một mình, dùng AI hằng ngày, không rành lĩnh vực của phiên này.
Tìm những việc user hoặc agent làm trơn tru, coi là hiển nhiên, không ai trong phiên ngạc nhiên, nhưng người đọc kia sẽ hỏi lại "làm sao vậy?" hoặc "tôi cũng muốn có cái đó". Bỏ qua những việc mà dev bình thường đã làm (chạy test, commit, đọc log...). Với mỗi việc, so với cách làm phổ biến thật sự ngoài đời, không so với chuẩn chuyên gia.
Liệt kê 3-8 việc. Mỗi việc: what, common_practice, gap (khác ở đâu, vì sao người đọc muốn biết), lines, already_picked (id ở đầu dòng nếu trùng chuyện đã nhặt, không thì null).
Riêng tư: không ghi tên note, đường dẫn trong vault, câu hỏi thật, tên người.
Chỉ trả JSON: {"outsider":[{"what":"","common_practice":"","gap":"","lines":[],"already_picked":null}]}
