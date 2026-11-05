---
title: "Chất liệu chuyện: bắt đúng tín hiệu ở nguồn (E20)"
description: "Điểm nóng bắt tiếng người dùng và bài học tự ghi, bớt nhiễu; tiếp theo là git, transcript worker, mạch nhiều phiên."
status: in-progress
priority: P1
branch: feat/story-material-signals
tags: [quality, hotspots, sources]
blockedBy: []
blocks: []
created: 2026-11-05
---

# Chất liệu chuyện (E20)

Board: [board.md](../board.md). Chất lượng xếp hạng và chi phí nằm ở [story-quality](../261104-story-quality/plan.md) (E17); plan này chỉ lo **chất liệu đầu vào**: thứ gì thành điểm nóng và nguồn nào được đọc.

**Lý do (2026-11-05):** chạy `reduce` trên 4 phiên thật của một dự án khác cho thấy bộ dò hiện có bắt tốt chỗ máy làm, nhưng trượt chỗ người quyết: lựa chọn, phản đối, ngắt, từ chối lệnh. Ghi bài học qua shell không ai thấy. Phần lớn điểm nóng còn lại là nhiễu (khoảng số, git dọn dẹp, hook chặn). Bằng chứng: số đo ở [material-signals](../../docs/experiments/2026-11-05-material-signals/README.md); hai báo cáo nguồn nằm ngoài repo này (`research-261105-1700-momentry-reduce-on-doc-sessions.md`, `feedback-261105-1700-momentry-story-picking.md` của dự án đã chạy thử).

## Mục tiêu

Chuyện thật của một phiên có điểm nóng neo vào, và điểm nóng rác ít đi, để harvest không phải trả lời hàng trăm dòng vô nghĩa.

## Việc

| ID | Việc | Ai | Trạng thái |
|---|---|---|---|
| M.1 | Bộ dò: `ownerVoice` (chọn, phản đối, ngắt, từ chối lệnh, câu ngắn sau chạy dài), `lessonWrite` (memory, quyết định, nhật ký, CHANGELOG, kể cả qua shell), `blocked` tách khỏi `nonzeroExit`; lọc nhiễu `metricPair` (khoảng số, số Việt) và `gitReversal` (detach, rebase thường, lockfile, heredoc); nhãn mới trong prompt harvest | Agent | ✅ 2026-11-05: điểm nóng 547 → 500 trên 4 phiên; 5/5 lời người dùng có điểm nóng (trước: 0/5); `metricPair` 216 → 51 lượt, `gitReversal` 109 → 52 ([số đo](../../docs/experiments/2026-11-05-material-signals/README.md)); 369 test pass |
| M.2 | Git là nguồn thứ hai trong khoảng thời gian của phiên: commit, tag, số dòng đổi, kèm SHA làm bằng chứng. Chuyện như "365 → 4 301 file" chỉ nằm trong git, không nằm trong transcript | Agent | ⬜ |
| M.3 | Transcript của subagent và worker (hiện `listTranscripts` chỉ đọc file ở thư mục gốc của dự án; bỏ qua subagent, phiên trong worktree liên kết, Doer) | Agent | ⬜ |
| M.1b | Đo có trả phí M.1 so với main trên bộ eval thứ hai (8 cửa sổ phiên thật của dự án khác, nhãn nháp đã có người thứ hai soát, `docs/_private/eval-forgentx/`) | Agent | ✅ 2026-11-05: 7 cửa sổ so được (1 cửa sổ hỏng ở nhánh, xem M.1c); USD 3,01 → 2,91; điểm nóng 189 → 167; chuyện nêu tên quyết định của người dùng 14 → 24; chỉ số p@k và `t` nửa trên nằm trong độ lệch một lần chụp ([số đo](../../docs/experiments/2026-11-05-material-signals/README.md#đo-có-trả-phí)) |
| M.1c | Sửa: câu trả lời điểm nóng có id lạ làm hỏng cả lời gọi harvest, mất mọi chuyện của cửa sổ (haiku trả "H1" khi chỉ còn một điểm nóng) | Agent | ✅ 2026-11-05: id hay verdict lạ bị bỏ và vào vòng gọi bù; chuyện giữ nguyên |
| M.5 | Đề xuất cho E17 (không làm ở đây vì xếp hạng thuộc E17): tầng tension chỉ hạ chuyện `none` khi stakes < 2. Trên bộ eval thứ hai, quyết định của người dùng bị chấm `none` dù stakes 3 nên rơi xuống #27/34; mô phỏng lên #11. Cần chạy lại 0 USD trên bộ 8 phiên của E17 trước khi đổi | E17 | ⬜ |
| M.6 | Đề xuất prompt: `hook-tension.md` thêm một dòng "người dùng phản đối hoặc đổi hướng là `khac` hoặc `giup_ma_hai`, không phải `none`"; `stakes.md` thêm một dòng "phản đối hay quyết định của người dùng làm đổi phạm vi, cách làm hay nhịp là ít nhất 2; chọn hướng mới là 3". Cần một lần chụp có trả phí mỗi bộ eval | Agent | ⬜ |
| M.4 | Mạch nhiều phiên và chế độ nhìn lại: nối chuyện qua nhiều phiên theo thời gian để dựng một cung dài (một dự án chạy hàng tuần) | Agent; anh chọn khung | ⬜ |

## Quyết định trong M.1

- `ownerVoice` giữ từ vựng phản đối hẹp (cụm cố định, không có "không" đứng giữa câu) vì cả phiên có hàng nghìn câu dài chứa chữ đó. Nhãn "câu ngắn sau chạy dài" ồn nhất (97 trong 153 lượt bắt); giữ lại vì nó là chỗ duy nhất bắt được câu người dùng không có từ khoá, và prompt nói thẳng nó thường chỉ là "tiếp tục".
- Tỉ lệ "X trên Y" đã thử rồi bỏ: 65 lượt bắt, gần hết là tiến độ ("47 trên 50 mục đạt"), không phải trước/sau.
- `lessonWrite` lấy luôn file memory khỏi `metaWrite` (memory nằm dưới `.claude/`), nên một lần ghi chỉ ra một điểm nóng. `metaWrite` còn đúng nghĩa cấu hình agent.
- `blocked` vẫn là điểm nóng để harvest phải trả lời, vì luật "không bỏ điểm nóng nào" giữ nguyên; giảm chú ý bằng một dòng trong prompt, không bằng bỏ dòng.
- Chỉ Claude có cờ `rejected` và `[Request interrupted by user]`; Codex chưa có trường tương đương.

## Rủi ro

- Từ vựng tiếng Việt và tiếng Anh viết tay sẽ trượt cách nói khác của người khác; đo lại trên phiên của người dùng khác trước khi mở rộng.
- Điểm nóng nhiều hơn ở phiên có nhiều lượt người ngắn (`ownerVoice`): chi phí harvest tăng theo số điểm nóng phải trả lời.
