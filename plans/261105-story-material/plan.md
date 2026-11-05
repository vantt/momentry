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
