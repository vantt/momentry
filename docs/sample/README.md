# Chất liệu build in public

Hộp chứa mọi chuyện nhặt được trong lúc làm việc (chat Claude, Codex), để sau viết bài trong `docs/blog/`. Mỗi chuyện một file `YYYY-MM-DD-ten-ngan.md`. Agent tự ghi khi gặp tín hiệu dưới đây (`AGENTS.md` của repo nguồn, mục "Chất liệu build in public"); lọc để sau cùng.

**Thứ tự: ghi nhiều, nối nhiều, lọc sau cùng.** Lúc làm việc không chấm điểm, không bỏ chuyện vì thấy nhỏ: chuyện nhỏ hôm nay có khi là mảnh ghép của một chuỗi sau này. Chấm và bỏ chỉ làm khi gom chuyện thành bài.

## Tín hiệu (gợi ý để nhận ra, không phải ngưỡng)

1. **Số trước, số sau:** một phép đo đổi rõ (điểm tìm kiếm, thời gian, số note).
2. **Nguyên nhân bất ngờ:** lỗi to mà gốc nhỏ, hoặc gốc nằm ở chỗ không ai nghi.
3. **Đảo quyết định có lý do:** làm A, đo thấy tệ, bỏ A; điều tưởng đúng hoá sai.
4. **Người duyệt thứ máy soạn:** bảng duyệt, hàng chờ, vòng lặp người với máy chạy được thật.
5. **Ràng buộc định hình thiết kế:** riêng tư, chạy trên máy, chỉ JS hay Rust... buộc chọn cách khác thường.
6. **Artefact nhìn được:** bảng, biểu đồ, màn hình đáng chụp (ghi rõ phải che gì).

Không khớp tín hiệu nào mà thấy hay, thấy lạ, thấy bực, thấy vui: vẫn ghi, `signals: [khác]`. Ghi vài dòng thô cũng được; khuôn dưới là cho đủ, không bắt buộc đủ.

## Khuôn một file

```markdown
---
date: 2026-11-03
status: raw        # raw | picked | drafted | published | dropped
signals: [số trước số sau, nguyên nhân bất ngờ]
source: chat Claude, E12.9      # phiên, plan, commit liên quan
links: [2026-11-02-tu-dien-lam-te-hon]   # chuyện khác trong hộp: cùng mạch, nhân quả, trái ngược
threads: [obsidian-hieu-tieng-viet]      # mạch truyện dài mà chuyện này góp vào
---

# Câu mở đầu (một dòng, như tiêu đề bài)

**Bối cảnh:** vấn đề người ngoài hiểu được, 1-2 câu.
**Chuyện gì xảy ra:** 3-5 câu, có con số.
**Bài học:** một câu người khác dùng được.
**Artefact:** thứ chụp hay dán được, và phải che gì.
```

## Nối

Ghi chuyện mới thì xem hộp có chuyện nào cùng mạch, là nguyên nhân hay hệ quả, hay trái ngược, rồi ghi `links` ở cả hai file. Chuyện góp vào một mạch dài thì thêm tên mạch vào `threads` (chữ thường, gạch nối); mạch mới thì đặt tên mới. Mạch hiện có: `obsidian-hieu-tieng-viet` (làm cho tìm kiếm Obsidian hiểu tiếng Việt), `nguoi-va-may` (người duyệt, máy soạn).

## Riêng tư

Chỉ ghi cơ chế, con số, tên công cụ. Không ghi tên note, đường dẫn, câu hỏi thật, nội dung vault hay tên người trong vault (cùng luật với golden set). Artefact lấy từ dữ liệu thật thì ghi "che cột ..." trước khi đăng.
