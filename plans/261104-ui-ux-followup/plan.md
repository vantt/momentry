---
title: "UI và UX, phần nối tiếp: dự án toàn cục, lệnh agent, nhắc phiên, đo, skill (E16)"
description: "Các việc không phải giao diện tách ra từ plan 261104-ui-ux sau khi phần UI xong."
status: done
priority: P1
branch: website-v2
tags: [ui, ux]
blockedBy: []
blocks: []
created: 2026-11-04
completed: 2026-11-05
---

# UI và UX, phần nối tiếp (E16)

Tách từ [261104-ui-ux](../261104-ui-ux/plan.md) ngày 2026-11-04, khi phần giao diện (U.4, U.5, U.6, U.10 và phần trên máy của U.7) đã xong và được duyệt. Mục tiêu, quyết định và danh sách màn hình vẫn ở plan gốc.

**Nối với giao diện đã có:**
- U.1 thay cách UI tìm dự án hiện nay (sổ phiên, `MOMENTRY_REPOS`, repo đang đứng) bằng danh sách toàn cục; `listProjects` trong `lib/ui-api.mjs` là chỗ đổi.
- U.2 thêm lệnh `momentry-ui` ở các host, gọi `momentry ui` (in ra file mở riêng, không in mã truy cập).
- U.3 đọc số phiên chờ ngân sách từ `<cache>/budget-wait.json` (`ledger.waiting`).
- U.7b đã tách thành plan riêng [shared-labels](../261105-shared-labels/plan.md) (E19).

| ID | Việc | Ai | Trạng thái |
|---|---|---|---|
| U.1 | Danh sách dự án toàn cục và đường dẫn hộp theo dự án; `init`, `scan`, hook đọc từ đó; giữ tương thích máy đã cài | Agent | ✅ 2026-11-05: `projects.json` trên máy; Settings hiện dự án mất thư mục để xoá |
| U.2 | Đổi lệnh agent sang `momentry-ui`, `momentry-bip` ở cả 5 host; giữ `/bip` làm bí danh một thời gian. Kiểm trên máy thật tên hiện ra ở từng host (Codex `/prompts:`, Antigravity skill) | Agent; anh kiểm Windows | ✅ 2026-11-05: `momentry-bip`, `momentry-ui` ở 5 host (Codex dùng skill `$…`); `/bip` còn là bí danh. Chờ anh kiểm Windows |
| U.3 | Dòng nhắc lúc mở phiên (hook SessionStart): số chuyện mới, phiên đang chờ vì ngân sách, lỗi cần sửa, kèm tên lệnh đúng theo host | Agent | ✅ 2026-11-05: `lib/reminder.mjs`, một dòng hoặc im lặng, ~50 ms. Chờ anh kiểm Windows |
| U.7b | Gửi nhãn Use/Later/Drop ẩn danh, chỉ khi người dùng đồng ý; dự án ở chế độ kín (`cfg.privateMode`) không bao giờ gửi. Cần dịch vụ nhận của E17 | Agent | ➡️ chuyển sang [shared-labels](../261105-shared-labels/plan.md) (E19), backlog |
| U.8 | Đo: thời gian từ cài tới chuyện đầu (S1.10), tỉ lệ chuyện top 5 được Use | Agent | ✅ 2026-11-05: `metrics.json` trên máy, khung "How it is going" ở màn Cost và `status --json` |
| U.9 | **Skill `momentry`** (thay MCP, quyết định 2026-11-04 vì MCP tốn token mỗi phiên): một skill duy nhất, cài vào cả 5 host như `momentry-bip`. Lúc thường chỉ tên và mô tả nằm trong context (vài chục token); thân skill chỉ nạp khi người dùng hỏi ("tuần này có chuyện gì hay?", "viết chuyện X thành thread"). Skill chỉ agent gọi CLI `--json`; thêm lệnh `show <id> --json`, `mark <id> use\|later\|drop`. Soạn nháp bài do agent của người dùng viết bằng model họ đã trả, không tốn LLM phía momentry (đường ngắn tới E13). Kiểm host nào hỗ trợ skill (Antigravity đã dùng skill cho bip; Claude Code có; Codex, pi, omp cần kiểm) | Agent | ✅ 2026-11-05: skill `momentry` ở 5 host; lệnh `show`, `mark` |

**Thứ tự:** U.1–U.3 cùng hoặc ngay sau lần bán đầu (U0); U.9 ngay sau; U.7b, U.8 khi có người dùng.

**Quyết định 2026-11-05:**
- Bỏ bí danh `/bip`; skill Codex đặt ở `~/.agents/skills`; shim `momentry` mất tính là lỗi trong dòng nhắc; dòng nhắc vẫn đi vào ngữ cảnh agent.
- Thêm tạm ngừng gom chuyện theo dự án (`momentry pause`/`resume`).
- Mọi cấu hình đi qua `momentry config` (kể cả theo dự án: `--project`), không thêm cờ lẻ như `init --box`.
- Mục 7b tách thành plan riêng E19 (xin quyền, nói rõ gửi gì); hiện chỉ tự nâng chất lượng bằng dữ liệu của đội (E17).
- Tỉ lệ top 5 được Use: có tính Later là "không dùng" hay không, anh trả lời sau khi dùng thật. Hiện vẫn tính Later là không dùng (`measures` trong `lib/metrics.mjs`).
