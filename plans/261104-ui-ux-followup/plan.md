---
title: "UI và UX, phần nối tiếp: dự án toàn cục, lệnh agent, nhắc phiên, đo, skill (E16)"
description: "Các việc không phải giao diện tách ra từ plan 261104-ui-ux sau khi phần UI xong."
status: todo
priority: P1
branch: website-v2
tags: [ui, ux]
blockedBy: []
blocks: []
created: 2026-11-04
---

# UI và UX, phần nối tiếp (E16)

Tách từ [261104-ui-ux](../261104-ui-ux/plan.md) ngày 2026-11-04, khi phần giao diện (U.4, U.5, U.6, U.10 và phần trên máy của U.7) đã xong và được duyệt. Mục tiêu, quyết định và danh sách màn hình vẫn ở plan gốc.

**Nối với giao diện đã có:**
- U.1 thay cách UI tìm dự án hiện nay (sổ phiên, `MOMENTRY_REPOS`, repo đang đứng) bằng danh sách toàn cục; `listProjects` trong `lib/ui-api.mjs` là chỗ đổi.
- U.2 thêm lệnh `momentry-ui` ở các host, gọi `momentry ui` (in ra file mở riêng, không in mã truy cập).
- U.3 đọc số phiên chờ ngân sách từ `<cache>/budget-wait.json` (`ledger.waiting`).
- U.7b phải bỏ qua dự án có `cfg.privateMode`.

| ID | Việc | Ai | Trạng thái |
|---|---|---|---|
| U.1 | Danh sách dự án toàn cục và đường dẫn hộp theo dự án; `init`, `scan`, hook đọc từ đó; giữ tương thích máy đã cài | Agent | ⬜ |
| U.2 | Đổi lệnh agent sang `momentry-ui`, `momentry-bip` ở cả 5 host; giữ `/bip` làm bí danh một thời gian. Kiểm trên máy thật tên hiện ra ở từng host (Codex `/prompts:`, Antigravity skill) | Agent; anh kiểm Windows | ⬜ |
| U.3 | Dòng nhắc lúc mở phiên (hook SessionStart): số chuyện mới, phiên đang chờ vì ngân sách, lỗi cần sửa, kèm tên lệnh đúng theo host | Agent | ⬜ |
| U.7b | Gửi nhãn Use/Later/Drop ẩn danh, chỉ khi người dùng đồng ý; dự án ở chế độ kín (`cfg.privateMode`) không bao giờ gửi. Cần dịch vụ nhận của E17 | Agent | ⬜ chờ E17 |
| U.8 | Đo: thời gian từ cài tới chuyện đầu (S1.10), tỉ lệ chuyện top 5 được Use | Agent | ⬜ |
| U.9 | **Skill `momentry`** (thay MCP, quyết định 2026-11-04 vì MCP tốn token mỗi phiên): một skill duy nhất, cài vào cả 5 host như `momentry-bip`. Lúc thường chỉ tên và mô tả nằm trong context (vài chục token); thân skill chỉ nạp khi người dùng hỏi ("tuần này có chuyện gì hay?", "viết chuyện X thành thread"). Skill chỉ agent gọi CLI `--json`; thêm lệnh `show <id> --json`, `mark <id> use\|later\|drop`. Soạn nháp bài do agent của người dùng viết bằng model họ đã trả, không tốn LLM phía momentry (đường ngắn tới E13). Kiểm host nào hỗ trợ skill (Antigravity đã dùng skill cho bip; Claude Code có; Codex, pi, omp cần kiểm) | Agent | ⬜ U0 hoặc ngay sau |

**Thứ tự:** U.1–U.3 cùng hoặc ngay sau lần bán đầu (U0); U.9 ngay sau; U.7b, U.8 khi có người dùng.
