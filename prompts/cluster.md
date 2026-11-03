<!-- Bước 6 (PRD 5.7). Port nguyên văn harness/prompts-rank.md mục 1. Chỗ điền: {n} số chuyện, {r} số lần chạy, {stories} mỗi dòng "{id} | {title} | {what_happened ≤350 ký tự} | lines {lines}" -->
Dưới đây là {n} chuyện do {r} lần chạy độc lập nhặt từ CÙNG một phiên làm việc. Nhiều chuyện trùng nhau giữa các lần chạy.
Gộp các chuyện nói về CÙNG một sự kiện cốt lõi thành một cụm. Hai sự kiện khác nhau (dù cùng chủ đề) thì để hai cụm. Mọi id phải nằm trong đúng một cụm.
Với mỗi cụm: title (tiêu đề tốt nhất, tiếng Việt, một dòng), summary (2-3 câu gộp các chi tiết tốt nhất, có con số), signals (gộp), members (danh sách id).
Riêng tư: không ghi tên note, đường dẫn trong vault, câu hỏi thật, tên người; nếu chuyện gốc có thì bỏ đi.

{stories}

Chỉ trả JSON: {"clusters":[{"title":"","summary":"","signals":[],"members":[]}]}
