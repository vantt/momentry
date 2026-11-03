# momentry

Nhặt chất liệu kể chuyện (build in public) từ transcript của Claude Code và Codex, ghi mỗi chuyện thành một file markdown, xếp hạng để người chọn.

## Đọc gì trước

1. [prd.md](prd.md): PRD v2, **bản duy nhất có hiệu lực**. Đọc mục 4 (nguyên tắc), mục 5 (cơ chế phát hiện), mục 9 (việc).
2. [experiments/2026-11-03-harvest/README.md](experiments/2026-11-03-harvest/README.md): kết quả thí nghiệm, nguồn sự thật cao nhất. Mục 6, 6b, 6c, 6d là kết luận.
3. [sample/README.md](sample/README.md): khuôn hộp chứa và 8 chuyện thật.
4. Chỉ đọc `history/` khi cần biết vì sao một ý bị bỏ.

## Thư mục

| Đường dẫn | Là gì | Còn hiệu lực |
|---|---|---|
| [prd.md](prd.md) | PRD v2: mục đích, nguyên tắc, pipeline, phần cơ học, cấu trúc code, kiểm thử, việc, đo, câu hỏi mở, các ý đã bỏ | Có |
| [experiments/2026-11-03-harvest/](experiments/2026-11-03-harvest/README.md) | Thí nghiệm harvest đợt 1–5: tự lọc, điểm nóng, người ngoài, nhãn user, hook và tension, stakes | Có (bằng chứng) |
| [experiments/2026-11-03-harvest/harness/](experiments/2026-11-03-harvest/harness/) | Code và prompt đã chạy được: `reduce.mjs`, `prompts.mjs`, `prompts-rank.md`, `run.sh`, `judge.sh`. Kết quả thô nằm ngoài repo | Có (điểm xuất phát cho code) |
| [sample/](sample/README.md) | Bản chép hộp chứa và 8 chuyện ghi tay từ repo `obsidian-pkm-automation`, nguyên trạng ngày bàn giao. Dùng làm đáp án và dữ liệu thử khuôn | Có (khuôn bản B) |
| [history/design-v1-body-brain.md](history/design-v1-body-brain.md) | Thiết kế v1 Body/Brain: hook Stop, detector regex, profile chấm, persona panel | Không. Nhiều phần bị thí nghiệm bác (PRD mục 12) |
| [history/prd-handoff-obsidian-pkm.md](history/prd-handoff-obsidian-pkm.md) | PRD bàn giao từ repo `obsidian-pkm-automation`: phần cơ học, riêng tư, bảng việc cũ | Không. Phần còn dùng đã chuyển vào PRD v2 |
| [history/debate-2026-11-03.md](history/debate-2026-11-03.md) | Debate 3 agent: đồng thuận, bất đồng, thí nghiệm phân xử, quyết định của user | Không. Kết luận đã chuyển vào PRD v2 |
| `_private/` | Dữ liệu lấy từ transcript thật (bảng cụm, nhãn user). Chưa qua kiểm riêng tư | Ngoài git (`.gitignore`). Không đọc, không chép vào repo, issue, commit |

## Liên quan

- Raw Capture Design (tài liệu trong repo riêng của CIS): bối cảnh rộng của CIS. momentry dùng chung nguyên tắc không can thiệp và bắt ở ranh giới phiên.
- Mã nguồn dự kiến: `` ở gốc repo CIS (chưa có; PRD mục 7).
- Dữ liệu chạy (sổ đã gom, khoá, kết quả thô của model, chuyện bị giữ lại vì riêng tư trong `quarantine/`) nằm ở `~/.cache/momentry/`, không bao giờ trong repo (PRD mục 6.3, 6.7).
