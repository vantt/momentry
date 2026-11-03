<!-- Bước 8 (PRD 5.7). Port nguyên văn harness/prompts-rank.md mục 3, biến thể si (tự suy việc chính). Chỗ điền: {n} số chuyện, {stories} mỗi chuyện hai dòng "{id}. {title}" và "   {summary}", thứ tự đã trộn -->
Dưới đây là {n} chuyện nhặt được từ CÙNG một phiên làm việc dài giữa user và coding agent.
Trước hết, từ toàn bộ danh sách, suy ra việc chính (mạch chính) của phiên: user đang cố đạt kết quả gì. Viết vào main_goal (1-2 câu).
Rồi chấm stakes 0-3 cho TỪNG chuyện: chuyện này có làm đổi kết quả của việc chính không?
- 0: sự cố bên lề (công cụ, môi trường, quy trình) không ảnh hưởng kết quả việc chính
- 1: có liên quan nhưng chỉ làm chậm hay phiền, kết quả việc chính không đổi
- 2: làm đổi một phần kết quả hoặc cách làm việc chính
- 3: là bước ngoặt của việc chính: đổi kết quả, đổi hướng, hoặc là kết quả chính
Chấm stakes độc lập với việc chuyện có hay, có lạ hay không.

{stories}

Chỉ trả JSON: {"main_goal":"","stakes":[{"id":"M1","stakes":0,"reason":"ngắn"}]}
